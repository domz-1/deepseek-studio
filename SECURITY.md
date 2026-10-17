# Security Model

DeepSeek Studio executes real commands and reads real files on your machine.
This document states the threat model plainly so you can make an informed choice.

## Default posture (secure)

- The bridge binds to `127.0.0.1` only (never `0.0.0.0`).
- CORS is restricted to `https://chat.deepseek.com` and browser-extension origins.
- Every request must carry `x-bridge-token`, a 32-byte secret generated at first
  boot into `bridge/.bridge-token` (chmod 600). The token is stored only in
  `chrome.storage.local` and attached by the extension's service worker — it is
  never placed in the page's `window`, DOM, or network-visible form state.
- The `/fs-index` endpoint is **metadata-only**: name, path, size, mtime. It
  never returns file contents and refuses to index `/`, `/home`, or `/home/<user>`.

## What the bridge can do

`POST /call` proxies an MCP tool call. With the `bash` server enabled, a tool
call runs an arbitrary shell command as your user. This is the whole point of
the product — and the whole risk.

## The accepted-risk escape hatch: `BRIDGE_UNSAFE=1`

Setting `BRIDGE_UNSAFE=1` restores the legacy behaviour: bind to all interfaces,
wildcard CORS, and **no token**. In that mode the exact attack is:

> Any web page you visit can issue `fetch('http://localhost:43210/call', {method:'POST', body: JSON.stringify({name:'bash', arguments:{command:'…'}})})`
> and achieve **remote code execution** on your machine. The permission card in
> the extension is irrelevant, because the attacker bypasses the UI and hits the
> endpoint directly.

Do not run `BRIDGE_UNSAFE=1` on a machine holding credentials, SSH keys, or
production data. It exists for demos on disposable environments only.

## Mitigations in place

| Layer | Control |
|---|---|
| Network | loopback bind (default) |
| Origin | allowlist + extension origins |
| Auth | per-call bearer token |
| Index | metadata-only, root-allowlisted, depth-capped |
| Approval | permission cards for write/execute tools |

## Reporting

This is a personal project. If you find an issue, open a private advisory on the
GitHub repo rather than a public issue.
