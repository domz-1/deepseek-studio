const $ = (id) => document.getElementById(id);

let currentCfg = { mcpServers: {} };
let cachedTools = [];
let customSkills = [];

function activate(tab) {
  ["t-list", "t-json", "t-skills"].forEach((t) =>
    $(t).classList.remove("active"),
  );
  ["p-list", "p-json", "p-skills"].forEach((p) =>
    $(p).classList.remove("active"),
  );
  $(tab).classList.add("active");
  $("p-" + tab.split("t-")[1]).classList.add("active");
}
$("t-list").onclick = () => activate("t-list");
$("t-json").onclick = () => activate("t-json");
$("t-skills").onclick = () => {
  activate("t-skills");
  renderSkills();
};

async function apiGetMCP() {
  const bgRes = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: "GET_MCP" }, r),
  );
  if (bgRes && bgRes.ok) return bgRes.data;
  throw new Error((bgRes && bgRes.error) || "Bridge unreachable");
}

async function apiSaveMCP(config) {
  const bgRes = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: "SAVE_MCP", config }, r),
  );
  if (bgRes && bgRes.ok) return bgRes.data;
  throw new Error((bgRes && bgRes.error) || "Bridge unreachable");
}

// Load the stored token into the field
async function loadToken() {
  const bgRes = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: "GET_TOKEN" }, r),
  );
  if (bgRes && bgRes.ok && bgRes.data && bgRes.data.token) {
    $("token-in").value = bgRes.data.token;
  }
}

$("save-token").onclick = async () => {
  const token = $("token-in").value.trim();
  const bgRes = await new Promise((r) =>
    chrome.runtime.sendMessage({ type: "SET_TOKEN", token }, r),
  );
  if (bgRes && bgRes.ok) {
    $("save-token").innerHTML =
      '<span class=\"ds-ic\" data-ic=\"check\"></span>';
    setTimeout(() => ($("save-token").textContent = "Set"), 1200);
    load();
  } else {
    alert("Failed to save token: " + (bgRes && bgRes.error));
  }
};

async function load() {
  try {
    const data = await apiGetMCP();
    if (!data || data.error || !data.config)
      throw new Error((data && data.error) || "Invalid response");
    currentCfg = data.config;
    cachedTools = data.tools || [];
    const status = data.status || {};
    $("tot").textContent = cachedTools.length + " tools ready";
    $("json-ed").value = JSON.stringify(currentCfg, null, 2);
    const entries = Object.entries(currentCfg.mcpServers || {});
    if (!entries.length) {
      $("srv-list").innerHTML =
        '<div class="ds-msg ds-msg-muted">No servers defined in JSON.</div>';
      return;
    }
    $("srv-list").innerHTML = entries
      .map(([name, srv]) => {
        const st = status[name] || {};
        const checked = srv.enabled !== false ? "checked" : "";
        return (
          '<div class="srv-card"><div><span class="dot ' +
          (st.online ? "on" : "") +
          '"></span><b>' +
          name +
          '</b><div class="ds-srv-meta">' +
          srv.command +
          " " +
          (srv.args || []).join(" ") +
          " (" +
          (st.count || 0) +
          ' tools)</div></div><input type="checkbox" class="ds-srv-check" data-srv="' +
          name +
          '" ' +
          checked +
          " /></div>"
        );
      })
      .join("");
    document.querySelectorAll("input[data-srv]").forEach((cb) => {
      cb.onchange = async (e) => {
        const name = e.target.dataset.srv;
        currentCfg.mcpServers[name].enabled = e.target.checked;
        $("srv-list").innerHTML =
          '<div class="ds-msg ds-msg-accent">Reloading...</div>';
        try {
          await apiSaveMCP(currentCfg);
          await load();
        } catch (err) {
          $("srv-list").innerHTML =
            '<div class="ds-msg ds-msg-danger">Error: ' +
            err.message +
            "</div>";
        }
      };
    });
  } catch (err) {
    $("srv-list").innerHTML =
      '<div class="ds-msg ds-msg-danger"><b>Bridge offline or unreachable:</b><br>' +
      err.message +
      "<br><br>Run in terminal:<br><code>cd bridge &amp;&amp; bun run server.js</code></div>";
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
  } catch (e) {
    $("save-json").textContent = "Save & Reload Servers";
    alert("Failed to save: " + e.message);
  }
};

async function renderSkills() {
  customSkills = await window.DSSkills.getCustomSkills();
  const all = await window.DSSkills.loadSkills();
  const list = $("sk-list");
  if (!all.length) {
    list.innerHTML = '<div class="muted">No skills yet.</div>';
    return;
  }
  list.innerHTML = all
    .map((s) => {
      const isCustom = customSkills.some(
        (c) => window.DSSkills.slugify(c.name) === s.name,
      );
      return (
        '<div class="skill-card"><div class="nm">' +
        (window.DSIcon ? window.DSIcon.forSkill(s) : s.emoji || "") +
        " /" +
        s.name +
        (isCustom
          ? ' <span class="ds-flag-custom">custom</span>'
          : ' <span class="ds-flag-builtin">built-in</span>') +
        '</div><div class="ds">' +
        (s.description || "") +
        '</div><div class="pr">' +
        (s.prompt === "__HELP__" ? "(lists all skills)" : s.prompt || "") +
        "</div>" +
        (isCustom
          ? '<div class="row ds-row-tight"><button class="mini" data-edit="' +
            s.name +
            '">Edit</button><button class="dang" data-del="' +
            s.name +
            '">Delete</button></div>'
          : "") +
        "</div>"
      );
    })
    .join("");
  list.querySelectorAll("[data-del]").forEach((b) => {
    b.onclick = async () => {
      const name = b.dataset.del;
      customSkills = customSkills.filter(
        (c) => window.DSSkills.slugify(c.name) !== name,
      );
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
      $("sk-emoji").value =
        s.icon || (window.DSIcon ? window.DSIcon.name(s) : "");
      $("sk-desc").value = s.description;
      $("sk-prompt").value = s.prompt;
      window.scrollTo(0, document.body.scrollHeight);
    };
  });
}

function populateIconSelect() {
  const sel = $("sk-emoji");
  if (!sel || sel.dataset.filled) return;
  const names =
    window.DSIcon && window.DSIcon.names ? window.DSIcon.names() : ["sparkles"];
  sel.innerHTML =
    '<option value="">default (sparkles)</option>' +
    names.map((n) => '<option value="' + n + '">' + n + "</option>").join("");
  sel.dataset.filled = "1";
}

$("sk-add").onclick = async () => {
  const name = window.DSSkills.slugify($("sk-name").value);
  const icon = $("sk-emoji").value.trim();
  const desc = $("sk-desc").value.trim();
  const prompt = $("sk-prompt").value.trim();
  if (!name) return alert("Name is required.");
  if (!prompt) return alert("Prompt is required.");
  const list = await window.DSSkills.getCustomSkills();
  const filtered = list.filter((s) => window.DSSkills.slugify(s.name) !== name);
  filtered.push({ name, icon, description: desc, prompt });
  await window.DSSkills.saveCustomSkills(filtered);
  $("sk-name").value = "";
  $("sk-emoji").value = "";
  $("sk-desc").value = "";
  $("sk-prompt").value = "";
  renderSkills();
};

$("inj").onclick = async () => {
  if (!cachedTools.length)
    return alert("0 active tools. Enable a server first.");
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.tabs.sendMessage(tabs[0].id, {
    type: "INJECT_NOW",
    tools: cachedTools,
  });
  window.close();
};

document.addEventListener("DOMContentLoaded", () => {
  loadToken();
  load();
  populateIconSelect();
  renderSkills();
});
