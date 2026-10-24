import { ref } from "vue";
import { useDeepSeekDom } from "./useDeepSeekDom";
import { settings, isTaskActive, activeActions } from "./useStudioState";
import { usePromptExecution } from "./usePromptExecution";

let idleSince = 0;
let consecutiveNudges = 0;
const MAX_CONSECUTIVE_NUDGES = 5;

export function resetNudge() {
  consecutiveNudges = 0;
  idleSince = 0;
}

export function useWatchdog() {
  const { findContinueOrRetryButton, clickButton, isGenerating } =
    useDeepSeekDom();
  const { sendPrompt } = usePromptExecution();

  const isPending = ref(false);
  const countdown = ref(0);
  const actionType = ref<"Continue" | "Retry">("Continue");

  let detectedTime = 0;
  let lastAttemptTime = 0;
  let timer: any = null;

  async function checkTaskContinuation() {
    if (!settings.autoContinue || !isTaskActive.value) {
      idleSince = 0;
      return;
    }

    // If model is streaming tokens or thinking, wait
    if (isGenerating()) {
      idleSince = 0;
      return;
    }

    // If any tool action is currently running or pending, wait
    const hasActiveActions = activeActions.value.some(
      (a) => a.status === "running" || a.status === "pending",
    );
    if (hasActiveActions) {
      idleSince = 0;
      consecutiveNudges = 0;
      return;
    }

    // If there are unsent results waiting to be flushed, wait
    const hasUnsent = activeActions.value.some(
      (a) =>
        (a.status === "completed" || a.status === "error") && !(a as any).sent,
    );
    if (hasUnsent) {
      idleSince = 0;
      return;
    }

    // Model has finished generating. Check if idle for > 8.0 seconds to prevent rate limits
    if (idleSince === 0) {
      idleSince = Date.now();
      return;
    }

    const isRateLimited = document.body.innerText.includes(
      "Messages too frequent",
    );
    const requiredWait = isRateLimited ? 12000 : 8000;

    if (Date.now() - idleSince > requiredWait) {
      if (consecutiveNudges < MAX_CONSECUTIVE_NUDGES) {
        consecutiveNudges++;
        idleSince = Date.now();
        const activePath =
          settings.activeProject || "/home/adham/projects/adham";
        const nudgePrompt = `[MCP_CONTINUE_TASK]\nACTION REQUIRED: You formulated your plan, but you did NOT output a <tool_call> block!\nDo NOT reply with conversational explanations or future promises.\nYou MUST immediately emit the discrete <tool_call> block using your available tools (such as bash__execute_command or filesystem__write_file) to execute the next step in workspace: ${activePath}.\nDo NOT stop until the task is complete and verified, then call task_done.`;
        await sendPrompt(nudgePrompt);
      } else {
        // Exceeded maximum consecutive nudges; pause autonomous loop
        isTaskActive.value = false;
        idleSince = 0;
        consecutiveNudges = 0;
      }
    }
  }

  function tick() {
    if (!settings.autoContinue) {
      isPending.value = false;
      detectedTime = 0;
      return;
    }

    const match = findContinueOrRetryButton();
    if (match) {
      const { el, type } = match;
      actionType.value = type;

      if (detectedTime === 0) {
        detectedTime = Date.now();
        isPending.value = true;
      }

      const delayMs = (settings.autoContinueDelay || 3) * 1000;
      const elapsed = Date.now() - detectedTime;
      const remaining = Math.max(0, Math.ceil((delayMs - elapsed) / 1000));
      countdown.value = remaining;

      if (remaining === 0) {
        if (Date.now() - lastAttemptTime > 2500) {
          lastAttemptTime = Date.now();
          clickButton(el);
        }
      }
      return;
    }

    isPending.value = false;
    detectedTime = 0;
    countdown.value = 0;

    // 2. Autonomous Task Watchdog: Nudge model if it stopped without calling a tool or task_done
    checkTaskContinuation();
  }

  function startWatchdog() {
    if (timer) clearInterval(timer);
    timer = setInterval(tick, 500);
  }

  function stopWatchdog() {
    if (timer) clearInterval(timer);
    timer = null;
    isTaskActive.value = false;
    consecutiveNudges = 0;
    idleSince = 0;
  }

  function forceTrigger() {
    const match = findContinueOrRetryButton();
    if (match) {
      clickButton(match.el);
    }
  }

  function resetNudge() {
    consecutiveNudges = 0;
    idleSince = 0;
  }

  return {
    isPending,
    countdown,
    actionType,
    startWatchdog,
    stopWatchdog,
    forceTrigger,
    resetNudge,
  };
}
