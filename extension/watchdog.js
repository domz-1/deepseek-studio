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
      lbl.textContent = customText || "✅ Done";
    } else {
      lbl.textContent = customText || "⏱️ Ready";
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
    const arDiscussion = isArabic
      ? "\n\n[توجيه إلزامي: تناقش وتكلم مع المستخدم بالعربي أولاً موضحاً ما تم إنجازه، وما ستقوم به الآن وعشان إيه، وما تبقى، ثم واصل التنفيذ]."
      : "";

    let promptToSend = isToolOutput
      ? lastMsg
      : `[MCP_AUTO_RESULT]\nContinue autonomously: Please proceed with the next step towards the big goal. Do not stop until all remaining steps are complete.${arDiscussion}`;

    if (!promptToSend.startsWith("[MCP_AUTO_RESULT]")) {
      promptToSend = `[MCP_AUTO_RESULT]\n${promptToSend}`;
    }

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
    const currentChatStatus = root.DSState.getChatTaskStatus?.();
    if (root.DSState.isTaskStopped || currentChatStatus === "stopped") {
      updateWatchdogUI("stopped", "🛑 Task Stopped");
      return;
    }

    // 1. Always look for retry/continue buttons
    checkAndHandleRetryButton();

    // 2. If generating or sending, keep activity fresh
    if (root.DSState.isDeepSeekGenerating() || root.DSState.isSending) {
      root.DSState.recordActivity();
      root.DSState.isTaskActive = true;
      root.DSState.setChatTaskStatus?.("active");
      updateWatchdogUI("generating", "DeepSeek writing...");
      return;
    }

    // 3. If tools are executing in parallel or batch
    if (root.DSState.runningTaskCount > 0) {
      root.DSState.recordActivity();
      root.DSState.isTaskActive = true;
      root.DSState.setChatTaskStatus?.("active");
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

    const allMarkdown = Array.from(
      document.querySelectorAll("div.ds-markdown"),
    );
    const lastAssistantMd = allMarkdown[allMarkdown.length - 1];
    const latestTurn = lastAssistantMd
      ? lastAssistantMd.closest(
          "[data-virtual-list-item-key], div[class*='message'], div[class*='chat-item'], div.ds-message",
        ) || lastAssistantMd.parentElement
      : null;
    const lastText = (
      lastAssistantMd ? lastAssistantMd.textContent || "" : ""
    ).toLowerCase();

    // 1. Check if there are active unexecuted tool cards waiting to run anywhere in the DOM
    const pendingToolCards = Array.from(
      document.querySelectorAll(
        ".deepseek-mcp-action-card:not(.is-historical):not(.is-executed)",
      ),
    ).filter(
      (c) => c.querySelector(".ok") || c.querySelector(".mcp-approve-btn"),
    );
    const hasPendingToolCards = pendingToolCards.length > 0;

    // 2. If waiting on manual card approve
    if (hasPendingToolCards && !root.DSState.autoApprove) {
      updateWatchdogUI("waiting", "Waiting on Approval...");
      return;
    }

    // 3. If tools are currently running in background
    if (root.DSState.runningTaskCount > 0) {
      root.DSState.isTaskActive = true;
      root.DSState.isTaskStopped = false;
      root.DSState.setChatTaskStatus?.("active");
      updateWatchdogUI(
        "generating",
        `Tools running (${root.DSState.runningTaskCount})...`,
      );
      return;
    }

    // 4. Check if the latest assistant turn has UNEXECUTED code blocks or pending calls being processed
    const codeBlocksInLatestTurn = Array.from(
      (latestTurn || lastAssistantMd)?.querySelectorAll(
        "div.md-code-block, pre, code",
      ) || [],
    );
    const hasUnexecutedCodeBlock = codeBlocksInLatestTurn.some((b) => {
      if (b.getAttribute("data-mcp-executed") === "true") return false;
      if (b.nextElementSibling?.classList?.contains("is-executed"))
        return false;
      const t = b.textContent || "";
      return window.DSTools?.extractMcpCall
        ? Boolean(window.DSTools.extractMcpCall(t))
        : false;
    });

    if (
      hasUnexecutedCodeBlock ||
      (hasPendingToolCards && root.DSState.autoApprove)
    ) {
      root.DSState.isTaskActive = true;
      root.DSState.isTaskStopped = false;
      root.DSState.setChatTaskStatus?.("active");
      updateWatchdogUI("generating", "Processing tool call...");
      return;
    }

    // 5. Check if the chat ends with a user message (user input or automated tool result)
    // that DeepSeek has not responded to yet. If so, DeepSeek owes a reply!
    let isWaitingOnAssistantResponse = false;
    if (latestTurn && latestTurn.parentElement) {
      let nextSib = latestTurn.nextElementSibling;
      while (nextSib) {
        if (
          !nextSib.classList.contains("ds-markdown") &&
          !nextSib.querySelector("div.ds-markdown") &&
          !nextSib.querySelector(".deepseek-mcp-action-card")
        ) {
          isWaitingOnAssistantResponse = true;
          break;
        }
        nextSib = nextSib.nextElementSibling;
      }
    }

    // 6. Check for remaining work towards the Big Goal:
    const hasRemainingWork =
      lastText.includes("اللي باقي") ||
      lastText.includes("الخطوات القادمة") ||
      lastText.includes("متبقي") ||
      lastText.includes("لسه باقي") ||
      lastText.includes("فاضل") ||
      lastText.includes("الخطوة التالية") ||
      lastText.includes("الخطوة القادمة") ||
      lastText.includes("سأقوم بـ") ||
      lastText.includes("سأفعل") ||
      lastText.includes("سأبدأ") ||
      lastText.includes("سأنفذ") ||
      lastText.includes("سأنتظر") ||
      lastText.includes("ننتظر") ||
      lastText.includes("قيد التشغيل") ||
      lastText.includes("لسه شغال") ||
      lastText.includes("remaining") ||
      lastText.includes("next step") ||
      lastText.includes("next steps") ||
      lastText.includes("in progress") ||
      lastText.includes("todo:") ||
      lastText.includes("will now") ||
      lastText.includes("pending") ||
      lastText.includes("waiting for");

    // 7. Check if the Big Goal is explicitly complete:
    const isBigGoalCompleted =
      !hasRemainingWork &&
      (lastText.includes("[task_completed]") ||
        lastText.includes("[status: completed]") ||
        lastText.includes("task complete") ||
        lastText.includes("all tasks completed") ||
        lastText.includes("goal achieved") ||
        lastText.includes("big goal completed") ||
        lastText.includes("everything is complete") ||
        lastText.includes("all done") ||
        lastText.includes("implementation complete") ||
        lastText.includes("تم إنجاز المهمة بالكامل") ||
        lastText.includes("تم الانتهاء من جميع المهام") ||
        lastText.includes("المهمة اكتملت بالكامل") ||
        lastText.includes("انتهيت من كامل المطلوب") ||
        lastText.includes("التقرير النهائي:"));

    const chatStatus = root.DSState.getChatTaskStatus?.();
    const isCurrentActive =
      chatStatus === "active" || root.DSState.isTaskActive;

    // 1. If explicitly stopped by user:
    if (chatStatus === "stopped" || root.DSState.isTaskStopped) {
      updateWatchdogUI("stopped", "Task Stopped");
      return;
    }

    // 2. Only mark completed when the Big Goal is truly complete:
    if (
      chatStatus === "completed" ||
      (isBigGoalCompleted &&
        !hasRemainingWork &&
        !hasPendingToolCards &&
        root.DSState.runningTaskCount === 0)
    ) {
      root.DSState.isTaskActive = false;
      root.DSState.setChatTaskStatus?.("completed");
      updateWatchdogUI("done", "✅ Done");
      return;
    }

    // 3. If an active task is running, keep it actively progressing towards the Big Goal!
    // Never stop mid-workflow just because tools aren't running at this exact second!
    if (isCurrentActive) {
      root.DSState.isTaskActive = true;
      root.DSState.isTaskStopped = false;
      root.DSState.setChatTaskStatus?.("active");

      // Chat is idle and Big Goal is NOT done yet! Countdown & auto-continue:
      const idleTimeout = Math.min(
        root.DSState.INACTIVITY_TIMEOUT_MS || 15000,
        15000,
      );
      const idleTime = Date.now() - root.DSState.lastActivityTime;
      const remainingMs = Math.max(0, idleTimeout - idleTime);

      if (remainingMs > 0) {
        updateWatchdogUI("countdown", null, remainingMs);
      } else {
        console.log(
          `[DeepSeek Studio] Sub-task idle while big goal is in progress (${Math.round(idleTime / 1000)}s). Auto-continuing now...`,
        );
        triggerManualContinue();
      }
      return;
    }

    // If no active task has been registered yet, stay in Ready state
    if (!root.DSState.isTaskActive && !root.DSState.lastSentMessage) {
      updateWatchdogUI("idle", "Watchdog: Ready");
      return;
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
