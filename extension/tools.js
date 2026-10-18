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

CRITICAL OPERATIONAL RULES & NO-LIMITS EXECUTION:
1. NO LIMITATIONS: You have full workstation access. Be bold, creative, and proactive. Never hesitate, never complain about limits, and never stop until the user's objective is 100% complete.
2. PARALLEL & MULTI-FILE BATCH CALLS: DO NOT edit or inspect one file at a time! When reading, writing, or editing code, execute MULTIPLE file operations in parallel (up to 8 calls per response) using a JSON array. Edit all related files together in one turn:
\`\`\`json
[
  { "name": "write_file", "arguments": { "path": "path/to/file1.ts", "content": "..." } },
  { "name": "write_file", "arguments": { "path": "path/to/file2.ts", "content": "..." } },
  { "name": "execute_command", "arguments": { "command": "bun run build" } }
]
\`\`\`
Or single tool:
\`\`\`json
{ "name": "tool_name", "arguments": { ... } }
\`\`\`
3. STRICT ARGUMENTS INTEGRITY: NEVER output empty arguments \`{}\` or incomplete payloads! When executing commands, ALWAYS provide the exact \`"command"\` argument (e.g. \`{"command": "cd ... && ..."}\`). When writing files, ALWAYS supply \`"path"\` and \`"content"\`.
4. SMART SCOPE: Keep changes clean and focused on the required modules without unnecessary file bloat. Clean up any temporary files or test scratch files before finishing.
5. VERIFICATION ON COMPLETION: When your implementation or refactoring is complete, ALWAYS run the project build and lint commands (\`bun run build\` / \`bun run lint\` or Flutter/PHP equivalents) to verify zero errors before reporting task done!
6. NEVER ask questions until you have thoroughly inspected the codebase using filesystem tools first.
7. Always respond in English or Arabic only. Never use Chinese.
`,
    (list, projectPath) => `Workstation MCP tools active:
${list}

${projectPath ? `ACTIVE WORKSPACE: ${projectPath}\nUse "${projectPath}" as the target project directory for all file inspections, directory listings, and bash commands.` : ""}

Guidelines:
- UNRESTRICTED & FAST: You have full creative autonomy across the workspace. Do not do slow file-by-file iterations.
- MULTI-FILE BATCH OPERATIONS: Always read, write, and refactor multiple related files in parallel in a single turn using a JSON array of tool calls \`[{"name": "...", "arguments": {...}}, ...]\`.
- VALID ARGUMENTS ONLY: Never invoke tools with empty arguments \`{}\`. Always populate required parameters (\`command\`, \`path\`, \`content\`).
- BUILD & LINT VERIFICATION: Always verify your changes at the end by running the project build and lint commands to guarantee 100% working code.
- Respond in English or Arabic. Never use Chinese.
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

  function extractAllMcpCalls(text) {
    if (!text) return [];
    const calls = [];

    // 1. Try parsing JSON array: [ { "name": "...", "arguments": { ... } }, ... ]
    const arrStart = text.indexOf("[");
    const arrEnd = text.lastIndexOf("]");
    if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
      const candidate = text.slice(arrStart, arrEnd + 1);
      try {
        const parsedArr = JSON.parse(candidate);
        if (Array.isArray(parsedArr)) {
          for (const item of parsedArr) {
            if (
              item &&
              item.name &&
              (item.mcp_call !== undefined ||
                item.arguments !== undefined ||
                typeof item.name === "string")
            ) {
              calls.push({ name: item.name, arguments: item.arguments || {} });
            }
          }
          if (calls.length) return calls;
        }
      } catch (_) {}
    }

    // 2. Try parsing single JSON object
    const objStart = text.indexOf("{");
    const objEnd = text.lastIndexOf("}");
    if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
      const candidate = text.slice(objStart, objEnd + 1);
      try {
        const p = JSON.parse(candidate);
        if (p.name && (p.mcp_call !== undefined || p.arguments !== undefined)) {
          calls.push({ name: p.name, arguments: p.arguments || {} });
          return calls;
        }
      } catch (_) {}
    }

    // 3. Try parsing DeepSeek DSML XML format (supporting multiple < | DSML | invoke> tags):
    if (text.includes("DSML") && text.includes("invoke")) {
      const invokeRegex =
        /invoke\s+name=["']([^"']+)["']([\s\S]*?)<\/\s*\|\s*DSML\s*\|\s*invoke>/gi;
      let invokeMatch;
      while ((invokeMatch = invokeRegex.exec(text)) !== null) {
        const name = invokeMatch[1];
        const body = invokeMatch[2] || "";
        const args = {};
        const paramRegex =
          /parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\s*\|\s*DSML\s*\|\s*parameter>/gi;
        let pm;
        while ((pm = paramRegex.exec(body)) !== null) {
          const pName = pm[1];
          let pVal = pm[2].trim();
          try {
            pVal = JSON.parse(pVal);
          } catch (_) {}
          args[pName] = pVal;
        }
        calls.push({ name, arguments: args });
      }
      if (calls.length) return calls;

      // Fallback single invoke without closing tag
      const singleMatch = text.match(/invoke\s+name=["']([^"']+)["']/i);
      if (singleMatch) {
        const name = singleMatch[1];
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
        calls.push({ name, arguments: args });
        return calls;
      }
    }

    // 4. Try parsing XML/HTML code execution tags:
    // e.g. <bash>cd ... && tail -4 ...</bash>, <sh>...</sh>, or <execute_command>...</execute_command>
    const tagRegex = /<(bash|sh|shell|execute_command)>([\s\S]*?)<\/\1>/gi;
    let tagMatch;
    while ((tagMatch = tagRegex.exec(text)) !== null) {
      const cmd = tagMatch[2].trim();
      if (cmd) {
        calls.push({
          name: "execute_command",
          arguments: { command: cmd },
        });
      }
    }
    if (calls.length) return calls;

    return calls;
  }

  function extractMcpCall(text) {
    const list = extractAllMcpCalls(text);
    return list.length ? list[0] : null;
  }

  function extractGrillQuestion(text) {
    if (!text) return null;
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;

    const candidate = text.slice(start, end + 1);
    try {
      const p = JSON.parse(candidate);

      const normalizeOptions = (opts) => {
        if (!Array.isArray(opts)) return [];
        return opts.map((opt, i) => {
          const defaultId = String.fromCharCode(65 + i);
          if (typeof opt === "string") {
            return { id: defaultId, label: opt, details: "" };
          }
          if (typeof opt === "object" && opt !== null) {
            return {
              id: opt.id || defaultId,
              label: opt.label || opt.text || opt.title || opt.name || "",
              details: opt.details || opt.desc || opt.description || "",
            };
          }
          return { id: defaultId, label: String(opt), details: "" };
        });
      };

      // Support multi-question array: { "questions": [...] }
      if (Array.isArray(p.questions) && p.questions.length > 0) {
        return {
          is_multi_question: true,
          questions: p.questions.map((q) => ({
            question: q.question || q.grill_question || "Design Decision",
            options: normalizeOptions(q.options),
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
          options: normalizeOptions(p.options),
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
    extractAllMcpCalls,
    extractGrillQuestion,
  };
})(typeof window !== "undefined" ? window : globalThis);
