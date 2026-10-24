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

  async function getApiUrl() {
    try {
      const { bridgePort } = await chrome.storage.local.get("bridgePort");
      const port = Number(bridgePort) || 43210;
      return `http://127.0.0.1:${port}`;
    } catch (_) {
      return "http://127.0.0.1:43210";
    }
  }

  async function bridgeFetch(path: string, init: RequestInit = {}) {
    const api = await getApiUrl();
    const token = await getToken();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((init.headers as Record<string, string>) || {}),
    };
    if (token) headers["x-bridge-token"] = token;
    const res = await fetch(`${api}${path}`, { ...init, headers });
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
      if (msg.type === "GET_SKILLS") return await bridgeFetch("/skills");
      if (msg.type === "GET_TOKEN") return { token: await getToken() };
      if (msg.type === "SERVER_START") {
        return await bridgeFetch("/server/start", { method: "POST" });
      }
      if (msg.type === "SERVER_STOP") {
        return await bridgeFetch("/server/stop", { method: "POST" });
      }
      if (msg.type === "SERVER_RESTART") {
        return await bridgeFetch("/server/restart", { method: "POST" });
      }
      if (msg.type === "SERVER_STATE") {
        return await bridgeFetch("/server/state");
      }
      throw new Error(`unknown message: ${msg.type}`);
    };

    run()
      .then((data) => sendResponse({ ok: true, data }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  });

  console.log("[DeepSeek Studio Vue] Background bridge proxy active.");
});
