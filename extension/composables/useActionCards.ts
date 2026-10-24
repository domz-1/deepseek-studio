import { activeActions, settings } from "./useStudioState";
import { useBridgeWs } from "./useBridgeWs";
import { usePromptExecution } from "./usePromptExecution";
import { useChatProjects } from "./useChatProjects";
import type { ToolCallAction } from "../types";

export function useActionCards() {
  const { executeToolCall } = useBridgeWs();
  const { sendPrompt } = usePromptExecution();
  const { markChatDone } = useChatProjects();

  async function approveAction(action: ToolCallAction) {
    if (action.status !== "pending") return;
    action.status = "running";

    try {
      const result = await executeToolCall(action.name, action.arguments);
      action.status = "completed";
      action.result = result;

      // Check if this tool invocation signals task completion
      const isTaskDone =
        action.name === "task_done" ||
        action.name === "bridge_task_done" ||
        action.name === "complete_task" ||
        result?.task_done;

      if (isTaskDone) {
        const summary =
          action.arguments?.summary ||
          result?.summary ||
          "Task successfully completed";
        await markChatDone(undefined, summary);
        // Do not continue auto-prompting; task is done!
        return;
      }

      // Format autonomous tool result back into DeepSeek chat
      const formattedResult =
        typeof result === "object"
          ? JSON.stringify(result, null, 2)
          : String(result);
      const followUp = `<tool_result>\n<tool_name>${action.name}</tool_name>\n<result>\n${formattedResult}\n</result>\n</tool_result>\n\nPlease review this result and continue autonomously until you call task_done.`;
      await sendPrompt(followUp);
    } catch (err: any) {
      action.status = "error";
      action.error = err.message || "Execution failed";

      const errorMsg = `<tool_result>\n<tool_name>${action.name}</tool_name>\n<error>\n${action.error}\n</error>\n</tool_result>\n\nPlease adjust your approach or try another command.`;
      await sendPrompt(errorMsg);
    }
  }

  function rejectAction(action: ToolCallAction) {
    if (action.status !== "pending") return;
    action.status = "rejected";

    const rejectionMsg = `[Tool Action Rejected by User for ${action.name}]. Please explain next steps or continue without this tool.`;
    sendPrompt(rejectionMsg);
  }

  function registerActions(newActions: ToolCallAction[]) {
    for (const act of newActions) {
      const exists = activeActions.value.some(
        (a) =>
          a.name === act.name &&
          JSON.stringify(a.arguments) === JSON.stringify(act.arguments),
      );
      if (!exists) {
        activeActions.value.push(act);
        if (settings.autoApprove) {
          approveAction(act);
        }
      }
    }
  }

  return {
    approveAction,
    rejectAction,
    registerActions,
  };
}
