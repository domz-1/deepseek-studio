import { useDeepSeekDom } from "./useDeepSeekDom";
import { settings } from "./useStudioState";
import { useAgentSystemPrompt } from "./useAgentSystemPrompt";

export function usePromptExecution() {
  const { getChatInput, getSendButton, clickButton } = useDeepSeekDom();
  const { preparePromptForSubmission } = useAgentSystemPrompt();

  async function typeHumanizedText(el: HTMLTextAreaElement, text: string) {
    el.focus();
    const isNatural = settings.humanSpeed === "natural";

    if (text.length <= 100) {
      for (let i = 0; i < text.length; i++) {
        el.value = (el.value || "") + text[i];
        el.dispatchEvent(new Event("input", { bubbles: true }));
        if (isNatural) {
          const jitter = Math.floor(Math.random() * 20) + 12; // 12-32ms
          await new Promise((r) => setTimeout(r, jitter));
        }
      }
    } else {
      const proto = Object.getPrototypeOf(el);
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(el, text);
      } else {
        el.value = text;
      }
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  async function sendPrompt(rawPromptText: string): Promise<boolean> {
    const input = getChatInput();
    if (!input) return false;

    const promptText = preparePromptForSubmission(rawPromptText);

    // 1. Natural pre-input focus delay
    if (settings.humanSpeed === "natural") {
      input.focus();
      await new Promise((r) => setTimeout(r, 150 + Math.random() * 200));
    }

    // 2. Type text
    await typeHumanizedText(input, promptText);

    // 3. Wait for React state to update Send button
    await new Promise((r) => setTimeout(r, 80));

    // 4. Click Send
    const sendBtn = getSendButton();
    if (sendBtn) {
      clickButton(sendBtn);
    }

    // 5. Fallback Enter key if input is still populated
    await new Promise((r) => setTimeout(r, 180));
    if (input.value && input.value.trim().length > 0) {
      input.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          code: "Enter",
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true,
        }),
      );
    }

    return true;
  }

  return {
    typeHumanizedText,
    sendPrompt,
  };
}
