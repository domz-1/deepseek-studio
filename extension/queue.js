// DeepSeek MCP Studio — Queue Module
(function (root) {
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

      item.querySelector(".ds-queue-item-text").onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        queuedMessages.splice(idx, 1);
        saveQueuedMessages();
        renderQueueList(container);
        root.DSState.sendText(msg, true);
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
      const addBtn = qWrap.querySelector(
        ".ds-queue-btn:not(.ds-queue-btn-send)",
      );

      const getTargetText = () => {
        let val = input.value.trim();
        const chatInput = root.DSState.getChatInput();
        if (!val && chatInput && chatInput.value.trim()) {
          val = chatInput.value.trim();
          root.DSState.setInputValue(chatInput, "");
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
        root.DSState.sendText(val, true);
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
  let hadQueuedTasks = false;

  async function checkAndProcessQueue() {
    if (queuedMessages.length > 0) {
      hadQueuedTasks = true;
    } else if (
      hadQueuedTasks &&
      !root.DSState.isDeepSeekGenerating() &&
      root.DSState.runningTaskCount === 0 &&
      Date.now() - root.DSState.lastActivityTime > 2000
    ) {
      hadQueuedTasks = false;
      try {
        chrome.runtime.sendMessage({
          type: "NOTIFY",
          payload: {
            title: "DeepSeek Studio",
            message:
              "All queued tasks and sub-commands completed successfully!",
          },
        });
      } catch (_) {}
    }

    if (isDispatchingQueue || queuedMessages.length === 0) return;

    // 1. Check if DeepSeek is currently generating streaming text
    if (root.DSState.isDeepSeekGenerating()) return;

    // 2. Check if background tasks are currently running
    if (root.DSState.runningTaskCount > 0) return;

    // 3. Check if there are any unexecuted pending MCP permission cards
    const pendingCards = Array.from(
      document.querySelectorAll(
        ".deepseek-mcp-action-card:not(.is-historical)",
      ),
    );
    if (pendingCards.some((c) => c.querySelector(".mcp-approve-btn"))) return;

    // 4. Check if a Grill-me question card is waiting for user input
    const pendingGrill = document.querySelector(
      ".deepseek-grill-card:not(.is-historical)",
    );
    if (pendingGrill && !pendingGrill.querySelector(".ds-grill-answered"))
      return;

    // 5. Check if the send button is ready to click
    const sendBtn = root.DSState.getSendButton();
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

    // Double check stability
    if (Date.now() - root.DSState.lastActivityTime < 1500) return;

    isDispatchingQueue = true;
    try {
      const nextMsg = queuedMessages.shift();
      saveQueuedMessages();

      const qWrap = document.getElementById("deepseek-mcp-queue-bar");
      if (qWrap) renderQueueList(qWrap);

      console.log(
        `[DeepSeek Studio] Current task and all sub-commands totally finished. Dispatching queued message: "${nextMsg}"`,
      );
      await root.DSState.sendText(nextMsg, true);
    } catch (err) {
      console.error("[DeepSeek Studio] Error sending queued message:", err);
    } finally {
      isDispatchingQueue = false;
    }
  }

  setInterval(checkAndProcessQueue, 1500);

  const HUMAN_RESULT_TEMPLATES = [
    (name, out) => {
      if (
        out &&
        (out.includes("FAILED") ||
          out.includes("Ralph Auto-Check FAILED") ||
          out.includes("Hot-check found issues"))
      ) {
        return `Output of ${name}:\n\`\`\`json\n${out}\n\`\`\`\n🚨 [Ralph Loop Alert]: Verification failed. Fix the issues above immediately using smart_patch or workspace_batch. Keep reasoning under 40 words.`;
      }
      return `Output of ${name}:\n\`\`\`json\n${out}\n\`\`\`\nProceed immediately with the next tool call autonomously without conversational preamble until task is 100% complete.`;
    },
    (name, out) => {
      if (
        out &&
        (out.includes("FAILED") ||
          out.includes("Ralph Auto-Check FAILED") ||
          out.includes("Hot-check found issues"))
      ) {
        return `Results for ${name}:\n\`\`\`json\n${out}\n\`\`\`\n🚨 Errors detected in verification. Analyze and patch the code immediately.`;
      }
      return `Results for ${name}:\n\`\`\`json\n${out}\n\`\`\`\nContinue executing the next step autonomously. Keep reasoning under 50 words and emit the tool block immediately.`;
    },
    (name, out) =>
      `Tool ${name} completed:\n\`\`\`json\n${out}\n\`\`\`\nProceed autonomously to the next action.`,
  ];

  root.DSQueue = {
    get queuedMessages() {
      return queuedMessages;
    },
    saveQueuedMessages,
    renderQueueList,
    injectMessageQueueBar,
    checkAndProcessQueue,
    HUMAN_RESULT_TEMPLATES,
  };
})(window);
