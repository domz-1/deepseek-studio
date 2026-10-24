import fs from "fs";
import path from "path";
import { resolveWorkspaceProject } from "./workspace-git.js";

const MAX_LOGS = 50;
export const RECENT_COMMAND_LOGS = [];

export function appendCommandLog(log) {
  RECENT_COMMAND_LOGS.unshift({
    id: log.id || `log_${Date.now()}`,
    name: log.name || "unknown",
    args: log.args || {},
    project: log.project || "",
    time: log.time || new Date().toISOString(),
    duration: log.duration || 0,
    status: log.status || "success",
    output: typeof log.output === "string" ? log.output.slice(0, 10000) : "",
  });
  if (RECENT_COMMAND_LOGS.length > MAX_LOGS) {
    RECENT_COMMAND_LOGS.length = MAX_LOGS;
  }
}

function buildFileTree(dir, rootDir, maxDepth = 4, depth = 0) {
  if (depth > maxDepth) return [];
  const items = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    entries.sort((a, b) => {
      if (a.isDirectory() === b.isDirectory())
        return a.name.localeCompare(b.name);
      return a.isDirectory() ? -1 : 1;
    });

    for (const e of entries) {
      if (
        e.name.startsWith(".git") ||
        e.name === "node_modules" ||
        e.name === ".output" ||
        e.name === "dist" ||
        e.name === ".next" ||
        e.name === "build" ||
        e.name === ".gemini" ||
        e.name === "coverage" ||
        e.name === ".turbo" ||
        e.name === ".wxt"
      ) {
        continue;
      }

      const full = path.join(dir, e.name);
      const rel = path.relative(rootDir, full);

      if (e.isDirectory()) {
        items.push({
          name: e.name,
          path: full,
          relPath: rel,
          type: "dir",
          children: buildFileTree(full, rootDir, maxDepth, depth + 1),
        });
      } else {
        const ext = path.extname(e.name).replace(".", "").toLowerCase();
        let size = 0;
        try {
          size = fs.statSync(full).size;
        } catch (_) {}

        items.push({
          name: e.name,
          path: full,
          relPath: rel,
          type: "file",
          ext,
          size,
        });
      }
    }
  } catch (_) {}
  return items;
}

export function registerFsRoutes(app) {
  // 1. File Tree
  app.get("/workspace/file-tree", (req, res) => {
    try {
      const projectDir = resolveWorkspaceProject(req.query.project);
      if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ error: "Project directory not found" });
      }
      const tree = buildFileTree(projectDir, projectDir, 4, 0);
      res.json({ project: projectDir, tree });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Terminal Logs
  app.get("/workspace/terminal-logs", (_req, res) => {
    res.json({ logs: RECENT_COMMAND_LOGS });
  });

  app.post("/workspace/clear-logs", (_req, res) => {
    RECENT_COMMAND_LOGS.length = 0;
    res.json({ ok: true });
  });
}
