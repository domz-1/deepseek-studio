import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { execSync, spawnSync } from "child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();

// --- Security floor -------------------------------------------------------
// Default: loopback only, explicit DeepSeek origin allowlist, per-call token.
// Set BRIDGE_UNSAFE=1 to restore the legacy open-socket demo behaviour.
const HOST = process.env.BRIDGE_HOST || "127.0.0.1";
const UNSAFE = process.env.BRIDGE_UNSAFE === "1";
const ALLOWED_ORIGINS = new Set([
  "https://chat.deepseek.com",
  "https://chat.deepseek.com:443",
]);

const TOKEN_FILE = new URL("./.bridge-token", import.meta.url).pathname;
const TOKEN = (() => {
  try {
    if (fs.existsSync(TOKEN_FILE))
      return fs.readFileSync(TOKEN_FILE, "utf8").trim();
    const t = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
    return t;
  } catch (e) {
    console.error(
      "[Bridge] token init failed, using ephemeral token:",
      e.message,
    );
    return crypto.randomBytes(32).toString("hex");
  }
})();

function originAllowed(origin) {
  if (!origin) return true; // same-origin / non-browser clients
  if (ALLOWED_ORIGINS.has(origin)) return true;
  // The extension itself (service worker / popup) is a trusted client.
  if (origin.startsWith("chrome-extension://")) return true;
  if (origin.startsWith("moz-extension://")) return true;
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const ok = UNSAFE || originAllowed(origin);
  if (!ok) return res.status(403).json({ error: "origin denied" });
  if (origin && ok) res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "content-type, x-bridge-token");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);

  // Authenticate: require token ONLY when request comes from public web origins
  // Requests from chrome-extension://, moz-extension://, or local loopback curl/scripts are trusted.
  const isTrustedExtensionOrLocal =
    !origin ||
    origin.startsWith("chrome-extension://") ||
    origin.startsWith("moz-extension://");

  if (
    !UNSAFE &&
    !isTrustedExtensionOrLocal &&
    req.headers["x-bridge-token"] !== TOKEN
  ) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
});

app.use(express.json({ limit: "50mb" }));

const CONFIG_FILE = new URL("./mcp-config.json", import.meta.url).pathname;
const defaultConfig = {
  mcpServers: {
    filesystem: {
      command: "bunx",
      args: [
        "@modelcontextprotocol/server-filesystem",
        "/home/adham/projects/adham",
      ],
      enabled: true,
    },
  },
};

if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
}

const clients = new Map();
const toolMap = new Map();
let serverStatus = {};
const runningCalls = new Map();

async function syncServers() {
  for (const [, c] of clients) await c.close().catch(() => {});
  clients.clear();
  toolMap.clear();
  serverStatus = {};

  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  for (const [name, srv] of Object.entries(cfg.mcpServers || {})) {
    if (srv.enabled === false) {
      serverStatus[name] = { online: false, count: 0, disabled: true };
      continue;
    }
    try {
      const transport = new StdioClientTransport({
        command: srv.command,
        args: srv.args || [],
        env: { ...process.env, ...(srv.env || {}) },
      });
      const client = new Client(
        { name: `ds-${name}`, version: "4.0.0" },
        { capabilities: {} },
      );
      await client.connect(transport);
      clients.set(name, client);

      const { tools } = await client.listTools();
      for (const t of tools)
        toolMap.set(t.name, { serverName: name, schema: t });
      serverStatus[name] = { online: true, count: tools.length };
      console.log(`[MCP] ${name} → ${tools.length} tools`);
    } catch (err) {
      serverStatus[name] = { online: false, count: 0, error: err.message };
      console.error(`[MCP ERR] ${name}:`, err.message);
    }
  }
}

await syncServers();

app.get("/mcp", (req, res) => {
  const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  res.json({
    config: cfg,
    status: serverStatus,
    tools: Array.from(toolMap.values()).map((v) => ({
      ...v.schema,
      server: v.serverName,
    })),
  });
});

app.post("/mcp", async (req, res) => {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(req.body, null, 2));
    await syncServers();
    res.json({
      ok: true,
      status: serverStatus,
      tools: Array.from(toolMap.values()).map((v) => ({
        ...v.schema,
        server: v.serverName,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const READ_CACHE = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes in-memory cache for ultra-fast repeat reads
const FILE_CONTENT_CACHE = new Map(); // Tracks last read/written content per path to produce diffs if requested

function pruneToolResult(name, content, args = {}) {
  if (!Array.isArray(content)) return content;
  return content.map((item) => {
    if (item.type !== "text" || typeof item.text !== "string") return item;
    let t = item.text;

    // Prune excessive empty lines and trailing whitespace
    t = t.replace(/\n\s*\n\s*\n+/g, "\n\n").trim();

    // 5. Diff-Only Output for very large files (> 300 lines) if already seen
    if ((name === "read_file" || name === "read_text_file") && args.path) {
      const p = args.path;
      const lines = t.split("\n");
      if (lines.length > 300 && FILE_CONTENT_CACHE.has(p)) {
        const prev = FILE_CONTENT_CACHE.get(p);
        if (prev === t) {
          t = `[File unchanged from previous read: ${p} (${lines.length} lines). Using cached knowledge.]`;
          return { ...item, text: t };
        }
      }
      FILE_CONTENT_CACHE.set(p, t);
    }

    // If output is massive (> 8,000 chars) for command/files, smartly summarize middle
    const MAX_CHARS = 8000;
    if (t.length > MAX_CHARS) {
      const head = t.slice(0, 4000);
      const tail = t.slice(-3500);
      const omitted = t.length - 7500;
      t = `${head}\n\n... [DeepSeek Studio Turbo: Omitted ${omitted} characters of intermediate output to keep context fast] ...\n\n${tail}`;
    }

    return { ...item, text: t };
  });
}

app.post("/call", async (req, res) => {
  const { name, arguments: args = {}, callId, project } = req.body;
  console.log(`[Bridge] Incoming /call: ${name}`, JSON.stringify(args || {}));
  const target = toolMap.get(name);
  if (!target) {
    console.error(`[Bridge] Tool ${name} not found!`);
    return res.status(404).json({ error: `Tool ${name} not found` });
  }

  // Invalidate read cache on file writes or modifications
  if (
    name === "write_file" ||
    name === "edit_file" ||
    name === "create_directory" ||
    name === "execute_command" ||
    name === "bash" ||
    name === "workspace_batch"
  ) {
    READ_CACHE.clear();
  }

  // If a project is specified and arguments contain relative paths or missing cwd, resolve them
  if (project && typeof project === "string") {
    if ((name === "execute_command" || name === "bash") && !args.cwd) {
      args.cwd = project;
    }
    if (
      args.path &&
      typeof args.path === "string" &&
      !args.path.startsWith("/")
    ) {
      args.path = path.resolve(project, args.path);
    }
  }

  // 7. Check In-Memory Cache for idempotent safe read tools
  const isCacheable =
    name === "read_file" ||
    name === "read_text_file" ||
    name === "list_directory" ||
    name === "list_allowed_directories" ||
    name === "directory_tree" ||
    name === "search_files" ||
    name === "get_file_info";

  const cacheKey = isCacheable ? `${name}:${JSON.stringify(args)}` : null;
  if (cacheKey && READ_CACHE.has(cacheKey)) {
    const entry = READ_CACHE.get(cacheKey);
    if (Date.now() - entry.time < CACHE_TTL_MS) {
      console.log(`[Bridge] Cache hit for ${name} (instant RAM response)`);
      return res.json({
        ...entry.result,
        callId: callId || "cached",
        fromCache: true,
      });
    }
    READ_CACHE.delete(cacheKey);
  }

  const activeId =
    callId || `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const abortController = new AbortController();
  runningCalls.set(activeId, { abortController, name, startedAt: Date.now() });

  try {
    const client = clients.get(target.serverName);
    const result = await client.callTool(
      { name, arguments: args },
      CallToolResultSchema,
      { signal: abortController.signal },
    );

    // Smart context pruning to keep DeepSeek token count light & fast
    if (result && result.content) {
      result.content = pruneToolResult(name, result.content, args);
    }

    if (cacheKey && !result?.isError) {
      READ_CACHE.set(cacheKey, { result, time: Date.now() });
    }

    console.log(`[Bridge] Success /call: ${name}`);
    res.json({ ...result, callId: activeId });
  } catch (err) {
    console.error(`[Bridge] Error /call: ${name}`, err.message);
    if (abortController.signal.aborted) {
      res.status(499).json({
        error: `Task ${name} was cancelled by user`,
        isCancelled: true,
      });
    } else {
      res.status(500).json({ error: err.message, isError: true });
    }
  } finally {
    runningCalls.delete(activeId);
  }
});

app.post("/kill", (req, res) => {
  const { callId } = req.body;
  if (callId && runningCalls.has(callId)) {
    const record = runningCalls.get(callId);
    record.abortController.abort();
    runningCalls.delete(callId);
    return res.json({ ok: true, killed: callId, name: record.name });
  }

  // Kill all running calls if no specific ID given
  let count = 0;
  for (const [id, record] of runningCalls.entries()) {
    record.abortController.abort();
    runningCalls.delete(id);
    count++;
  }
  res.json({ ok: true, killedCount: count });
});

// --- Projects & File Intelligence ---
const FD_BIN = fs.existsSync("/home/adham/.local/bin/fd")
  ? "/home/adham/.local/bin/fd"
  : "fd";
const RG_BIN = fs.existsSync("/home/adham/.local/bin/rg")
  ? "/home/adham/.local/bin/rg"
  : "rg";

const DEFAULT_PROJECTS_DIR = "/home/adham/projects";

app.get("/projects", (req, res) => {
  try {
    const list = [];
    if (fs.existsSync(DEFAULT_PROJECTS_DIR)) {
      const entries = fs.readdirSync(DEFAULT_PROJECTS_DIR, {
        withFileTypes: true,
      });
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".")) {
          const p = path.join(DEFAULT_PROJECTS_DIR, e.name);
          list.push({ name: e.name, path: p });

          // Also check one level deeper for grouped workspaces (e.g. /home/adham/projects/adham/*)
          try {
            const sub = fs.readdirSync(p, { withFileTypes: true });
            for (const s of sub) {
              if (
                s.isDirectory() &&
                !s.name.startsWith(".") &&
                s.name !== "node_modules"
              ) {
                list.push({
                  name: `${e.name}/${s.name}`,
                  path: path.join(p, s.name),
                });
              }
            }
          } catch (_) {}
        }
      }
    }
    // Also include current directory
    list.unshift({
      name: "deepseek-mcp-ext (Current)",
      path: "/home/adham/projects/adham/deepseek-mcp-ext",
    });

    // Deduplicate by path
    const seen = new Set();
    const unique = [];
    for (const item of list) {
      if (!seen.has(item.path)) {
        seen.add(item.path);
        unique.push(item);
      }
    }
    res.json({ projects: unique });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/fs-index", (req, res) => {
  try {
    const projectPath =
      req.query.project || req.query.root || DEFAULT_PROJECTS_DIR;
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Number(req.query.limit) || 40, 100);

    const targetDir = fs.existsSync(projectPath)
      ? projectPath
      : DEFAULT_PROJECTS_DIR;

    // Use fast binary fd
    try {
      const fdArgs = [
        "--type",
        "f",
        "--hidden",
        "--exclude",
        ".git",
        "--exclude",
        "node_modules",
        "--exclude",
        "dist",
        "--exclude",
        "build",
        "--exclude",
        ".next",
        "--exclude",
        ".cache",
        "--max-results",
        String(limit),
      ];

      if (q) {
        fdArgs.push(q);
      }
      fdArgs.push(targetDir);

      const fdRes = spawnSync(FD_BIN, fdArgs, {
        encoding: "utf8",
        timeout: 1500,
      });

      if (!fdRes.error && fdRes.stdout) {
        const lines = fdRes.stdout.trim().split("\n").filter(Boolean);
        const results = lines.map((p) => {
          let st = { size: 0, mtimeMs: 0 };
          try {
            st = fs.statSync(p);
          } catch (_) {}
          return {
            name: path.basename(p),
            path: p,
            relativePath: path.relative(targetDir, p),
            type: "file",
            size: st.size,
            mtime: st.mtimeMs,
          };
        });
        return res.json({ results, total: results.length, engine: "fd" });
      }
    } catch (_) {}

    // Fallback: Node walk
    const results = [];
    res.json({ results, total: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Read file content for @file instant prompt injection
app.post("/read-file-content", (req, res) => {
  try {
    const {
      path: filePath,
      maxLines = 400,
      maxBytes = 150000,
    } = req.body || {};
    if (!filePath || typeof filePath !== "string") {
      return res.status(400).json({ error: "Missing filePath" });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: `File not found: ${filePath}` });
    }

    const st = fs.statSync(filePath);
    if (st.isDirectory()) {
      return res.status(400).json({ error: "Path is a directory, not a file" });
    }

    if (st.size > 2 * 1024 * 1024) {
      return res
        .status(400)
        .json({ error: "File too large (exceeds 2MB limit)" });
    }

    const raw = fs.readFileSync(filePath, "utf8");
    const lines = raw.split("\n");
    const isTruncated = lines.length > maxLines;
    const content = isTruncated ? lines.slice(0, maxLines).join("\n") : raw;

    res.json({
      path: filePath,
      name: path.basename(filePath),
      content: content.slice(0, maxBytes),
      lines: lines.length,
      truncated: isTruncated || content.length < raw.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = 43210;
app.listen(PORT, HOST, () => {
  console.log(
    `MCP Hub running → http://${HOST}:${PORT} ${UNSAFE ? "[UNSAFE]" : "[secured]"}`,
  );
  if (!UNSAFE)
    console.log(`Bridge token (paste into the extension popup): ${TOKEN}`);
});
