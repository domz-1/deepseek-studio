// DeepSeek MCP Studio — Watchdog & Retry Automation Module
(function (root) {
  let lastRetriedEl = null;

  function checkAndHandleRetryButton(forceClick = false) {
    if (!root.DSState.autoApprove && !forceClick) return false;

    function triggerClick(el, name) {
      if (!el || el.offsetParent === null) return false;
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
        return true;
      } catch (err) {
        console.warn(`[DeepSeek Studio] Error clicking ${name}:`, err);
        return false;
      }
    }

    // 1. Direct match for DeepSeek's warning/retry button
    const directRetryBtn =
      document.querySelector(
        '.ds-button--warning, [class*="ds-button--warning"], [class*="retry-button"]',
      ) || document.querySelector('div[role="button"].ds-button--warning');

    if (
      directRetryBtn &&
      directRetryBtn !== lastRetriedEl &&
      directRetryBtn.offsetParent !== null
    ) {
      return triggerClick(directRetryBtn, "Warning/Retry");
    }

    // 2. Direct match for Continue button
    const directContinueBtn = Array.from(
      document.querySelectorAll(
        '.ds-button--capsule, .ds-button, div[role="button"], button',
      ),
    ).find((el) => {
      if (el.getAttribute("data-mcp-dismissed") === "true") return false;
      if (el.style.display === "none") return false;
      if (
        el.id === "mcp-watchdog-btn" ||
        el.closest("#deepseek-mcp-badge") ||
        el.closest(".deepseek-mcp-action-card") ||
        el.closest("#mcp-task-indicator") ||
        el.closest("#deepseek-mcp-queue-bar")
      ) {
        return false;
      }
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
      return triggerClick(directContinueBtn, "Continue");
    }

    // 3. Search buttons for explicit retry/continue intent
    const buttons = Array.from(
      document.querySelectorAll(
        'button, div[role="button"], span[role="button"], div[class*="retry" i], button[class*="retry" i], .ds-button',
      ),
    );

    for (const btn of buttons) {
      const text = (btn.textContent || "").trim().toLowerCase();
      const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
      const title = (btn.getAttribute("title") || "").toLowerCase();

      const isRetryOrContinue =
        text === "retry" ||
        aria === "retry" ||
        title === "retry" ||
        btn.classList.contains("ds-retry-button") ||
        btn.classList.contains("ds-button--warning") ||
        text === "continue" ||
        aria === "continue" ||
        title === "continue" ||
        btn.classList.contains("ds-continue-button");

      if (
        isRetryOrContinue &&
        btn !== lastRetriedEl &&
        btn.offsetParent !== null
      ) {
        const actionName = text.includes("continue") ? "Continue" : "Retry";
        return triggerClick(btn, actionName);
      }
    }

    return false;
  }

  function updateWatchdogUI(mode, customText, remainingMs) {
    const btn = document.getElementById("mcp-watchdog-btn");
    const lbl = document.getElementById("mcp-watchdog-label");
    if (!btn || !lbl) return;

    btn.classList.remove(
      "is-generating",
      "is-countdown",
      "is-active",
      "is-done",
    );

    if (mode === "generating") {
      btn.classList.add("is-generating");
      lbl.textContent = customText || "⏱️ DeepSeek writing...";
    } else if (mode === "countdown") {
      btn.classList.add("is-countdown");
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      lbl.textContent =
        mins > 0
          ? `⏱️ Continue in ${mins}:${secs < 10 ? "0" : ""}${secs}`
          : `⏱️ Continue in ${secs}s`;
    } else if (mode === "cooldown") {
      btn.classList.add("is-countdown");
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      lbl.textContent =
        mins > 0
          ? `🛡️ Safe delay: ${mins}:${secs < 10 ? "0" : ""}${secs}`
          : `🛡️ Safe delay: ${secs}s`;
    } else if (mode === "triggering") {
      btn.classList.add("is-active");
      lbl.textContent = customText || "⏱️ Resuming chat...";
    } else if (mode === "waiting") {
      btn.classList.add("is-active");
      lbl.textContent = customText || "⏱️ Waiting...";
    } else if (mode === "paused") {
      btn.classList.add("is-active");
      lbl.textContent = customText || "⏸️ Task Paused";
    } else if (mode === "stopped") {
      btn.classList.remove(
        "is-active",
        "is-generating",
        "is-countdown",
        "is-done",
      );
      lbl.textContent = customText || "🛑 Task Stopped";
    } else if (mode === "done") {
      btn.classList.add("is-done");
      lbl.textContent = "⏱️ Task Done";
    } else {
      lbl.textContent = customText || "⏱️ Watchdog: Ready";
    }
  }

  async function triggerManualContinue() {
    root.DSState.recordActivity();
    root.DSState.isTaskActive = true;
    updateWatchdogUI("triggering", "⏱️ Resuming now...");

    // Check if the last sent message was an unanswered tool output
    const lastMsg = root.DSState.lastSentMessage || "";
    const isToolOutput =
      lastMsg.includes("Batch Results") ||
      lastMsg.includes("completed:") ||
      lastMsg.includes("```json");

    const isArabic = sessionStorage.getItem("deepseek_mcp_arabic") === "true";
    const arabicNote = isArabic
      ? " (استمر بالشرح والرد باللغة العربية دائماً)"
      : "";

    const promptToSend = isToolOutput
      ? lastMsg
      : `[MCP_AUTO_RESULT]\nContinue autonomously: Please proceed with the next step to complete the task.${arabicNote}`;

    console.log(
      "[DeepSeek Studio] Dispatched watchdog continuation prompt:",
      promptToSend.slice(0, 100),
    );
    await root.DSState.sendText(promptToSend, true);
  }

  function handleWatchdogClick() {
    console.log("[DeepSeek Studio] Watchdog button clicked by user.");

    // If currently paused, resume!
    if (root.DSState.isPaused) {
      root.DSState.resumeTask();
      return;
    }

    // If stopped, reset to ready!
    const lbl = document.getElementById("mcp-watchdog-label");
    if (lbl && lbl.textContent.includes("Stopped")) {
      root.DSState.resetTaskStateOnTyping();
      return;
    }

    // If currently in safe cooldown pause, skip it and send immediately!
    if (root.DSState.skipCooldown) {
      root.DSState.skipCooldown();
    }

    // 1. If there's an active retry/continue button from DeepSeek, click it immediately!
    const retryHandled = checkAndHandleRetryButton(true);
    if (retryHandled) {
      updateWatchdogUI("triggering", "⏱️ Retrying message...");
      return;
    }

    // 2. If DeepSeek is currently generating, show generating status
    if (root.DSState.isDeepSeekGenerating()) {
      updateWatchdogUI("generating", "DeepSeek writing...");
      return;
    }

    // 3. Immediately trigger continuation
    triggerManualContinue();
  }

  function checkInactivityAndResend() {
    // 0. If task is explicitly paused or stopped by user, do nothing!
    if (root.DSState.isPaused) {
      updateWatchdogUI("paused", "⏸️ Task Paused");
      return;
    }
    if (root.DSState.isTaskStopped) {
      updateWatchdogUI("stopped", "🛑 Task Stopped");
      return;
    }

    // 1. Always look for retry/continue buttons
    checkAndHandleRetryButton();

    // 2. If generating or sending, keep activity fresh
    if (root.DSState.isDeepSeekGenerating() || root.DSState.isSending) {
      root.DSState.recordActivity();
      root.DSState.isTaskActive = true;
      updateWatchdogUI("generating", "DeepSeek writing...");
      return;
    }

    // 3. If tools are executing in parallel or batch
    if (root.DSState.runningTaskCount > 0) {
      root.DSState.recordActivity();
      root.DSState.isTaskActive = true;
      updateWatchdogUI(
        "generating",
        `Tools running (${root.DSState.runningTaskCount})...`,
      );
      return;
    }

    // 4. If waiting on Grill-Me decision
    const activeQuestionCard = Array.from(
      document.querySelectorAll(".deepseek-grill-card"),
    ).find((c) => !c.querySelector(".ds-grill-answered"));
    if (activeQuestionCard) {
      updateWatchdogUI("waiting", "Waiting on Decision...");
      return;
    }

    // 5. If waiting on manual card approve
    const pendingToolCard = Array.from(
      document.querySelectorAll(
        ".deepseek-mcp-action-card:not(.deepseek-grill-card)",
      ),
    ).find((c) => c.querySelector(".mcp-approve-btn"));
    if (pendingToolCard && !root.DSState.autoApprove) {
      updateWatchdogUI("waiting", "Waiting on Approval...");
      return;
    }

    // 6. Inspect chat messages
    const chatBlocks = Array.from(
      document.querySelectorAll(
        "div.ds-markdown, div.md-code-block, pre, div[class*='message']",
      ),
    );

    if (!chatBlocks.length) {
      updateWatchdogUI("idle", "Watchdog: Ready");
      return;
    }

    const lastBlock = chatBlocks[chatBlocks.length - 1];
    const lastText = (
      lastBlock ? lastBlock.textContent || "" : ""
    ).toLowerCase();

    // Check if task is explicitly finished
    const isTaskFinished =
      lastText.includes("task complete") ||
      lastText.includes("task is done") ||
      lastText.includes("all tasks completed") ||
      lastText.includes("all done!") ||
      lastText.includes("implementation complete");

    if (isTaskFinished) {
      root.DSState.isTaskActive = false;
      updateWatchdogUI("done", "Task Done");
      return;
    }

    // If no active task has been registered yet, stay in Ready state
    if (!root.DSState.isTaskActive && !root.DSState.lastSentMessage) {
      updateWatchdogUI("idle", "Watchdog: Ready");
      return;
    }

    // Chat is idle and task is NOT done! Start countdown:
    const idleTime = Date.now() - root.DSState.lastActivityTime;
    const remainingMs = Math.max(
      0,
      root.DSState.INACTIVITY_TIMEOUT_MS - idleTime,
    );

    if (remainingMs > 0) {
      updateWatchdogUI("countdown", null, remainingMs);
    } else {
      console.log(
        `[DeepSeek Studio] Chat stalled while task is incomplete (${Math.round(idleTime / 1000)}s). Auto-continuing now...`,
      );
      triggerManualContinue();
    }
  }

  // Periodic heartbeat every 1 second
  setInterval(checkInactivityAndResend, 1000);

  // Periodic cleanup of retried button reference
  setInterval(() => {
    if (lastRetriedEl && !document.body.contains(lastRetriedEl)) {
      lastRetriedEl = null;
    }
  }, 10000);

  root.DSWatchdog = {
    checkAndHandleRetryButton,
    updateWatchdogBadge: (remainingMs) => {
      if (remainingMs !== null && remainingMs !== undefined) {
        updateWatchdogUI("countdown", null, remainingMs);
      } else {
        updateWatchdogUI("idle");
      }
    },
    updateWatchdogUI,
    handleWatchdogClick,
    triggerManualContinue,
    checkInactivityAndResend,
  };
})(window);
