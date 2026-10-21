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

      const text = el.textContent || "";

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
          ? window.DSState.getCallSignature(allCalls, idx)
          : `mcp_${idx}_${JSON.stringify(allCalls).slice(0, 120)}`;

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
  }

  root.DSScanner = { scanMessages };
  root.DSScanner.initObserver = function () {
    new MutationObserver(() => {
      clearTimeout(window.DSState?.debounceTimer);
      if (window.DSState) {
        window.DSState.debounceTimer = setTimeout(() => {
          scanMessages();
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
