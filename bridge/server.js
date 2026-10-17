import express from "express";
import crypto from "crypto";
import fs from "fs";
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
    if (fs.existsSync(TOKEN_FILE)) return fs.readFileSync(TOKEN_FILE, "utf8").trim();
    const t = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(TOKEN_FILE, t, { mode: 0o600 });
    return t;
  } catch (e) {
    console.error("[Bridge] token init failed, using ephemeral token:", e.message);
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
  if (!UNSAFE && req.headers["x-bridge-token"] !== TOKEN)
    return res.status(401).json({ error: "unauthorized" });
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

app.post("/call", async (req, res) => {
  const { name, arguments: args, callId } = req.body;
  console.log(`[Bridge] Incoming /call: ${name}`, JSON.stringify(args || {}));
  const target = toolMap.get(name);
  if (!target) {
    console.error(`[Bridge] Tool ${name} not found!`);
    return res.status(404).json({ error: `Tool ${name} not found` });
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

// --- Metadata-only file index ---------------------------------------------
// Never serves file bytes and never indexes "/" or the whole home directory.
const IGNORE = new Set([
  "node_modules", ".git", "dist", "build", ".next", ".cache",
  ".venv", "venv", "target", ".turbo", ".parcel-cache", "coverage",
]);
const FORBIDDEN_ROOTS = new Set(["/", "/home", "/home/adham", ""]);
let indexSnapshot = [];

function buildIndex(roots, maxDepth = 4, maxEntries = 20000) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth || out.length >= maxEntries) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (IGNORE.has(e.name)) continue;
      const p = `${dir.replace(/\/$/, "")}/${e.name}`;
      if (e.isDirectory()) {
        walk(p, depth + 1);
        continue;
      }
      let st;
      try {
        st = fs.statSync(p);
      } catch {
        continue;
      }
      out.push({
        name: e.name,
        path: p,
        type: "file",
        size: st.size,
        mtime: st.mtimeMs,
      });
      if (out.length >= maxEntries) return;
    }
  };
  for (const r of roots) walk(r, 0);
  return out;
}

function scoreMatch(name, q) {
  if (!q) return 1;
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 50;
  return 0;
}

app.get("/fs-index", (req, res) => {
  try {
    const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
    const roots = (cfg.indexRoots || []).filter(
      (r) => typeof r === "string" && !FORBIDDEN_ROOTS.has(r),
    );
    if (!roots.length)
      return res.json({ results: [], note: "no indexRoots configured" });

    if (req.query.refresh === "1" || indexSnapshot.length === 0)
      indexSnapshot = buildIndex(roots);

    const q = String(req.query.q || "").toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const results = (
      q
        ? indexSnapshot
            .map((e) => ({ e, s: scoreMatch(e.name.toLowerCase(), q) }))
            .filter((x) => x.s > 0)
            .sort((a, b) => b.s - a.s)
        : indexSnapshot.map((e) => ({ e, s: 1 }))
    )
      .slice(0, limit)
      .map((x) => x.e);
    res.json({ results, total: indexSnapshot.length });
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
