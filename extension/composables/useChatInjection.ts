import { ref } from "vue";
import { useDeepSeekDom } from "./useDeepSeekDom";

export const chatInjectionToast = ref<string | null>(null);
let toastTimer: any = null;

export function useChatInjection() {
  const { getChatInput } = useDeepSeekDom();

  function triggerToast(msg: string) {
    chatInjectionToast.value = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      chatInjectionToast.value = null;
    }, 2000);
  }

  function injectSnippetToChat(snippet: string, filePath?: string): boolean {
    const input = getChatInput();
    if (!input) return false;

    const currentVal = input.value || "";
    let formatted = "";

    if (filePath && snippet) {
      const ext = filePath.split(".").pop() || "";
      const base = filePath.split("/").slice(-2).join("/");
      formatted = `In \`${base}\`:\n\`\`\`${ext}\n${snippet}\n\`\`\`\n`;
    } else if (snippet) {
      formatted = `\`\`\`\n${snippet}\n\`\`\`\n`;
    } else if (filePath) {
      formatted = `@${filePath} `;
    }

    if (!formatted) return false;

    const newVal = currentVal ? `${currentVal}\n\n${formatted}` : formatted;

    try {
      const proto = Object.getPrototypeOf(input);
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(input, newVal);
      } else {
        input.value = newVal;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.focus();
      input.selectionStart = input.selectionEnd = newVal.length;
      triggerToast(
        filePath
          ? `Added ${filePath.split("/").pop()} to chat!`
          : "Added snippet to chat!",
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function addActiveSelectionToChat(
    activeFile?: string | null,
    fallbackContent?: string,
  ): boolean {
    const selectedText = window.getSelection()?.toString()?.trim();
    if (selectedText) {
      return injectSnippetToChat(selectedText, activeFile || undefined);
    }
    if (fallbackContent) {
      return injectSnippetToChat(
        fallbackContent.slice(0, 3000),
        activeFile || undefined,
      );
    }
    if (activeFile) {
      return injectSnippetToChat("", activeFile);
    }
    return false;
  }

  return {
    chatInjectionToast,
    injectSnippetToChat,
    addActiveSelectionToChat,
    triggerToast,
  };
}
