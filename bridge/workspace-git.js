import fs from "fs";
import path from "path";
import os from "os";
import { execSync } from "child_process";

export function resolveWorkspaceProject(projPath) {
  let p = projPath ? String(projPath).trim() : "";
  if (!p) p = "/home/adham/projects/adham";
  if (p.startsWith("~")) p = path.join(os.homedir(), p.slice(1));
  return path.resolve(p);
}

export function registerGitRoutes(app) {
  // 1. Git Status
  app.get("/workspace/git-status", (req, res) => {
    try {
      const projectDir = resolveWorkspaceProject(req.query.project);
      if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ error: "Project directory not found" });
      }

      let isGit = false;
      try {
        execSync("git rev-parse --is-inside-work-tree", {
          cwd: projectDir,
          stdio: "pipe",
          encoding: "utf8",
        });
        isGit = true;
      } catch (_) {
        isGit = false;
      }

      if (!isGit) {
        return res.json({
          isGit: false,
          project: projectDir,
          branch: "",
          files: [],
          stats: { total: 0, modified: 0, added: 0, deleted: 0, untracked: 0 },
        });
      }

      let branch = "HEAD";
      try {
        branch =
          execSync("git branch --show-current", {
            cwd: projectDir,
            stdio: "pipe",
            encoding: "utf8",
          }).trim() || "HEAD";
      } catch (_) {}

      const statusOut = execSync("git status --porcelain=v1 -uall", {
        cwd: projectDir,
        stdio: "pipe",
        encoding: "utf8",
      });

      const files = [];
      let modified = 0,
        added = 0,
        deleted = 0,
        untracked = 0;
      const lines = statusOut.split("\n").filter(Boolean);

      for (const line of lines) {
        const code = line.slice(0, 2);
        const filePath = line.slice(3).trim();
        let status = "modified";
        let shortCode = "M";

        if (code.includes("?")) {
          status = "untracked";
          shortCode = "?";
          untracked++;
        } else if (code.includes("A")) {
          status = "added";
          shortCode = "A";
          added++;
        } else if (code.includes("D")) {
          status = "deleted";
          shortCode = "D";
          deleted++;
        } else {
          modified++;
        }

        files.push({
          path: filePath,
          code,
          shortCode,
          status,
          staged: code[0] !== " " && code[0] !== "?",
        });
      }

      res.json({
        isGit: true,
        project: projectDir,
        branch,
        files,
        stats: { total: files.length, modified, added, deleted, untracked },
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 2. Git Diff
  app.get("/workspace/git-diff", (req, res) => {
    try {
      const projectDir = resolveWorkspaceProject(req.query.project);
      const targetFile = req.query.file;
      if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ error: "Project directory not found" });
      }

      let diff = "";
      if (targetFile) {
        const fullPath = path.resolve(projectDir, targetFile);
        let isUntracked = false;
        try {
          const status = execSync(`git status --porcelain "${targetFile}"`, {
            cwd: projectDir,
            stdio: "pipe",
            encoding: "utf8",
          });
          if (status.startsWith("??")) isUntracked = true;
        } catch (_) {}

        if (isUntracked && fs.existsSync(fullPath)) {
          try {
            diff = execSync(`git diff --no-index /dev/null "${targetFile}"`, {
              cwd: projectDir,
              stdio: "pipe",
              encoding: "utf8",
            });
          } catch (e) {
            diff = e.stdout || e.message;
          }
        } else {
          try {
            diff = execSync(`git diff HEAD -- "${targetFile}"`, {
              cwd: projectDir,
              stdio: "pipe",
              encoding: "utf8",
            });
            if (!diff) {
              diff = execSync(`git diff --cached -- "${targetFile}"`, {
                cwd: projectDir,
                stdio: "pipe",
                encoding: "utf8",
              });
            }
          } catch (e) {
            diff = e.stdout || e.message;
          }
        }
      } else {
        try {
          diff = execSync("git diff HEAD", {
            cwd: projectDir,
            stdio: "pipe",
            encoding: "utf8",
          });
        } catch (e) {
          diff = e.stdout || e.message;
        }
      }

      res.json({ file: targetFile || "all", diff: diff || "" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 3. Git Revert
  app.post("/workspace/git-revert", (req, res) => {
    try {
      const { project, file } = req.body || {};
      const projectDir = resolveWorkspaceProject(project);
      if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ error: "Project directory not found" });
      }

      if (file && file !== "all") {
        const fullPath = path.resolve(projectDir, file);
        let isUntracked = false;
        try {
          const st = execSync(`git status --porcelain "${file}"`, {
            cwd: projectDir,
            stdio: "pipe",
            encoding: "utf8",
          });
          if (st.startsWith("??")) isUntracked = true;
        } catch (_) {}

        if (isUntracked) {
          if (fs.existsSync(fullPath)) {
            fs.rmSync(fullPath, { recursive: true, force: true });
          }
        } else {
          execSync(`git checkout HEAD -- "${file}"`, {
            cwd: projectDir,
            stdio: "pipe",
            encoding: "utf8",
          });
        }
      } else {
        execSync("git checkout . && git clean -fd", {
          cwd: projectDir,
          stdio: "pipe",
          encoding: "utf8",
        });
      }

      res.json({ ok: true, message: "Reverted successfully" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // 4. Git Commit (Strict lowercase rule enforced)
  app.post("/workspace/git-commit", (req, res) => {
    try {
      const { project, message } = req.body || {};
      const projectDir = resolveWorkspaceProject(project);
      if (!fs.existsSync(projectDir)) {
        return res.status(404).json({ error: "Project directory not found" });
      }

      let commitMsg = (message || "update changes").trim().toLowerCase();
      if (!commitMsg) commitMsg = "update changes";

      execSync("git add -A", { cwd: projectDir, stdio: "pipe" });
      execSync(`git commit -m ${JSON.stringify(commitMsg)}`, {
        cwd: projectDir,
        stdio: "pipe",
        encoding: "utf8",
      });

      res.json({ ok: true, commitMsg });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}
