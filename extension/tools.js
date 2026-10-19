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
    "hot_check",
    "smart_patch",
    "workspace_batch",
    "ralph_loop",
    "symbol_find",
    "git_diff_summary",
  ]);

  const SYSTEM_PROMPT_STYLES = [
    (
      list,
      projectPath,
      skeleton,
    ) => `You have local workstation MCP tools available:
${list}

${projectPath ? `ACTIVE PROJECT WORKSPACE: ${projectPath}\nAll relative file operations and bash commands must run inside or relative to this project workspace path: "${projectPath}".` : ""}
${skeleton ? `\nPROJECT STRUCTURE SKELETON (up to 3 levels):\n\`\`\`\n${skeleton}\n\`\`\`\n` : ""}

CRITICAL OPERATIONAL RULES & HIGH-SPEED EXECUTION:
1. STRICT ZERO CHATTER: DO NOT write conversational commentary or preamble. Output ONLY the tool call payload immediately.
2. MULTI-OPERATION BATCHING: Bundle inspection, patching, and verification in a single JSON array (up to 8 calls):
\`\`\`json
[
  { "name": "symbol_find", "arguments": { "symbol": "useMemberActions" } },
  { "name": "smart_patch", "arguments": { "path": "apps/web/composables/useMemberActions.ts", "search": "old code", "replace": "new code" } },
  { "name": "ralph_loop", "arguments": { "action": "verify" } }
]
\`\`\`
3. RELIABLE AST CODE EDITING: ALWAYS prefer "smart_patch" over "sed -i". "smart_patch" never fails with bash quote escaping.
4. FAST SYMBOL LOOKUP: ALWAYS use "symbol_find" to locate function and type declarations in 10ms instead of reading large 1000-line files.
5. AUTONOMOUS RALPH LOOP: Use "ralph_loop" to run iterative test-fix-verify cycles. If tests fail, fix errors immediately until 0 errors remain.
6. COMPOSITE RUNNER: Use "workspace_batch" to write files and run commands in 1 atomic turn.
7. FAST REASONING: Keep thinking concise (under 50 words) and act immediately.
8. Respond in English or Arabic only.
`,
    (list, projectPath, skeleton) => `Workstation MCP tools active:
${list}

${projectPath ? `ACTIVE WORKSPACE: ${projectPath}\nUse "${projectPath}" as the target project directory for all operations.` : ""}
${skeleton ? `\nPROJECT STRUCTURE SKELETON:\n\`\`\`\n${skeleton}\n\`\`\`\n` : ""}

Turbo Mode Guidelines:
- ABSOLUTELY ZERO PREAMBLE: Start response directly with the tool JSON block.
- AGGRESSIVE BATCHING: Bundle searching, reading, editing, and checking in a single turn.
- RELIABLE EDITING: Use "smart_patch" for exact string/AST replacements.
- INSTANT SYMBOL LOOKUP: Use "symbol_find" instead of reading entire files.
- AUTONOMOUS SELF-HEALING: Use "ralph_loop" for automated test-verify-fix cycles.
- INSTANT VERIFICATION: Use "hot_check" (~30ms type/compile verification).
- LANGUAGE: Respond in English or Arabic only. Never use Chinese.
`,
  ];

  function buildSysPrompt(tools, projectPath = "", skeleton = "") {
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
    return template(list, projectPath, skeleton);
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

  function repairJson(str) {
    if (!str || typeof str !== "string") return null;
    try {
      return JSON.parse(str);
    } catch (_) {
      const nameM = str.match(/"name"\s*:\s*"([^"]+)"/);
      if (!nameM) return null;
      const name = nameM[1].trim();

      const argsIdx = str.indexOf('"arguments"');
      if (argsIdx === -1) return null;

      const args = {};
      const cwdM = str.match(/"cwd"\s*:\s*"([^"]+)"/);
      if (cwdM) args.cwd = cwdM[1].trim();

      const pathM = str.match(/"path"\s*:\s*"([^"]+)"/);
      if (pathM) args.path = pathM[1].trim();

      // Tolerant command extraction even when inner quotes aren't escaped:
      const cmdM = str.match(
        /"command"\s*:\s*"([\s\S]*?)"\s*(?:,\s*"cwd"|\s*\}\s*\}|\s*\}\s*$)/,
      );
      if (cmdM) {
        args.command = cmdM[1];
      } else {
        const sub = str.slice(argsIdx);
        const afterCmd = sub.match(/"command"\s*:\s*"([\s\S]*)/);
        if (afterCmd) {
          let val = afterCmd[1];
          val = val.replace(
            /"\s*(?:,\s*"cwd"[\s\S]*|\}\s*\}[\s\S]*|\}\s*)$/,
            "",
          );
          args.command = val;
        }
      }

      const contentM = str.match(
        /"content"\s*:\s*"([\s\S]*?)"\s*(?:\s*\}\s*\}|\s*\}\s*$)/,
      );
      if (contentM && !args.content) {
        args.content = contentM[1];
      }

      if (Object.keys(args).length > 0 || name) {
        return { name, arguments: args };
      }
    }
    return null;
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
      } catch (_) {
        const repaired = repairJson(code);
        if (repaired && repaired.name) {
          calls.push(repaired);
        }
      }
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
        const repaired = repairJson(body);
        if (repaired && repaired.name) {
          calls.push(repaired);
        } else {
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
            } catch (e) {
              const innerRepaired = repairJson(innerJsonMatch[0]);
              if (innerRepaired && innerRepaired.name) {
                calls.push(innerRepaired);
              }
            }
          }
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
