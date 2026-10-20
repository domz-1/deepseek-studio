// DeepSeek MCP Studio — State & DOM Helpers Module
(function (root) {
  let debounceTimer = null;
  let activeTools = [];
  let serverStatus = {};
  let autoApprove =
    localStorage.getItem("deepseek_mcp_auto_approve") !== "false";
  let isRalphLoopActive =
    localStorage.getItem("deepseek_mcp_ralph_loop") === "true";
  let selectedProject =
    localStorage.getItem("deepseek_mcp_selected_project") ||
    "/home/adham/projects/adham/deepseek-mcp-ext";
  let projectList = [];
  let isSending = false;
  let runningTaskCount = 0;
  let userScrolledUp = false;
  let executedCalls = new Set();
  let loadedSkills = [];
  let lastSentMessage = "";
  let lastActivityTime = Date.now();
  let isTaskActive = false;
  let isPaused = false;
  let lastMessageSentTime = 0;
  let bypassCooldown = false;
  let SAFE_INTERVAL_MS = parseInt(
    localStorage.getItem("deepseek_mcp_safe_interval") || String(30 * 1000),
    10,
  );
  if (SAFE_INTERVAL_MS > 120000) {
    SAFE_INTERVAL_MS = 30 * 1000;
    localStorage.setItem(
      "deepseek_mcp_safe_interval",
      String(SAFE_INTERVAL_MS),
    );
  }
  let INACTIVITY_TIMEOUT_MS = parseInt(
    localStorage.getItem("deepseek_mcp_inactivity_timeout") ||
      String(40 * 1000),
    10,
  );
  if (INACTIVITY_TIMEOUT_MS > 120000) {
    INACTIVITY_TIMEOUT_MS = 40 * 1000;
    localStorage.setItem(
      "deepseek_mcp_inactivity_timeout",
      String(INACTIVITY_TIMEOUT_MS),
    );
  }
  const GRILL_AUTO_TIMEOUT_MS = 2 * 60 * 1000;

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
    if (saved) executedCalls = new Set(JSON.parse(saved));
  } catch (_) {}

  function isContextValid() {
    return typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
  }

  async function fetchActiveTools() {
    if (!isContextValid()) return [];
    try {
      const bgRes = await new Promise((r) => {
        chrome.runtime.sendMessage({ type: "GET_MCP" }, (res) => {
          if (chrome.runtime.lastError) r(null);
          else r(res);
        });
      });
      if (bgRes?.ok && bgRes.data?.tools) {
        activeTools = bgRes.data.tools;
        serverStatus = bgRes.data.status || {};
        return activeTools;
      }
    } catch (e) {
      if (!e?.message?.includes("Extension context invalidated")) {
        console.warn("[MCP] fetchActiveTools failed", e);
      }
    }
    return [];
  }

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
      const r = document.documentElement;
      if (accent) r.style.setProperty("--ds-accent", accent);
      if (bg) {
        const m = bg.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
        if (m) {
          const lum =
            (Number(m[1]) * 0.299 +
              Number(m[2]) * 0.587 +
              Number(m[3]) * 0.114) /
            255;
          r.dataset.dsTheme = lum < 0.5 ? "dark" : "light";
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

  // Input elements lookup
  function getChatInput() {
    return (
      document.querySelector('textarea[placeholder*="DeepSeek"]') ||
      document.querySelector("textarea#chat-input") ||
      document.querySelector("textarea")
    );
  }

  function isDeepSeekGenerating() {
    // 1. If there is a visible Continue or Retry button, DeepSeek has definitely stopped!
    const continueOrRetryBtn = Array.from(
      document.querySelectorAll(
        '.ds-button--capsule, .ds-button--warning, button, div[role="button"]',
      ),
    ).find((el) => {
      if (!el || el.offsetParent === null) return false;
      const text = (el.textContent || "").trim().toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      return (
        text === "continue" ||
        aria === "continue" ||
        (text.includes("continue") && !text.includes("discontinue")) ||
        text === "retry" ||
        aria === "retry" ||
        el.classList.contains("ds-button--warning")
      );
    });
    if (continueOrRetryBtn) return false;

    // 2. Look for explicit stop-generating button in chat input area
    const input = getChatInput();
    if (!input) return false;
    const inputWrap =
      input.closest("div.ds-textarea-wrapper") ||
      input.closest("div[class*='textarea']") ||
      input.parentElement?.parentElement;

    if (inputWrap) {
      const buttons = Array.from(
        inputWrap.querySelectorAll('button, div[role="button"]'),
      );
      for (const btn of buttons) {
        if (!btn || btn.offsetParent === null) continue;
        const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
        const title = (btn.getAttribute("title") || "").toLowerCase();

        if (
          aria.includes("stop") ||
          title.includes("stop") ||
          btn.classList.contains("ds-stop-button") ||
          btn.classList.contains("ds-button--stop")
        ) {
          return true;
        }

        if (
          btn.querySelector("svg rect") &&
          !aria.includes("send") &&
          !title.includes("send")
        ) {
          return true;
        }
      }
    }

    // 3. Check for active streaming blinking cursor
    const blinkingCursor = document.querySelector(
      '.ds-markdown:last-child .cursor--blinking, [class*="cursor--blinking" i]',
    );
    if (blinkingCursor && blinkingCursor.offsetParent !== null) return true;

    return false;
  }

  function stopDeepSeekGeneration() {
    const input = getChatInput();
    const containers = [
      input?.closest("div.ds-textarea-wrapper"),
      input?.closest("div[class*='textarea']"),
      input?.parentElement?.parentElement?.parentElement,
      input?.parentElement?.parentElement,
      document.querySelector("div[class*='chat-input']"),
      document.querySelector("div[class*='input-wrapper']"),
      document.body,
    ].filter(Boolean);

    for (const container of containers) {
      const candidates = Array.from(
        container.querySelectorAll(
          'button, div[role="button"], span[role="button"]',
        ),
      );
      for (const btn of candidates) {
        const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
        const title = (btn.getAttribute("title") || "").toLowerCase();
        const text = (btn.textContent || "").toLowerCase();
        if (
          aria.includes("stop") ||
          title.includes("stop") ||
          text.includes("stop") ||
          btn.classList.contains("ds-button--stop") ||
          btn.querySelector("svg rect")
        ) {
          try {
            btn.click();
            console.log("[DS Studio] Stopped DeepSeek generation.");
            return true;
          } catch (_) {}
        }
      }
    }
    return false;
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

    if (valueSetter) valueSetter.call(el, text);
    else el.value = text;

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

    const containers = [
      input.closest("div.ds-textarea-wrapper"),
      input.closest("div[class*='textarea']"),
      input.parentElement?.parentElement?.parentElement,
      input.parentElement?.parentElement,
      document.querySelector("div[class*='chat-input']"),
      document.querySelector("div[class*='input-wrapper']"),
    ].filter(Boolean);

    for (const container of containers) {
      const candidates = Array.from(
        container.querySelectorAll(
          'button, div[role="button"], span[role="button"]',
        ),
      );

      for (let i = candidates.length - 1; i >= 0; i--) {
        const btn = candidates[i];
        const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
        const title = (btn.getAttribute("title") || "").toLowerCase();
        const html = (btn.innerHTML || "").toLowerCase();

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

    const globalSend = document.querySelector(
      'button[aria-label*="Send" i], div[role="button"][aria-label*="Send" i]',
    );
    if (globalSend) return globalSend;

    return null;
  }

  function recordActivity() {
    lastActivityTime = Date.now();
  }

  function skipCooldown() {
    bypassCooldown = true;
  }

  function setSafeInterval(ms) {
    SAFE_INTERVAL_MS = ms;
    INACTIVITY_TIMEOUT_MS = ms;
    localStorage.setItem("deepseek_mcp_safe_interval", String(ms));
    localStorage.setItem("deepseek_mcp_inactivity_timeout", String(ms));
  }

  function removeLingeringContinueButtons() {
    const candidates = Array.from(
      document.querySelectorAll(
        'button, div[role="button"], span[role="button"], .ds-button, .ds-button--capsule',
      ),
    );
    for (const el of candidates) {
      if (
        el.id === "mcp-watchdog-btn" ||
        el.closest("#deepseek-mcp-badge") ||
        el.closest(".deepseek-mcp-action-card") ||
        el.closest("#mcp-task-indicator") ||
        el.closest("#deepseek-mcp-queue-bar")
      ) {
        continue;
      }
      const text = (el.textContent || "").trim().toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      if (
        text === "continue" ||
        aria === "continue" ||
        (text.includes("continue") && !text.includes("discontinue"))
      ) {
        try {
          el.style.display = "none";
          el.setAttribute("data-mcp-dismissed", "true");
          const parent = el.parentElement;
          if (
            parent &&
            parent.children.length === 1 &&
            !parent.closest(".ds-markdown")
          ) {
            parent.style.display = "none";
            parent.setAttribute("data-mcp-dismissed", "true");
          }
        } catch (_) {}
      }
    }
  }

  function resetTaskStateOnTyping() {
    const lbl = document.getElementById("mcp-watchdog-label");
    if (lbl && lbl.textContent.includes("Stopped")) {
      if (window.DSWatchdog?.updateWatchdogUI) {
        window.DSWatchdog.updateWatchdogUI("idle", "⏱️ Watchdog: Ready");
      }
    }
    removeLingeringContinueButtons();
  }

  function startNewTask(text) {
    isTaskActive = true;
    isPaused = false;
    runningTaskCount = 0;
    if (text) lastSentMessage = text;
    recordActivity();
    updateTaskBadge();

    // 1. Hide lingering continue buttons from previous stopped turns
    removeLingeringContinueButtons();

    // 2. Mark any unexecuted cards as superseded
    document.querySelectorAll(".deepseek-mcp-action-card").forEach((card) => {
      const okBtn = card.querySelector(".ok");
      if (okBtn) {
        const controls = card.querySelector(".card-controls");
        if (controls) {
          controls.innerHTML = `<div class="ds-note ds-note-muted">Previous task ended</div>`;
        }
      }
    });

    // 3. Set watchdog UI to active generating state
    if (window.DSWatchdog?.updateWatchdogUI) {
      window.DSWatchdog.updateWatchdogUI("generating", "DeepSeek writing...");
    }

    console.log("[DS Studio] Started new task lifecycle.");
  }

  async function sendText(text, isUserInput = false) {
    if (isPaused && !isUserInput) {
      console.log("[DS Studio] Task is paused. Suppressed automated send.");
      return;
    }
    if (isSending) return;
    isSending = true;

    if (isUserInput) {
      startNewTask(text);
    } else {
      recordActivity();
      isTaskActive = true;
      if (text) lastSentMessage = text;
    }

    try {
      const el = getChatInput();
      if (!el) return;

      if (!isUserInput) {
        // 1. Wait until DeepSeek finishes generating
        let waited = 0;
        while (isDeepSeekGenerating() && waited < 30000) {
          if (isPaused || !isTaskActive) return;
          await new Promise((r) => setTimeout(r, 600));
          waited += 600;
        }

        // 2. Anti-ban safe throttling (30s) between automated messages
        bypassCooldown = false;
        while (!bypassCooldown) {
          if (isPaused || !isTaskActive) return;
          const elapsed = Date.now() - lastMessageSentTime;
          const remaining = Math.max(0, SAFE_INTERVAL_MS - elapsed);
          if (remaining <= 0) break;

          if (window.DSWatchdog?.updateWatchdogUI) {
            window.DSWatchdog.updateWatchdogUI("cooldown", null, remaining);
          }
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      setInputValue(el, text);
      await new Promise((r) => setTimeout(r, 120));

      const sendBtn = getSendButton();
      if (sendBtn) {
        sendBtn.click();
        console.log("[MCP] Dispatched message safely with anti-ban cooldown.");
      } else {
        const enterEvt = new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        });
        el.dispatchEvent(enterEvt);
      }
      lastMessageSentTime = Date.now();
    } finally {
      setTimeout(() => {
        isSending = false;
      }, 500);
    }
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

  function pauseTask() {
    isPaused = true;
    updateTaskBadge();
    if (window.DSWatchdog?.updateWatchdogUI) {
      window.DSWatchdog.updateWatchdogUI("paused", "⏸️ Task Paused");
    }
    console.log("[DS Studio] Autonomous task paused by user.");
  }

  function resumeTask() {
    isPaused = false;
    isTaskActive = true;
    recordActivity();
    updateTaskBadge();
    if (window.DSWatchdog?.updateWatchdogUI) {
      window.DSWatchdog.updateWatchdogUI("triggering", "▶️ Resuming Task...");
    }
    console.log("[DS Studio] Autonomous task resumed by user.");
    setTimeout(() => {
      if (window.DSWatchdog?.triggerManualContinue) {
        window.DSWatchdog.triggerManualContinue();
      }
    }, 400);
  }

  async function killFullTask() {
    isTaskActive = false;
    isPaused = false;
    runningTaskCount = 0;
    isSending = false;

    // 1. Abort any running MCP call on bridge
    await killActiveTask(null);

    // 2. Stop DeepSeek streaming generation if currently running
    stopDeepSeekGeneration();

    // 3. Clear pending message queue
    if (window.DSQueue?.clearQueue) {
      window.DSQueue.clearQueue();
    }

    // 4. Update UI states
    updateTaskBadge();
    if (window.DSWatchdog?.updateWatchdogUI) {
      window.DSWatchdog.updateWatchdogUI("stopped", "🛑 Task Stopped");
    }

    // 5. Hide lingering Continue buttons that DeepSeek generates when stopped!
    setTimeout(() => {
      removeLingeringContinueButtons();
    }, 300);
    setTimeout(() => {
      removeLingeringContinueButtons();
    }, 1000);

    console.log("[DS Studio] Full task stopped and cancelled by user.");
  }

  function updateTaskBadge() {
    const taskIndicator = document.getElementById("mcp-task-indicator");
    if (!taskIndicator) return;

    if (runningTaskCount > 0 || isPaused) {
      taskIndicator.classList.add("is-on");
      taskIndicator.innerHTML = window.DSComponents.taskChip(
        runningTaskCount,
        isPaused,
      );

      const killBtn = taskIndicator.querySelector("#mcp-kill-all-btn");
      if (killBtn) {
        killBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          killFullTask();
        };
      }

      const pauseBtn = taskIndicator.querySelector("#mcp-pause-task-btn");
      if (pauseBtn) {
        pauseBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          pauseTask();
        };
      }

      const resumeBtn = taskIndicator.querySelector("#mcp-resume-task-btn");
      if (resumeBtn) {
        resumeBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          resumeTask();
        };
      }
    } else {
      taskIndicator.classList.remove("is-on");
    }
  }

  function saveExecuted() {
    try {
      sessionStorage.setItem(
        "deepseek_mcp_executed",
        JSON.stringify(Array.from(executedCalls)),
      );
    } catch (_) {}
  }

  function init() {
    fetchActiveTools();
    refreshSkills();
  }

  root.DSState = {
    get: () => ({
      activeTools,
      serverStatus,
      autoApprove,
      isRalphLoopActive,
      selectedProject,
      projectList,
      isSending,
      runningTaskCount,
      userScrolledUp,
      executedCalls,
      loadedSkills,
      lastSentMessage,
      lastActivityTime,
    }),
    set: (k, v) => {
      if (k === "activeTools") activeTools = v;
      else if (k === "serverStatus") serverStatus = v;
      else if (k === "autoApprove") autoApprove = v;
      else if (k === "isRalphLoopActive") isRalphLoopActive = v;
      else if (k === "selectedProject") selectedProject = v;
      else if (k === "projectList") projectList = v;
      else if (k === "isSending") isSending = v;
      else if (k === "runningTaskCount") runningTaskCount = v;
      else if (k === "executedCalls") executedCalls = v;
      else if (k === "loadedSkills") loadedSkills = v;
    },
    init,
    saveExecuted,
    refreshTools: fetchActiveTools,
    get activeTools() {
      return activeTools;
    },
    set activeTools(v) {
      activeTools = v;
    },
    get serverStatus() {
      return serverStatus;
    },
    set serverStatus(v) {
      serverStatus = v;
    },
    get autoApprove() {
      return autoApprove;
    },
    set autoApprove(v) {
      autoApprove = v;
    },
    get isRalphLoopActive() {
      return isRalphLoopActive;
    },
    set isRalphLoopActive(v) {
      isRalphLoopActive = v;
    },
    get selectedProject() {
      return selectedProject;
    },
    set selectedProject(v) {
      selectedProject = v;
    },
    get projectList() {
      return projectList;
    },
    set projectList(v) {
      projectList = v;
    },
    get isSending() {
      return isSending;
    },
    set isSending(v) {
      isSending = v;
    },
    get runningTaskCount() {
      return runningTaskCount;
    },
    set runningTaskCount(v) {
      runningTaskCount = v;
    },
    get executedCalls() {
      return executedCalls;
    },
    set executedCalls(v) {
      executedCalls = v;
    },
    get loadedSkills() {
      return loadedSkills;
    },
    set loadedSkills(v) {
      loadedSkills = v;
    },
    get lastSentMessage() {
      return lastSentMessage;
    },
    set lastSentMessage(v) {
      lastSentMessage = v;
    },
    get lastActivityTime() {
      return lastActivityTime;
    },
    set lastActivityTime(v) {
      lastActivityTime = v;
    },
    get debounceTimer() {
      return debounceTimer;
    },
    set debounceTimer(v) {
      debounceTimer = v;
    },
    get isTaskActive() {
      return isTaskActive;
    },
    set isTaskActive(v) {
      isTaskActive = v;
    },
    get SAFE_INTERVAL_MS() {
      return SAFE_INTERVAL_MS;
    },
    set SAFE_INTERVAL_MS(v) {
      SAFE_INTERVAL_MS = v;
    },
    get INACTIVITY_TIMEOUT_MS() {
      return INACTIVITY_TIMEOUT_MS;
    },
    set INACTIVITY_TIMEOUT_MS(v) {
      INACTIVITY_TIMEOUT_MS = v;
    },
    setSafeInterval,
    GRILL_AUTO_TIMEOUT_MS,
    skipCooldown,
    get lastMessageSentTime() {
      return lastMessageSentTime;
    },
    scrollToBottom,
    isContextValid,
    fetchActiveTools,
    refreshSkills,
    getChatInput,
    isDeepSeekGenerating,
    setInputValue,
    getSendButton,
    recordActivity,
    sendText,
    get isPaused() {
      return isPaused;
    },
    set isPaused(v) {
      isPaused = v;
    },
    pauseTask,
    resumeTask,
    killFullTask,
    stopDeepSeekGeneration,
    killActiveTask,
    updateTaskBadge,
    startNewTask,
    resetTaskStateOnTyping,
    removeLingeringContinueButtons,
  };
})(window);
