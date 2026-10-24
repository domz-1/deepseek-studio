import { tools, settings } from "./useStudioState";
import { useProjects } from "./useProjects";

let sessionPromptInjected = false;

export function useAgentSystemPrompt() {
  const { activeProjectName } = useProjects();

  function isFirstMessageInChat(): boolean {
    const mdBlocks = document.querySelectorAll("div.ds-markdown");
    return mdBlocks.length === 0;
  }

  function resetSession() {
    sessionPromptInjected = false;
  }

  function buildFableSystemPrompt(): string {
    const activePath = settings.activeProject || "/home/adham/projects/adham";
    const toolCatalog = tools.value
      .slice(0, 50)
      .map(
        (t) =>
          `- ${t.server ? `${t.server}__${t.name}` : t.name}: ${
            t.description || "MCP tool"
          }`,
      )
      .join("\n");

    return `<antml:reasoning_effort>40</antml:reasoning_effort>
<agent_system_instructions>
# Claude Fable 5 Agent Persona & Operating Guidelines
You are an expert autonomous software engineer and operational agent running in the DeepSeek Studio environment.
You operate with relentless precision, deep architectural thinking, and proactive problem solving.

## Environment & Working Directory
- Active Project Workspace: ${activeProjectName.value}
- Workspace Root: ${activePath}
- All relative file paths, bash commands, and scripts MUST execute within this workspace root.

## Skills Protocol
Before modifying code or executing unfamiliar tasks, check for relevant skills in the repository or skills library.
Look for a \`SKILL.md\` file in each skill folder and inspect it thoroughly before taking action.

## Autonomous Tool Execution Protocol
When invoking tools, you MUST output a discrete XML block in the following exact format:
<tool_call>
<tool_name>tool_name</tool_name>
<parameters>
{
  "param": "value"
}
</parameters>
</tool_call>

## Task Completion Protocol
- Work autonomously step-by-step.
- Verify your code and changes after running commands or writing files.
- When the user's task or goal is completely resolved and verified, you MUST call the \`task_done\` tool:
<tool_call>
<tool_name>task_done</tool_name>
<parameters>
{
  "summary": "Executive summary of what was completed and verified",
  "status": "completed"
}
</parameters>
</tool_call>
Calling \`task_done\` informs the user and marks this chat task as successfully completed.

## Available MCP Tool Catalog:
- task_done: Signals that the entire task or goal is complete and verified. Provide an executive summary.
${toolCatalog || "- bash: run shell commands\n- filesystem: read/write/list files\n- chrome: inspect browser pages"}
</agent_system_instructions>`;
  }

  function preparePromptForSubmission(rawText: string): string {
    const isNew = isFirstMessageInChat() && !sessionPromptInjected;
    if (isNew) {
      sessionPromptInjected = true;
      return `${buildFableSystemPrompt()}\n\n${rawText}`;
    }
    return rawText;
  }

  function injectIntoTextarea(input: HTMLTextAreaElement) {
    if (!input || !input.value || !input.value.trim()) return;
    if (input.value.includes("<agent_system_instructions>")) return;

    if (isFirstMessageInChat()) {
      const full = `${buildFableSystemPrompt()}\n\n${input.value}`;
      const proto = Object.getPrototypeOf(input);
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(input, full);
      } else {
        input.value = full;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
      sessionPromptInjected = true;
    }
  }

  function initPromptAutoInjection(
    getChatInput: () => HTMLTextAreaElement | null,
    getSendButton: () => HTMLElement | null,
  ) {
    // Intercept Enter key press on chat textarea
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

    // Intercept Send button click/pointerdown
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
    window.addEventListener("click", onSendClick, true);
  }

  return {
    isFirstMessageInChat,
    resetSession,
    buildFableSystemPrompt,
    preparePromptForSubmission,
    injectIntoTextarea,
    initPromptAutoInjection,
  };
}
