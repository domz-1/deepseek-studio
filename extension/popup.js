const $ = (id) => document.getElementById(id);

let currentCfg = { mcpServers: {} };
let cachedTools = [];
let customSkills = [];

function activate(tab) {
  ["t-list", "t-json", "t-skills"].forEach((t) => $(t).classList.remove("active"));
  ["p-list", "p-json", "p-skills"].forEach((p) => $(p).classList.remove("active"));
  $(tab).classList.add("active");
  $("p-" + tab.split("t-")[1]).classList.add("active");
}
$("t-list").onclick = () => activate("t-list");
$("t-json").onclick = () => activate("t-json");
$("t-skills").onclick = () => { activate("t-skills"); renderSkills(); };

async function apiGetMCP() {
  try {
    const res = await fetch("http://localhost:43210/mcp");
    if (!res.ok) throw new Error("HTTP error " + res.status);
    return await res.json();
  } catch (err) {
    const bgRes = await new Promise((r) => chrome.runtime.sendMessage({ type: "GET_MCP" }, r));
    if (bgRes && bgRes.ok) return bgRes.data;
    throw new Error((bgRes && bgRes.error) || err.message);
  }
}

async function apiSaveMCP(config) {
  try {
    const res = await fetch("http://localhost:43210/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error("HTTP error " + res.status);
    return await res.json();
  } catch (err) {
    const bgRes = await new Promise((r) => chrome.runtime.sendMessage({ type: "SAVE_MCP", config }, r));
    if (bgRes && bgRes.ok) return bgRes.data;
    throw new Error((bgRes && bgRes.error) || err.message);
  }
}

async function load() {
  try {
    const data = await apiGetMCP();
    if (!data || data.error || !data.config) throw new Error((data && data.error) || "Invalid response");
    currentCfg = data.config;
    cachedTools = data.tools || [];
    const status = data.status || {};
    $("tot").textContent = cachedTools.length + " tools ready";
    $("json-ed").value = JSON.stringify(currentCfg, null, 2);
    const entries = Object.entries(currentCfg.mcpServers || {});
    if (!entries.length) { $("srv-list").innerHTML = '<div style="color:#a6adc8;padding:8px;">No servers defined in JSON.</div>'; return; }
    $("srv-list").innerHTML = entries.map(([name, srv]) => {
      const st = status[name] || {};
      const checked = srv.enabled !== false ? "checked" : "";
      return '<div class="srv-card"><div><span class="dot ' + (st.online ? "on" : "") + '"></span><b>' + name + '</b><div style="font-size:10px;color:#a6adc8;margin-left:14px;">' + srv.command + ' ' + (srv.args || []).join(" ") + ' (' + (st.count || 0) + ' tools)</div></div><input type="checkbox" data-srv="' + name + '" ' + checked + ' style="cursor:pointer;width:16px;height:16px;" /></div>';
    }).join("");
    document.querySelectorAll("input[data-srv]").forEach((cb) => {
      cb.onchange = async (e) => {
        const name = e.target.dataset.srv;
        currentCfg.mcpServers[name].enabled = e.target.checked;
        $("srv-list").innerHTML = '<div style="color:#89b4fa;padding:8px;">Reloading...</div>';
        try { await apiSaveMCP(currentCfg); await load(); } catch (err) { $("srv-list").innerHTML = '<div style="color:#f38ba8;padding:8px;">Error: ' + err.message + '</div>'; }
      };
    });
  } catch (err) {
    $("srv-list").innerHTML = '<div style="color:#f38ba8;padding:8px;"><b>Bridge offline or unreachable:</b><br>' + err.message + '<br><br>Run in terminal:<br><code>cd bridge &amp;&amp; bun run server.js</code></div>';
  }
}

$("save-json").onclick = async () => {
  try {
    const parsed = JSON.parse($("json-ed").value);
    $("save-json").textContent = "Spawning...";
    await apiSaveMCP(parsed);
    $("save-json").textContent = "Save & Reload Servers";
    activate("t-list");
    await load();
  } catch (e) { $("save-json").textContent = "Save & Reload Servers"; alert("Failed to save: " + e.message); }
};

async function renderSkills() {
  customSkills = await window.DSSkills.getCustomSkills();
  const all = await window.DSSkills.loadSkills();
  const list = $("sk-list");
  if (!all.length) { list.innerHTML = '<div class="muted">No skills yet.</div>'; return; }
  list.innerHTML = all.map((s) => {
    const isCustom = customSkills.some((c) => window.DSSkills.slugify(c.name) === s.name);
    return '<div class="skill-card"><div class="nm">' + s.emoji + ' /' + s.name + (isCustom ? ' <span style="color:#a6e3a1;font-size:9px;">custom</span>' : ' <span style="color:#a6adc8;font-size:9px;">built-in</span>') + '</div><div class="ds">' + (s.description || "") + '</div><div class="pr">' + (s.prompt === "__HELP__" ? "(lists all skills)" : (s.prompt || "")) + '</div>' + (isCustom ? '<div class="row" style="margin-top:6px;"><button class="mini" data-edit="' + s.name + '">Edit</button><button class="dang" data-del="' + s.name + '">Delete</button></div>' : '') + '</div>';
  }).join("");
  list.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      const name = b.dataset.del;
      customSkills = customSkills.filter((c) => window.DSSkills.slugify(c.name) !== name);
      await window.DSSkills.saveCustomSkills(customSkills);
      renderSkills();
    };
  });
  list.querySelectorAll("[data-edit]").forEach((b) => {
    b.onclick = () => {
      const name = b.dataset.edit;
      const s = all.find((x) => x.name === name);
      if (!s) return;
      $("sk-name").value = s.name;
      $("sk-emoji").value = s.emoji;
      $("sk-desc").value = s.description;
      $("sk-prompt").value = s.prompt;
      window.scrollTo(0, document.body.scrollHeight);
    };
  });
}

$("sk-add").onclick = async () => {
  const name = window.DSSkills.slugify($("sk-name").value);
  const emoji = $("sk-emoji").value.trim() || "✨";
  const desc = $("sk-desc").value.trim();
  const prompt = $("sk-prompt").value.trim();
  if (!name) return alert("Name is required.");
  if (!prompt) return alert("Prompt is required.");
  const list = await window.DSSkills.getCustomSkills();
  const filtered = list.filter((s) => window.DSSkills.slugify(s.name) !== name);
  filtered.push({ name, emoji, description: desc, prompt });
  await window.DSSkills.saveCustomSkills(filtered);
  $("sk-name").value = "";
  $("sk-emoji").value = "";
  $("sk-desc").value = "";
  $("sk-prompt").value = "";
  renderSkills();
};

$("inj").onclick = async () => {
  if (!cachedTools.length) return alert("0 active tools. Enable a server first.");
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tabs[0].id, { type: "INJECT_NOW", tools: cachedTools });
  window.close();
};

document.addEventListener("DOMContentLoaded", () => { load(); renderSkills(); });
