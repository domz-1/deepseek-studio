# DeepSeek MCP Studio — System Architecture & Reference Manual

## 1. System Overview

**DeepSeek MCP Studio** transforms the web interface of `chat.deepseek.com` into an autonomous, high-speed coding workstation connected to local machine capabilities via the Model Context Protocol (MCP).

```
┌────────────────────────────────────────────────────────┐
│             DeepSeek Web (chat.deepseek.com)           │
│   ┌────────────────────────────────────────────────┐   │
│   │   Chrome Extension (Content + UI + Watchdog)   │   │
│   │   • Top Badge Bar (Projects, [🔁 Ralph], [Undo])│   │
│   │   • Queue Worker & Auto-Continue Watchdog      │   │
│   │   • Resilient JSON Repair Parser               │   │
│   └───────────────────────┬────────────────────────┘   │
└───────────────────────────┼────────────────────────────┘
                            │ HTTP + Bearer Token
                            ▼
┌────────────────────────────────────────────────────────┐
│            Local Bun Bridge (127.0.0.1:43210)          │
│   • In-Memory RAM Caches (5-min TTL)                   │
│   • 50-Step Undo History Stack                         │
│   • Diff-Only & Semantic Output Pruner                 │
│   • Ralph Loop Auto-Verification Daemon                │
└───────┬───────────────────┬────────────────────┬───────┘
        ▼                   ▼                    ▼
┌───────────────┐   ┌────────────────┐   ┌───────────────┐
│  Filesystem   │   │  Bash & Shell  │   │    Memory     │
│  (Read/Write) │   │ (command-server│   │ (Graph Store) │
└───────────────┘   └────────────────┘   └───────────────┘
```

---

## 2. Core Capabilities & Performance Suite

### 🔁 Ralph Autonomous Loop (`ralph_loop` & `RALPH_AUTO_VERIFY`)

- **Iterative Test-Fix-Verify Cycle**: Orchestrates autonomous development loops. DeepSeek executes a fix, runs tests (`bun test` or `bunx tsc --noEmit`), and if an error is detected, receives targeted diagnostics instructing it to patch the code without user intervention (up to 5 iterations).
- **Auto-Verification Hook**: When enabled via the `[🔁 Ralph]` button in the UI, every code modification (`smart_patch`, `write_file`, `workspace_batch`) automatically triggers `hot_check` in the background and injects the test result into the same turn, cutting model round-trips by 50%.

### ⚡ 10ms Symbol Finder (`symbol_find`)

- Uses binary `ripgrep` (`rg`) to search across thousands of files for function, class, interface, type, or constant definitions in under 10ms.
- Prevents DeepSeek from reading 1,000-line files to find a single declaration, saving context tokens and reducing latency.

### 🛠️ Smart AST Code Patcher (`smart_patch`)

- Direct in-memory string and block replacement tool.
- Eliminates bash quote-escaping syntax errors and broken multi-line `sed -i` commands.

### ⏪ 1-Click Instant File Undo (`/undo` & UI Button)

- Automatically records a file snapshot before any write or patch operation (retaining up to 50 previous versions).
- Clicking the `[Undo]` button in the top badge bar immediately reverts the most recent modification.

### 🔔 Native Desktop Notifications & Audio Bell (`/notify`)

- Sends Linux system notifications via `notify-send` and emits an audio terminal alert (`\x07`) when queued jobs finish.

### 📦 Workspace Batch Runner (`workspace_batch`)

- Writes multiple files and executes verification commands sequentially in a single atomic turn.

### 🛡️ Resilient JSON Repair Parser (`repairJson`)

- Safely extracts tool names and arguments (commands, paths, content) even when models omit quotes or output unescaped double quotes inside bash strings.

### ⏱️ Responsive Watchdog Heartbeat

- Automatically monitors generation state. If a tool output stalls without response for 90 seconds, it resends the message to keep autonomous workflows moving forward.

---

## 3. Bridge Server Endpoints

The bridge server runs locally at `http://127.0.0.1:43210` and requires the `X-Bridge-Token` header for protected calls (token stored in `bridge/.bridge-token`).

| Endpoint             | Method         | Description                                                             |
| :------------------- | :------------- | :---------------------------------------------------------------------- |
| `/status`            | `GET`          | Returns bridge status and server health.                                |
| `/mcp`               | `GET` / `POST` | Lists or updates MCP server configurations.                             |
| `/call`              | `POST`         | Executes an MCP tool (`name`, `arguments`, `project`).                  |
| `/kill`              | `POST`         | Cancels a running tool execution by `callId` or kills all active calls. |
| `/projects`          | `GET`          | Discovers available projects under `/home/adham/projects`.              |
| `/project-skeleton`  | `GET`          | Returns a tree structure of the workspace via binary `fd`.              |
| `/ralph-mode`        | `GET` / `POST` | Inspects or toggles Ralph Loop Auto-Verification mode.                  |
| `/undo`              | `POST`         | Reverts the last file modification from snapshot history.               |
| `/notify`            | `POST`         | Dispatches Linux desktop notification and terminal audio bell.          |
| `/read-file-content` | `POST`         | Fetches file text for `@file` autocomplete injection.                   |

---

## 4. MCP Tools Reference

### Shell & Coding Tools (`bash` server)

- `execute_command` / `bash`: Run shell commands with output truncation and noise filtering.
- `smart_patch`: Replace exact code blocks without sed escaping bugs (`path`, `search`, `replace`).
- `ralph_loop`: Manage autonomous test-fix iterations (`action`, `task`, `verify_command`, `max_iterations`).
- `symbol_find`: Locate definitions in <10ms via ripgrep (`symbol`, `cwd`).
- `hot_check`: Run in-memory compilation and type check (~30ms) (`command`, `cwd`).
- `workspace_batch`: Atomic multi-file writer and command runner (`files`, `commands`, `cwd`).
- `git_diff_summary`: Compact git status and unified diff (`stat_only`, `cwd`).

### Filesystem Tools (`filesystem` server)

- `read_file`, `write_file`, `edit_file`, `list_directory`, `directory_tree`, `search_files`, `get_file_info`.

### Memory Tools (`memory` server)

- `read_graph`, `search_nodes`, `open_nodes`, `create_entities`, `create_relations`.

---

## 5. Operations & Troubleshooting

### Start / Restart Bridge Daemon

```bash
cd /home/adham/projects/adham/deepseek-mcp-ext/bridge
bun run server.js
```

### Stop Bridge Server

```bash
pkill -f "bun run server.js"
```

### Run Type & Syntax Checks

```bash
bun test
bunx prettier --check bridge/ extension/
```

### Verify Endpoints via Curl

```bash
# Check Ralph status
curl -s http://127.0.0.1:43210/ralph-mode

# Test Desktop Notification
curl -s -X POST http://127.0.0.1:43210/notify -H "Content-Type: application/json" -d '{"title":"Test","message":"Bridge OK"}'

# Test Symbol Lookup
curl -s -X POST http://127.0.0.1:43210/call \
  -H "Content-Type: application/json" \
  -H "X-Bridge-Token: $(cat bridge/.bridge-token)" \
  -d '{"name": "symbol_find", "arguments": {"symbol": "badgeBar", "cwd": "/home/adham/projects/adham/deepseek-mcp-ext"}}'
```
