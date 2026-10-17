# Changelog

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-10-17

### Added
- **Skills system** — reusable prompt bundles triggered with a leading `/name`.
  - 10 built-in skills: `/help`, `/explain`, `/review`, `/refactor`, `/tests`, `/debug`, `/commit`, `/summarize`, `/translate-ar`, `/translate-en`.
  - Slash-autocomplete dropdown in the chat box.
  - Custom skills managed from a new **Skills** tab in the popup (add / edit / delete), stored in `chrome.storage.local`.
  - Skills combine with `@server` mentions.
- New `extension/skills.js` engine.
- `unlimitedStorage` permission.

### Changed
- `content.js` input handler now recognises both `@` and `/` triggers.
- Popup reworked with three tabs: Servers, JSON, Skills.

## [1.0.0] - 2026-10-17

### Added
- Initial public release.
- Local **MCP bridge** (`bridge/server.js`) exposing `GET /mcp`, `POST /mcp`, and `POST /call` on port `43210`.
- Built-in **bash/shell MCP server** (`bridge/command-server.js`) with the `execute_command` tool.
- **Chrome extension (Manifest V3)** that injects a live tool banner, `@mention` autocomplete, and permission cards into the DeepSeek chat UI.
- Safe-tool detection and an **Auto-run** toggle.
- Cross-platform install scripts for **Linux**, **macOS**, and **Windows**.
- Extension icon (`assets/icon.png`).
- Full setup + troubleshooting documentation for all three platforms.
