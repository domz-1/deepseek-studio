// DeepSeek MCP Studio — background service worker.
// All bridge traffic flows through here so the page never sees the token.
const API = 'http://127.0.0.1:43210';

async function getToken() {
  const { bridgeToken } = await chrome.storage.local.get('bridgeToken');
  return bridgeToken || '';
}

async function bridgeFetch(path, init = {}) {
  const token = await getToken();
  const headers = { 'Content-Type': 'application/json', ...(init.headers || {}) };
  if (token) headers['x-bridge-token'] = token;
  const res = await fetch(`${API}${path}`, { ...init, headers });
  if (!res.ok) {
    let body = {};
    try { body = await res.json(); } catch (_) {}
    throw new Error(body.error || `bridge ${res.status}`);
  }
  return res.json();
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = async () => {
    if (msg.type === 'GET_MCP') return await bridgeFetch('/mcp');
    if (msg.type === 'SAVE_MCP')
      return await bridgeFetch('/mcp', { method: 'POST', body: JSON.stringify(msg.config) });
    if (msg.type === 'CALL')
      return await bridgeFetch('/call', { method: 'POST', body: JSON.stringify(msg.payload) });
    if (msg.type === 'KILL')
      return await bridgeFetch('/kill', {
        method: 'POST',
        body: JSON.stringify(msg.callId ? { callId: msg.callId } : {}),
      });
    if (msg.type === 'FS_INDEX') {
      const q = encodeURIComponent(msg.q || '');
      const refresh = msg.refresh ? '&refresh=1' : '';
      return await bridgeFetch(`/fs-index?q=${q}&limit=${msg.limit || 50}${refresh}`);
    }
    if (msg.type === 'SET_TOKEN') {
      await chrome.storage.local.set({ bridgeToken: msg.token || '' });
      return { ok: true };
    }
    if (msg.type === 'GET_TOKEN') return { token: await getToken() };
    throw new Error(`unknown message: ${msg.type}`);
  };
  run()
    .then((data) => sendResponse({ ok: true, data }))
    .catch((err) => sendResponse({ ok: false, error: err.message }));
  return true;
});
