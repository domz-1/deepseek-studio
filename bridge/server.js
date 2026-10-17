import express from "express";
import cors from "cors";
import fs from "fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const CONFIG_FILE = "./mcp-config.json";
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
  const target = toolMap.get(name);
  if (!target) return res.status(404).json({ error: `Tool ${name} not found` });

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
    res.json({ ...result, callId: activeId });
  } catch (err) {
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

const PORT = 43210;
app.listen(PORT, "0.0.0.0", () =>
  console.log(`MCP Hub running → http://localhost:${PORT}`),
);
