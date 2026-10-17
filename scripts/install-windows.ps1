# DeepSeek MCP Studio — Windows installer (PowerShell)
# Installs Bun (if missing), installs bridge deps, and prints next steps.

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Write-Host "==> DeepSeek MCP Studio installer (Windows)"
Write-Host "    Repo: $Root"

# 1. Bun
$bun = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bun) {
    Write-Host "==> Bun not found - installing..."
    powershell -c "irm bun.sh/install.ps1 | iex"
    $env:Path = "$env:USERPROFILE\.bun\bin;$env:Path"
} else {
    Write-Host "==> Bun found: $(& bun --version)"
}

# 2. Dependencies
Write-Host "==> Installing bridge dependencies..."
Push-Location (Join-Path $Root "bridge")
try { bun install } finally { Pop-Location }

# 3. Done
Write-Host ""
Write-Host "Install complete!"
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Start the bridge:   bun run `"$Root\bridge\server.js`""
Write-Host "  2. Open chrome://extensions -> enable Developer mode -> Load unpacked -> select:"
Write-Host "       $Root\extension"
Write-Host "  3. Open https://chat.deepseek.com and start typing @filesystem ..."
Write-Host ""
Write-Host "Note: update paths in bridge\mcp-config.json to Windows paths (e.g. C:/Users/You/projects)."
Write-Host ""
