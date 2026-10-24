import { useDeepSeekDom } from "./useDeepSeekDom";
import { settings } from "./useStudioState";
import { useAgentSystemPrompt } from "./useAgentSystemPrompt";

let isSending = false;
let lastSendTime = 0;

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
    // Prevent concurrent or burst duplicate prompt submissions
    if (isSending) return false;
    if (Date.now() - lastSendTime < 1200) return false;

    const input = getChatInput();
    if (!input) return false;

    isSending = true;
    lastSendTime = Date.now();

    try {
      const promptText = preparePromptForSubmission(rawPromptText);

      // 1. Natural pre-input focus delay
      if (settings.humanSpeed === "natural") {
        input.focus();
        await new Promise((r) => setTimeout(r, 120));
      }

      // 2. Set text in textarea and notify React
      await typeHumanizedText(input, promptText);

      // 3. Wait for React to enable the Send button (poll up to 400ms)
      let sendBtn = getSendButton();
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 50));
        sendBtn = getSendButton();
        if (
          sendBtn &&
          !(sendBtn as HTMLButtonElement).disabled &&
          !sendBtn.classList.contains("ds-button--disabled") &&
          sendBtn.getAttribute("aria-disabled") !== "true"
        ) {
          break;
        }
      }

      // 4. Click Send button if enabled, otherwise fallback to Enter key
      const isEnabled =
        sendBtn &&
        !(sendBtn as HTMLButtonElement).disabled &&
        !sendBtn.classList.contains("ds-button--disabled") &&
        sendBtn.getAttribute("aria-disabled") !== "true";

      if (isEnabled && sendBtn) {
        clickButton(sendBtn);
      } else {
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

      // Settle time before allowing next automated send
      await new Promise((r) => setTimeout(r, 500));
      return true;
    } finally {
      isSending = false;
    }
  }

  return {
    typeHumanizedText,
    sendPrompt,
  };
}
