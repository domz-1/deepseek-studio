import { activeActions, settings, isTaskActive } from "./useStudioState";
import { useBridgeWs } from "./useBridgeWs";
import { usePromptExecution } from "./usePromptExecution";
import { useChatProjects } from "./useChatProjects";
import { useDeepSeekDom } from "./useDeepSeekDom";
import type { ToolCallAction } from "../types";

export function useActionCards() {
  const { executeToolCall } = useBridgeWs();
  const { sendPrompt } = usePromptExecution();
  const { markChatDone } = useChatProjects();
  const { isGenerating } = useDeepSeekDom();

  let batchTimer: any = null;
  let isFlushingBatch = false;

  async function checkAndFlushBatch() {
    if (isFlushingBatch) return;

    // 1. If DeepSeek is still generating tokens/text, wait for completion
    if (isGenerating()) {
      scheduleBatchCheck(800);
      return;
    }

    // 2. Check if any actions are still pending or executing
    const hasRunning = activeActions.value.some(
      (a) => a.status === "running" || a.status === "pending",
    );
    if (hasRunning) {
      scheduleBatchCheck(400);
      return;
    }

    // 3. Gather all unsent completed or errored actions
    const unsentActions = activeActions.value.filter(
      (a) =>
        (a.status === "completed" || a.status === "error") && !(a as any).sent,
    );

    if (unsentActions.length === 0) return;

    // 4. Check if task_done was called
    const taskDoneAction = unsentActions.find(
      (a) =>
        a.name === "task_done" ||
        a.name === "bridge_task_done" ||
        a.name === "complete_task" ||
        a.result?.task_done,
    );

    if (taskDoneAction) {
      isTaskActive.value = false;
      unsentActions.forEach((a) => ((a as any).sent = true));
      const summary =
        taskDoneAction.arguments?.summary ||
        taskDoneAction.result?.summary ||
        "Task successfully completed";
      await markChatDone(undefined, summary);
      return;
    }

    // 5. Ensure model is completely settled before sending batch
    await new Promise((r) => setTimeout(r, 1200));
    if (isGenerating()) {
      scheduleBatchCheck(800);
      return;
    }

    isFlushingBatch = true;
    try {
      const blocks = unsentActions.map((act) => {
        (act as any).sent = true;
        if (act.status === "completed") {
          const formatted =
            typeof act.result === "object"
              ? JSON.stringify(act.result, null, 2)
              : String(act.result);
          return `<tool_result>\n<tool_name>${act.name}</tool_name>\n<result>\n${formatted}\n</result>\n</tool_result>`;
        } else {
          return `<tool_result>\n<tool_name>${act.name}</tool_name>\n<error>\n${act.error || "Execution failed"}\n</error>\n</tool_result>`;
        }
      });

      isTaskActive.value = true;
      const combinedPrompt = `[MCP_AUTO_RESULT]\n${blocks.join(
        "\n\n",
      )}\n\nReview these results and continue executing the task autonomously using your available tools. Do not stop until the task is completely finished, verified, and you call <tool_call><tool_name>task_done</tool_name><parameters>{"summary":"...","status":"completed"}</parameters></tool_call>.`;
      await sendPrompt(combinedPrompt);
    } finally {
      isFlushingBatch = false;
    }
  }

  function scheduleBatchCheck(delay = 400) {
    if (batchTimer) clearTimeout(batchTimer);
    batchTimer = setTimeout(checkAndFlushBatch, delay);
  }

  async function approveAction(action: ToolCallAction) {
    if (action.status !== "pending") return;
    action.status = "running";

    try {
      const result = await executeToolCall(action.name, action.arguments);
      action.status = "completed";
      action.result = result;
    } catch (err: any) {
      action.status = "error";
      action.error = err.message || "Execution failed";
    } finally {
      scheduleBatchCheck();
    }
  }

  function rejectAction(action: ToolCallAction) {
    if (action.status !== "pending") return;
    action.status = "rejected";
    (action as any).sent = true;

    const rejectionMsg = `[Tool Action Skipped for ${action.name}]. Please explain next steps or continue without this tool.`;
    sendPrompt(rejectionMsg);
  }

  function registerActions(newActions: ToolCallAction[]) {
    for (const act of newActions) {
      const alreadyHandled = activeActions.value.some(
        (a) =>
          a.id === act.id ||
          (a.name === act.name &&
            JSON.stringify(a.arguments) === JSON.stringify(act.arguments) &&
            (a.status === "pending" ||
              a.status === "running" ||
              (a as any).sent)),
      );
      if (!alreadyHandled) {
        activeActions.value.push(act);
        approveAction(act);
      }
    }
  }

  return {
    approveAction,
    rejectAction,
    registerActions,
  };
}
