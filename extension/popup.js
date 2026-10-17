const $ = (id) => document.getElementById(id);

let currentCfg = { mcpServers: {} };
let cachedTools = [];

$("t-list").onclick = () => {
  $("t-list").classList.add("active");
  $("t-json").classList.remove("active");
  $("p-list").classList.add("active");
  $("p-json").classList.remove("active");
};

$("t-json").onclick = () => {
  $("t-json").classList.add("active");
  $("t-list").classList.remove("active");
  $("p-json").classList.add("active");
  $("p-list").classList.remove("active");
};

async function apiGetMCP() {
  try {
    const res = await fetch("http://localhost:43210/mcp");
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(
      "Direct fetch failed, falling back to background worker:",
      err,
    );
    const bgRes = await new Promise((r) =>
      chrome.runtime.sendMessage({ type: "GET_MCP" }, r),
    );
    if (bgRes?.ok) return bgRes.data;
    throw new Error(bgRes?.error || err.message);
  }
}

async function apiSaveMCP(config) {
  try {
    const res = await fetch("http://localhost:43210/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    return await res.json();
  } catch (err) {
    const bgRes = await new Promise((r) =>
      chrome.runtime.sendMessage({ type: "SAVE_MCP", config }, r),
    );
    if (bgRes?.ok) return bgRes.data;
    throw new Error(bgRes?.error || err.message);
  }
}

async function load() {
  try {
    const data = await apiGetMCP();
    if (!data || data.error || !data.config) {
      throw new Error(data?.error || "Invalid response from bridge");
    }

    currentCfg = data.config;
    cachedTools = data.tools || [];
    const status = data.status || {};

    $("tot").textContent = `${cachedTools.length} tools ready`;
    $("json-ed").value = JSON.stringify(currentCfg, null, 2);

    const entries = Object.entries(currentCfg.mcpServers || {});
    if (!entries.length) {
      $("srv-list").innerHTML =
        '<div style="color:#a6adc8;padding:8px;">No servers defined in JSON.</div>';
      return;
    }

    $("srv-list").innerHTML = entries
      .map(([name, srv]) => {
        const st = status[name] || {};
        const checked = srv.enabled !== false ? "checked" : "";
        return `
        <div class="srv-card">
          <div>
            <span class="dot ${st.online ? "on" : ""}"></span>
            <b>${name}</b>
            <div style="font-size:10px;color:#a6adc8;margin-left:14px;">
              ${srv.command} ${(srv.args || []).join(" ")} (${st.count || 0} tools)
            </div>
          </div>
          <input type="checkbox" data-srv="${name}" ${checked} style="cursor:pointer;width:16px;height:16px;" />
        </div>
      `;
      })
      .join("");

    document.querySelectorAll("input[data-srv]").forEach((cb) => {
      cb.onchange = async (e) => {
        const name = e.target.dataset.srv;
        currentCfg.mcpServers[name].enabled = e.target.checked;
        $("srv-list").innerHTML =
          '<div style="color:#89b4fa;padding:8px;">Reloading MCP servers...</div>';
        try {
          await apiSaveMCP(currentCfg);
          await load();
        } catch (err) {
          $("srv-list").innerHTML =
            `<div style="color:#f38ba8;padding:8px;">Error: ${err.message}</div>`;
        }
      };
    });
  } catch (err) {
    console.error("Load error:", err);
    $("srv-list").innerHTML = `
      <div style="color:#f38ba8;padding:8px;">
        <b>Bridge offline or unreachable:</b><br>${err.message}<br><br>
        Run in terminal:<br><code>cd /home/adham/projects/adham/deepseek-mcp-ext/bridge && bun run server.js</code>
      </div>
    `;
  }
}

$("save-json").onclick = async () => {
  try {
    const parsed = JSON.parse($("json-ed").value);
    $("save-json").textContent = "Spawning...";
    await apiSaveMCP(parsed);
    $("save-json").textContent = "Save & Reload Servers";
    $("t-list").click();
    await load();
  } catch (e) {
    $("save-json").textContent = "Save & Reload Servers";
    alert("Failed to save: " + e.message);
  }
};

$("inj").onclick = async () => {
  if (!cachedTools.length)
    return alert("0 active tools. Enable a server first.");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tab.id, { type: "INJECT_NOW", tools: cachedTools });
  window.close();
};

document.addEventListener("DOMContentLoaded", load);
