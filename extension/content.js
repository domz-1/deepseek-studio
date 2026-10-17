// DeepSeek MCP Studio — Content Script (Orchestrator)

let debounceTimer = null;
let activeTools = [];
let serverStatus = {};
let autoApprove = localStorage.getItem("deepseek_mcp_auto_approve") !== "false";
let selectedProject =
  localStorage.getItem("deepseek_mcp_selected_project") ||
  "/home/adham/projects/adham/deepseek-mcp-ext";
let projectList = [];
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
    // Always route through the background worker so the bridge token is
    // attached and the page never performs an unauthenticated fetch.
    const bgRes = await new Promise((r) =>
      chrome.runtime.sendMessage({ type: "GET_MCP" }, r),
    );
    if (bgRes?.ok && bgRes.data?.tools) {
      activeTools = bgRes.data.tools;
      serverStatus = bgRes.data.status || {};
      return activeTools;
    }
  } catch (e) {
    console.warn("[MCP] fetchActiveTools failed", e);
  }
  return [];
}

// Best-effort: adopt DeepSeek's live palette when discoverable. Never throws;
// theme.css hardcoded tokens remain the source of truth on failure.
function probeDeepSeekTheme() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const get = (...names) =>
      names.map((n) => cs.getPropertyValue(n).trim()).find(Boolean);
    const accent = get(
      "--ds-color-primary",
      "--primary-color",
      "--color-primary",
    );
    const bg = get("--ds-color-bg", "--bg-color", "--background-color");
    const root = document.documentElement;
    if (accent) root.style.setProperty("--ds-accent", accent);
    if (bg) {
      const m = bg.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
      if (m) {
        const lum =
          (Number(m[1]) * 0.299 + Number(m[2]) * 0.587 + Number(m[3]) * 0.114) /
          255;
        root.dataset.dsTheme = lum < 0.5 ? "dark" : "light";
      }
    }
  } catch (_) {}
}
try {
  probeDeepSeekTheme();
} catch (_) {}

async function refreshSkills() {
  try {
    if (window.DSSkills) loadedSkills = await window.DSSkills.loadSkills();
  } catch (e) {
    console.warn("[MCP] skills load failed", e);
  }
}
refreshSkills();

// Eagerly fetch active MCP tools on script boot so badges display tools immediately!
fetchActiveTools().then(() => {
  injectChatBadge();
  updateServerBadges();
});

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
    const mentionMatch = val.match(/@([^\s@]*)$/);

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
      const q = mentionMatch[1];
      if (input.__mentionDebounce) clearTimeout(input.__mentionDebounce);
      input.__mentionDebounce = setTimeout(async () => {
        let fileResults = [];
        try {
          const res = await new Promise((r) =>
            chrome.runtime.sendMessage(
              { type: "FS_INDEX", q, project: selectedProject, limit: 30 },
              r,
            ),
          );
          if (res?.ok && res.data?.results) fileResults = res.data.results;
        } catch (_) {}
        window.DSUI.showAutocomplete(
          input,
          q,
          activeTools,
          serverStatus,
          fileResults,
          (label, fileObj) => {
            const currentVal = input.value;
            // Inject file link with path so MCP filesystem reads it cleanly on demand
            if (fileObj && fileObj.path) {
              const fileLink = `@file:${fileObj.name} [file://${fileObj.path}] `;
              const newVal = currentVal.replace(/@[^\s@]*$/, fileLink);
              setInputValue(input, newVal);
              return;
            }
            const newVal = currentVal.replace(/@[^\s@]*$/, `${label} `);
            setInputValue(input, newVal);
          },
        );
      }, 100);
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

  const serversWrap = container.querySelector("#mcp-server-pills");
  if (!serversWrap) return;

  serversWrap.innerHTML = window.DSComponents.serverPills(
    activeTools,
    serverStatus,
  );

  serversWrap.querySelectorAll(".ds-pill, .ds-chip-item").forEach((btn) => {
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
    await new Promise((r) =>
      chrome.runtime.sendMessage({ type: "KILL", callId }, r),
    );
  } catch (e) {
    console.warn("[MCP] kill task failed", e);
  }
}

function updateTaskBadge() {
  const taskIndicator = document.getElementById("mcp-task-indicator");
  if (!taskIndicator) return;

  if (runningTaskCount > 0) {
    taskIndicator.classList.add("is-on");
    taskIndicator.innerHTML = window.DSComponents.taskChip(runningTaskCount);
    const btn = taskIndicator.querySelector("#mcp-kill-all-btn");
    if (btn) {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        killActiveTask();
      };
    }
  } else {
    taskIndicator.classList.remove("is-on");
  }
}

function showAddProjectModal(onConfirm) {
  const existing = document.getElementById("ds-add-project-modal");
  if (existing) existing.remove();

  const overlay = document.createElement("div");
  overlay.id = "ds-add-project-modal";
  overlay.className = "ds-modal-overlay";

  overlay.innerHTML = `
    <div class="ds-modal-card">
      <div class="ds-modal-title">
        <span class="ds-ic" data-ic="folder"></span>
        <span>Add Local Project Workspace</span>
      </div>
      <div class="ds-modal-desc">
        Enter the absolute folder path of your project (e.g. <code>/home/adham/my-app</code>). It will be indexed instantly by <code>fd</code> for fast <code>@file</code> search.
      </div>
      <input type="text" class="ds-modal-input" placeholder="/home/adham/projects/..." value="/home/adham/projects/" spellcheck="false" />
      <div class="ds-modal-actions">
        <button class="ds-btn ds-btn-no cancel-btn" type="button">Cancel</button>
        <button class="ds-btn ds-btn-ok confirm-btn" type="button">Add Project</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector(".ds-modal-input");
  const cancelBtn = overlay.querySelector(".cancel-btn");
  const confirmBtn = overlay.querySelector(".confirm-btn");

  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);

  const close = () => overlay.remove();

  cancelBtn.onclick = close;
  overlay.onclick = (e) => {
    if (e.target === overlay) close();
  };

  const submit = () => {
    const val = input.value.trim();
    if (!val) return;
    close();
    onConfirm(val);
  };

  confirmBtn.onclick = submit;
  input.onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "Escape") {
      close();
    }
  };
}

function populateProjectsDropdown(force = false) {
  const projSelect = document.getElementById("mcp-project-select");
  if (!projSelect) return;
  if (!force && projSelect.options.length > 1) return;

  let customs = [];
  try {
    customs = JSON.parse(
      localStorage.getItem("deepseek_mcp_custom_projects") || "[]",
    );
  } catch (_) {}

  chrome.runtime.sendMessage({ type: "GET_PROJECTS" }, (res) => {
    let list = [];
    if (res?.ok && Array.isArray(res.data?.projects)) {
      list = res.data.projects;
      projectList = list;
    }
    // Merge custom added projects
    const all = [...customs, ...list];
    const seen = new Set();
    const unique = [];
    for (const item of all) {
      if (!seen.has(item.path)) {
        seen.add(item.path);
        unique.push(item);
      }
    }

    if (unique.length > 0) {
      projSelect.innerHTML = unique
        .map(
          (p) =>
            `<option value="${p.path}" ${p.path === selectedProject ? "selected" : ""}>${p.name.replace(/^⭐\s*/, "")}</option>`,
        )
        .join("");
    }
  });
}

function injectSidebarProjectFilter() {
  // DeepSeek left sidebar container:
  // Usually contains the "New chat" button and chat history list
  const newChatBtn = Array.from(
    document.querySelectorAll("button, div[role='button']"),
  ).find((el) => (el.textContent || "").toLowerCase().includes("new chat"));

  let sidebar = null;
  let insertBeforeNode = null;

  if (newChatBtn) {
    // Find the list/scroll container right below or inside the parent
    const parentContainer =
      newChatBtn.closest(
        "div[class*='sidebar'], aside, nav, div[class*='left']",
      ) || newChatBtn.parentElement?.parentElement;
    if (parentContainer) {
      sidebar = parentContainer;
      // We want to place the Workspaces filter right below the New chat button container!
      insertBeforeNode =
        newChatBtn.parentElement?.nextElementSibling ||
        newChatBtn.nextElementSibling;
    }
  }

  if (!sidebar) {
    sidebar =
      document.querySelector("div.ds-sidebar, nav[class*='sidebar'], aside") ||
      document.querySelector("div[class*='chat-history']");
  }

  if (!sidebar) return;

  let filterWrap = document.getElementById("ds-sidebar-project-filter");
  if (filterWrap && filterWrap.parentElement !== sidebar) {
    filterWrap.remove();
    filterWrap = null;
  }

  if (!filterWrap) {
    filterWrap = document.createElement("div");
    filterWrap.id = "ds-sidebar-project-filter";
    filterWrap.className = "ds-sidebar-filter";

    const head = document.createElement("div");
    head.className = "ds-sidebar-filter-head";
    head.innerHTML = `
      <span><span class="ds-ic" data-ic="folder"></span> Workspaces</span>
      <span class="ds-chip-more" style="font-size:9px;cursor:pointer;" id="ds-sidebar-all-projects">All</span>
    `;

    const chips = document.createElement("div");
    chips.className = "ds-sidebar-chips";
    chips.id = "ds-sidebar-chips";

    filterWrap.appendChild(head);
    filterWrap.appendChild(chips);

    if (insertBeforeNode && insertBeforeNode.parentElement === sidebar) {
      sidebar.insertBefore(filterWrap, insertBeforeNode);
    } else {
      sidebar.insertBefore(filterWrap, sidebar.firstChild);
    }
  }

  const chipsContainer = document.getElementById("ds-sidebar-chips");
  if (!chipsContainer || chipsContainer.children.length > 0) return;

  chrome.runtime.sendMessage({ type: "GET_PROJECTS" }, (res) => {
    if (res?.ok && Array.isArray(res.data?.projects)) {
      const projects = res.data.projects.slice(0, 10);
      chipsContainer.innerHTML = projects
        .map((p) => {
          const isActive = p.path === selectedProject;
          const short = p.name.split("/").pop();
          return `<button class="ds-sidebar-chip ${isActive ? "is-active" : ""}" data-path="${p.path}" title="${p.path}" type="button">${short}</button>`;
        })
        .join("");

      chipsContainer.querySelectorAll(".ds-sidebar-chip").forEach((btn) => {
        btn.onclick = () => {
          selectedProject = btn.dataset.path;
          localStorage.setItem(
            "deepseek_mcp_selected_project",
            selectedProject,
          );
          chipsContainer
            .querySelectorAll(".ds-sidebar-chip")
            .forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          populateProjectsDropdown(true);
        };
      });
    }
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
    wrap.className = "ds-badge-bar";
    wrap.innerHTML = window.DSComponents.badgeBar({ autoApprove });

    const autoInput = wrap.querySelector("#mcp-auto-approve");
    if (autoInput) {
      autoInput.onchange = (e) => {
        autoApprove = e.target.checked;
        localStorage.setItem("deepseek_mcp_auto_approve", autoApprove);
      };
    }

    const projSelect = wrap.querySelector("#mcp-project-select");
    if (projSelect) {
      projSelect.onchange = (e) => {
        selectedProject = e.target.value;
        localStorage.setItem("deepseek_mcp_selected_project", selectedProject);
      };
    }

    const addBtn = wrap.querySelector("#mcp-add-project-btn");
    if (addBtn) {
      addBtn.onclick = () => {
        showAddProjectModal((cleanPath) => {
          if (!cleanPath) return;
          const name = cleanPath.split("/").filter(Boolean).pop() || cleanPath;
          let customs = [];
          try {
            customs = JSON.parse(
              localStorage.getItem("deepseek_mcp_custom_projects") || "[]",
            );
          } catch (_) {}
          if (!customs.find((c) => c.path === cleanPath)) {
            customs.unshift({ name: `⭐ ${name}`, path: cleanPath });
            localStorage.setItem(
              "deepseek_mcp_custom_projects",
              JSON.stringify(customs),
            );
          }
          selectedProject = cleanPath;
          localStorage.setItem(
            "deepseek_mcp_selected_project",
            selectedProject,
          );
          populateProjectsDropdown(true);
        });
      };
    }

    targetParent.parentElement.insertBefore(wrap, targetParent);
  }

  populateProjectsDropdown();

  updateServerBadges();
  updateTaskBadge();

  if (!activeTools.length) {
    fetchActiveTools().then(() => {
      updateServerBadges();
    });
  }
}

const HUMAN_RESULT_TEMPLATES = [
  (name, out) =>
    `Output of ${name}:\n\`\`\`json\n${out}\n\`\`\`\nAnalyze this result and proceed with the next tool call or action to finish the task.`,
  (name, out) =>
    `Results for ${name}:\n\`\`\`json\n${out}\n\`\`\`\nContinue executing the next step autonomously until complete.`,
  (name, out) =>
    `Tool ${name} completed:\n\`\`\`json\n${out}\n\`\`\`\nCheck the output and proceed with the next tool call.`,
];

// Tool execution & card rendering
async function executeTool(payload, cardStatusEl, callKey, targetEl) {
  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  payload.callId = callId;

  if (cardStatusEl) {
    cardStatusEl.innerHTML = window.DSComponents.status.runningWithKill(
      payload.name,
    );
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
    const bgRes = await new Promise((r) =>
      chrome.runtime.sendMessage({ type: "CALL", payload }, r),
    );
    if (!bgRes?.ok) throw new Error(bgRes?.error || "Bridge unreachable");
    const data = bgRes.data;
    if (data?.isError) {
      if (data.isCancelled) throw new Error("Task was cancelled by user");
      throw new Error(data.error || "Execution failed");
    }

    if (targetEl) {
      targetEl.setAttribute("data-mcp-executed", "true");
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
      cardStatusEl.innerHTML = window.DSComponents.status.done(payload.name);
    }

    const template =
      HUMAN_RESULT_TEMPLATES[
        Math.floor(Math.random() * HUMAN_RESULT_TEMPLATES.length)
      ];
    const message = template(payload.name, out);

    await sendText(message);
  } catch (err) {
    if (cardStatusEl) {
      cardStatusEl.innerHTML = window.DSComponents.status.error(err.message);
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
  // Hide the raw JSON code block so the user only sees the custom UI card
  if (targetEl) {
    targetEl.style.display = "none";
  }

  const isSafe = window.DSTools.SAFE_TOOLS.has(payload.name);
  const card = document.createElement("div");
  card.className =
    "deepseek-mcp-action-card ds-card" +
    (isSafe ? "" : " is-danger") +
    (isAlreadyExecuted ? " is-historical" : "");
  card.innerHTML = window.DSComponents.permissionCard({
    payload,
    isSafe,
    isHistorical: isAlreadyExecuted,
  });

  if (isAlreadyExecuted) {
    const btn = card.querySelector(".view-raw-btn");
    if (btn && targetEl) {
      btn.onclick = () => {
        targetEl.style.display =
          targetEl.style.display === "none" ? "block" : "none";
      };
    }
    targetEl.insertAdjacentElement("afterend", card);
    return;
  }

  const btn = card.querySelector(".view-raw-btn");
  if (btn && targetEl) {
    btn.onclick = () => {
      targetEl.style.display =
        targetEl.style.display === "none" ? "block" : "none";
    };
  }

  targetEl.insertAdjacentElement("afterend", card);

  const controls = card.querySelector(".card-controls");

  card.querySelector(".ok").onclick = async () => {
    try {
      payload.arguments = JSON.parse(card.querySelector(".ed").value);
    } catch (_) {}
    executeTool(payload, controls, callKey, targetEl);
  };

  card.querySelector(".no").onclick = () => {
    targetEl.setAttribute("data-mcp-executed", "true");
    executedCalls.add(callKey);
    controls.innerHTML = window.DSComponents.status.rejected(payload.name);
    sendText(`I skipped "${payload.name}". Please continue.`);
  };

  if (autoApprove) {
    controls.innerHTML = window.DSComponents.status.autoRunning(payload.name);
    setTimeout(() => {
      executeTool(payload, controls, callKey, targetEl);
    }, 400);
  }
}

function renderGrillQuestionCard(
  targetEl,
  grillData,
  callKey,
  isHistorical = false,
) {
  // Hide the ugly raw JSON code block so the user only sees clean interactive UI!
  if (targetEl) {
    targetEl.style.display = "none";
  }

  const card = document.createElement("div");
  card.className =
    "deepseek-mcp-action-card deepseek-grill-card ds-card ds-grill";

  const qList = grillData.is_multi_question ? grillData.questions : [grillData];

  if (isHistorical) {
    card.innerHTML = `
      <div class="ds-grill-hist">
        <div class="ds-title">
          <span><span class="ds-ic" data-ic="flame"></span> Answered Grill-Me Decision</span>
          <span class="ds-grill-count">(${qList.length} question${qList.length > 1 ? "s" : ""})</span>
        </div>
        <button class="ds-btn ds-btn-raw view-raw-btn" type="button">Toggle JSON</button>
      </div>
    `;
    const btn = card.querySelector(".view-raw-btn");
    if (btn && targetEl) {
      btn.onclick = () => {
        targetEl.style.display =
          targetEl.style.display === "none" ? "block" : "none";
      };
    }
    targetEl.insertAdjacentElement("afterend", card);
    return;
  }

  // Render question list
  let questionsHtml = qList
    .map((q, qIdx) => {
      const isMultiSelect = Boolean(q.multi_select);
      const optionsHtml = (q.options || [])
        .map((opt, i) => {
          const optId = opt.id || String.fromCharCode(65 + i);
          const label = opt.label || opt.text || "";
          const details = opt.details || "";
          return `
            <label class="ds-grill-opt grill-opt-card" data-q-idx="${qIdx}" data-opt-id="${optId}">
              <input type="${isMultiSelect ? "checkbox" : "radio"}" name="grill_q_${qIdx}" value="${optId}" />
              <div class="ds-grill-opt-body">
                <b class="ds-grill-opt-label">[${optId}] ${label}</b>
                ${details ? `<span class="ds-grill-opt-desc">${details}</span>` : ""}
              </div>
            </label>
          `;
        })
        .join("");

      return `
        <div class="ds-grill-q grill-single-q-block" data-q-idx="${qIdx}">
          <div class="ds-grill-q-title">
            ${qList.length > 1 ? `<b>#${qIdx + 1}:</b> ` : ""}${q.question}
            ${isMultiSelect ? '<span class="ds-grill-multi">(Select multiple that apply)</span>' : ""}
          </div>
          <div class="ds-grill-options grill-options-grid">
            ${optionsHtml}
          </div>
        </div>
      `;
    })
    .join("");

  card.innerHTML = `
    <div class="ds-grill-head">
      <div class="ds-grill-title">
        <span><span class="ds-ic" data-ic="flame"></span> Architecture Decision Point</span>
      </div>
      <div class="ds-title">
        <span class="ds-grill-badge">Interactive Interview</span>
        <button class="ds-btn ds-btn-raw toggle-raw-json-btn" type="button">JSON</button>
      </div>
    </div>
    <div class="grill-questions-container">
      ${questionsHtml}
    </div>
    <div class="ds-grill-custom grill-custom-wrap">
      <input type="text" class="ds-grill-custom-input grill-custom-input" placeholder="Add custom notes or alternative rationale (optional)..." />
      <div class="ds-grill-submit-row">
        <button class="ds-grill-submit grill-submit-btn" type="button">
          <span>Submit Decision <span class="ds-ic" data-ic="arrowRight"></span></span>
        </button>
      </div>
    </div>
  `;

  targetEl.insertAdjacentElement("afterend", card);

  // Toggle raw JSON button
  const toggleBtn = card.querySelector(".toggle-raw-json-btn");
  if (toggleBtn && targetEl) {
    toggleBtn.onclick = () => {
      targetEl.style.display =
        targetEl.style.display === "none" ? "block" : "none";
    };
  }

  // Selection state via .is-selected class (styling lives in theme.css)
  card.querySelectorAll(".grill-opt-card").forEach((optEl) => {
    optEl.onclick = () => {
      const input = optEl.querySelector("input");
      if (input.type === "radio") {
        const qIdx = optEl.getAttribute("data-q-idx");
        card
          .querySelectorAll(`.grill-opt-card[data-q-idx="${qIdx}"]`)
          .forEach((sibling) => sibling.classList.remove("is-selected"));
        optEl.classList.add("is-selected");
      } else {
        optEl.classList.toggle("is-selected", input.checked);
      }
    };
  });

  // Submit decision handling
  const submitBtn = card.querySelector(".grill-submit-btn");
  const customInput = card.querySelector(".grill-custom-input");

  submitBtn.onclick = () => {
    const answers = [];

    qList.forEach((q, idx) => {
      const checkedInputs = Array.from(
        card.querySelectorAll(`input[name="grill_q_${idx}"]:checked`),
      );
      const selectedIds = checkedInputs.map((i) => i.value);
      const selectedOpts = (q.options || []).filter((o, i) =>
        selectedIds.includes(o.id || String.fromCharCode(65 + i)),
      );

      if (selectedOpts.length > 0) {
        const labelStr = selectedOpts
          .map(
            (o, i) =>
              `[${o.id || String.fromCharCode(65 + i)}] "${o.label || o.text || ""}"`,
          )
          .join(", ");
        const detailsStr = selectedOpts
          .map((o) => o.details)
          .filter(Boolean)
          .join("; ");
        answers.push(
          `Question "${q.question}":\n- Decision: ${labelStr}${detailsStr ? `\n- Details: ${detailsStr}` : ""}`,
        );
      }
    });

    const customText = customInput ? customInput.value.trim() : "";
    if (customText) {
      answers.push(`- Custom Rationale/Notes: ${customText}`);
    }

    if (answers.length === 0 && !customText) {
      alert(
        "Please select an option or type a custom response before submitting.",
      );
      return;
    }

    if (targetEl) {
      targetEl.setAttribute("data-mcp-executed", "true");
    }
    executedCalls.add(callKey);
    const fullAnswer = `My Architecture Decision:\n${answers.join("\n\n")}\n\nWhat is the next step or question?`;

    card.innerHTML = `
      <div class="ds-grill-answered">
        <span><span class="ds-ic" data-ic="check"></span> Architecture Decision Submitted!</span>
      </div>
    `;

    sendText(fullAnswer, true);
  };
}

function scanMessages() {
  const codeBlocks = Array.from(document.querySelectorAll("div.md-code-block"));
  if (!codeBlocks.length) return;

  // Find all messages in the thread
  const messages = Array.from(
    document.querySelectorAll(
      "div.ds-message, div._4f9bf79, div.chat-message, div[data-message-id]",
    ),
  );
  const lastMessage =
    messages.length > 0 ? messages[messages.length - 1] : null;

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
      (text.includes("grill_question") || text.includes('"questions"')) &&
      window.DSTools.extractGrillQuestion
    ) {
      const grillData = window.DSTools.extractGrillQuestion(text);
      if (grillData && (grillData.question || grillData.questions)) {
        el.setAttribute("data-mcp-attached", "true");
        const qTitle =
          grillData.question || grillData.questions[0]?.question || "multi";
        const callKey = `grill:${qTitle.slice(0, 80)}`;

        const isElementExecuted =
          el.getAttribute("data-mcp-executed") === "true";

        const isHistorical = isElementExecuted;

        renderGrillQuestionCard(el, grillData, callKey, isHistorical);
        return;
      }
    }

    // 2. Check for standard MCP tool call JSON
    if (!text.includes("name")) return;

    const payload = window.DSTools.extractMcpCall(text);
    if (payload && payload.name) {
      el.setAttribute("data-mcp-attached", "true");

      const isElementExecuted = el.getAttribute("data-mcp-executed") === "true";

      // If an element has never executed, it is NEVER historical! It must be actionable.
      const isHistorical = isElementExecuted;

      if (!el.dataset.mcpId) {
        el.dataset.mcpId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      }
      const callKey = `${el.dataset.mcpId}:${payload.name}`;

      renderPermissionCard(el, payload, callKey, isHistorical);
    }
  });
}

// Auto-handle DeepSeek network/server Retry button
let retryTimeout = null;
let lastRetriedEl = null;

function checkAndHandleRetryButton() {
  if (!autoApprove) return;

  // Search for Retry button or container
  // DeepSeek renders Retry with an orange/yellow circle icon or button with text "Retry"
  const buttons = Array.from(
    document.querySelectorAll(
      'button, div[role="button"], span[role="button"], div[class*="retry" i], button[class*="retry" i]',
    ),
  );

  for (const btn of buttons) {
    const text = (btn.textContent || "").trim().toLowerCase();
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    const title = (btn.getAttribute("title") || "").toLowerCase();

    const isRetry =
      text === "retry" ||
      text.includes("retry") ||
      aria.includes("retry") ||
      title.includes("retry") ||
      btn.classList.contains("ds-retry-button");

    if (isRetry && btn !== lastRetriedEl && btn.offsetParent !== null) {
      if (retryTimeout) return;

      console.log(
        "[DeepSeek Studio] Detected Retry button. Waiting 1 second before clicking...",
      );
      retryTimeout = setTimeout(() => {
        retryTimeout = null;
        lastRetriedEl = btn;
        console.log("[DeepSeek Studio] Clicking Retry button now.");

        btn.dispatchEvent(
          new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
        );
        btn.dispatchEvent(
          new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
        );
        btn.dispatchEvent(
          new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
        );
        btn.dispatchEvent(
          new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
        );
        btn.click();
      }, 1000);
      return;
    }
  }
}

// Observer
new MutationObserver(() => {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    scanMessages();
    attachInputMentionInterceptor();
    injectChatBadge();
    injectSidebarProjectFilter();
    checkAndHandleRetryButton();
  }, 200);
}).observe(document.body, {
  childList: true,
  subtree: true,
  characterData: true,
});

scanMessages();
injectSidebarProjectFilter();
checkAndHandleRetryButton();
