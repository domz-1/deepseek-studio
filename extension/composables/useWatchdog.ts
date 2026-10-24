import { ref } from "vue";
import { useDeepSeekDom } from "./useDeepSeekDom";
import { settings } from "./useStudioState";

export function useWatchdog() {
  const { findContinueOrRetryButton, clickButton } = useDeepSeekDom();

  const isPending = ref(false);
  const countdown = ref(0);
  const actionType = ref<"Continue" | "Retry">("Continue");

  let detectedTime = 0;
  let lastAttemptTime = 0;
  let timer: any = null;

  function tick() {
    if (!settings.autoContinue) {
      isPending.value = false;
      detectedTime = 0;
      return;
    }

    const match = findContinueOrRetryButton();
    if (!match) {
      isPending.value = false;
      detectedTime = 0;
      countdown.value = 0;
      return;
    }

    const { el, type } = match;
    actionType.value = type;

    if (detectedTime === 0) {
      detectedTime = Date.now();
      isPending.value = true;
    }

    const delayMs = (settings.autoContinueDelay || 5) * 1000;
    const elapsed = Date.now() - detectedTime;
    const remaining = Math.max(0, Math.ceil((delayMs - elapsed) / 1000));
    countdown.value = remaining;

    if (remaining === 0) {
      if (Date.now() - lastAttemptTime > 1500) {
        lastAttemptTime = Date.now();
        clickButton(el);
      }
    }
  }

  function startWatchdog() {
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 500);
  }

  function stopWatchdog() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function forceTrigger() {
    const match = findContinueOrRetryButton();
    if (match) {
      clickButton(match.el);
    }
  }

  return {
    isPending,
    countdown,
    actionType,
    startWatchdog,
    stopWatchdog,
    forceTrigger,
  };
}
