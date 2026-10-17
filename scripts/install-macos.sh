#!/usr/bin/env bash
set -euo pipefail

# DeepSeek MCP Studio — macOS installer
# Installs Bun (if missing), installs bridge deps, and prints next steps.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "==> DeepSeek MCP Studio installer (macOS)"
echo "    Repo: $ROOT"

# 1. Bun
if ! command -v bun >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "==> Bun not found — installing via Homebrew…"
    brew install oven-sh/bun/bun
  else
    echo "==> Bun not found — installing via install script…"
    curl -fsSL https://bun.com/install | bash
    export BUN_INSTALL="$HOME/.bun"
    export PATH="$BUN_INSTALL/bin:$PATH"
  fi
else
  echo "==> Bun found: $(bun --version)"
fi

# 2. Dependencies
echo "==> Installing bridge dependencies…"
cd "$ROOT/bridge"
bun install

# 3. Done
echo ""
echo "✅ Install complete!"
echo ""
echo "Next steps:"
echo "  1. Start the bridge:   bun run \"$ROOT/bridge/server.js\""
echo "  2. Open chrome://extensions → enable Developer mode → Load unpacked → select:"
echo "       $ROOT/extension"
echo "  3. Open https://chat.deepseek.com and start typing @filesystem …"
echo ""
echo "Tip: grant your terminal Full Disk Access in System Settings → Privacy & Security"
echo "     if you want the filesystem server to read protected folders."
echo ""
