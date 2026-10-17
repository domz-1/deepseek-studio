// DeepSeek MCP Studio — Content Script (Orchestrator)

let debounceTimer = null;
let activeTools = [];
let serverStatus = {};
let autoApprove = localStorage.getItem("deepseek_mcp_auto_approve") !== "false";
let isSending = false;
let runningTaskCount = 0;
let userScrolledUp = false;
let executedCalls = new Set();
let loadedSkills = [];

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

// Restore previously executed calls from sessionStorage
try {
  const saved = sessionStorage.getItem("deepseek_mcp_executed");
  if (saved) {
    executedCalls = new Set(JSON.parse(saved));
  }
} catch (_) {}

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

async function refreshSkills() {
  try {
    if (window.DSSkills) loadedSkills = await window.DSSkills.loadSkills();
  } catch (e) {
    console.warn("[MCP] skills load failed", e);
  }
}
refreshSkills();

// Input elements lookup
function getChatInput() {
  return (
    document.querySelector('textarea[placeholder*="DeepSeek"]') ||
    document.querySelector("textarea#chat-input") ||
    document.querySelector("textarea")
  );
}

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

function setInputValue(el, text) {
  el.focus();
  const proto = Object.getPrototypeOf(el);
  const valueSetter =
    Object.getOwnPropertyDescriptor(proto, "value")?.set ||
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;

  if (valueSetter) {
    valueSetter.call(el, text);
  } else {
    el.value = text;
  }

  // Dispatch both InputEvent and generic events so DeepSeek React state updates
  el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  try {
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text,
      }),
    );
  } catch (_) {}
  el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

function setInputValue(el, text) {
  el.focus();
  const proto = Object.getPrototypeOf(el);
  const valueSetter =
    Object.getOwnPropertyDescriptor(proto, "value")?.set ||
    Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      "value",
    )?.set;

  if (valueSetter) {
    valueSetter.call(el, text);
  } else {
    el.value = text;
  }

  // Dispatch standard events so React/Vue models update
  el.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  try {
    el.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        inputType: "insertText",
        data: text,
      }),
    );
  } catch (_) {}
  el.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

function getSendButton() {
  const input = getChatInput();
  if (!input) return null;

  // 1. Locate the container surrounding the input and controls
  const containers = [
    input.closest("div.ds-textarea-wrapper"),
    input.closest("div[class*='textarea']"),
    input.parentElement?.parentElement?.parentElement,
    input.parentElement?.parentElement,
    document.querySelector("div[class*='chat-input']"),
    document.querySelector("div[class*='input-wrapper']"),
  ].filter(Boolean);

  for (const container of containers) {
    // Collect all buttons or role=button elements inside the container
    const candidates = Array.from(
      container.querySelectorAll(
        'button, div[role="button"], span[role="button"]',
      ),
    );

    // Look from bottom-right (last elements first)
    for (let i = candidates.length - 1; i >= 0; i--) {
      const btn = candidates[i];
      const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
      const title = (btn.getAttribute("title") || "").toLowerCase();
      const html = (btn.innerHTML || "").toLowerCase();

      // Exclude attachment, paperclip, upload buttons
      if (
        aria.includes("file") ||
        aria.includes("attach") ||
        aria.includes("upload") ||
        title.includes("file") ||
        title.includes("attach") ||
        title.includes("upload") ||
        btn.querySelector('input[type="file"]') ||
        html.includes("paperclip")
      ) {
        continue;
      }

      // Check if it has an SVG (DeepSeek's blue circle button with arrow)
      // or if it matches aria/title send
      if (
        aria.includes("send") ||
        title.includes("send") ||
        btn.querySelector("svg") ||
        btn.classList.contains("ds-icon-button")
      ) {
        return btn;
      }
    }
  }

  // Fallback: search globally for button with aria-label send
  const globalSend = document.querySelector(
    'button[aria-label*="Send" i], div[role="button"][aria-label*="Send" i]',
  );
  if (globalSend) return globalSend;

  return null;
}

// Reliable message sender
async function sendText(text, isUserInput = false) {
  if (isSending) return;
  isSending = true;

  try {
    const el = getChatInput();
    if (!el) return;

    // For background automated tool results, wait if DeepSeek is generating.
    // For direct user Enter, send immediately with zero delay/rate-limit restrictions!
    if (!isUserInput) {
      let waited = 0;
      while (isDeepSeekGenerating() && waited < 15000) {
        await new Promise((r) => setTimeout(r, 400));
        waited += 400;
      }
    }

    setInputValue(el, text);
    // Instant click without delay
    if (!isUserInput) {
      await new Promise((r) => setTimeout(r, 80));
    }

    // Helper to click element with all mouse events
    const triggerClick = (target) => {
      if (!target) return;
      target.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
      target.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      target.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
      );
      target.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      );
      target.click();
    };

    let sendBtn = getSendButton();
    if (sendBtn) {
      triggerClick(sendBtn);
    } else {
      // Fallback only if no send button element found
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
    }

    // Wait and verify input cleared
    await new Promise((r) => setTimeout(r, 300));
    if (el.value.trim().length > 0) {
      sendBtn = getSendButton();
      if (sendBtn) {
        triggerClick(sendBtn);
      }
    }
    scrollToBottom();
  } finally {
    isSending = false;
  }
}

// Popup injection listener
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "INJECT_NOW" && msg.tools) {
    activeTools = msg.tools;
    sendText(window.DSTools.buildSysPrompt(msg.tools));
  }
});

// Input Listener & Interceptor
function attachInputMentionInterceptor() {
  const input = getChatInput();
  if (!input || input.__mcpAttached) return;
  input.__mcpAttached = true;

  input.addEventListener("input", () => {
    const val = input.value;
    const slashMatch = val.match(/\/([\w-]*)$/);
    const mentionMatch = val.match(/@([\w-]*)$/);

    if (slashMatch) {
      window.DSUI.removeAutocomplete();
      window.DSUI.showSkillAutocomplete(
        input,
        slashMatch[1],
        loadedSkills,
        (name) => {
          const currentVal = input.value;
          const newVal = currentVal.replace(/\/[\w-]*$/, `/${name} `);
          setInputValue(input, newVal);
        },
      );
    } else if (mentionMatch) {
      window.DSUI.removeSkillMenu();
      window.DSUI.showAutocomplete(
        input,
        mentionMatch[1],
        activeTools,
        serverStatus,
        (label) => {
          const currentVal = input.value;
          const newVal = currentVal.replace(/@[\w-]*$/, `${label} `);
          setInputValue(input, newVal);
        },
      );
    } else {
      window.DSUI.removeAutocomplete();
      window.DSUI.removeSkillMenu();
    }
  });

  input.addEventListener(
    "keydown",
    async (e) => {
      if (e.key === "Escape") {
        window.DSUI.removeAutocomplete();
        window.DSUI.removeSkillMenu();
        return;
      }

      if (e.key === "Enter" && !e.shiftKey) {
        window.DSUI.removeAutocomplete();
        window.DSUI.removeSkillMenu();
        const rawVal = input.value.trim();
        if (!rawVal) return;

        // Ensure skills list is loaded
        if (!loadedSkills.length && window.DSSkills) {
          loadedSkills = (await window.DSSkills.loadSkills()) || [];
        }

        // Detect any @mention in the message
        const mentionMatches = rawVal.match(/@([\w-]+)/i);
        const activeMention = mentionMatches ? mentionMatches[0] : null;

        // Detect any /skill in the message
        const skillMatch = rawVal.match(/\/([a-z0-9_-]+)\b([\s\S]*)$/i);

        // Case 1: Has /skill (with or without @mention)
        if (window.DSSkills && skillMatch) {
          const skillName = skillMatch[1].toLowerCase();
          const targetSkill = loadedSkills.find((s) => s.name === skillName);

          if (targetSkill) {
            e.preventDefault();
            e.stopPropagation();

            // Extract the rest of the text and expand skill
            let rest = rawVal
              .replace(new RegExp(`/${skillName}\\b`, "i"), "")
              .trim();
            if (activeMention) {
              rest = rest.replace(new RegExp(activeMention, "gi"), "").trim();
            }

            let prompt = window.DSSkills.expandSkill(
              targetSkill,
              rest,
              loadedSkills,
            );

            // If an @mention is present
            if (activeMention) {
              await fetchActiveTools();
              const selectedTools = window.DSTools.filterToolsByMention(
                activeMention,
                activeTools,
              );
              prompt = `${window.DSTools.buildSysPrompt(selectedTools)}\n${prompt}`;
            }

            sendText(prompt, true);
            return;
          }
        }

        // Case 2: Only @mention (no /skill)
        if (activeMention) {
          e.preventDefault();
          e.stopPropagation();

          await fetchActiveTools();
          if (!activeTools.length) {
            alert("No active MCP tools found on port 43210.");
            return;
          }

          const selectedTools = window.DSTools.filterToolsByMention(
            activeMention,
            activeTools,
          );
          const userText = rawVal
            .replace(new RegExp(activeMention, "gi"), "")
            .trim();
          const combined = `${window.DSTools.buildSysPrompt(selectedTools)}\n${userText}`;
          sendText(combined, true);
        }
      }
    },
    true,
  );
}

// UI Badges & Indicator
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
      <input type="checkbox" id="mcp-auto-approve" ${autoApprove ? "checked" : ""} style="cursor:pointer;" />
      <span>⚡ Auto-run</span>
    `;
    autoToggle.querySelector("input").onchange = (e) => {
      autoApprove = e.target.checked;
      localStorage.setItem("deepseek_mcp_auto_approve", autoApprove);
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
  const isSafe = window.DSTools.SAFE_TOOLS.has(payload.name);
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
    if (callKey) executedCalls.add(callKey);
    controls.innerHTML = `<div style="color:#a6e3a1;font-size:12px;">⚡ Auto-executing <code>${payload.name}</code>...</div>`;
    setTimeout(() => {
      executeTool(payload, controls, callKey);
    }, 400);
  }
}

function renderGrillQuestionCard(
  targetEl,
  grillData,
  callKey,
  isHistorical = false,
) {
  const card = document.createElement("div");
  card.className = "deepseek-mcp-action-card deepseek-grill-card";
  card.style.cssText = `
    margin: 14px 0 18px 0 !important;
    background: linear-gradient(145deg, #181825, #1e1e2e) !important;
    border: 2px solid #fab387 !important;
    border-radius: 12px !important;
    padding: 16px !important;
    font-family: system-ui, -apple-system, sans-serif !important;
    font-size: 13px !important;
    color: #cdd6f4 !important;
    box-shadow: 0 6px 20px rgba(0,0,0,0.6) !important;
    display: block !important;
    position: relative !important;
  `;

  if (isHistorical) {
    card.innerHTML = `
      <div style="font-weight:bold;color:#a6adc8;display:flex;align-items:center;gap:8px;">
        <span>🔥 Answered Grill-Me Decision:</span>
        <span style="color:#fab387;font-size:12px;">${grillData.question || ""}</span>
      </div>
    `;
    targetEl.insertAdjacentElement("afterend", card);
    return;
  }

  const optionsHtml = grillData.options
    .map((opt, i) => {
      const optId = opt.id || String.fromCharCode(65 + i);
      return `
        <div class="grill-opt-card" data-opt-id="${optId}" style="background:#11111b;border:1px solid #45475a;border-radius:8px;padding:10px 12px;cursor:pointer;transition:all 0.15s ease;display:flex;flex-direction:column;gap:4px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <b style="color:#fab387;font-size:13px;">[${optId}] ${opt.label || opt.text || ""}</b>
            <span style="background:#313244;color:#cdd6f4;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600;">Choose</span>
          </div>
          ${opt.details ? `<div style="color:#a6adc8;font-size:11px;line-height:1.35;">${opt.details}</div>` : ""}
        </div>
      `;
    })
    .join("");

  card.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;border-bottom:1px solid #313244;padding-bottom:8px;">
      <div style="font-weight:bold;color:#fab387;font-size:14px;display:flex;align-items:center;gap:6px;">
        <span>🔥 Architecture Decision Point</span>
      </div>
      <span style="background:#fab387;color:#11111b;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:bold;">1-by-1 Interview</span>
    </div>
    <div style="font-size:14px;font-weight:600;color:#cdd6f4;margin-bottom:12px;line-height:1.4;">
      ${grillData.question}
    </div>
    <div class="grill-options-grid" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;">
      ${optionsHtml}
    </div>
    <div class="grill-custom-wrap" style="display:flex;gap:8px;align-items:center;border-top:1px solid #313244;padding-top:10px;">
      <input type="text" class="grill-custom-input" placeholder="Or write custom rationale / trade-off choice..." style="flex:1;background:#11111b;border:1px solid #45475a;color:#cdd6f4;padding:8px 12px;border-radius:6px;font-size:12px;outline:none;" />
      <button class="grill-custom-submit" style="background:#89b4fa;color:#11111b;border:none;padding:8px 16px;border-radius:6px;font-weight:bold;font-size:12px;cursor:pointer;">Send Custom</button>
    </div>
  `;

  targetEl.insertAdjacentElement("afterend", card);

  // Bind option clicks
  card.querySelectorAll(".grill-opt-card").forEach((optEl) => {
    optEl.onmouseenter = () => {
      optEl.style.borderColor = "#fab387";
      optEl.style.transform = "translateY(-1px)";
    };
    optEl.onmouseleave = () => {
      optEl.style.borderColor = "#45475a";
      optEl.style.transform = "none";
    };
    optEl.onclick = () => {
      executedCalls.add(callKey);
      const optId = optEl.getAttribute("data-opt-id");
      const chosen =
        grillData.options.find((o) => (o.id || "") === optId) || {};
      const answerText = `I choose Option [${optId}]: "${chosen.label || chosen.text || optId}".\nRationale & Trade-offs: ${chosen.details || "Proceeding with this architectural approach."}\n\nWhat is the next question?`;

      card.innerHTML = `
        <div style="color:#a6e3a1;font-weight:bold;padding:6px;display:flex;align-items:center;gap:6px;">
          <span>✓ Selected Option [${optId}]:</span>
          <span style="color:#cdd6f4;">${chosen.label || optId}</span>
        </div>
      `;
      sendText(answerText, true);
    };
  });

  // Custom response handling
  const customInput = card.querySelector(".grill-custom-input");
  const customBtn = card.querySelector(".grill-custom-submit");

  const sendCustom = () => {
    const val = customInput.value.trim();
    if (!val) return;
    executedCalls.add(callKey);
    const answerText = `Custom architecture decision for question "${grillData.question}":\n${val}\n\nWhat is the next question?`;
    card.innerHTML = `
      <div style="color:#89b4fa;font-weight:bold;padding:6px;">
        ✓ Submitted Custom Decision: <span style="color:#cdd6f4;">${val}</span>
      </div>
    `;
    sendText(answerText, true);
  };

  customBtn.onclick = sendCustom;
  customInput.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      sendCustom();
    }
  };
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

    // 1. Check for interactive Grill-Me Question JSON
    if (
      text.includes("grill_question") &&
      window.DSTools.extractGrillQuestion
    ) {
      const grillData = window.DSTools.extractGrillQuestion(text);
      if (grillData && grillData.question) {
        el.setAttribute("data-mcp-attached", "true");
        const callKey = `grill:${grillData.question.slice(0, 80)}`;
        const parentMsg = el.closest(
          "div.ds-message, div._4f9bf79, div.ds-markdown",
        );
        const hasFollowUp = parentMsg && parentMsg.nextElementSibling !== null;
        const isHistorical = executedCalls.has(callKey) || hasFollowUp;

        renderGrillQuestionCard(el, grillData, callKey, isHistorical);
        return;
      }
    }

    // 2. Check for standard MCP tool call JSON
    if (!text.includes("name")) return;

    const payload = window.DSTools.extractMcpCall(text);
    if (payload && payload.name) {
      el.setAttribute("data-mcp-attached", "true");

      const callKey = `${payload.name}:${JSON.stringify(payload.arguments || {})}:${text.slice(0, 100)}`;
      const parentMsg = el.closest(
        "div.ds-message, div._4f9bf79, div.ds-markdown",
      );
      const hasFollowUp = parentMsg && parentMsg.nextElementSibling !== null;
      const isHistorical = executedCalls.has(callKey) || hasFollowUp;

      renderPermissionCard(el, payload, callKey, isHistorical);
    }
  });
}

// Observer
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
