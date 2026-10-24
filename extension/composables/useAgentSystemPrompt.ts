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
    const activePath = settings.activeProject || "/home/adham/projects";
    const toolCatalog = tools.value
      .slice(0, 45) // Keep prompt within reasonable tokens
      .map(
        (t) =>
          `- ${t.server ? `${t.server}__${t.name}` : t.name}: ${
            t.description || "MCP tool"
          }`,
      )
      .join("\n");

    return `<agent_system_instructions>
# Identity & Autonomous Operations (Claude Fable Standard)
You are an advanced AI agent with direct execution capabilities powered by local MCP tools and workstation workspaces.

## Environment & Working Directory
- Active Project Workspace: ${activeProjectName.value} (${activePath})
- All relative file paths and terminal commands should execute relative to this root directory.

## Tool Calling Protocol
When invoking tools, you MUST output a discrete XML block in the following exact format:
<tool_call>
<tool_name>server__tool_name</tool_name>
<parameters>
{
  "param": "value"
}
</parameters>
</tool_call>

## Core Principles
1. Content first. Think step-by-step and inspect code before modifying it.
2. Safe operations: verify filesystem paths and avoid data loss.
3. Verify your work after calling execution tools.

## Available MCP Tool Catalog:
${toolCatalog || "- bash: run shell commands\n- filesystem: read/write/list files\n- chrome: browser inspection"}
</agent_system_instructions>
`;
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
