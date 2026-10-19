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
  const INACTIVITY_TIMEOUT_MS = 90 * 1000;
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

  async function sendText(text, isUserInput = false) {
    if (isSending) return;
    isSending = true;
    recordActivity();
    if (text) lastSentMessage = text;

    try {
      const el = getChatInput();
      if (!el) return;

      if (!isUserInput) {
        let waited = 0;
        while (isDeepSeekGenerating() && waited < 15000) {
          await new Promise((r) => setTimeout(r, 600));
          waited += 600;
        }
      }

      setInputValue(el, text);
      await new Promise((r) => setTimeout(r, 80));

      const sendBtn = getSendButton();
      if (sendBtn) {
        sendBtn.click();
        console.log("[MCP] Dispatched message successfully.");
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
    INACTIVITY_TIMEOUT_MS,
    GRILL_AUTO_TIMEOUT_MS,
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
    killActiveTask,
    updateTaskBadge,
  };
})(window);
