export function useDeepSeekDom() {
  function getChatInput(): HTMLTextAreaElement | null {
    return (
      (document.querySelector("textarea#chat-input") as HTMLTextAreaElement) ||
      (document.querySelector(
        'textarea[placeholder*="DeepSeek"]',
      ) as HTMLTextAreaElement) ||
      (document.querySelector("textarea") as HTMLTextAreaElement)
    );
  }

  function getSendButton(): HTMLElement | null {
    const input = getChatInput();
    if (!input) return null;

    const containers = [
      input.closest("div.ds-textarea-wrapper"),
      input.closest("div[class*='textarea']"),
      input.parentElement?.parentElement?.parentElement,
      input.parentElement?.parentElement,
      document.body,
    ].filter(Boolean) as HTMLElement[];

    for (const container of containers) {
      const candidates = Array.from(
        container.querySelectorAll(
          'button, div[role="button"], span[role="button"]',
        ),
      ) as HTMLElement[];

      for (let i = candidates.length - 1; i >= 0; i--) {
        const btn = candidates[i];
        const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
        const title = (btn.getAttribute("title") || "").toLowerCase();

        if (
          aria.includes("file") ||
          aria.includes("attach") ||
          title.includes("file") ||
          title.includes("attach")
        ) {
          continue;
        }

        if (
          aria.includes("send") ||
          title.includes("send") ||
          btn.querySelector("svg path[d*='M']")
        ) {
          return btn;
        }
      }
    }
    return null;
  }

  function findContinueOrRetryButton(): {
    el: HTMLElement;
    type: "Continue" | "Retry";
  } | null {
    const candidates = Array.from(
      document.querySelectorAll(
        '.ds-button--capsule, .ds-button, button, div[role="button"], span[role="button"], [class*="ds-button"]',
      ),
    ) as HTMLElement[];

    for (const el of candidates) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      if (
        el.closest("#deepseek-studio-mount") ||
        el.closest("#deepseek-studio-root") ||
        el.closest(".ds-inline-tool-mount") ||
        el.closest("#opendude-widget")
      ) {
        continue;
      }

      const text = (el.textContent || "").trim().toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      const title = (el.getAttribute("title") || "").toLowerCase();

      // 1. Continue
      if (
        text === "continue" ||
        aria === "continue" ||
        title === "continue" ||
        el.classList.contains("ds-continue-button")
      ) {
        return { el, type: "Continue" };
      }

      // 2. Retry
      if (
        text === "retry" ||
        aria === "retry" ||
        title === "retry" ||
        el.classList.contains("ds-button--warning") ||
        el.classList.contains("ds-retry-button")
      ) {
        return { el, type: "Retry" };
      }
    }
    return null;
  }

  function clickButton(el: HTMLElement): boolean {
    if (!el) return false;
    const btn =
      (el.closest(
        'button, div[role="button"], span[role="button"], .ds-button, .ds-button--capsule',
      ) as HTMLElement) || el;
    try {
      if (typeof btn.scrollIntoView === "function") {
        btn.scrollIntoView({ behavior: "instant", block: "center" });
      }
      btn.focus?.();
      const rect = btn.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return false;
      const x = rect.left + (rect.width > 0 ? rect.width / 2 : 10);
      const y = rect.top + (rect.height > 0 ? rect.height / 2 : 10);
      const opts = {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window,
        clientX: x,
        clientY: y,
        button: 0,
        buttons: 1,
        isPrimary: true,
      };

      btn.dispatchEvent(new PointerEvent("pointerdown", opts));
      btn.dispatchEvent(new MouseEvent("mousedown", opts));
      btn.dispatchEvent(new PointerEvent("pointerup", opts));
      btn.dispatchEvent(new MouseEvent("mouseup", opts));
      if (typeof btn.click === "function") {
        btn.click();
      } else {
        btn.dispatchEvent(new MouseEvent("click", opts));
      }

      // Also trigger React synthetic onClick on btn or its parent/children
      const candidates = [btn, btn.parentElement, btn.firstElementChild].filter(
        Boolean,
      ) as any[];
      for (const t of candidates) {
        const reactKey = Object.keys(t).find((k) =>
          k.startsWith("__reactProps"),
        );
        if (
          reactKey &&
          t[reactKey] &&
          typeof t[reactKey].onClick === "function"
        ) {
          try {
            t[reactKey].onClick({
              stopPropagation: () => {},
              preventDefault: () => {},
              nativeEvent: new MouseEvent("click", opts),
              currentTarget: t,
              target: t,
            });
          } catch (_) {}
        }
      }

      return true;
    } catch (_) {
      try {
        btn.click?.();
        return true;
      } catch (_) {
        return false;
      }
    }
  }

  let lastSeenText = "";
  let lastChangeTime = 0;

  function isGenerating(): boolean {
    const cont = findContinueOrRetryButton();
    if (cont) return false;

    // 0. Detect disabled or pending textarea (submission in progress)
    const input = getChatInput();
    if (input && input.disabled) {
      lastChangeTime = Date.now();
      return true;
    }

    // 1. Detect Stop button via aria, title, class, or DeepSeek circular stop icon (d starts with M2 4.88)
    const stopButton = document.querySelector(
      'button[aria-label*="Stop" i], button[title*="Stop" i], .ds-stop-button, .ds-button--stop, [class*="stop-button" i], [class*="StopButton" i], div.ds-button--circle._52c986b:not(.ds-button--disabled) svg path[d^="M2 4.88"]',
    );
    if (stopButton && (stopButton as HTMLElement).offsetParent !== null) {
      lastChangeTime = Date.now();
      return true;
    }

    // 2. Detect Stop square icon (SVG rect in textarea buttons)
    const stopIcon = document.querySelector(
      "div.ds-textarea-wrapper svg rect, button svg rect",
    );
    if (stopIcon && (stopIcon as HTMLElement).offsetParent !== null) {
      lastChangeTime = Date.now();
      return true;
    }

    // 3. Detect Blinking cursor or streaming indicator
    const cursor = document.querySelector(
      '.cursor--blinking, [class*="cursor--blinking" i], [class*="loading" i], [class*="generating" i]',
    );
    if (cursor && (cursor as HTMLElement).offsetParent !== null) {
      lastChangeTime = Date.now();
      return true;
    }

    // 4. Text Quiescence check: if tokens are streaming, text length grows
    const mdBlocks = document.querySelectorAll("div.ds-markdown");
    const latest = mdBlocks.length > 0 ? mdBlocks[mdBlocks.length - 1] : null;
    const currentText = latest ? latest.textContent || "" : "";

    if (currentText && currentText !== lastSeenText) {
      lastSeenText = currentText;
      lastChangeTime = Date.now();
      return true;
    }

    // Enforce minimum 2-second settle delay after model stops generating
    if (lastChangeTime > 0 && Date.now() - lastChangeTime < 2000) {
      return true;
    }

    return false;
  }

  return {
    getChatInput,
    getSendButton,
    findContinueOrRetryButton,
    clickButton,
    isGenerating,
  };
}
