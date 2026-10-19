// DeepSeek MCP Studio — Watchdog & Retry Automation Module
(function (root) {
  let lastRetriedEl = null;

  function checkAndHandleRetryButton() {
    if (!root.DSState.autoApprove) return;

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
      triggerClick(directRetryBtn, "Warning/Retry");
      return;
    }

    // 2. Direct match for Continue button
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

    // 3. Search all buttons
    const buttons = Array.from(
      document.querySelectorAll(
        'button, div[role="button"], span[role="button"], div[class*="retry" i], button[class*="retry" i], .ds-button',
      ),
    );

    for (const btn of buttons) {
      const text = (btn.textContent || "").trim().toLowerCase();
      const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
      const title = (btn.getAttribute("title") || "").toLowerCase();
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
    if (
      root.DSState.isDeepSeekGenerating() ||
      root.DSState.isSending ||
      root.DSState.runningTaskCount > 0
    ) {
      root.DSState.recordActivity();
      updateWatchdogBadge(null);
      return;
    }

    const activeQuestionCard = Array.from(
      document.querySelectorAll(".deepseek-grill-card"),
    ).find((c) => !c.querySelector(".ds-grill-answered"));
    if (activeQuestionCard) {
      updateWatchdogBadge(null);
      return;
    }

    const pendingToolCard = Array.from(
      document.querySelectorAll(
        ".deepseek-mcp-action-card:not(.deepseek-grill-card)",
      ),
    ).find((c) => c.querySelector(".mcp-approve-btn"));
    if (pendingToolCard && !root.DSState.autoApprove) {
      updateWatchdogBadge(null);
      return;
    }

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
      updateWatchdogBadge(null);
      return;
    }

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
      (root.DSState.lastSentMessage &&
        (root.DSState.lastSentMessage.includes("```json") ||
          root.DSState.lastSentMessage.includes("Output of [") ||
          root.DSState.lastSentMessage.includes('"result"') ||
          root.DSState.lastSentMessage.includes('"questions"')));

    const isTaskFinished =
      lastText.toLowerCase().includes("task complete") ||
      lastText.toLowerCase().includes("task is done") ||
      lastText.toLowerCase().includes("all tasks completed") ||
      lastText.toLowerCase().includes("all done!");

    if (!hasJsonOrTool || isTaskFinished || !root.DSState.lastSentMessage) {
      updateWatchdogBadge(null);
      return;
    }

    const idleTime = Date.now() - root.DSState.lastActivityTime;
    const remainingMs = Math.max(
      0,
      root.DSState.INACTIVITY_TIMEOUT_MS - idleTime,
    );

    updateWatchdogBadge(remainingMs);

    if (idleTime >= root.DSState.INACTIVITY_TIMEOUT_MS) {
      console.log(
        `[DeepSeek Studio] Chat stalled with pending tool/JSON output for ${Math.round(idleTime / 1000)}s. Auto-continuing by resending last message...`,
      );
      root.DSState.recordActivity();
      updateWatchdogBadge(null);
      root.DSState.sendText(root.DSState.lastSentMessage, true);
    }
  }

  setInterval(checkInactivityAndResend, 1000);

  setInterval(() => {
    if (lastRetriedEl && !document.body.contains(lastRetriedEl)) {
      lastRetriedEl = null;
    }
    checkAndHandleRetryButton();
  }, 60000);

  root.DSWatchdog = {
    checkAndHandleRetryButton,
    updateWatchdogBadge,
    checkInactivityAndResend,
  };
})(window);
