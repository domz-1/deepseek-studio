import { tools, settings } from "./useStudioState";
import { useProjects } from "./useProjects";
import { useSkills } from "./useSkills";

let sessionPromptInjected = false;

const VERIFIED_DEFAULT_TOOLS = `
- filesystem__list_directory: { "path": "string" } - List files and directories in path
- filesystem__read_file: { "path": "string" } - Read complete file content
- filesystem__write_file: { "path": "string", "content": "string" } - Write or overwrite a file
- filesystem__edit_file: { "path": "string", "edits": [{"oldText": "string", "newText": "string"}] } - Atomic file editing
- filesystem__create_directory: { "path": "string" } - Create directory
- filesystem__directory_tree: { "path": "string" } - Recursive directory tree
- filesystem__search_files: { "path": "string", "pattern": "string" } - Search for files matching pattern
- filesystem__get_file_info: { "path": "string" } - File metadata
- bash__execute_command: { "command": "string" } - Run bash shell commands
- bash__hot_check: { "cwd": "string" } - Fast typecheck or test runner
- chrome__navigate_page: { "url": "string" } - Navigate browser
- chrome__click: { "selector": "string" } - Click webpage element
- chrome__take_screenshot: {} - Capture browser screenshot
- memory__create_entities: { "entities": [...] } - Store knowledge graph nodes
- task_done: { "summary": "string", "status": "completed" } - Signal entire task is finished and verified
`.trim();

export function useAgentSystemPrompt() {
  const { activeProjectName } = useProjects();
  const { findSkillByTrigger } = useSkills();

  function isFirstMessageInChat(): boolean {
    const mdBlocks = document.querySelectorAll("div.ds-markdown");
    return mdBlocks.length === 0;
  }

  function resetSession() {
    sessionPromptInjected = false;
  }

  function expandMentionsAndSkills(rawText: string): string {
    const activePath = settings.activeProject || "/home/adham/projects/adham";
    let extraContext = "";

    // 1. Expand @server mentions (@filesystem, @bash, @chrome, @memory, @all)
    const mentionMatches = rawText.match(/@([a-zA-Z0-9_-]+)/g);
    if (mentionMatches) {
      const seenServers = new Set<string>();
      for (const m of mentionMatches) {
        const sName = m.slice(1).toLowerCase().replace(/_/g, "");
        if (seenServers.has(sName)) continue;
        seenServers.add(sName);

        if (sName === "filesystem" || sName === "fs") {
          extraContext += `\n<mcp_context server="filesystem">
The user explicitly invoked the @filesystem MCP server.
Active Project Root: ${activePath}
Available Filesystem Tools:
- filesystem__list_directory: { "path": "${activePath}" } - List files and directories in path
- filesystem__read_file: { "path": "string" } - Read complete file content
- filesystem__write_file: { "path": "string", "content": "string" } - Write or overwrite a file
- filesystem__edit_file: { "path": "string", "edits": [{"oldText": "string", "newText": "string"}] } - Edit file atomically
- filesystem__create_directory: { "path": "string" } - Create directory
- filesystem__directory_tree: { "path": "string" } - Directory hierarchy
- filesystem__search_files: { "path": "string", "pattern": "string" } - Find files
- filesystem__get_file_info: { "path": "string" } - File metadata
To execute any tool, output:
<tool_call>
<tool_name>filesystem__tool_name</tool_name>
<parameters>
{ ... }
</parameters>
</tool_call>
</mcp_context>\n`;
        } else if (sName === "bash" || sName === "sh" || sName === "cmd") {
          extraContext += `\n<mcp_context server="bash">
The user explicitly invoked the @bash MCP server.
Working Directory: ${activePath}
Available Bash Tools:
- bash__execute_command: { "command": "string" } - Execute shell command
- bash__hot_check: { "cwd": "${activePath}" } - Run typecheck or tests
To execute bash, output:
<tool_call>
<tool_name>bash__execute_command</tool_name>
<parameters>
{ "command": "command_to_run" }
</parameters>
</tool_call>
</mcp_context>\n`;
        } else if (sName === "chrome" || sName === "browser") {
          extraContext += `\n<mcp_context server="chrome">
The user explicitly invoked the @chrome MCP server for browser automation.
Available Chrome Tools:
- chrome__navigate_page: { "url": "string" }
- chrome__click: { "selector": "string" }
- chrome__type_text: { "selector": "string", "text": "string" }
- chrome__take_screenshot: {}
- chrome__list_pages: {}
</mcp_context>\n`;
        } else if (sName === "memory") {
          extraContext += `\n<mcp_context server="memory">
The user explicitly invoked the @memory MCP server.
- memory__create_entities: { "entities": [...] }
- memory__read_graph: {}
- memory__search_nodes: { "query": "string" }
</mcp_context>\n`;
        } else if (sName === "all") {
          const allToolsList = tools.value
            .map(
              (t) =>
                `- ${t.server ? `${t.server}__${t.name}` : t.name}: ${
                  t.description || "MCP tool"
                }`,
            )
            .join("\n");
          extraContext += `\n<mcp_context server="all">
Available Tools:
${allToolsList || VERIFIED_DEFAULT_TOOLS}
</mcp_context>\n`;
        }
      }
    }

    // 2. Expand /skill mentions
    const slashMatches = rawText.match(/\/([a-zA-Z0-9_-]+)/g);
    if (slashMatches) {
      for (const sm of slashMatches) {
        const skillName = sm.slice(1);
        const skill = findSkillByTrigger(skillName);
        if (skill) {
          extraContext += `\n<skill_instructions skill="${skill.name}">
## Skill: ${skill.name}
${skill.description ? `${skill.description}\n\n` : ""}${skill.content || ""}
</skill_instructions>\n`;
        }
      }
    }

    return extraContext ? `${extraContext}\n${rawText}` : rawText;
  }

  function buildFableSystemPrompt(): string {
    const activePath = settings.activeProject || "/home/adham/projects/adham";
    const toolCatalog =
      tools.value.length > 0
        ? tools.value
            .slice(0, 60)
            .map(
              (t) =>
                `- ${t.server ? `${t.server}__${t.name}` : t.name}: ${
                  t.description || "MCP tool"
                }`,
            )
            .join("\n")
        : VERIFIED_DEFAULT_TOOLS;

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
${toolCatalog}
</agent_system_instructions>`;
  }

  function preparePromptForSubmission(rawText: string): string {
    const expanded = expandMentionsAndSkills(rawText);
    const isNew = isFirstMessageInChat() && !sessionPromptInjected;
    if (isNew) {
      sessionPromptInjected = true;
      return `${buildFableSystemPrompt()}\n\n${expanded}`;
    }
    return expanded;
  }

  function injectIntoTextarea(input: HTMLTextAreaElement) {
    if (!input || !input.value || !input.value.trim()) return;
    if (input.value.includes("<agent_system_instructions>")) return;

    let modified = expandMentionsAndSkills(input.value);

    if (isFirstMessageInChat()) {
      modified = `${buildFableSystemPrompt()}\n\n${modified}`;
      sessionPromptInjected = true;
    }

    if (modified !== input.value) {
      const proto = Object.getPrototypeOf(input);
      const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(input, modified);
      } else {
        input.value = modified;
      }
      input.dispatchEvent(new Event("input", { bubbles: true }));
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
