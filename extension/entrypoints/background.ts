export default defineBackground(() => {
  const API = "http://127.0.0.1:43210";

  async function getToken() {
    try {
      const { bridgeToken } = await chrome.storage.local.get("bridgeToken");
      return bridgeToken || "";
    } catch (_) {
      return "";
    }
  }

  async function bridgeFetch(path: string, init: RequestInit = {}) {
    const token = await getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    };
    if (token) headers["x-bridge-token"] = token;
    const res = await fetch(`${API}${path}`, { ...init, headers });
    if (!res.ok) {
      let body: any = {};
      try {
        body = await res.json();
      } catch (_) {}
      throw new Error(body.error || `bridge ${res.status}`);
    }
    return res.json();
  }

  chrome.runtime.onMessage.addListener((msg: any, _sender, sendResponse) => {
    const run = async () => {
      if (msg.type === "GET_MCP") return await bridgeFetch("/mcp");
      if (msg.type === "CALL") {
        return await bridgeFetch("/call", {
          method: "POST",
          body: JSON.stringify(msg.payload),
        });
      }
      if (msg.type === "GET_PROJECTS") return await bridgeFetch("/projects");
      if (msg.type === "GET_TOKEN") return { token: await getToken() };
      throw new Error(`unknown message: ${msg.type}`);
    };

    run()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  });

  console.log("[DeepSeek Studio Vue] Background bridge proxy active.");
});
