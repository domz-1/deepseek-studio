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

function isContextValid() {
  return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
}

async function fetchActiveTools() {
  if (!isContextValid()) return [];
  try {
    // Always route through the background worker so the bridge token is
    // attached and the page never performs an unauthenticated fetch.
    const bgRes = await new Promise((r) => {
      chrome.runtime.sendMessage({ type: "GET_MCP" }, (res) => {
        if (chrome.runtime.lastError) {
          r(null);
        } else {
          r(res);
        }
      });
    });
    if (bgRes?.ok && bgRes.data?.tools) {
      activeTools = bgRes.data.tools;
      serverStatus = bgRes.data.status || {};
      return activeTools;
    }
  } catch (e) {
    // Silence error if extension context is invalidated by reload
    if (!e?.message?.includes("Extension context invalidated")) {
      console.warn("[MCP] fetchActiveTools failed", e);
    }
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

let lastSentMessage = "";
let lastActivityTime = Date.now();
const INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes
const GRILL_AUTO_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

function recordActivity() {
  lastActivityTime = Date.now();
}

// Reliable message sender
async function sendText(text, isUserInput = false) {
  if (isSending) return;
  isSending = true;
  recordActivity();
  if (text) {
    lastSentMessage = text;
  }

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
    sendText(window.DSTools.buildSysPrompt(msg.tools, selectedProject));
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

            // Inject active MCP tools and project context into the skill prompt!
            await fetchActiveTools();
            if (activeTools.length) {
              const selectedTools = activeMention
                ? window.DSTools.filterToolsByMention(
                    activeMention,
                    activeTools,
                  )
                : activeTools;
              prompt = `${window.DSTools.buildSysPrompt(selectedTools, selectedProject)}\n${prompt}`;
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
          sendText(combined, true);
          return;
        }

        // Case 3: Regular text without mentions/skills.
        // Send immediately to chat when Enter is pressed!
        // (Queueing is exclusively handled when the user clicks + Queue)
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

function getCustomProjects() {
  try {
    return JSON.parse(
      localStorage.getItem("deepseek_mcp_custom_projects") || "[]",
    );
  } catch (_) {
    return [];
  }
}

function fetchAllProjects(cb) {
  const customs = getCustomProjects();
  if (!isContextValid()) {
    cb(customs);
    return;
  }
  try {
    chrome.runtime.sendMessage({ type: "GET_PROJECTS" }, (res) => {
      if (chrome.runtime.lastError) {
        cb(customs);
        return;
      }
      let list = [];
      if (res?.ok && Array.isArray(res.data?.projects)) {
        list = res.data.projects;
        projectList = list;
      }
      const all = [...customs, ...list];
      const seen = new Set();
      const unique = [];
      for (const item of all) {
        if (!seen.has(item.path)) {
          seen.add(item.path);
          unique.push(item);
        }
      }
      cb(unique);
    });
  } catch (_) {
    cb(customs);
  }
}

function updateProjectLabel() {
  const label = document.getElementById("mcp-project-label");
  if (!label) return;
  const name = selectedProject
    ? selectedProject.split("/").filter(Boolean).pop() || selectedProject
    : "Select Project";
  label.textContent = name;
  label.title = selectedProject;
}

function injectSidebarProjectFilter() {
  // Try several selectors to find DeepSeek's sidebar or New Chat button
  let newChatBtn = Array.from(
    document.querySelectorAll("button, div[role='button'], a"),
  ).find((el) => {
    const text = (el.textContent || "").trim().toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    return text.includes("new chat") || aria.includes("new chat");
  });

  let sidebar = null;
  let insertBeforeNode = null;

  if (newChatBtn) {
    // Walk up to find a container that has siblings or houses the chat history
    let curr = newChatBtn.parentElement;
    for (let depth = 0; depth < 5 && curr; depth++) {
      if (
        curr.tagName === "ASIDE" ||
        curr.tagName === "NAV" ||
        curr.classList.contains("ds-sidebar") ||
        curr.querySelector("div[class*='history'], nav, aside")
      ) {
        sidebar = curr;
        break;
      }
      curr = curr.parentElement;
    }
    if (!sidebar && newChatBtn.parentElement?.parentElement) {
      sidebar = newChatBtn.parentElement.parentElement;
    }
    insertBeforeNode =
      newChatBtn.parentElement?.nextElementSibling ||
      newChatBtn.nextElementSibling;
  }

  if (!sidebar) {
    sidebar =
      document.querySelector("aside") ||
      document.querySelector("nav") ||
      document.querySelector("div[class*='sidebar']") ||
      document.querySelector("div[class*='left']") ||
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

    const allBtn = head.querySelector("#ds-sidebar-all-projects");
    if (allBtn) {
      allBtn.onclick = () => {
        selectedProject = "";
        localStorage.setItem("deepseek_mcp_selected_project", "");
        updateProjectLabel();
        chips
          .querySelectorAll(".ds-sidebar-chip")
          .forEach((b) => b.classList.remove("is-active"));
      };
    }

    if (insertBeforeNode && insertBeforeNode.parentElement === sidebar) {
      sidebar.insertBefore(filterWrap, insertBeforeNode);
    } else {
      sidebar.insertBefore(filterWrap, sidebar.firstChild);
    }
  }

  const chipsContainer = document.getElementById("ds-sidebar-chips");
  if (!chipsContainer || chipsContainer.children.length > 0) return;

  fetchAllProjects((unique) => {
    const projects = unique.slice(0, 10);
    chipsContainer.innerHTML = projects
      .map((p) => {
        const isActive = p.path === selectedProject;
        const short = p.name
          .replace(/^⭐\s*/, "")
          .split("/")
          .pop();
        return `<button class="ds-sidebar-chip ${isActive ? "is-active" : ""}" data-path="${p.path}" title="${p.path}" type="button">${short}</button>`;
      })
      .join("");

    chipsContainer.querySelectorAll(".ds-sidebar-chip").forEach((btn) => {
      btn.onclick = () => {
        selectedProject = btn.dataset.path;
        localStorage.setItem("deepseek_mcp_selected_project", selectedProject);
        chipsContainer
          .querySelectorAll(".ds-sidebar-chip")
          .forEach((b) => b.classList.remove("is-active"));
        btn.classList.add("is-active");
        updateProjectLabel();
      };
    });
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
    wrap.innerHTML = window.DSComponents.badgeBar({ selectedProject });

    const projTrigger = wrap.querySelector("#mcp-project-trigger");
    if (projTrigger) {
      projTrigger.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        fetchAllProjects((projects) => {
          if (window.DSUI?.showProjectMenu) {
            window.DSUI.showProjectMenu(
              projTrigger,
              projects,
              selectedProject,
              (chosen) => {
                selectedProject = chosen.path;
                localStorage.setItem(
                  "deepseek_mcp_selected_project",
                  selectedProject,
                );
                updateProjectLabel();
                // Sync sidebar chips
                const chips = document.getElementById("ds-sidebar-chips");
                if (chips) {
                  chips.querySelectorAll(".ds-sidebar-chip").forEach((b) => {
                    b.classList.toggle(
                      "is-active",
                      b.dataset.path === selectedProject,
                    );
                  });
                }
              },
            );
          }
        });
      };
    }

    const addBtn = wrap.querySelector("#mcp-add-project-btn");
    if (addBtn) {
      addBtn.onclick = () => {
        showAddProjectModal((cleanPath) => {
          if (!cleanPath) return;
          const name = cleanPath.split("/").filter(Boolean).pop() || cleanPath;
          let customs = getCustomProjects();
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
          updateProjectLabel();
          // Force re-render of sidebar chips
          const filter = document.getElementById("ds-sidebar-project-filter");
          if (filter) filter.remove();
          injectSidebarProjectFilter();
        });
      };
    }

    targetParent.parentElement.insertBefore(wrap, targetParent);
  }

  updateProjectLabel();
  updateServerBadges();
  updateTaskBadge();

  if (!activeTools.length) {
    fetchActiveTools().then(() => {
      updateServerBadges();
    });
  }

  // Also inject the Queued Messages Bar right below the badge bar
  injectMessageQueueBar(targetParent);
}

// --- Queued Messages System ---
// Allows user to queue messages in a dedicated input while tasks/sub-commands run.
// The next message automatically dispatches when all tasks, sub-commands, and generation finish!
let queuedMessages = [];
try {
  queuedMessages = JSON.parse(
    sessionStorage.getItem("deepseek_mcp_queued_messages") || "[]",
  );
} catch (_) {}

function saveQueuedMessages() {
  try {
    sessionStorage.setItem(
      "deepseek_mcp_queued_messages",
      JSON.stringify(queuedMessages),
    );
  } catch (_) {}
}

function renderQueueList(container) {
  const listEl = container.querySelector(".ds-queue-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (queuedMessages.length === 0) {
    listEl.style.display = "none";
    return;
  }

  listEl.style.display = "flex";
  queuedMessages.forEach((msg, idx) => {
    const item = document.createElement("div");
    item.className = "ds-queue-item";
    item.title = "Click to send now, or wait for auto-send on completion";
    item.innerHTML = `
      <span class="ds-queue-item-idx">${idx + 1}</span>
      <span class="ds-queue-item-text" title="${msg.replace(/"/g, "&quot;")}">${msg}</span>
      <span class="ds-queue-item-del" title="Remove"><span class="ds-ic" data-ic="close"></span></span>
    `;

    // Clicking the item text sends it immediately!
    item.querySelector(".ds-queue-item-text").onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      queuedMessages.splice(idx, 1);
      saveQueuedMessages();
      renderQueueList(container);
      sendText(msg, true);
    };

    item.querySelector(".ds-queue-item-del").onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      queuedMessages.splice(idx, 1);
      saveQueuedMessages();
      renderQueueList(container);
    };
    listEl.appendChild(item);
  });
}

function injectMessageQueueBar(targetParent) {
  if (!targetParent || !targetParent.parentElement) return;

  let qWrap = document.getElementById("deepseek-mcp-queue-bar");
  if (qWrap && qWrap.parentElement !== targetParent.parentElement) {
    qWrap.remove();
    qWrap = null;
  }

  if (!qWrap) {
    qWrap = document.createElement("div");
    qWrap.id = "deepseek-mcp-queue-bar";
    qWrap.className = "ds-queue-container";
    qWrap.innerHTML = `
      <div class="ds-queue-input-wrapper">
        <span class="ds-queue-tag">
          <span class="ds-ic" data-ic="clock"></span>
          <span>Queue Next</span>
        </span>
        <input type="text" class="ds-queue-input" placeholder="Queue a message to send after current task & all sub-commands finish..." spellcheck="false" />
        <button type="button" class="ds-queue-btn ds-queue-btn-send" title="Send this message right now immediately">
          <span class="ds-ic" data-ic="arrowRight"></span>
          <span>Send Now</span>
        </button>
        <button type="button" class="ds-queue-btn" title="Queue to send when tasks finish">
          <span class="ds-ic" data-ic="plus"></span>
          <span>Queue</span>
        </button>
      </div>
      <div class="ds-queue-list"></div>
    `;

    const input = qWrap.querySelector(".ds-queue-input");
    const sendNowBtn = qWrap.querySelector(".ds-queue-btn-send");
    const addBtn = qWrap.querySelector(".ds-queue-btn:not(.ds-queue-btn-send)");

    const getTargetText = () => {
      let val = input.value.trim();
      const chatInput = getChatInput();
      if (!val && chatInput && chatInput.value.trim()) {
        val = chatInput.value.trim();
        setInputValue(chatInput, "");
      }
      return val;
    };

    const enqueue = () => {
      const val = getTargetText();
      if (!val) {
        input.focus();
        return;
      }
      queuedMessages.push(val);
      saveQueuedMessages();
      input.value = "";
      renderQueueList(qWrap);
    };

    const sendNow = () => {
      const val = getTargetText();
      if (!val) {
        input.focus();
        return;
      }
      input.value = "";
      sendText(val, true);
    };

    if (sendNowBtn) {
      sendNowBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        sendNow();
      };
    }

    if (addBtn) {
      addBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        enqueue();
      };
    }

    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        enqueue();
      }
    };

    targetParent.parentElement.insertBefore(qWrap, targetParent);
  }

  renderQueueList(qWrap);
}

// Queue Worker: checks if all tasks, sub-commands, and generation are 100% complete
let isDispatchingQueue = false;

async function checkAndProcessQueue() {
  if (isDispatchingQueue || queuedMessages.length === 0) return;

  // 1. Check if DeepSeek is currently generating streaming text
  if (isDeepSeekGenerating()) return;

  // 2. Check if background tasks are currently running
  if (runningTaskCount > 0) return;

  // 3. Check if there are any unexecuted pending MCP permission cards
  const pendingCards = Array.from(
    document.querySelectorAll(".deepseek-mcp-action-card:not(.is-historical)"),
  );
  if (pendingCards.some((c) => c.querySelector(".mcp-approve-btn"))) return;

  // 4. Check if a Grill-me question card is waiting for user input
  const pendingGrill = document.querySelector(
    ".deepseek-grill-card:not(.is-historical)",
  );
  if (pendingGrill && !pendingGrill.querySelector(".ds-grill-answered")) return;

  // 5. Check if the send button is ready to click (up arrow icon visible and not disabled)
  const sendBtn = getSendButton();
  if (sendBtn) {
    const disabledAttr = sendBtn.getAttribute("disabled");
    const ariaDisabled = sendBtn.getAttribute("aria-disabled");
    const isBtnDisabled =
      disabledAttr !== null ||
      ariaDisabled === "true" ||
      sendBtn.classList.contains("disabled") ||
      sendBtn.classList.contains("ds-button--disabled");
    if (isBtnDisabled) return;
  }

  // Double check stability: ensure at least 1.5 seconds have passed since last activity
  if (Date.now() - lastActivityTime < 1500) return;

  // All tasks, sub-commands, and generation are totally done!
  isDispatchingQueue = true;
  try {
    const nextMsg = queuedMessages.shift();
    saveQueuedMessages();

    const qWrap = document.getElementById("deepseek-mcp-queue-bar");
    if (qWrap) renderQueueList(qWrap);

    console.log(
      `[DeepSeek Studio] Current task and all sub-commands totally finished. Dispatching queued message: "${nextMsg}"`,
    );
    await sendText(nextMsg, true);
  } catch (err) {
    console.error("[DeepSeek Studio] Error sending queued message:", err);
  } finally {
    isDispatchingQueue = false;
  }
}

setInterval(checkAndProcessQueue, 1500);

const HUMAN_RESULT_TEMPLATES = [
  (name, out) =>
    `Output of ${name}:\n\`\`\`json\n${out}\n\`\`\`\nAnalyze this result and proceed with the next tool call or action to finish the task.`,
  (name, out) =>
    `Results for ${name}:\n\`\`\`json\n${out}\n\`\`\`\nContinue executing the next step autonomously until complete.`,
  (name, out) =>
    `Tool ${name} completed:\n\`\`\`json\n${out}\n\`\`\`\nCheck the output and proceed with the next tool call.`,
];

// Batch Tool execution & card rendering
async function executeBatchTools(payloads, cardStatusEl, callKey, targetEl) {
  if (!Array.isArray(payloads) || payloads.length === 0) return;
  if (payloads.length === 1) {
    return executeTool(payloads[0], cardStatusEl, callKey, targetEl);
  }

  const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  if (cardStatusEl) {
    cardStatusEl.innerHTML = `<div class="ds-card-head ds-mb0">
      <div class="ds-note ds-note-accent ds-pad0"><span class="ds-ic" data-ic="clock"></span> Running batch of ${payloads.length} tools in parallel...</div>
      <button class="ds-btn ds-btn-no ds-btn-sm mcp-card-kill-btn" type="button"><span class="ds-ic" data-ic="close"></span> Kill Batch</button>
    </div>`;
    const killBtn = cardStatusEl.querySelector(".mcp-card-kill-btn");
    if (killBtn) {
      killBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        killActiveTask(batchId);
      };
    }
  }

  runningTaskCount += payloads.length;
  updateTaskBadge();

  try {
    const results = await Promise.all(
      payloads.map(async (payload, idx) => {
        const callId = `${batchId}_${idx}`;
        payload.callId = callId;

        if (selectedProject) {
          payload.project = selectedProject;
          payload.arguments = payload.arguments || {};
          if (
            (payload.name === "execute_command" || payload.name === "bash") &&
            !payload.arguments.cwd
          ) {
            payload.arguments.cwd = selectedProject;
          }
          if (
            payload.arguments.path &&
            typeof payload.arguments.path === "string" &&
            !payload.arguments.path.startsWith("/")
          ) {
            payload.arguments.path =
              `${selectedProject}/${payload.arguments.path}`.replace(
                /\/+/g,
                "/",
              );
          }
        }

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
          return {
            name: payload.name,
            output: JSON.stringify(data.content || data, null, 2).slice(
              0,
              5000,
            ),
            success: true,
          };
        } catch (err) {
          return {
            name: payload.name,
            output: `Error: ${err.message}`,
            success: false,
          };
        }
      }),
    );

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

    if (cardStatusEl) {
      cardStatusEl.innerHTML = `<div class="ds-note ds-note-success"><span class="ds-ic" data-ic="check"></span> Completed batch of ${payloads.length} tools.</div>`;
    }

    const batchMessage =
      `Batch Results for ${payloads.length} parallel calls:\n` +
      results
        .map(
          (r, i) =>
            `### Tool ${i + 1}: ${r.name}\n\`\`\`json\n${r.output}\n\`\`\``,
        )
        .join("\n\n") +
      `\n\nAnalyze these batch results and continue executing the next step autonomously until complete.`;

    await sendText(batchMessage);
  } catch (err) {
    if (cardStatusEl) {
      cardStatusEl.innerHTML = window.DSComponents.status.error(err.message);
    }
    await sendText(`Execution notice on batch: ${err.message}`);
  } finally {
    runningTaskCount = Math.max(0, runningTaskCount - payloads.length);
    updateTaskBadge();
    scrollToBottom();
  }
}

// Tool execution & card rendering
async function executeTool(payload, cardStatusEl, callKey, targetEl) {
  const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  payload.callId = callId;

  // Automatically contextualize tool execution to the active workspace
  payload.arguments = payload.arguments || {};

  // Auto-recovery: If command is missing or empty, search surrounding element for <bash>...</bash> or command text
  if (
    (payload.name === "execute_command" || payload.name === "bash") &&
    !payload.arguments.command &&
    targetEl
  ) {
    const parentMessage =
      targetEl.closest(
        "div.ds-markdown, div.md-code-block, pre, div[class*='message']",
      ) || targetEl.parentElement;
    const fullText =
      (parentMessage ? parentMessage.textContent : targetEl.textContent) || "";
    const bashTagMatch = fullText.match(
      /<(?:bash|sh|shell)>([\s\S]*?)<\/(?:bash|sh|shell)>/i,
    );
    if (bashTagMatch && bashTagMatch[1].trim()) {
      payload.arguments.command = bashTagMatch[1].trim();
    }
  }

  if (selectedProject) {
    payload.project = selectedProject;
    // If bash/execute_command without cwd, set to selectedProject
    if (
      (payload.name === "execute_command" || payload.name === "bash") &&
      !payload.arguments.cwd
    ) {
      payload.arguments.cwd = selectedProject;
    }
    // If filesystem tool called with relative path or empty path, resolve inside selectedProject
    if (
      payload.arguments.path &&
      typeof payload.arguments.path === "string" &&
      !payload.arguments.path.startsWith("/")
    ) {
      payload.arguments.path =
        `${selectedProject}/${payload.arguments.path}`.replace(/\/+/g, "/");
    }
  }

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
  // Hide or clean the raw code block / DSML markup so user only sees clean UI card
  if (targetEl) {
    if (
      targetEl.tagName === "PRE" ||
      targetEl.classList.contains("md-code-block")
    ) {
      targetEl.style.display = "none";
    } else {
      // It is a div.ds-markdown container where DSML was printed as raw text
      // Hide or strip the DSML tags from the DOM content
      try {
        const rawHtml = targetEl.innerHTML;
        const cleanedHtml = rawHtml
          .replace(
            /(&lt;|<)[\|\uff5c\s]*DSML[\s\S]*?(\/)[\|\uff5c\s]*DSML[\|\uff5c\s]*calls(&gt;|>)/gi,
            "",
          )
          .replace(
            /(&lt;|<)[\|\uff5c\s]*DSML[\s\S]*?(\/)[\|\uff5c\s]*DSML[\|\uff5c\s]*invoke(&gt;|>)/gi,
            "",
          )
          .replace(/(&lt;|<)[\|\uff5c\s]*DSML[\|\uff5c\s]*calls(&gt;|>)/gi, "")
          .replace(
            /(&lt;|<)\/[\|\uff5c\s]*DSML[\|\uff5c\s]*calls(&gt;|>)/gi,
            "",
          )
          .replace(/(&lt;|<)tool_call(?:s)?(&gt;|>)/gi, "")
          .replace(/(&lt;|<)\/tool_call(?:s)?(&gt;|>)/gi, "");
        if (cleanedHtml.trim() !== rawHtml.trim()) {
          targetEl.innerHTML = cleanedHtml;
        }
      } catch (_) {}
    }
  }

  const isBatch = Array.isArray(payload);
  const isSafe = isBatch
    ? payload.every((p) => window.DSTools.SAFE_TOOLS.has(p.name))
    : window.DSTools.SAFE_TOOLS.has(payload.name);

  const card = document.createElement("div");
  card.className =
    "deepseek-mcp-action-card ds-card" +
    (isSafe ? "" : " is-danger") +
    (isAlreadyExecuted ? " is-historical" : "");
  card.innerHTML = window.DSComponents.permissionCard({
    payload,
    isSafe,
    isHistorical: isAlreadyExecuted,
    isBatch,
    batchCount: isBatch ? payload.length : 1,
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
      const edited = JSON.parse(card.querySelector(".ed").value);
      if (isBatch && Array.isArray(edited)) {
        payload = edited;
      } else if (!isBatch && edited) {
        payload.arguments = edited;
      }
    } catch (_) {}
    if (isBatch) {
      executeBatchTools(payload, controls, callKey, targetEl);
    } else {
      executeTool(payload, controls, callKey, targetEl);
    }
  };

  card.querySelector(".no").onclick = () => {
    targetEl.setAttribute("data-mcp-executed", "true");
    executedCalls.add(callKey);
    const title = isBatch ? `batch of ${payload.length} tools` : payload.name;
    controls.innerHTML = window.DSComponents.status.rejected(title);
    sendText(`I skipped "${title}". Please continue.`);
  };

  if (autoApprove) {
    const title = isBatch ? `batch of ${payload.length} tools` : payload.name;
    controls.innerHTML = window.DSComponents.status.autoRunning(title);
    setTimeout(() => {
      if (isBatch) {
        executeBatchTools(payload, controls, callKey, targetEl);
      } else {
        executeTool(payload, controls, callKey, targetEl);
      }
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
          const optId =
            typeof opt === "object" && opt?.id
              ? opt.id
              : String.fromCharCode(65 + i);
          const label =
            typeof opt === "string"
              ? opt
              : opt.label || opt.text || opt.title || "";
          const details =
            typeof opt === "object" ? opt.details || opt.desc || "" : "";
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

  const doSubmitDecision = (isAuto = false) => {
    if (card.__grillAutoTimer) {
      clearInterval(card.__grillAutoTimer);
      card.__grillAutoTimer = null;
    }

    const answers = [];

    qList.forEach((q, idx) => {
      let checkedInputs = Array.from(
        card.querySelectorAll(`input[name="grill_q_${idx}"]:checked`),
      );

      // If auto-answering or no selection made, automatically select recommended option
      if (isAuto && checkedInputs.length === 0) {
        // Find option that contains "(Recommended)" or default to the first option
        const recIndex = (q.options || []).findIndex((o) => {
          const text =
            typeof o === "string" ? o : `${o.label || ""} ${o.details || ""}`;
          return text.toLowerCase().includes("recommended");
        });
        const targetIdx = recIndex !== -1 ? recIndex : 0;
        const opt = (q.options || [])[targetIdx];
        if (opt) {
          const optId =
            typeof opt === "object" && opt?.id
              ? opt.id
              : String.fromCharCode(65 + targetIdx);
          const inputEl = card.querySelector(
            `input[name="grill_q_${idx}"][value="${optId}"]`,
          );
          if (inputEl) inputEl.checked = true;
          checkedInputs = [inputEl].filter(Boolean);
        }
      }

      const selectedIds = checkedInputs.map((i) => i.value);
      const selectedOpts = (q.options || []).filter((o, i) =>
        selectedIds.includes(
          typeof o === "object" && o?.id ? o.id : String.fromCharCode(65 + i),
        ),
      );

      if (selectedOpts.length > 0) {
        const labelStr = selectedOpts
          .map((o, i) => {
            const id =
              typeof o === "object" && o?.id
                ? o.id
                : String.fromCharCode(65 + i);
            const lbl =
              typeof o === "string" ? o : o.label || o.text || o.title || "";
            return `[${id}] "${lbl}"`;
          })
          .join(", ");
        const detailsStr = selectedOpts
          .map((o) => (typeof o === "object" ? o.details : ""))
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
      if (!isAuto) {
        alert(
          "Please select an option or type a custom response before submitting.",
        );
      }
      return;
    }

    if (targetEl) {
      targetEl.setAttribute("data-mcp-executed", "true");
    }
    executedCalls.add(callKey);
    const reasonPrefix = isAuto
      ? "[Auto-selected Recommended Options after 10m timeout]\n"
      : "";
    const fullAnswer = `${reasonPrefix}My Architecture Decision:\n${answers.join("\n\n")}\n\nWhat is the next step or question?`;

    card.innerHTML = `
      <div class="ds-grill-answered">
        <span><span class="ds-ic" data-ic="check"></span> ${isAuto ? "Recommended Decisions Auto-Submitted (Timeout)!" : "Architecture Decision Submitted!"}</span>
      </div>
    `;

    sendText(fullAnswer, true);
  };

  submitBtn.onclick = () => doSubmitDecision(false);

  // Set 2-minute auto-answer timer for recommended options
  const startTime = Date.now();
  const timerBadge = document.createElement("span");
  timerBadge.className = "ds-grill-badge";
  timerBadge.style.cssText =
    "background:var(--ds-bg-hover);color:var(--ds-fg-muted);margin-left:6px;font-size:10px;";
  timerBadge.textContent = "Auto-answering in 2:00";
  const titleContainer = card.querySelector(".ds-grill-head .ds-title");
  if (titleContainer) {
    titleContainer.insertBefore(timerBadge, titleContainer.firstChild);
  }

  card.__grillAutoTimer = setInterval(() => {
    // If card detached or already answered, stop
    if (
      !document.body.contains(card) ||
      card.querySelector(".ds-grill-answered")
    ) {
      clearInterval(card.__grillAutoTimer);
      return;
    }

    const elapsed = Date.now() - startTime;
    const remaining = Math.max(0, GRILL_AUTO_TIMEOUT_MS - elapsed);
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    timerBadge.textContent = `Auto-answering in ${mins}:${secs < 10 ? "0" : ""}${secs}`;

    if (remaining <= 0) {
      clearInterval(card.__grillAutoTimer);
      card.__grillAutoTimer = null;
      console.log(
        "[DeepSeek Studio] 2 minutes passed without answering. Auto-selecting recommended options and submitting...",
      );
      doSubmitDecision(true);
    }
  }, 1000);
}

function scanMessages() {
  const codeBlocks = Array.from(
    document.querySelectorAll("div.md-code-block, pre, div.ds-markdown"),
  );
  if (!codeBlocks.length) return;

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

    // 2. Check for standard MCP tool calls (JSON, DeepSeek DSML, or <tool_call> tags)
    if (
      !text.includes("name") &&
      !text.includes("invoke") &&
      !text.includes("tool_call")
    )
      return;

    const allCalls = window.DSTools.extractAllMcpCalls
      ? window.DSTools.extractAllMcpCalls(text)
      : [window.DSTools.extractMcpCall(text)].filter(Boolean);

    if (allCalls && allCalls.length > 0) {
      el.setAttribute("data-mcp-attached", "true");

      const isElementExecuted = el.getAttribute("data-mcp-executed") === "true";
      const isHistorical = isElementExecuted;

      if (!el.dataset.mcpId) {
        el.dataset.mcpId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      }

      if (allCalls.length === 1) {
        const payload = allCalls[0];
        const callKey = `${el.dataset.mcpId}:${payload.name}`;
        renderPermissionCard(el, payload, callKey, isHistorical);
      } else {
        const callKey = `${el.dataset.mcpId}:batch_${allCalls.length}`;
        renderPermissionCard(el, allCalls, callKey, isHistorical);
      }
    }
  });
}

// Auto-handle DeepSeek network/server Retry button
let retryTimeout = null;
let lastRetriedEl = null;

function checkAndHandleRetryButton() {
  if (!autoApprove) return;

  function triggerClick(el, name) {
    if (!el || el.offsetParent === null) return;
    lastRetriedEl = el;
    console.log(`[DeepSeek Studio] Immediately clicking ${name} button now.`);
    try {
      el.dispatchEvent(
        new MouseEvent("pointerdown", { bubbles: true, cancelable: true }),
      );
      el.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
      );
      el.dispatchEvent(
        new MouseEvent("pointerup", { bubbles: true, cancelable: true }),
      );
      el.dispatchEvent(
        new MouseEvent("mouseup", { bubbles: true, cancelable: true }),
      );
      el.click();
    } catch (err) {
      console.warn(`[DeepSeek Studio] Error clicking ${name}:`, err);
    }
  }

  // 1. Direct match for DeepSeek's circular retry/refresh button:
  const directRetryBtn =
    document.querySelector(
      '.ds-button--warning, [class*="ds-button--warning"], [class*="retry-button"]',
    ) || document.querySelector('div[role="button"].ds-button--warning');

  if (
    directRetryBtn &&
    directRetryBtn !== lastRetriedEl &&
    directRetryBtn.offsetParent !== null
  ) {
    triggerClick(directRetryBtn, "Warning/Retry");
    return;
  }

  // 2. Direct match for DeepSeek's "Continue" button:
  // e.g. <div role="button" class="ds-button ds-button--outlinedNeutral ds-button--outlined ds-button--capsule ..."><span class="ds-button__content">Continue</span></div>
  const directContinueBtn = Array.from(
    document.querySelectorAll(
      '.ds-button--capsule, .ds-button, div[role="button"], button',
    ),
  ).find((el) => {
    const text = (el.textContent || "").trim().toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    return (
      (text === "continue" ||
        aria === "continue" ||
        (text.includes("continue") && !text.includes("discontinue"))) &&
      el.offsetParent !== null
    );
  });

  if (
    directContinueBtn &&
    directContinueBtn !== lastRetriedEl &&
    directContinueBtn.offsetParent !== null
  ) {
    triggerClick(directContinueBtn, "Continue");
    return;
  }

  // 3. Search all buttons or role=button or clickable elements
  const buttons = Array.from(
    document.querySelectorAll(
      'button, div[role="button"], span[role="button"], div[class*="retry" i], button[class*="retry" i], .ds-button',
    ),
  );

  for (const btn of buttons) {
    const text = (btn.textContent || "").trim().toLowerCase();
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    const title = (btn.getAttribute("title") || "").toLowerCase();

    // Check if parent text has "retry" or "check network and retry"
    const parentText = (btn.parentElement?.textContent || "")
      .trim()
      .toLowerCase();

    const isRetryOrContinue =
      text === "retry" ||
      text.includes("retry") ||
      parentText.includes("retry") ||
      aria.includes("retry") ||
      title.includes("retry") ||
      btn.classList.contains("ds-retry-button") ||
      btn.classList.contains("ds-button--warning") ||
      text === "continue" ||
      (text.includes("continue") && !text.includes("discontinue")) ||
      aria.includes("continue") ||
      title.includes("continue") ||
      btn.classList.contains("ds-continue-button");

    if (
      isRetryOrContinue &&
      btn !== lastRetriedEl &&
      btn.offsetParent !== null
    ) {
      const actionName =
        text.includes("continue") || aria.includes("continue")
          ? "Continue"
          : "Retry";
      triggerClick(btn, actionName);
      return;
    }
  }
}

// 3-minute Chat Inactivity Watchdog
// Displays live countdown badge. Only triggers auto-resend if the chat is stalled and the last message contains JSON/tool output (not completed).
function updateWatchdogBadge(remainingMs) {
  const badge = document.getElementById("mcp-watchdog-indicator");
  if (!badge) return;

  if (remainingMs === null || remainingMs === undefined) {
    badge.classList.remove("is-on");
    badge.innerHTML = "";
    return;
  }

  const mins = Math.floor(remainingMs / 60000);
  const secs = Math.floor((remainingMs % 60000) / 1000);
  badge.classList.add("is-on");
  badge.innerHTML = `<span class="ds-watchdog-dot"></span><span>Auto-continue in <b class="ds-watchdog-time">${mins}:${secs < 10 ? "0" : ""}${secs}</b></span>`;
}

function checkInactivityAndResend() {
  // If DeepSeek is actively generating or a task is executing, don't intervene
  if (isDeepSeekGenerating() || isSending || runningTaskCount > 0) {
    recordActivity();
    updateWatchdogBadge(null);
    return;
  }

  // If there's an active, unanswered question card on screen, let the 2m question timer handle it
  const activeQuestionCard = Array.from(
    document.querySelectorAll(".deepseek-grill-card"),
  ).find((c) => !c.querySelector(".ds-grill-answered"));
  if (activeQuestionCard) {
    updateWatchdogBadge(null);
    return;
  }

  // If there is an actionable tool permission card waiting for user click (when not auto-approve), don't resend
  const pendingToolCard = Array.from(
    document.querySelectorAll(
      ".deepseek-mcp-action-card:not(.deepseek-grill-card)",
    ),
  ).find((c) => c.querySelector(".mcp-approve-btn"));
  if (pendingToolCard && !autoApprove) {
    updateWatchdogBadge(null);
    return;
  }

  // Check if DeepSeek stalled with Retry / Continue button
  const retryOrContinueBtn = Array.from(
    document.querySelectorAll(
      'button, div[role="button"], span[role="button"], div[class*="retry" i], button[class*="retry" i]',
    ),
  ).find((btn) => {
    const text = (btn.textContent || "").trim().toLowerCase();
    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
    return (
      (text.includes("retry") ||
        (text.includes("continue") && !text.includes("discontinue")) ||
        aria.includes("retry") ||
        aria.includes("continue")) &&
      btn.offsetParent !== null
    );
  });
  if (retryOrContinueBtn) {
    // Retry/Continue handler is processing it, don't resend text
    updateWatchdogBadge(null);
    return;
  }

  // Verify that the conversation is actively needing continuation:
  // Must check the last message in chat: auto-continue only if it contains JSON / tool call / DSML tags / pending output,
  // and NOT when the task is done/completed.
  const chatBlocks = Array.from(
    document.querySelectorAll(
      "div.ds-markdown, div.md-code-block, pre, div[class*='message']",
    ),
  );
  const lastBlock = chatBlocks.length
    ? chatBlocks[chatBlocks.length - 1]
    : null;
  const lastText = lastBlock ? lastBlock.textContent || "" : "";

  const hasJsonOrTool =
    lastText.includes("```json") ||
    lastText.includes('"tool"') ||
    lastText.includes('"call"') ||
    lastText.includes("DSML") ||
    lastText.includes("Output of ") ||
    lastText.includes("<|DSML|") ||
    lastText.includes("Execution notice") ||
    lastText.includes("Execution failed") ||
    lastText.includes("Check network and retry") ||
    lastText.includes("system_warning") ||
    (lastSentMessage &&
      (lastSentMessage.includes("```json") ||
        lastSentMessage.includes("Output of [") ||
        lastSentMessage.includes('"result"') ||
        lastSentMessage.includes('"questions"')));

  // Check if the chat or task is marked finished/done
  const isTaskFinished =
    lastText.toLowerCase().includes("task complete") ||
    lastText.toLowerCase().includes("task is done") ||
    lastText.toLowerCase().includes("all tasks completed") ||
    lastText.toLowerCase().includes("all done!");

  if (!hasJsonOrTool || isTaskFinished || !lastSentMessage) {
    // Inactive or completed chat — keep watchdog dormant
    updateWatchdogBadge(null);
    return;
  }

  const idleTime = Date.now() - lastActivityTime;
  const remainingMs = Math.max(0, INACTIVITY_TIMEOUT_MS - idleTime);

  updateWatchdogBadge(remainingMs);

  if (idleTime >= INACTIVITY_TIMEOUT_MS) {
    console.log(
      `[DeepSeek Studio] Chat stalled with pending tool/JSON output for ${Math.round(idleTime / 1000)}s. Auto-continuing by resending last message...`,
    );
    recordActivity();
    updateWatchdogBadge(null);
    sendText(lastSentMessage, true);
  }
}

setInterval(checkInactivityAndResend, 1000);

// Dedicated 1-minute periodic retry/continue checker (in addition to live DOM mutation checks)
setInterval(() => {
  if (lastRetriedEl && !document.body.contains(lastRetriedEl)) {
    lastRetriedEl = null;
  }
  checkAndHandleRetryButton();
}, 60000);

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
