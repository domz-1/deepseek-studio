let debounceTimer = null;
let activeTools = [];
let serverStatus = {};
let autoApprove = localStorage.getItem("deepseek_mcp_auto_approve") !== "false";
let isSending = false;
let runningTaskCount = 0;
let userScrolledUp = false;
let executedCalls = new Set();

// Track user scroll manually so auto-scroll doesn't fight the user if they scroll up
window.addEventListener(
  "scroll",
  () => {
    const scrollPos = window.innerHeight + window.scrollY;
    const scrollBottom = document.documentElement.scrollHeight - 60;
    userScrolledUp = scrollPos < scrollBottom;
  },
  { passive: true },
);

function scrollToBottom() {
  if (userScrolledUp) return;
  window.scrollTo({
    top: document.documentElement.scrollHeight,
    behavior: "smooth",
  });
}

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

// Direct, instant, and reliable sender with queue & rate-limit awareness
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
    scrollToBottom();
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
    console.warn("[MCP] skills load failed", e);
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
  if (!window.DSSkills) return;

  const matches = window.DSSkills.filterSkills(query, loadedSkills);
  if (!matches.length) return;

  const menu = document.createElement("div");
  skillMenu = menu;
  menu.id = "deepseek-mcp-skill-menu";

  const rect = inputEl.getBoundingClientRect();
  const menuWidth = 460;
  const leftPos = Math.max(
    12,
    Math.min(rect.left, window.innerWidth - menuWidth - 20),
  );
  const bottomPos = window.innerHeight - rect.top + 10;

  menu.style.cssText = `
    position: fixed !important;
    bottom: ${bottomPos}px !important;
    left: ${leftPos}px !important;
    width: ${menuWidth}px !important;
    max-height: 380px !important;
    overflow-y: auto !important;
    background: #181825 !important;
    border: 1px solid #45475a !important;
    border-radius: 12px !important;
    box-shadow: 0 12px 32px rgba(0,0,0,0.7) !important;
    z-index: 2147483647 !important;
    padding: 8px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    color: #cdd6f4 !important;
    box-sizing: border-box !important;
  `;

  const header = document.createElement("div");
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px 8px 10px;
    font-size: 11px;
    font-weight: 700;
    color: #cba6f7;
    border-bottom: 1px solid #313244;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `;
  header.innerHTML = `<span>⚡ Skills</span><span style="color:#a6adc8;font-size:10px;">${matches.length} available</span>`;
  menu.appendChild(header);

  matches.forEach((sk, idx) => {
    const item = document.createElement("div");
    item.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.12s;
      ${idx === 0 ? "background: #313244;" : ""}
    `;
    item.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:16px;">${sk.emoji || "⚡"}</span>
        <b style="color:#89b4fa;font-size:13px;">/${sk.name}</b>
        ${sk.isCustom ? '<span style="background:#f9e2af;color:#11111b;padding:1px 5px;border-radius:6px;font-size:9px;font-weight:700;">CUSTOM</span>' : ""}
      </div>
      <div style="font-size:11px;color:#a6adc8;padding-left:24px;line-height:1.3;">${sk.description || ""}</div>
    `;

    item.onmouseenter = () => {
      menu
        .querySelectorAll("div[data-skill-item]")
        .forEach((el) => (el.style.background = "transparent"));
      item.style.background = "#313244";
    };
    item.onmouseleave = () => {
      item.style.background = "transparent";
    };
    item.setAttribute("data-skill-item", "true");

    item.onmousedown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const val = inputEl.value;
      const slashRegex = /\/[\w-]*$/;
      const newVal = val.replace(slashRegex, `/${sk.name} `);
      setInputValue(inputEl, newVal);
      removeSkillMenu();
    };

    menu.appendChild(item);
  });

  document.body.appendChild(menu);
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

  const rect = inputEl.getBoundingClientRect();
  const menuWidth = 280;
  const leftPos = Math.max(
    12,
    Math.min(rect.left, window.innerWidth - menuWidth - 20),
  );
  const bottomPos = window.innerHeight - rect.top + 10;

  menu.style.cssText = `
    position: fixed !important;
    bottom: ${bottomPos}px !important;
    left: ${leftPos}px !important;
    width: ${menuWidth}px !important;
    max-height: 320px !important;
    overflow-y: auto !important;
    background: #181825 !important;
    border: 1px solid #45475a !important;
    border-radius: 10px !important;
    box-shadow: 0 12px 32px rgba(0,0,0,0.7) !important;
    z-index: 2147483647 !important;
    padding: 6px !important;
    min-width: 220px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    color: #cdd6f4 !important;
    box-sizing: border-box !important;
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
      e.stopPropagation();
      const val = inputEl.value;
      const mentionRegex = /@[\w-]*$/;
      const newVal = val.replace(mentionRegex, `${opt.label} `);
      setInputValue(inputEl, newVal);
      removeAutocomplete();
    };

    menu.appendChild(item);
  });

  document.body.appendChild(menu);
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
          const matched = window.DSSkills.matchSkill(val, loadedSkills);
          if (matched && matched.skill) {
            e.preventDefault();
            e.stopPropagation();

            const prompt = window.DSSkills.expandSkill(
              matched.skill,
              matched.rest,
              loadedSkills,
            );

            const mentionMatch = prompt.match(/(@[\w-]+)/i);
            if (mentionMatch) {
              await fetchActiveTools();
              const rawMention = mentionMatch[1];
              const selectedTools = filterToolsByMention(
                rawMention,
                activeTools,
              );
              const cleanPrompt = prompt
                .replace(new RegExp(rawMention, "gi"), "")
                .trim();
              const combined = `${buildSysPrompt(selectedTools)}\n${cleanPrompt}`;
              sendText(combined);
            } else {
              sendText(prompt);
            }
            return;
          }
        }

        // ---- Standard @mention handling ----
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

async function killActiveTask(callId = null) {
  try {
    await fetch("http://localhost:43210/kill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(callId ? { callId } : {}),
    });
  } catch (e) {
    console.warn("[MCP] kill task failed", e);
  }
}

function updateTaskBadge() {
  const taskIndicator = document.getElementById("mcp-task-indicator");
  if (!taskIndicator) return;

  if (runningTaskCount > 0) {
    taskIndicator.style.display = "inline-flex";
    taskIndicator.innerHTML = `
      <span style="width:7px;height:7px;border-radius:50%;background:#89b4fa;box-shadow:0 0 6px #89b4fa;animation:mcp-pulse 1s infinite alternate;"></span>
      <span>Running task (${runningTaskCount})...</span>
      <button id="mcp-kill-all-btn" style="background:#f38ba8;color:#11111b;border:none;border-radius:8px;padding:2px 8px;font-size:10px;font-weight:bold;cursor:pointer;margin-left:4px;">✕ Kill</button>
    `;
    const btn = taskIndicator.querySelector("#mcp-kill-all-btn");
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        killActiveTask();
      };
    }
  } else {
    taskIndicator.style.display = "none";
  }
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

    const taskIndicator = document.createElement("div");
    taskIndicator.id = "mcp-task-indicator";
    taskIndicator.style.cssText = `
      display: none;
      align-items: center;
      gap: 6px;
      background: #1e1e2e;
      border: 1px solid #89b4fa;
      color: #89b4fa;
      padding: 3px 9px;
      border-radius: 12px;
      font-weight: 600;
      font-size: 11px;
    `;

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
    wrap.appendChild(taskIndicator);
    wrap.appendChild(autoToggle);
    targetParent.parentElement.insertBefore(wrap, targetParent);
  }

  updateServerBadges();
  updateTaskBadge();
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
async function executeTool(payload, cardStatusEl, callKey) {
  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  payload.callId = callId;

  if (cardStatusEl) {
    cardStatusEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;">
        <div style="color:#89b4fa;font-weight:bold;padding:4px;">⏳ Running <code>${payload.name}</code>...</div>
        <button class="mcp-card-kill-btn" style="background:#f38ba8;color:#11111b;border:none;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:bold;cursor:pointer;">✕ Kill Task</button>
      </div>
    `;
    const killBtn = cardStatusEl.querySelector(".mcp-card-kill-btn");
    if (killBtn) {
      killBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        killActiveTask(callId);
      };
    }
  }

  runningTaskCount++;
  updateTaskBadge();

  try {
    const res = await fetch("http://localhost:43210/call", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.isError) {
      if (data.isCancelled) {
        throw new Error("Task was cancelled by user");
      }
      throw new Error(data.error || "Execution failed");
    }

    if (callKey) {
      executedCalls.add(callKey);
      try {
        sessionStorage.setItem(
          "deepseek_mcp_executed",
          JSON.stringify(Array.from(executedCalls)),
        );
      } catch (_) {}
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
    await sendText(`Execution notice on ${payload.name}: ${err.message}`);
  } finally {
    runningTaskCount = Math.max(0, runningTaskCount - 1);
    updateTaskBadge();
    scrollToBottom();
  }
}

function renderPermissionCard(
  targetEl,
  payload,
  callKey,
  isAlreadyExecuted = false,
) {
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

  if (isAlreadyExecuted) {
    card.innerHTML = `
      <div style="font-weight:bold;color:#a6adc8;margin-bottom:8px;display:flex;align-items:center;gap:8px;">
        <span>✓ Completed Historical Call:</span>
        <code style="background:#11111b;padding:3px 8px;border-radius:4px;color:#a6e3a1;font-size:12px;">${payload.name}</code>
      </div>
      <div style="font-size:11px;color:#a6adc8;">Arguments:</div>
      <pre style="background:#11111b;color:#a6adc8;padding:6px;border-radius:4px;font-size:11px;overflow:auto;max-height:80px;">${JSON.stringify(payload.arguments || {}, null, 2)}</pre>
    `;
    targetEl.insertAdjacentElement("afterend", card);
    return;
  }

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
    executeTool(payload, controls, callKey);
  };

  card.querySelector(".no").onclick = () => {
    executedCalls.add(callKey);
    controls.innerHTML = `<div style="color:#a6adc8;font-style:italic;padding:4px;">✕ Rejected: ${payload.name}</div>`;
    sendText(`I skipped "${payload.name}". Please continue.`);
  };

  if (autoApprove) {
    controls.innerHTML = `<div style="color:#a6e3a1;font-size:12px;">⚡ Auto-executing <code>${payload.name}</code>...</div>`;
    setTimeout(() => {
      executeTool(payload, controls, callKey);
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

// Restore previously executed calls from sessionStorage
try {
  const saved = sessionStorage.getItem("deepseek_mcp_executed");
  if (saved) {
    executedCalls = new Set(JSON.parse(saved));
  }
} catch (_) {}

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

      // Unique call hash based on message context + tool name + args
      const callKey = `${payload.name}:${JSON.stringify(payload.arguments || {})}:${text.slice(0, 100)}`;

      // Check if this block is already followed by a model response or was executed before
      const parentMsg = el.closest(
        "div.ds-message, div._4f9bf79, div.ds-markdown",
      );
      const hasFollowUp = parentMsg && parentMsg.nextElementSibling !== null;
      const isHistorical = executedCalls.has(callKey) || hasFollowUp;

      renderPermissionCard(el, payload, callKey, isHistorical);
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
