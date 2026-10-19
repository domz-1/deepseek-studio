// DeepSeek MCP Studio — DOM Scanner & Observer
(function (root) {
  "use strict";
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
        window.DSTools?.extractGrillQuestion
      ) {
        const grillData = window.DSTools.extractGrillQuestion(text);
        if (grillData && (grillData.question || grillData.questions)) {
          el.setAttribute("data-mcp-attached", "true");
          const qTitle =
            grillData.question || grillData.questions[0]?.question || "multi";
          const callKey = `grill:${qTitle.slice(0, 80)}`;
          const isElementExecuted =
            el.getAttribute("data-mcp-executed") === "true";

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

        const isElementExecuted =
          el.getAttribute("data-mcp-executed") === "true";

        if (!el.dataset.mcpId) {
          el.dataset.mcpId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        }

        if (allCalls.length === 1) {
          const payload = allCalls[0];
          const callKey = `${el.dataset.mcpId}:${payload.name}`;
          root.DSCards?.renderPermissionCard(
            el,
            payload,
            callKey,
            isElementExecuted,
          );
        } else {
          const callKey = `${el.dataset.mcpId}:batch_${allCalls.length}`;
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
