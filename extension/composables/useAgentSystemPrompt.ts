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

  return {
    isFirstMessageInChat,
    resetSession,
    buildFableSystemPrompt,
    preparePromptForSubmission,
  };
}
