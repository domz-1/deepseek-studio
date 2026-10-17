// DeepSeek MCP Studio — Tools & System Prompt Module
(function (root) {
  const SAFE_TOOLS = new Set([
    "read_file",
    "read_text_file",
    "read_media_file",
    "read_multiple_files",
    "list_directory",
    "list_directory_with_sizes",
    "directory_tree",
    "search_files",
    "get_file_info",
    "list_allowed_directories",
    "read_graph",
    "search_nodes",
    "open_nodes",
  ]);

  const SYSTEM_PROMPT_STYLES = [
    (list, projectPath) => `You have local workstation MCP tools available:
${list}

${projectPath ? `ACTIVE PROJECT WORKSPACE: ${projectPath}\nAll relative file operations and bash commands must run inside or relative to this project workspace path: "${projectPath}".` : ""}

Rules:
1. Always respond in English or Arabic only. Never use Chinese.
2. When you need to inspect files, execute commands, or perform actions, call ONE tool at a time using this exact JSON code block:
\`\`\`json
{
  "mcp_call": true,
  "name": "tool_name",
  "arguments": {}
}
\`\`\`
3. Do not stop until the user's objective is fully accomplished. Output only one tool call per turn, wait for the tool output, and then proceed with the next step autonomously.
4. CRITICAL RULE FOR ASKING QUESTIONS: NEVER ask questions or present decisions until you have THOROUGHLY inspected and read the project codebase using the filesystem/tools MCP first!
5. When asking questions/decisions, ALWAYS prefix your recommended choice with "(Recommended)", and enable multi-selection boolean (\`"multi_select": true\`) so the user can select multiple options.
`,
    (list, projectPath) => `Workstation MCP tools active:
${list}

${projectPath ? `ACTIVE WORKSPACE: ${projectPath}\nUse "${projectPath}" as the target project directory for all file inspections, directory listings, and bash commands.` : ""}

Guidelines:
- Respond in English or Arabic. Never use Chinese.
- Call tools autonomously to complete the task. Call one tool at a time using:
\`\`\`json
{"name": "tool_name", "arguments": {}}
\`\`\`
- After receiving tool results, analyze them and continue with the next tool call until the goal is fully achieved.
- CRITICAL: Never ask questions until you have read and analyzed the project code using filesystem tools first.
- When asking questions, always prefix the recommended option with "(Recommended)" and enable multi-selection (\`"multi_select": true\`).
`,
  ];

  function buildSysPrompt(tools, projectPath = "") {
    const list = (tools || [])
      .map(
        (t) =>
          `- [${t.server || "mcp"}] ${t.name}(${Object.keys(t.inputSchema?.properties || {}).join(", ")}): ${t.description?.slice(0, 80) || ""}`,
      )
      .join("\n");
    const template =
      SYSTEM_PROMPT_STYLES[
        Math.floor(Math.random() * SYSTEM_PROMPT_STYLES.length)
      ];
    return template(list, projectPath);
  }

  function filterToolsByMention(mention, tools) {
    const m = (mention || "")
      .toLowerCase()
      .replace(/^[@#/]/, "")
      .trim();
    if (m === "mcp" || m === "all" || !m) return tools;

    let filtered = tools.filter(
      (t) => t.server && t.server.toLowerCase() === m,
    );
    if (filtered.length) return filtered;

    filtered = tools.filter(
      (t) => t.server && t.server.toLowerCase().startsWith(m),
    );
    return filtered.length ? filtered : tools;
  }

  function extractMcpCall(text) {
    if (!text) return null;

    // 1. Try parsing JSON format
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const candidate = text.slice(start, end + 1);
      try {
        const p = JSON.parse(candidate);
        if (p.name && (p.mcp_call !== undefined || p.arguments !== undefined)) {
          return { name: p.name, arguments: p.arguments || {} };
        }
      } catch (_) {}
    }

    // 2. Try parsing DeepSeek DSML XML format:
    // < | DSML | calls>< | DSML | invoke name="list_directory">< | DSML | parameter name="path" string="true">...</ | DSML | parameter>...</ | DSML | invoke></ | DSML | calls>
    if (text.includes("DSML") && text.includes("invoke")) {
      const invokeMatch = text.match(/invoke\s+name=["']([^"']+)["']/i);
      if (invokeMatch) {
        const name = invokeMatch[1];
        const args = {};
        const paramRegex =
          /parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\s*\|\s*DSML\s*\|\s*parameter>/gi;
        let m;
        while ((m = paramRegex.exec(text)) !== null) {
          const pName = m[1];
          let pVal = m[2].trim();
          try {
            pVal = JSON.parse(pVal);
          } catch (_) {}
          args[pName] = pVal;
        }
        return { name, arguments: args };
      }
    }

    return null;
  }

  function extractGrillQuestion(text) {
    if (!text) return null;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;

    const candidate = text.slice(start, end + 1);
    try {
      const p = JSON.parse(candidate);

      // Support multi-question array: { "questions": [...] }
      if (Array.isArray(p.questions) && p.questions.length > 0) {
        return {
          is_multi_question: true,
          questions: p.questions.map((q) => ({
            question: q.question || q.grill_question || "Design Decision",
            options: Array.isArray(q.options) ? q.options : [],
            multi_select: Boolean(q.multi_select || q.is_multi_select),
            allow_custom: q.allow_custom !== false,
          })),
        };
      }

      // Single question format: { "grill_question": ..., "options": [...] }
      if (
        (p.grill_question || p.question) &&
        Array.isArray(p.options) &&
        p.options.length > 0
      ) {
        return {
          is_multi_question: false,
          question: p.grill_question || p.question,
          options: p.options,
          multi_select: Boolean(p.multi_select || p.is_multi_select),
          allow_custom: p.allow_custom !== false,
        };
      }
    } catch (_) {}
    return null;
  }

  root.DSTools = {
    SAFE_TOOLS,
    buildSysPrompt,
    filterToolsByMention,
    extractMcpCall,
    extractGrillQuestion,
  };
})(typeof window !== "undefined" ? window : globalThis);
