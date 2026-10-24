import { tools, settings, isTaskActive } from "./useStudioState";
import { useProjects } from "./useProjects";
import { useSkills } from "./useSkills";

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

  function buildFableSystemPrompt(): string {
    const activePath = settings.activeProject || "/home/adham/projects/adham";
    const toolCatalog =
      tools.value.length > 0
        ? tools.value
            .slice(0, 50)
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
- NEVER state that you will execute a tool or command in text without actually outputting the <tool_call> block!
- Continue calling tools autonomously step-by-step until the task is complete.
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

  function expandMentionsAndSkills(rawText: string): string {
    const activePath = settings.activeProject || "/home/adham/projects/adham";
    let extraContext = "";

    const mentionMatches = rawText.match(/@([a-zA-Z0-9_-]+)/g);
    if (mentionMatches) {
      const seen = new Set<string>();
      for (const m of mentionMatches) {
        const sName = m.slice(1).toLowerCase().replace(/_/g, "");
        if (seen.has(sName)) continue;
        seen.add(sName);

        if (sName === "filesystem" || sName === "fs") {
          extraContext += `\n<mcp_context server="filesystem">\nActive Project Root: ${activePath}\nAvailable: list_directory, read_file, write_file, edit_file, create_directory, directory_tree, search_files, get_file_info\n</mcp_context>\n`;
        } else if (sName === "bash" || sName === "sh" || sName === "cmd") {
          extraContext += `\n<mcp_context server="bash">\nWorking Directory: ${activePath}\nAvailable: bash__execute_command: { "command": "string" }, bash__hot_check: { "cwd": "${activePath}" }\n</mcp_context>\n`;
        } else if (sName === "chrome" || sName === "browser") {
          extraContext += `\n<mcp_context server="chrome">\nAvailable: chrome__navigate_page, chrome__click, chrome__type_text, chrome__take_screenshot, chrome__list_pages\n</mcp_context>\n`;
        } else if (sName === "memory") {
          extraContext += `\n<mcp_context server="memory">\nAvailable: memory__create_entities, memory__read_graph, memory__search_nodes\n</mcp_context>\n`;
        }
      }
    }

    const slashMatches = rawText.match(/\/([a-zA-Z0-9_-]+)/g);
    if (slashMatches) {
      for (const sm of slashMatches) {
        const skill = findSkillByTrigger(sm.slice(1));
        if (skill) {
          extraContext += `\n<skill_instructions skill="${skill.name}">\n## Skill: ${skill.name}\n${skill.description ? `${skill.description}\n\n` : ""}${skill.content || ""}\n</skill_instructions>\n`;
        }
      }
    }

    return extraContext ? `${extraContext}\n${rawText}` : rawText;
  }

  function preparePromptForSubmission(rawText: string): string {
    if (
      rawText.startsWith("[MCP_AUTO_RESULT]") ||
      rawText.startsWith("[MCP_CONTINUE_TASK]")
    ) {
      return rawText;
    }
    const expanded = expandMentionsAndSkills(rawText);
    isTaskActive.value = true;
    if (expanded.includes("<agent_system_instructions>")) {
      return expanded;
    }
    return `${buildFableSystemPrompt()}\n\n${expanded}`;
  }

  function injectIntoTextarea(input: HTMLTextAreaElement) {
    if (!input || !input.value || !input.value.trim()) return;
    if (input.value.includes("<agent_system_instructions>")) {
      isTaskActive.value = true;
      return;
    }

    let modified = expandMentionsAndSkills(input.value);
    modified = `${buildFableSystemPrompt()}\n\n${modified}`;
    isTaskActive.value = true;

    const proto = Object.getPrototypeOf(input);
    const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(input, modified);
    } else {
      input.value = modified;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function initPromptAutoInjection(
    getChatInput: () => HTMLTextAreaElement | null,
    getSendButton: () => HTMLElement | null,
  ) {
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
    buildFableSystemPrompt,
    preparePromptForSubmission,
    injectIntoTextarea,
    initPromptAutoInjection,
  };
}
