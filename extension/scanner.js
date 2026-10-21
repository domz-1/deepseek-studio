// DeepSeek MCP Studio — DOM Scanner & Observer
(function (root) {
  "use strict";
  function scanMessages() {
    // Only search actual markdown blocks, explicitly excluding all extension UI elements (cards, badges, pills, pre tags inside cards)
    const rawBlocks = Array.from(
      document.querySelectorAll(
        "div.ds-markdown div.md-code-block, div.ds-markdown pre, div.ds-markdown",
      ),
    );
    if (!rawBlocks.length) return;

    // Filter out:
    // 1. Any element that is inside or belongs to our own extension action cards or UI elements
    // 2. Parent ds-markdown containers if they already contain inner code blocks (prevents duplicate cards)
    const codeBlocks = rawBlocks.filter((el) => {
      if (
        el.closest(".deepseek-mcp-action-card") ||
        el.closest("#deepseek-mcp-badge") ||
        el.closest("#deepseek-mcp-queue-bar") ||
        el.closest("#mcp-task-indicator") ||
        el.classList.contains("ds-card-pre")
      ) {
        return false;
      }
      if (el.classList.contains("ds-markdown")) {
        return !el.querySelector(
          "div.md-code-block, pre, .deepseek-mcp-action-card",
        );
      }
      return true;
    });
    if (!codeBlocks.length) return;

    // Only the very last message container in the chat can be considered "live" for auto-execution,
    // and ONLY if a task is actively running in this session (not on initial page load / crash restore).
    const allMarkdownContainers = Array.from(
      document.querySelectorAll("div.ds-markdown"),
    );
    const latestMarkdownContainer =
      allMarkdownContainers[allMarkdownContainers.length - 1] || null;

    codeBlocks.forEach((el, idx) => {
      if (
        el.hasAttribute("data-mcp-attached") ||
        el.closest(".deepseek-mcp-action-card") ||
        el.closest("#deepseek-mcp-badge") ||
        el.querySelector(".deepseek-mcp-action-card")
      ) {
        return;
      }
      const nextEl = el.nextElementSibling;
      if (nextEl && nextEl.classList.contains("deepseek-mcp-action-card")) {
        el.setAttribute("data-mcp-attached", "true");
        return;
      }

      // Read clean text without any injected card text
      let text = "";
      if (el.classList.contains("ds-markdown")) {
        const clone = el.cloneNode(true);
        clone
          .querySelectorAll(
            ".deepseek-mcp-action-card, .ds-card, #deepseek-mcp-badge, #deepseek-mcp-queue-bar",
          )
          .forEach((c) => c.remove());
        text = clone.textContent || "";
      } else {
        text = el.textContent || "";
      }

      // A block is historical if:
      // 1. No active task is running in this tab session (e.g., page just loaded or restored after crash)
      // 2. Or this block is NOT inside the very last assistant message in the conversation
      // 3. Or this call was already executed previously (persisted in localStorage)
      const parentMd = el.closest("div.ds-markdown");
      const isLatestTurn =
        latestMarkdownContainer &&
        (el === latestMarkdownContainer ||
          parentMd === latestMarkdownContainer);
      const isLiveSessionTurn = Boolean(
        window.DSState?.isTaskActive && isLatestTurn,
      );

      // 1. Check for interactive Grill-Me Question JSON
      if (
        (text.includes("grill_question") || text.includes('"questions"')) &&
        window.DSTools?.extractGrillQuestion
      ) {
        const grillData = window.DSTools.extractGrillQuestion(text);
        if (grillData && (grillData.question || grillData.questions)) {
          el.setAttribute("data-mcp-attached", "true");
          const qTitle =
            grillData.question || grillData.questions[0]?.question || "multi";
          const callKey = `grill:${qTitle.slice(0, 80)}`;

          try {
            if (
              document.querySelector(
                `.deepseek-mcp-action-card[data-call-key="${CSS.escape(callKey)}"]`,
              )
            ) {
              return;
            }
          } catch (_) {}

          const isElementExecuted =
            !isLiveSessionTurn ||
            el.getAttribute("data-mcp-executed") === "true" ||
            Boolean(window.DSState?.hasExecutedCall?.(callKey));

          root.DSCards?.renderGrillQuestionCard(
            el,
            grillData,
            callKey,
            isElementExecuted,
          );
          return;
        }
      }

      // 2. Check for tool calls (JSON, DeepSeek DSML, or custom/any XML tags)
      const hasPossibleCall =
        text.includes("{") ||
        text.includes("<") ||
        text.includes("name") ||
        text.includes("invoke") ||
        text.includes("DSML");

      if (!hasPossibleCall) return;

      const allCalls = window.DSTools?.extractAllMcpCalls
        ? window.DSTools.extractAllMcpCalls(text)
        : [window.DSTools?.extractMcpCall(text)].filter(Boolean);

      if (allCalls && allCalls.length > 0) {
        el.setAttribute("data-mcp-attached", "true");

        // Deterministic fingerprint so the same call in a chat is recognized across reloads
        const callSignature = window.DSState?.getCallSignature
          ? window.DSState.getCallSignature(allCalls)
          : `mcp_${JSON.stringify(allCalls).slice(0, 120)}`;

        if (!el.dataset.mcpId) {
          el.dataset.mcpId = callSignature;
        }

        const callKey =
          allCalls.length === 1
            ? `${callSignature}:${allCalls[0].name}`
            : `${callSignature}:batch_${allCalls.length}`;

        try {
          if (
            document.querySelector(
              `.deepseek-mcp-action-card[data-call-key="${CSS.escape(callKey)}"]`,
            )
          ) {
            return;
          }
        } catch (_) {}

        const isElementExecuted =
          !isLiveSessionTurn ||
          el.getAttribute("data-mcp-executed") === "true" ||
          Boolean(window.DSState?.hasExecutedCall?.(callKey));

        if (allCalls.length === 1) {
          const payload = allCalls[0];
          root.DSCards?.renderPermissionCard(
            el,
            payload,
            callKey,
            isElementExecuted,
          );
        } else {
          root.DSCards?.renderPermissionCard(
            el,
            allCalls,
            callKey,
            isElementExecuted,
          );
        }
      }
    });

    collapseAutomatedMessages();
  }

  function isAutomatedMessageText(text) {
    if (!text || typeof text !== "string") return false;
    const t = text.trim();
    return (
      t.includes("[MCP_AUTO_RESULT]") ||
      t.startsWith("Output of ") ||
      t.startsWith("Results for ") ||
      t.startsWith("Batch Results for ") ||
      (t.startsWith("Tool ") && t.includes("completed")) ||
      t.startsWith("Continue autonomously:") ||
      t.includes("🚨 [Ralph Loop Alert]:") ||
      t.startsWith("Execution notice on ")
    );
  }

  function findMessageTurnContainer(el) {
    // 1. If inside DeepSeek virtual list item, return the top-level virtual list row
    const vItem = el.closest("[data-virtual-list-item-key]");
    if (vItem) return vItem;

    let curr = el;
    while (curr && curr.parentElement && curr.parentElement !== document.body) {
      const parent = curr.parentElement;

      // In DeepSeek, the conversation history is a container whose direct children are message turns.
      // At least one other child of parent contains an assistant markdown block or card.
      const hasAssistantSibling = Array.from(parent.children).some(
        (sib) =>
          sib !== curr &&
          (sib.classList.contains("ds-markdown") ||
            sib.querySelector?.("div.ds-markdown") ||
            sib.querySelector?.(".deepseek-mcp-action-card")),
      );

      if (hasAssistantSibling) {
        return curr;
      }

      if (
        curr.hasAttribute("data-virtual-list-item-key") ||
        curr.classList.contains("ds-message") ||
        curr.getAttribute("role") === "row" ||
        curr.getAttribute("data-role") === "user" ||
        (curr.className &&
          typeof curr.className === "string" &&
          (curr.className.includes("chat-item") ||
            curr.className.includes("message-item") ||
            curr.className.includes("session-item")))
      ) {
        return curr;
      }

      curr = parent;
    }
    return (
      el.closest(
        "[data-virtual-list-item-key], div[class*='message'], div[class*='chat-item'], div.ds-message",
      ) || el
    );
  }

  function isAssistantTurn(turn) {
    if (!turn) return false;
    // 1. In DeepSeek, ALL assistant message content is rendered inside .ds-markdown
    if (
      turn.classList.contains("ds-markdown") ||
      turn.querySelector("div.ds-markdown, .ds-markdown")
    ) {
      return true;
    }
    // 2. Action cards belong ONLY to assistant turns
    if (turn.querySelector(".deepseek-mcp-action-card")) return true;
    // 3. Feedback icons belong ONLY to assistant turns
    if (
      turn.querySelector(
        "button[aria-label*='like' i], button[aria-label*='thumbs' i], div[class*='feedback' i]",
      )
    ) {
      return true;
    }
    return false;
  }

  function collapseElementIntoPill(el, text) {
    if (el.hasAttribute("data-mcp-auto-styled")) return;
    el.setAttribute("data-mcp-auto-styled", "true");

    let summary = "تم إرسال مخرجات الأداة في الخلفية (Background Tool Data)";
    if (text.includes("Batch Results")) {
      const m = text.match(/Batch Results for (\d+) parallel calls/);
      summary = `تم إرسال نتائج حزمة أدوات (${m ? m[1] : ""} أدوات) لديب سيك في الخلفية`;
    } else if (text.includes("Output of ")) {
      const m = text.match(/Output of ([\w\.-]+)/);
      summary = `مخرجات أداة: ${m ? m[1] : ""}`;
    } else if (text.includes("Tool ") && text.includes("completed")) {
      const m = text.match(/Tool ([\w\.-]+) completed/);
      summary = `تم إرسال نتيجة الأداة: ${m ? m[1] : ""}`;
    } else if (text.includes("Continue autonomously")) {
      summary = `أمر متابعة تلقائي للأجنت في الخلفية (Autonomous Nudge)`;
    }

    const pill = document.createElement("div");
    pill.className = "ds-auto-msg-pill";
    pill.innerHTML = `
      <div class="ds-auto-pill-bar">
        <span class="ds-ic" data-ic="zap" style="color:var(--ds-accent,#4f46e5);margin-right:6px;"></span>
        <span class="ds-auto-pill-title">${summary}</span>
        <button class="ds-auto-pill-btn" type="button">عرض الداتا ▼</button>
      </div>
      <div class="ds-auto-pill-body" style="display:none;margin-top:8px;"></div>
    `;

    const body = pill.querySelector(".ds-auto-pill-body");
    const btn = pill.querySelector(".ds-auto-pill-btn");
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "block" : "none";
      btn.textContent = isHidden ? "إخفاء الداتا ▲" : "عرض الداتا ▼";
    };

    while (el.firstChild) {
      body.appendChild(el.firstChild);
    }
    el.appendChild(pill);
  }

  function updateHiddenCounterBadge() {
    const hiddenTurns = document.querySelectorAll(
      "[data-mcp-auto-turn='true']",
    );
    const toggleBtn = document.getElementById("mcp-toggle-auto-msg");
    const label = document.getElementById("mcp-toggle-auto-msg-label");
    if (!toggleBtn) return;
    const shouldHide =
      localStorage.getItem("deepseek_mcp_hide_auto_messages") !== "false";
    const count = hiddenTurns.length;

    if (label) {
      label.textContent = shouldHide
        ? `مخرجات الأدوات: مخفية (${count})`
        : `مخرجات الأدوات: ظاهرة (${count})`;
    }
    toggleBtn.title = shouldHide
      ? "انقر لإظهار رسائل مخرجات الأدوات في الشات"
      : "انقر لإخفاء رسائل مخرجات الأدوات من الشات";
  }

  function processAutomatedMessages() {
    const shouldHide =
      localStorage.getItem("deepseek_mcp_hide_auto_messages") !== "false";

    // Strictly search user containers, including virtual list rows
    const candidates = Array.from(
      document.querySelectorAll(
        "[data-virtual-list-item-key], div[class*='message'], div[class*='chat-item'], div[class*='bubble']",
      ),
    );

    for (const el of candidates) {
      // NEVER process or hide assistant turns!
      if (
        el.classList.contains("ds-markdown") ||
        el.closest("div.ds-markdown") ||
        el.querySelector("div.ds-markdown, .ds-markdown")
      ) {
        continue;
      }

      const text = el.textContent || "";
      if (!isAutomatedMessageText(text)) continue;

      const turn = findMessageTurnContainer(el);
      if (!turn || isAssistantTurn(turn)) continue;

      turn.setAttribute("data-mcp-auto-turn", "true");

      if (shouldHide) {
        turn.classList.add("ds-mcp-hidden-turn");
        turn.style.setProperty("display", "none", "important");
        turn.style.setProperty("height", "0", "important");
        turn.style.setProperty("min-height", "0", "important");
        turn.style.setProperty("padding", "0", "important");
        turn.style.setProperty("margin", "0", "important");

        // Hide inner message bubble and the action buttons row after the message
        turn
          .querySelectorAll(
            ".ds-message, .ds-flex, [class*='ds-flex'], [class*='flex'], button",
          )
          .forEach((sub) => {
            sub.classList.add("ds-mcp-hidden-turn");
            sub.style.setProperty("display", "none", "important");
          });
      } else {
        turn.classList.remove("ds-mcp-hidden-turn");
        turn.style.removeProperty("display");
        turn.style.removeProperty("height");
        turn.style.removeProperty("min-height");
        turn.style.removeProperty("padding");
        turn.style.removeProperty("margin");

        turn.querySelectorAll(".ds-mcp-hidden-turn").forEach((sub) => {
          sub.classList.remove("ds-mcp-hidden-turn");
          sub.style.removeProperty("display");
        });

        collapseElementIntoPill(el, text);
      }
    }

    // Safety cleanup: Ensure NO assistant turn ever keeps ds-mcp-hidden-turn
    document.querySelectorAll(".ds-mcp-hidden-turn").forEach((hiddenEl) => {
      if (isAssistantTurn(hiddenEl)) {
        hiddenEl.classList.remove("ds-mcp-hidden-turn");
        hiddenEl.style.removeProperty("display");
        hiddenEl.style.removeProperty("height");
        hiddenEl.style.removeProperty("padding");
      }
    });

    updateHiddenCounterBadge();
  }

  const collapseAutomatedMessages = processAutomatedMessages;

  function hideTertiaryButtons() {
    const btns = document.querySelectorAll(
      ".ds-button--iconLabelTertiary, button[class*='iconLabelTertiary']",
    );
    for (const btn of btns) {
      if (
        btn.id === "mcp-watchdog-btn" ||
        btn.closest("#deepseek-mcp-badge") ||
        btn.closest(".deepseek-mcp-action-card")
      ) {
        continue;
      }
      btn.style.setProperty("display", "none", "important");
      const parent = btn.parentElement;
      if (parent && !parent.classList.contains("ds-markdown")) {
        parent.style.setProperty("display", "none", "important");
        parent.style.setProperty("height", "0", "important");
        parent.style.setProperty("padding", "0", "important");
        parent.style.setProperty("margin", "0", "important");
      }
    }
  }

  root.DSScanner = {
    scanMessages,
    collapseAutomatedMessages,
    processAutomatedMessages,
    updateHiddenCounterBadge,
    hideTertiaryButtons,
  };
  root.DSScanner.initObserver = function () {
    new MutationObserver(() => {
      clearTimeout(window.DSState?.debounceTimer);
      if (window.DSState) {
        window.DSState.debounceTimer = setTimeout(() => {
          scanMessages();
          processAutomatedMessages();
          hideTertiaryButtons();
          window.DSMention?.attachInputMentionInterceptor();
          root.DSBadges?.injectChatBadge();
          window.DSProjects?.injectSidebarProjectFilter();
          window.DSWatchdog?.checkAndHandleRetryButton();
        }, 200);
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };
})(window);
