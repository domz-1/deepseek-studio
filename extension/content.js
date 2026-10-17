let debounceTimer = null;
let activeTools = [];
let serverStatus = {};
let autoApprove = localStorage.getItem("deepseek_mcp_auto_approve") !== "false";
let isSending = false;

const SAFE_TOOLS = new Set([
  "read_file",
  "read_text_file",
  "read_media_file",
  "read_multiple_files",
  "list_directory",
  "list_directory_with_sizes",
  "directory_tree",
  "search_files",
  "get_file_info",
  "list_allowed_directories",
  "read_graph",
  "search_nodes",
  "open_nodes",
]);

async function fetchActiveTools() {
  try {
    const res = await fetch("http://localhost:43210/mcp");
    if (res.ok) {
      const data = await res.json();
      activeTools = data.tools || [];
      serverStatus = data.status || {};
      return activeTools;
    }
  } catch (_) {
    try {
      const bgRes = await new Promise((r) =>
        chrome.runtime.sendMessage({ type: "GET_MCP" }, r),
      );
      if (bgRes?.ok && bgRes.data?.tools) {
        activeTools = bgRes.data.tools;
        serverStatus = bgRes.data.status || {};
        return activeTools;
      }
    } catch (_) {}
  }
  return [];
}

fetchActiveTools();

function getChatInput() {
  return (
    document.querySelector('textarea[placeholder*="DeepSeek"]') ||
    document.querySelector("textarea#chat-input") ||
    document.querySelector("textarea")
  );
}

// Check if DeepSeek is generating (looking for square stop icon in the send button area)
function isDeepSeekGenerating() {
  const input = getChatInput();
  if (!input) return false;
  const wrapper =
    input.closest("div.ds-textarea-wrapper") ||
    input.parentElement?.parentElement ||
    document;
  const stopSquare = wrapper.querySelector("svg rect");
  return Boolean(stopSquare);
}

// React 18 / Vue compatible text setter
function setInputValue(el, text) {
  el.focus();
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    "value",
  ).set;
  valueSetter.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

// Find the blue arrow send button
function getSendButton() {
  const input = getChatInput();
  if (!input) return null;
  const wrapper =
    input.closest("div.ds-textarea-wrapper") ||
    input.parentElement?.parentElement ||
    document;
  const buttons = Array.from(
    wrapper.querySelectorAll('div[role="button"], button'),
  );
  for (const b of buttons) {
    const aria = (b.getAttribute("aria-label") || "").toLowerCase();
    if (
      aria.includes("file") ||
      aria.includes("attach") ||
      b.querySelector('input[type="file"]')
    ) {
      continue;
    }
    // DeepSeek send button has svg with path arrow (or blue class)
    if (b.classList.contains("ds-icon-button") || b.querySelector("svg path")) {
      return b;
    }
  }
  return null;
}

// Direct, instant, and reliable sender
async function sendText(text) {
  if (isSending) return;
  isSending = true;

  try {
    const el = getChatInput();
    if (!el) return;

    // 1. Wait if currently streaming
    let waited = 0;
    while (isDeepSeekGenerating() && waited < 15000) {
      await new Promise((r) => setTimeout(r, 400));
      waited += 400;
    }

    // 2. Set value
    setInputValue(el, text);
    await new Promise((r) => setTimeout(r, 150));

    // 3. Dispatch click on send button
    const sendBtn = getSendButton();
    if (sendBtn && !sendBtn.getAttribute("aria-disabled")) {
      sendBtn.click();
    }

    // Also dispatch Enter on textarea to guarantee trigger
    el.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }),
    );

    // 4. Verification check after 500ms
    await new Promise((r) => setTimeout(r, 500));
    if (el.value.trim().length > 0) {
      // If still not submitted, click again
      const btnAgain = getSendButton();
      if (btnAgain) btnAgain.click();
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          bubbles: true,
        }),
      );
    }
  } finally {
    isSending = false;
  }
}

// System prompts
const SYSTEM_PROMPT_STYLES = [
  (list) => `You have local workstation MCP tools:
${list}

Rules:
1. Always respond in English or Arabic only. Never use Chinese.
2. When you need to run a tool, output only this JSON block:
\`\`\`json
{
  "mcp_call": true,
  "name": "tool_name",
  "arguments": {}
}
\`\`\`
`,
  (list) => `Workstation tools active:
${list}

Guidelines:
- Respond in English or Arabic. Never use Chinese.
- Call tools using JSON:
\`\`\`json
{"name": "tool_name", "arguments": {}}
\`\`\`
`,
];

function buildSysPrompt(tools) {
  const list = tools
    .map(
      (t) =>
        `- [${t.server}] ${t.name}(${Object.keys(t.inputSchema?.properties || {}).join(", ")}): ${t.description?.slice(0, 80) || ""}`,
    )
    .join("\n");
  const template =
    SYSTEM_PROMPT_STYLES[
      Math.floor(Math.random() * SYSTEM_PROMPT_STYLES.length)
    ];
  return template(list);
}

// Popup injection
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "INJECT_NOW" && msg.tools) {
    activeTools = msg.tools;
    sendText(buildSysPrompt(msg.tools));
  }
});

// Mention filtering
function filterToolsByMention(mention, tools) {
  const m = mention.toLowerCase().replace(/^[@#/]/, "");
  if (m === "mcp" || m === "all" || !m) return tools;

  let filtered = tools.filter((t) => t.server && t.server.toLowerCase() === m);
  if (filtered.length) return filtered;

  filtered = tools.filter(
    (t) => t.server && t.server.toLowerCase().startsWith(m),
  );
  return filtered.length ? filtered : tools;
}

// Autocomplete Dropdown Popup
let autocompleteMenu = null;

function removeAutocomplete() {
  if (autocompleteMenu) {
    autocompleteMenu.remove();
    autocompleteMenu = null;
  }
}

// ===================== SKILLS (/slash commands) =====================
let loadedSkills = [];
let skillMenu = null;

async function refreshSkills() {
  try {
    if (window.DSSkills) loadedSkills = await window.DSSkills.loadSkills();
  } catch (e) {
    console.warn('[MCP] skills load failed', e);
  }
}
refreshSkills();

function removeSkillMenu() {
  if (skillMenu) {
    skillMenu.remove();
    skillMenu = null;
  }
}

function showSkillAutocomplete(inputEl, query) {
  removeSkillMenu();
  removeAutocomplete();
  if (!loadedSkills.length) return;
  const q = (query || '').toLowerCase();
  const opts = loadedSkills.filter(
    (s) => !q || s.name.startsWith(q) || (s.description || '').toLowerCase().includes(q),
  );
  if (!opts.length) return;

  const menu = document.createElement('div');
  skillMenu = menu;
  menu.id = 'deepseek-mcp-skillmenu';
  menu.style.cssText = 'position:absolute;bottom:calc(100% + 8px);left:12px;background:#181825;border:1px solid #45475a;border-radius:12px;box-shadow:0 12px 32px rgba(0,0,0,0.7);z-index:99999;padding:10px;width:460px;max-width:90vw;max-height:420px;overflow-y:auto;font-family:system-ui,sans-serif;color:#cdd6f4;';

  opts.forEach((s) => {
    const item = document.createElement('div');
    item.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:8px;cursor:pointer;font-size:14px;min-height:44px;box-sizing:border-box;';
    item.innerHTML =
      '<span style="font-size:20px;">' + s.emoji + '</span>' +
      '<span style="color:#cba6f7;font-weight:bold;">/' + s.name + '</span>' +
      '<span style="color:#a6adc8;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + (s.description || '') + '</span>';
    item.onmouseenter = () => (item.style.background = '#313244');
    item.onmouseleave = () => (item.style.background = 'transparent');
    item.onmousedown = (e) => {
      e.preventDefault();
      const val = inputEl.value;
      const newVal = val.replace(/\/[\w-]*$/, '/' + s.name + ' ');
      setInputValue(inputEl, newVal);
      removeSkillMenu();
    };
    menu.appendChild(item);
  });

  const wrapper = inputEl.closest('div.ds-textarea-wrapper') || inputEl.parentElement;
  wrapper.style.position = 'relative';
  wrapper.appendChild(menu);
}

function showAutocomplete(inputEl, query) {
  removeAutocomplete();
  const availableServers = Object.keys(serverStatus).length
    ? Object.keys(serverStatus)
    : ["filesystem", "bash", "memory"];
  const allOptions = [
    {
      id: "all",
      label: "@all",
      count: activeTools.length,
      desc: "All MCP Tools",
    },
    ...availableServers.map((s) => {
      const st = serverStatus[s] || {};
      return {
        id: s,
        label: `@${s}`,
        count: st.count || 0,
        desc: `${s} server tools`,
      };
    }),
  ];

  const filtered = allOptions.filter(
    (o) =>
      !query ||
      o.id.toLowerCase().startsWith(query.toLowerCase()) ||
      o.label.toLowerCase().startsWith(query.toLowerCase()),
  );

  if (!filtered.length) return;

  const menu = document.createElement("div");
  autocompleteMenu = menu;
  menu.id = "deepseek-mcp-autocomplete";
  menu.style.cssText = `
    position: absolute;
    bottom: calc(100% + 8px);
    left: 12px;
    background: #181825;
    border: 1px solid #45475a;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.6);
    z-index: 99999;
    padding: 6px;
    min-width: 220px;
    font-family: system-ui, sans-serif;
    color: #cdd6f4;
  `;

  filtered.forEach((opt) => {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 7px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 12px;
      transition: background 0.15s;
    `;
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:6px;">
        <span style="color:#89b4fa;font-weight:bold;">${opt.label}</span>
        <span style="font-size:10px;color:#a6adc8;">${opt.desc}</span>
      </div>
      <span style="background:#313244;color:#a6e3a1;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:bold;">${opt.count}</span>
    `;

    item.onmouseenter = () => {
      item.style.background = "#313244";
    };
    item.onmouseleave = () => {
      item.style.background = "transparent";
    };

    item.onmousedown = (e) => {
      e.preventDefault();
      const val = inputEl.value;
      const mentionRegex = /@[\w-]*$/;
      const newVal = val.replace(mentionRegex, `${opt.label} `);
      setInputValue(inputEl, newVal);
      removeAutocomplete();
    };

    menu.appendChild(item);
  });

  const wrapper =
    inputEl.closest("div.ds-textarea-wrapper") || inputEl.parentElement;
  wrapper.style.position = "relative";
  wrapper.appendChild(menu);
}

// Input Listener
function attachInputMentionInterceptor() {
  const input = getChatInput();
  if (!input || input.__mcpAttached) return;
  input.__mcpAttached = true;

  input.addEventListener("input", () => {
    const val = input.value;
    const slashMatch = val.match(/\/([\w-]*)$/);
    const mentionMatch = val.match(/@([\w-]*)$/);
    if (slashMatch) {
      removeAutocomplete();
      showSkillAutocomplete(input, slashMatch[1]);
    } else if (mentionMatch) {
      removeSkillMenu();
      showAutocomplete(input, mentionMatch[1]);
    } else {
      removeAutocomplete();
      removeSkillMenu();
    }
  });

  input.addEventListener(
    "keydown",
    async (e) => {
      if (e.key === "Escape") {
        removeAutocomplete();
        removeSkillMenu();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        removeAutocomplete();
        removeSkillMenu();
        const val = input.value.trim();

        // ---- Skills: leading /skillname ----
        if (window.DSSkills && loadedSkills.length) {
          const sk = window.DSSkills.matchSkill(val, loadedSkills);
          if (sk) {
            e.preventDefault();
            e.stopPropagation();
            const expanded = window.DSSkills.expandSkill(sk.skill, sk.rest, loadedSkills);
            if (sk.skill.prompt === "__HELP__") {
              sendText(expanded);
            } else {
              const mm = sk.rest.match(/(@[\w-]+)/i);
              if (mm && activeTools.length) {
                const sel = filterToolsByMention(mm[1], activeTools);
                sendText(buildSysPrompt(sel) + "\n" + expanded);
              } else {
                sendText(expanded);
              }
            }
            return;
          }
        }

        const mentionMatch = val.match(/(@[\w-]+)/i);
        if (mentionMatch) {
          e.preventDefault();
          e.stopPropagation();

          await fetchActiveTools();
          if (!activeTools.length) {
            alert("No active MCP tools found on port 43210.");
            return;
          }

          const rawMention = mentionMatch[1];
          const selectedTools = filterToolsByMention(rawMention, activeTools);
          const userText = val.replace(new RegExp(rawMention, "gi"), "").trim();
          const combined = `${buildSysPrompt(selectedTools)}\n${userText}`;
          sendText(combined);
        }
      }
    },
    true,
  );
}

// Server badges
function updateServerBadges() {
  const container = document.getElementById("deepseek-mcp-badge");
  if (!container) return;

  const serverNames = Object.keys(serverStatus).filter(
    (s) => serverStatus[s]?.online,
  );
  const serversWrap = container.querySelector("#mcp-server-pills");
  if (!serversWrap) return;

  serversWrap.innerHTML = `
    <span class="mcp-pill" data-srv="all" style="background:#313244;color:#89b4fa;border:1px solid #45475a;padding:4px 10px;border-radius:12px;cursor:pointer;font-weight:bold;display:inline-flex;align-items:center;gap:4px;">
      ✨ @all (${activeTools.length})
    </span>
    ${serverNames
      .map((name) => {
        const s = serverStatus[name] || {};
        return `<span class="mcp-pill" data-srv="${name}" style="background:#181825;border:1px solid #313244;color:#cdd6f4;padding:4px 10px;border-radius:12px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;font-weight:500;">
        <span style="width:7px;height:7px;border-radius:50%;background:#a6e3a1;box-shadow:0 0 5px #a6e3a1;"></span>
        <b>@${name}</b> <span style="color:#a6adc8;font-size:10px;">(${s.count || 0})</span>
      </span>`;
      })
      .join("")}
  `;

  serversWrap.querySelectorAll(".mcp-pill").forEach((btn) => {
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const srv = btn.dataset.srv;
      const mention = srv === "all" ? "@all" : `@${srv}`;
      const el = getChatInput();
      if (el) {
        el.focus();
        if (!el.value.includes(mention)) {
          const sep = el.value.trim() ? " " : "";
          setInputValue(el, `${el.value.trim()}${sep}${mention} `);
        }
      }
    };
  });
}

function injectChatBadge() {
  const input = getChatInput();
  if (!input) return;

  const targetParent =
    input.closest("div.ds-textarea-wrapper") || input.parentElement;
  if (!targetParent) return;

  let wrap = document.getElementById("deepseek-mcp-badge");
  if (wrap && wrap.parentElement !== targetParent.parentElement) {
    wrap.remove();
    wrap = null;
  }

  if (!wrap) {
    wrap = document.createElement("div");
    wrap.id = "deepseek-mcp-badge";
    wrap.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      font-size: 11px;
      font-family: system-ui, sans-serif;
      color: #a6adc8;
      margin-bottom: 8px;
      user-select: none;
      width: 100%;
      max-width: 800px;
      margin-left: auto;
      margin-right: auto;
    `;

    const pillsWrap = document.createElement("div");
    pillsWrap.id = "mcp-server-pills";
    pillsWrap.style.cssText =
      "display:flex;flex-wrap:wrap;gap:6px;align-items:center;";

    const autoToggle = document.createElement("label");
    autoToggle.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 5px;
      cursor: pointer;
      color: #89b4fa;
      font-size: 11px;
      background: #11111b;
      border: 1px solid #313244;
      padding: 4px 10px;
      border-radius: 12px;
      margin-left: auto;
    `;
    autoToggle.innerHTML = `
      <input type="checkbox" id="mcp-auto-cb" ${autoApprove ? "checked" : ""} style="cursor:pointer;" />
      <span>⚡ Auto-run</span>
    `;

    autoToggle.querySelector("#mcp-auto-cb").onchange = (e) => {
      autoApprove = e.target.checked;
      localStorage.setItem(
        "deepseek_mcp_auto_approve",
        autoApprove ? "true" : "false",
      );
    };

    wrap.appendChild(pillsWrap);
    wrap.appendChild(autoToggle);
    targetParent.parentElement.insertBefore(wrap, targetParent);
  }

  updateServerBadges();
}

const HUMAN_RESULT_TEMPLATES = [
  (name, out) =>
    `Output of ${name}:\n\`\`\`json\n${out}\n\`\`\`\nPlease check and proceed.`,
  (name, out) =>
    `Results for ${name}:\n\`\`\`json\n${out}\n\`\`\`\nWhat is the next step?`,
  (name, out) =>
    `Tool ${name} completed:\n\`\`\`json\n${out}\n\`\`\`\nProceed in English or Arabic.`,
];

// Tool execution & card rendering
async function executeTool(payload, cardStatusEl) {
  if (cardStatusEl) {
    cardStatusEl.innerHTML = `<div style="color:#89b4fa;font-weight:bold;padding:4px;">⏳ Running <code>${payload.name}</code>...</div>`;
  }

  try {
    const res = await fetch("http://localhost:43210/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.isError) {
      throw new Error(data.error || "Execution failed");
    }
    const out = JSON.stringify(data.content || data, null, 2).slice(0, 10000);
    if (cardStatusEl) {
      cardStatusEl.innerHTML = `<div style="color:#a6e3a1;font-weight:bold;padding:4px;">✓ Done: <code>${payload.name}</code></div>`;
    }

    const template =
      HUMAN_RESULT_TEMPLATES[
        Math.floor(Math.random() * HUMAN_RESULT_TEMPLATES.length)
      ];
    const message = template(payload.name, out);

    await sendText(message);
  } catch (err) {
    if (cardStatusEl) {
      cardStatusEl.innerHTML = `<div style="color:#f38ba8;font-weight:bold;padding:4px;">❌ Error: ${err.message}</div>`;
    }
    await sendText(`Execution error on ${payload.name}: ${err.message}`);
  }
}

function renderPermissionCard(targetEl, payload) {
  const isSafe = SAFE_TOOLS.has(payload.name);
  const card = document.createElement("div");
  card.className = "deepseek-mcp-action-card";
  card.style.cssText = `
    margin: 12px 0 16px 0 !important;
    background: #1e1e2e !important;
    border: 2px solid ${isSafe ? "#89b4fa" : "#f38ba8"} !important;
    border-radius: 10px !important;
    padding: 14px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    font-size: 13px !important;
    color: #cdd6f4 !important;
    box-shadow: 0 4px 18px rgba(0,0,0,0.5) !important;
    display: block !important;
    position: relative !important;
  `;

  card.innerHTML = `
    <div style="font-weight:bold;color:${isSafe ? "#89b4fa" : "#f38ba8"};margin-bottom:8px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:15px;">${isSafe ? "🔍 MCP Read / Safe" : "⚡ MCP Action / Bash"}</span>
      <code style="background:#11111b;padding:3px 8px;border-radius:4px;color:#a6e3a1;font-size:12px;">${payload.name}</code>
    </div>
    <div style="font-size:11px;color:#a6adc8;margin-bottom:4px;">Arguments:</div>
    <textarea class="ed" style="width:100%;box-sizing:border-box;height:75px;background:#11111b;color:#a6e3a1;border:1px solid #45475a;border-radius:6px;padding:8px;font-family:monospace;font-size:12px;margin-bottom:10px;">${JSON.stringify(payload.arguments || {}, null, 2)}</textarea>
    <div class="card-controls" style="display:flex;gap:10px;">
      <button class="ok" style="background:#a6e3a1;color:#11111b;border:none;padding:8px 18px;border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">✓ Run Now</button>
      <button class="no" style="background:#f38ba8;color:#11111b;border:none;padding:8px 18px;border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">✕ Reject</button>
    </div>
  `;

  targetEl.insertAdjacentElement("afterend", card);

  const controls = card.querySelector(".card-controls");

  card.querySelector(".ok").onclick = async () => {
    try {
      payload.arguments = JSON.parse(card.querySelector(".ed").value);
    } catch (_) {}
    executeTool(payload, controls);
  };

  card.querySelector(".no").onclick = () => {
    controls.innerHTML = `<div style="color:#a6adc8;font-style:italic;padding:4px;">✕ Rejected: ${payload.name}</div>`;
    sendText(`I skipped "${payload.name}". Please continue.`);
  };

  if (autoApprove) {
    controls.innerHTML = `<div style="color:#a6e3a1;font-size:12px;">⚡ Auto-executing <code>${payload.name}</code>...</div>`;
    setTimeout(() => {
      executeTool(payload, controls);
    }, 400);
  }
}

function extractMcpCall(text) {
  if (!text) return null;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;

  const candidate = text.slice(start, end + 1);
  try {
    const p = JSON.parse(candidate);
    if (p.name && (p.mcp_call !== undefined || p.arguments !== undefined)) {
      return { name: p.name, arguments: p.arguments || {} };
    }
  } catch (_) {}
  return null;
}

function scanMessages() {
  const codeBlocks = document.querySelectorAll("div.md-code-block");
  codeBlocks.forEach((el) => {
    if (el.hasAttribute("data-mcp-attached")) return;
    const nextEl = el.nextElementSibling;
    if (nextEl && nextEl.classList.contains("deepseek-mcp-action-card")) {
      el.setAttribute("data-mcp-attached", "true");
      return;
    }

    const text = el.textContent || "";
    if (!text.includes("name")) return;

    const payload = extractMcpCall(text);
    if (payload && payload.name) {
      el.setAttribute("data-mcp-attached", "true");
      renderPermissionCard(el, payload);
    }
  });
}

new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    scanMessages();
    attachInputMentionInterceptor();
    injectChatBadge();
  }, 200);
}).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

scanMessages();
