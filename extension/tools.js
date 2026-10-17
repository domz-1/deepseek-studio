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
    (list) => `You have local workstation MCP tools available:
${list}

Rules:
1. Always respond in English or Arabic only. Never use Chinese.
2. When you need to execute a tool, output ONLY this JSON code block:
\`\`\`json
{
  "mcp_call": true,
  "name": "tool_name",
  "arguments": {}
}
\`\`\`
`,
    (list) => `Workstation MCP tools active:
${list}

Guidelines:
- Respond in English or Arabic. Never use Chinese.
- Call tools using this JSON block:
\`\`\`json
{"name": "tool_name", "arguments": {}}
\`\`\`
`,
  ];

  function buildSysPrompt(tools) {
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
    return template(list);
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
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;

    const candidate = text.slice(start, end + 1);
    try {
      const p = JSON.parse(candidate);
      if (p.name && (p.mcp_call !== undefined || p.arguments !== undefined)) {
        return { name: p.name, arguments: p.arguments || {} };
      }
    } catch (_) {}
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
