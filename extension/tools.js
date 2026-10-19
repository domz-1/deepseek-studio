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

CRITICAL OPERATIONAL RULES & HIGH-SPEED EXECUTION:
1. MAXIMUM SPEED & ZERO CHATTER: DO NOT output conversational filler, pre-tool monologue, or commentary (e.g. do NOT say "I will check the directory now" or "Let me inspect the file"). Immediately output the required tool call JSON. Less chat means 5x faster speed!
2. MULTI-FILE PARALLEL BATCHING: NEVER inspect or modify files one by one! Always execute MULTIPLE related operations in parallel using a JSON array in a single turn (up to 8 calls):
\`\`\`json
[
  { "name": "read_file", "arguments": { "path": "src/index.ts" } },
  { "name": "read_file", "arguments": { "path": "package.json" } },
  { "name": "execute_command", "arguments": { "command": "git status" } }
]
\`\`\`
Or single tool:
\`\`\`json
{ "name": "tool_name", "arguments": { ... } }
\`\`\`
3. STRICT JSON MCP FORMAT — NEVER OUTPUT RAW DSML TAGS:
Always emit tool calls in clean fenced \`\`\`json blocks.
4. STRICT ARGUMENTS INTEGRITY: ALWAYS populate required arguments (\`command\`, \`path\`, \`content\`). Never leave empty \`{}\`.
5. SMART VERIFICATION: When implementation is finished, run project verification (\`bun run build\` or \`bun run test\`) in the same turn before declaring task complete.
6. NO CHINESE: Respond in English or Arabic only.
`,
    (list, projectPath) => `Workstation MCP tools active:
${list}

${projectPath ? `ACTIVE WORKSPACE: ${projectPath}\nUse "${projectPath}" as the target project directory for all file inspections, directory listings, and bash commands.` : ""}

High-Speed Guidelines:
- ZERO PREAMBLE: Do not write conversational text or introductions before tools. Output tool calls immediately.
- AGGRESSIVE PARALLEL BATCHING: Bundle all reading, editing, and execution steps into a single JSON array of tool calls \`[{"name": "...", "arguments": {...}}, ...]\` to finish tasks in 1 or 2 turns instead of 10.
- STRICT ARGUMENTS: Always provide complete arguments (\`command\`, \`path\`, \`content\`).
- BUILD & VERIFY: Always verify your code changes before concluding.
- LANGUAGE: Respond in English or Arabic only. Never use Chinese.
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

    // 1. Try finding all JSON blocks (both arrays and objects):
    const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
    let blockMatch;
    while ((blockMatch = jsonBlockRegex.exec(text)) !== null) {
      const code = blockMatch[1].trim();
      if (!code) continue;
      try {
        const parsed = JSON.parse(code);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.name && typeof item.name === "string") {
              calls.push({ name: item.name, arguments: item.arguments || {} });
            }
          }
        } else if (parsed && parsed.name && typeof parsed.name === "string") {
          calls.push({ name: parsed.name, arguments: parsed.arguments || {} });
        }
      } catch (_) {}
    }
    if (calls.length) return calls;

    // 1b. Fallback: Try parsing raw JSON array in text
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

    // 2. Try parsing single or multiple JSON objects with regex (e.g. {"name": "...", "arguments": {...}})
    // Also handles cases where JSON is directly in the text without markdown blocks or XML wrappers:
    const directObjRegex =
      /\{\s*"name"\s*:\s*"([^"]+)"\s*,\s*"arguments"\s*:\s*(\{[\s\S]*?\})\s*\}/g;
    let directMatch;
    while ((directMatch = directObjRegex.exec(text)) !== null) {
      try {
        const name = directMatch[1].trim();
        const args = JSON.parse(directMatch[2]);
        if (name) {
          calls.push({ name, arguments: args || {} });
        }
      } catch (_) {}
    }
    if (calls.length) return calls;

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

    // 3. Try parsing DeepSeek DSML XML format (supporting both standard | and fullwidth ｜ pipes):
    if (
      (text.includes("DSML") || text.includes("\uff5c\uff5cDSML")) &&
      text.includes("invoke")
    ) {
      const normText = text.replace(/[\uff5c|]+/g, "|");
      const invokeRegex =
        /invoke\s+name=["']([^"']+)["']([\s\S]*?)<\/\s*\|\s*DSML\s*\|\s*invoke>/gi;
      let invokeMatch;
      while ((invokeMatch = invokeRegex.exec(normText)) !== null) {
        let name = invokeMatch[1].trim();
        const body = invokeMatch[2] || "";
        const args = {};
        const paramRegex =
          /parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\s*\|\s*DSML\s*\|\s*parameter>/gi;
        let pm;
        while ((pm = paramRegex.exec(body)) !== null) {
          const pName = pm[1].trim();
          let pVal = pm[2].trim();
          try {
            pVal = JSON.parse(pVal);
          } catch (_) {}
          args[pName] = pVal;
        }

        // Translate model confusion when it passes server name as invoke name:
        if ((name === "filesystem" || name === "fs") && args.command) {
          name = args.command;
          delete args.command;
        }
        if (name === "bash" && !args.command && args.cmd) {
          args.command = args.cmd;
        }

        calls.push({ name, arguments: args });
      }
      if (calls.length) return calls;

      // Fallback single invoke without closing tag
      const singleMatch = normText.match(/invoke\s+name=["']([^"']+)["']/i);
      if (singleMatch) {
        let name = singleMatch[1].trim();
        const args = {};
        const paramRegex =
          /parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/\s*\|\s*DSML\s*\|\s*parameter>/gi;
        let m;
        while ((m = paramRegex.exec(normText)) !== null) {
          const pName = m[1].trim();
          let pVal = m[2].trim();
          try {
            pVal = JSON.parse(pVal);
          } catch (_) {}
          args[pName] = pVal;
        }

        if ((name === "filesystem" || name === "fs") && args.command) {
          name = args.command;
          delete args.command;
        }

        calls.push({ name, arguments: args });
        return calls;
      }
    }

    // 4. Try parsing ANY custom XML/HTML tag wrapper (e.g. <tool_call>, <function_call>, <custom_tag>, <write_file>, <anything>):
    const anyTagRegex =
      /<([a-zA-Z0-9_\-\.:\|]+)(?:\s+[^>]*)?>([\s\S]*?)<\/\1>/gi;
    let gtMatch;
    const standardHtmlTags = new Set([
      "b",
      "i",
      "u",
      "strong",
      "em",
      "p",
      "div",
      "span",
      "code",
      "pre",
      "a",
      "li",
      "ul",
      "ol",
      "table",
      "tr",
      "td",
      "th",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "blockquote",
      "hr",
      "br",
      "img",
      "style",
      "script",
      "head",
      "body",
      "html",
    ]);

    while ((gtMatch = anyTagRegex.exec(text)) !== null) {
      const rawTag = gtMatch[1];
      const tagName = rawTag.toLowerCase().replace(/^[|]+|[|]+$/g, "");
      const body = gtMatch[2].trim();
      const tagOpening = gtMatch[0].slice(0, gtMatch[0].indexOf(">") + 1);

      if (standardHtmlTags.has(tagName)) continue;

      // Check if body is JSON (object or array)
      try {
        const parsed = JSON.parse(body);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item && item.name) {
              calls.push({ name: item.name, arguments: item.arguments || {} });
            }
          }
        } else if (parsed && parsed.name) {
          calls.push({ name: parsed.name, arguments: parsed.arguments || {} });
        }
      } catch (_) {
        // Body might have inner JSON block or raw JSON object
        const innerJsonMatch = body.match(/\{[\s\S]*\}/);
        if (innerJsonMatch) {
          try {
            const innerParsed = JSON.parse(innerJsonMatch[0]);
            if (innerParsed && innerParsed.name) {
              calls.push({
                name: innerParsed.name,
                arguments: innerParsed.arguments || {},
              });
            }
          } catch (e) {}
        }

        if (calls.length) continue;

        // Body might have XML parameters: <parameter name="...">...</parameter> or <param name="...">...</param>
        const xmlParamRegex =
          /<(?:parameter|param)\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:parameter|param)>/gi;
        let pMatch;
        const xmlArgs = {};
        let hadXmlArgs = false;
        while ((pMatch = xmlParamRegex.exec(body)) !== null) {
          hadXmlArgs = true;
          const pName = pMatch[1].trim();
          let pVal = pMatch[2].trim();
          try {
            pVal = JSON.parse(pVal);
          } catch (_) {}
          xmlArgs[pName] = pVal;
        }

        // Subtags like <path>...</path>, <content>...</content>
        if (!hadXmlArgs) {
          const subTagRegex = /<([a-zA-Z0-9_\-]+)>([\s\S]*?)<\/\1>/gi;
          let sm;
          while ((sm = subTagRegex.exec(body)) !== null) {
            hadXmlArgs = true;
            const pName = sm[1].trim();
            let pVal = sm[2].trim();
            try {
              pVal = JSON.parse(pVal);
            } catch (_) {}
            xmlArgs[pName] = pVal;
          }
        }

        // Check if tag itself or body specifies tool name:
        let name = "";
        const nameAttrMatch =
          tagOpening.match(/name=["']([^"']+)["']/i) ||
          body.match(/name=["']([^"']+)["']/i) ||
          body.match(/<tool_name>([^<]+)<\/tool_name>/i);
        if (nameAttrMatch) {
          name = nameAttrMatch[1].trim();
        } else if (
          ![
            "tool_call",
            "tool_calls",
            "function_call",
            "function_calls",
            "call",
            "calls",
            "invoke",
            "invokes",
            "action",
            "actions",
            "tool",
            "tools",
            "mcp_call",
            "mcp_calls",
            "dsml",
          ].includes(tagName)
        ) {
          name = tagName;
        }

        if ((name === "filesystem" || name === "fs") && xmlArgs.command) {
          name = xmlArgs.command;
          delete xmlArgs.command;
        }
        if (name === "bash" && !xmlArgs.command && xmlArgs.cmd) {
          xmlArgs.command = xmlArgs.cmd;
        }
        if (
          (name === "bash" ||
            name === "sh" ||
            name === "shell" ||
            name === "execute_command") &&
          !xmlArgs.command &&
          body &&
          !hadXmlArgs
        ) {
          xmlArgs.command = body;
        }

        if (
          name &&
          (hadXmlArgs ||
            Object.keys(xmlArgs).length ||
            [
              "execute_command",
              "bash",
              "sh",
              "shell",
              "list_allowed_directories",
            ].includes(name))
        ) {
          calls.push({
            name:
              name === "bash" || name === "sh" || name === "shell"
                ? "execute_command"
                : name,
            arguments: xmlArgs,
          });
        }
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
