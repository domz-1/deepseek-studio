import { isTaskActive } from "./useStudioState";
import { usePromptExpander } from "./usePromptExpander";

const injectedChatIds = new Set<string>();

export function useAgentSystemPrompt() {
  const { buildFableSystemPrompt, expandMentionsAndSkills } =
    usePromptExpander();

  function getCurrentChatId(): string | null {
    const match = window.location.pathname.match(
      /\/a\/chat\/s\/([a-zA-Z0-9-]+)/,
    );
    return match ? match[1] : null;
  }

  function hasAgentMentions(text: string): boolean {
    return /@([a-zA-Z0-9_-]+)/.test(text) || /\/([a-zA-Z0-9_-]+)/.test(text);
  }

  function isFirstMessageInChat(): boolean {
    const mdBlocks = document.querySelectorAll("div.ds-markdown");
    const userMsgs = document.querySelectorAll(
      "div.ds-message:not(.ds-mcp-hidden-turn)",
    );

    // If there are ANY messages in the conversation DOM, this is NOT the first message
    if (mdBlocks.length > 0 || userMsgs.length > 0) {
      return false;
    }

    // If on the root / new chat page with 0 messages, ensure fresh injection state
    if (window.location.pathname === "/" || window.location.pathname === "") {
      injectedChatIds.delete("new_chat");
      return true;
    }

    // In an existing chat path, if already marked injected, do not reinject
    const chatId = getCurrentChatId();
    if (chatId && injectedChatIds.has(chatId)) {
      return false;
    }

    return true;
  }

  function shouldInjectSystemPrompt(rawText: string): boolean {
    const text = rawText.trim();
    if (!text) return false;

    // Never inject on automated MCP results, task continuation prompts, or "continue"
    if (
      text.startsWith("[MCP_AUTO_RESULT]") ||
      text.startsWith("[MCP_CONTINUE_TASK]") ||
      text.toLowerCase() === "continue" ||
      text.includes("<agent_system_instructions>")
    ) {
      return false;
    }

    // ONLY inject on the very first message of a chat!
    return isFirstMessageInChat();
  }

  function preparePromptForSubmission(rawText: string): string {
    if (
      rawText.startsWith("[MCP_AUTO_RESULT]") ||
      rawText.startsWith("[MCP_CONTINUE_TASK]") ||
      rawText.trim().toLowerCase() === "continue"
    ) {
      return rawText;
    }

    const shouldInject = shouldInjectSystemPrompt(rawText);
    const expanded = expandMentionsAndSkills(rawText);

    if (shouldInject) {
      const chatId = getCurrentChatId() || "new_chat";
      injectedChatIds.add(chatId);
      isTaskActive.value = true;
      return `${buildFableSystemPrompt()}\n\n${expanded}`;
    }

    isTaskActive.value = true;
    return expanded;
  }

  let lastInjectTime = 0;

  function injectIntoTextarea(input: HTMLTextAreaElement) {
    if (!input || !input.value || !input.value.trim()) return;
    if (Date.now() - lastInjectTime < 800) return;

    const val = input.value.trim();
    if (
      val.startsWith("[MCP_AUTO_RESULT]") ||
      val.startsWith("[MCP_CONTINUE_TASK]") ||
      val.toLowerCase() === "continue"
    ) {
      return;
    }

    lastInjectTime = Date.now();
    const shouldInject = shouldInjectSystemPrompt(input.value);
    let modified = expandMentionsAndSkills(input.value);

    if (shouldInject) {
      modified = `${buildFableSystemPrompt()}\n\n${modified}`;
      const chatId = getCurrentChatId() || "new_chat";
      injectedChatIds.add(chatId);
      if (hasAgentMentions(input.value)) {
        isTaskActive.value = true;
      }
    } else if (hasAgentMentions(input.value)) {
      isTaskActive.value = true;
    }

    if (modified !== input.value) {
      const proto = Object.getPrototypeOf(input);
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(input, modified);
      } else {
        input.value = modified;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function initPromptAutoInjection(
    getChatInput: () => HTMLTextAreaElement | null,
    getSendButton: () => HTMLElement | null,
  ) {
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
          const input = getChatInput();
          if (
            input &&
            (document.activeElement === input || e.target === input)
          ) {
            injectIntoTextarea(input);
          }
        }
      },
      true,
    );

    const onSendClick = (e: Event) => {
      const target = e.target as HTMLElement;
      const sendBtn = getSendButton();
      if (sendBtn && (target === sendBtn || sendBtn.contains(target))) {
        const input = getChatInput();
        if (input) {
          injectIntoTextarea(input);
        }
      }
    };

    window.addEventListener("pointerdown", onSendClick, true);
  }

  return {
    buildFableSystemPrompt,
    preparePromptForSubmission,
    injectIntoTextarea,
    initPromptAutoInjection,
  };
}
