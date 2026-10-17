const API = 'http://localhost:43210';

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const run = async () => {
    if (msg.type === 'GET_MCP') {
      const r = await fetch(`${API}/mcp`);
      return await r.json();
    }
    if (msg.type === 'SAVE_MCP') {
      const r = await fetch(`${API}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg.config)
      });
      return await r.json();
    }
    if (msg.type === 'CALL') {
      const r = await fetch(`${API}/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(msg.payload)
      });
      return await r.json();
    }
  };
  run().then(data => sendResponse({ ok: true, data })).catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});
