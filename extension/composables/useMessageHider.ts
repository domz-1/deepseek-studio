export function useMessageHider() {
  function isAutomatedMessageText(text: string): boolean {
    const t = text.trim();
    return (
      t.includes("<tool_result>") ||
      t.includes("</tool_result>") ||
      t.includes("[MCP_AUTO_RESULT]") ||
      t.includes("[MCP_SYSTEM_PROMPT]") ||
      t.includes("<mcp_context") ||
      t.startsWith("Output of ") ||
      t.startsWith("Results for ") ||
      t.startsWith("Batch Results for ") ||
      (t.startsWith("Tool ") && t.includes("completed")) ||
      t.startsWith("Continue autonomously:") ||
      t.includes("🚨 [Ralph Loop Alert]:") ||
      t.startsWith("Execution notice on ") ||
      t.includes(
        "You are an expert AI autonomous software engineering agent",
      ) ||
      t.includes("You are an expert AI workstation assistant") ||
      t.includes("CRITICAL OPERATIONAL RULES & AGENT WORKFLOW:") ||
      t.includes(
        "Please review these results and continue autonomously until you call task_done.",
      )
    );
  }

  function isAssistantTurn(turn: HTMLElement | null): boolean {
    if (!turn) return false;
    // In DeepSeek, ALL assistant message content is rendered inside .ds-markdown
    if (
      turn.classList.contains("ds-markdown") ||
      turn.querySelector("div.ds-markdown, .ds-markdown")
    ) {
      return true;
    }
    // Action cards or inline tool box belong to assistant turns
    if (
      turn.querySelector(
        ".ds-inline-tool-mount, .ds-inline-tool-box, .deepseek-mcp-action-card",
      )
    ) {
      return true;
    }
    return false;
  }

  function findMessageTurnContainer(el: HTMLElement): HTMLElement | null {
    const vItem = el.closest("[data-virtual-list-item-key]");
    if (vItem) return vItem as HTMLElement;

    let curr: HTMLElement | null = el;
    while (curr && curr.parentElement && curr.parentElement !== document.body) {
      const parent = curr.parentElement;
      const hasAssistantSibling = Array.from(parent.children).some(
        (sib) =>
          sib !== curr &&
          ((sib as HTMLElement).classList.contains("ds-markdown") ||
            (sib as HTMLElement).querySelector?.("div.ds-markdown")),
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
      el.closest("div[class*='chat-item' i], div[class*='message' i]") || el
    );
  }

  function processAutomatedMessages() {
    const candidates = Array.from(
      document.querySelectorAll(
        "[data-virtual-list-item-key], div[class*='message'], div[class*='chat-item'], div[class*='bubble']",
      ),
    ) as HTMLElement[];

    for (const el of candidates) {
      // NEVER process or hide assistant turns!
      if (isAssistantTurn(el)) continue;

      const text = el.textContent || "";
      if (!isAutomatedMessageText(text)) continue;

      // If user typed actual text along with system prompt, clean system prompt out
      if (text.includes("[USER_PROMPT]")) {
        const parts = text.split("[USER_PROMPT]");
        const cleanUserText = (parts[1] || "").trim();
        if (cleanUserText && !el.hasAttribute("data-mcp-sys-cleaned")) {
          el.setAttribute("data-mcp-sys-cleaned", "true");
          el.textContent = cleanUserText;
        }
        continue;
      }

      const turn = findMessageTurnContainer(el);
      if (!turn || isAssistantTurn(turn)) continue;

      turn.setAttribute("data-mcp-auto-turn", "true");
      turn.classList.add("ds-mcp-hidden-turn");
      turn.style.setProperty("display", "none", "important");
      turn.style.setProperty("height", "0", "important");
      turn.style.setProperty("min-height", "0", "important");
      turn.style.setProperty("padding", "0", "important");
      turn.style.setProperty("margin", "0", "important");

      // Hide inner message bubble and copy buttons row
      turn
        .querySelectorAll(
          ".ds-message, .ds-flex, [class*='ds-flex'], [class*='flex'], button, .ds-button--iconLabelTertiary, [class*='iconLabelTertiary']",
        )
        .forEach((sub) => {
          (sub as HTMLElement).classList.add("ds-mcp-hidden-turn");
          (sub as HTMLElement).style.setProperty(
            "display",
            "none",
            "important",
          );
        });

      // Hide adjacent button sibling bars (copy, edit, retry buttons)
      let nextSib = turn.nextElementSibling as HTMLElement | null;
      while (nextSib) {
        if (
          nextSib.classList.contains("ds-flex") ||
          nextSib.querySelector?.(
            ".ds-button--iconLabelTertiary, [class*='iconLabelTertiary'], button",
          )
        ) {
          nextSib.classList.add("ds-mcp-hidden-turn");
          nextSib.style.setProperty("display", "none", "important");
          nextSib.style.setProperty("height", "0", "important");
          nextSib.style.setProperty("padding", "0", "important");
          nextSib.style.setProperty("margin", "0", "important");
        }
        nextSib = nextSib.nextElementSibling as HTMLElement | null;
      }
    }

    // Safety cleanup: Ensure NO assistant turn ever keeps ds-mcp-hidden-turn
    document.querySelectorAll(".ds-mcp-hidden-turn").forEach((hiddenEl) => {
      if (isAssistantTurn(hiddenEl as HTMLElement)) {
        hiddenEl.classList.remove("ds-mcp-hidden-turn");
        (hiddenEl as HTMLElement).style.removeProperty("display");
      }
    });
  }

  return {
    isAutomatedMessageText,
    processAutomatedMessages,
  };
}
