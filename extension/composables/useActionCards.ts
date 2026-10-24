import { activeActions, settings } from "./useStudioState";
import { useBridgeWs } from "./useBridgeWs";
import { usePromptExecution } from "./usePromptExecution";
import type { ToolCallAction } from "../types";

export function useActionCards() {
  const { executeToolCall } = useBridgeWs();
  const { sendPrompt } = usePromptExecution();

  async function approveAction(action: ToolCallAction) {
    if (action.status !== "pending") return;
    action.status = "running";

    try {
      const result = await executeToolCall(action.name, action.arguments);
      action.status = "completed";
      action.result = result;

      // Feed tool result back to DeepSeek chat
      const formattedResult =
        typeof result === "object"
          ? JSON.stringify(result, null, 2)
          : String(result);
      const followUp = `[Tool Result for ${action.name}]:\n\`\`\`\n${formattedResult}\n\`\`\`\nPlease continue based on this result.`;
      await sendPrompt(followUp);
    } catch (err: any) {
      action.status = "error";
      action.error = err.message || "Execution failed";

      const errorMsg = `[Tool Error for ${action.name}]: ${action.error}\nPlease decide how to proceed or try another approach.`;
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
