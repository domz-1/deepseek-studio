export function useMessageHider() {
  function processAutomatedMessages() {
    // Only target user message bubbles (div.ds-message) that contain tool results
    const userMessages = document.querySelectorAll(
      "div.ds-message:not(.ds-mcp-hidden-turn)",
    );

    for (const el of userMessages) {
      const msg = el as HTMLElement;

      // NEVER touch assistant messages or markdown blocks
      if (
        msg.classList.contains("ds-markdown") ||
        msg.querySelector("div.ds-markdown") ||
        msg.closest("div.ds-markdown")
      ) {
        continue;
      }

      const text = (msg.textContent || "").trim();
      if (
        text.startsWith("[MCP_AUTO_RESULT]") ||
        text.startsWith("[MCP_CONTINUE_TASK]") ||
        text.startsWith("<tool_result>") ||
        (text.includes("<tool_result>") && !text.includes("<tool_call>"))
      ) {
        msg.classList.add("ds-mcp-hidden-turn");
        msg.style.display = "none";

        // Hide adjacent action buttons (copy/edit) in the same user row wrapper
        const parentWrapper = msg.parentElement;
        if (parentWrapper && !parentWrapper.querySelector("div.ds-markdown")) {
          const btns = parentWrapper.querySelectorAll(
            "button, .ds-button--iconLabelTertiary, [class*='iconLabelTertiary']",
          );
          btns.forEach((btn) => {
            (btn as HTMLElement).style.display = "none";
          });
        }
      }
    }
  }

  return {
    processAutomatedMessages,
  };
}
