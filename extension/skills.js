// DeepSeek MCP Studio — Skills engine
// A "skill" is a reusable prompt bundle triggered by /skillname.
// Skills live in chrome.storage.local under the key "ds_skills".

(function (root) {
  const STORAGE_KEY = "ds_skills";

  const DEFAULT_SKILLS = [
    {
      id: "help",
      name: "help",
      emoji: "❓",
      description: "List every available skill and how to use them.",
      prompt: "__HELP__",
      builtin: true,
    },
    {
      id: "explain",
      name: "explain",
      emoji: "🧠",
      description: "Explain code or a concept clearly, step by step.",
      prompt:
        "Explain the following clearly and concisely, step by step, with a short example where useful:",
      builtin: true,
    },
    {
      id: "review",
      name: "review",
      emoji: "🔍",
      description: "Senior code review: bugs, edge cases, security, style.",
      prompt:
        "Act as a senior engineer. Review the following code for bugs, edge cases, security issues, performance, and style. Be specific and prioritize fixes:",
      builtin: true,
    },
    {
      id: "refactor",
      name: "refactor",
      emoji: "🛠️",
      description: "Refactor code for readability and maintainability.",
      prompt:
        "Refactor the following code for readability, maintainability, and correctness. Preserve behavior and explain the key changes:",
      builtin: true,
    },
    {
      id: "tests",
      name: "tests",
      emoji: "🧪",
      description: "Write unit tests for the given code.",
      prompt:
        "Write thorough unit tests for the following code. Cover happy paths, edge cases, and failures. Use the project's existing test framework if known:",
      builtin: true,
    },
    {
      id: "debug",
      name: "debug",
      emoji: "🐞",
      description: "Find the root cause of a bug and propose a fix.",
      prompt:
        "Help me debug the following. Identify the most likely root cause, explain the reasoning, then give a concrete fix:",
      builtin: true,
    },
    {
      id: "commit",
      name: "commit",
      emoji: "📝",
      description: "Write a Conventional Commits message from a diff.",
      prompt:
        "Write a Conventional Commits message (type(scope): subject + body) for the following changes:",
      builtin: true,
    },
    {
      id: "summarize",
      name: "summarize",
      emoji: "📄",
      description: "Summarize text into key bullet points.",
      prompt:
        "Summarize the following into concise, high-signal bullet points:",
      builtin: true,
    },
    {
      id: "grill-me",
      name: "grill-me",
      emoji: "🔥",
      description:
        "Interactive interview challenging design decisions, trade-offs, and edge cases one question at a time.",
      prompt:
        "Act as an exceptionally demanding Principal Engineer and Architect. You are conducting an interactive architecture interview (Grill-Me session).\n" +
        "CRITICAL RULES:\n" +
        "1. Ask ONE focused, critical design question at a time (never dump a long list of questions all at once!).\n" +
        "2. Explain briefly why this decision is pivotal (trade-offs, failure modes, scale).\n" +
        "3. Provide 2 to 4 concrete, realistic choices for me to select from, plus what each choice implies.\n" +
        "4. Output this EXACT JSON block at the end of your message so the interactive UI can render selectable buttons for me:\n" +
        "```json\n" +
        "{\n" +
        '  "grill_question": "Summary of the critical decision question?",\n' +
        '  "options": [\n' +
        '    {"id": "A", "label": "Option A summary", "details": "Trade-off details..."},\n' +
        '    {"id": "B", "label": "Option B summary", "details": "Trade-off details..."},\n' +
        '    {"id": "C", "label": "Option C summary", "details": "Trade-off details..."}\n' +
        "  ],\n" +
        '  "allow_custom": true\n' +
        "}\n" +
        "```\n" +
        "5. When I answer, evaluate my choice, challenge any remaining edge cases or move to the next pivotal architectural question.\n\n" +
        "Topic to grill me on:",
      builtin: true,
    },
    {
      id: "plan",
      name: "plan",
      emoji: "📋",
      description:
        "Generate a rigorous step-by-step implementation plan with file changes and verification.",
      prompt:
        "Act as a Senior Tech Lead. Create a rigorous, complete, step-by-step Implementation Plan before writing any code.\n" +
        "Structure your response with:\n" +
        "1. **Summary & Architecture**: Clear scope and core architectural approach.\n" +
        "2. **Critical Decisions & Trade-offs**: Key trade-offs or constraints identified.\n" +
        "3. **Step-by-Step Changes**: Exact files to create/modify (`[NEW]`, `[MODIFY]`, `[DELETE]`) with rationale for each.\n" +
        "4. **Verification Plan**: Exact commands, unit tests, and edge case validations.\n" +
        "5. **Open Questions**: Anything needing clarification before implementation starts.\n\n" +
        "Task to plan:",
      builtin: true,
    },
    {
      id: "build",
      name: "build",
      emoji: "🏗️",
      description:
        "Autonomous Build Mode: execute plan, call MCP tools, create files, and verify.",
      prompt:
        "You are now in **Autonomous Build Mode**. Your objective is to implement the solution cleanly and verify it using workstation MCP tools.\n" +
        "Guidelines:\n" +
        "1. Inspect files or execute commands using MCP tools directly.\n" +
        "2. Implement production-ready code with complete error handling and tests.\n" +
        "3. Verify your work (run tests or linting with `@bash`).\n" +
        "4. Keep me updated with concise progress summaries in English or Arabic.\n\n" +
        "Objective to build:",
      builtin: true,
    },
    {
      id: "translate-ar",
      name: "translate-ar",
      emoji: "🇸🇦",
      description: "Translate text to Arabic.",
      prompt: "Translate the following text into natural, fluent Arabic:",
      builtin: true,
    },
    {
      id: "translate-en",
      name: "translate-en",
      emoji: "🇬🇧",
      description: "Translate text to English.",
      prompt: "Translate the following text into natural, fluent English:",
      builtin: true,
    },
  ];

  function slugify(s) {
    return String(s || "")
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9_-]/g, "")
      .slice(0, 40);
  }

  function normalizeSkill(raw) {
    const name = slugify(raw.name || raw.id);
    return {
      id: raw.id || name,
      name: name,
      emoji: raw.emoji || "✨",
      description: raw.description || "",
      prompt: raw.prompt || "",
      servers: Array.isArray(raw.servers) ? raw.servers : [],
      builtin: !!raw.builtin,
    };
  }

  async function loadSkills() {
    let custom = [];
    try {
      const got = await chrome.storage.local.get(STORAGE_KEY);
      custom = (got && got[STORAGE_KEY]) || [];
    } catch (_) {
      try {
        custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      } catch (_) {}
    }
    const customs = custom.map(normalizeSkill);
    const byName = new Map();
    for (const s of DEFAULT_SKILLS) byName.set(s.name, normalizeSkill(s));
    for (const s of customs) byName.set(s.name, s);
    return Array.from(byName.values()).sort((a, b) => {
      if (a.builtin !== b.builtin) return a.builtin ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }

  async function saveCustomSkills(list) {
    const clean = (list || []).map(normalizeSkill).filter((s) => s.name);
    const payload = {};
    payload[STORAGE_KEY] = clean;
    try {
      await chrome.storage.local.set(payload);
    } catch (_) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    }
    return clean;
  }

  async function getCustomSkills() {
    try {
      const got = await chrome.storage.local.get(STORAGE_KEY);
      return (got && got[STORAGE_KEY]) || [];
    } catch (_) {
      try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      } catch (_) {
        return [];
      }
    }
  }

  function helpText(skills) {
    const lines = skills.map(
      (s) => "- `/" + s.name + "` " + s.emoji + " — " + s.description,
    );
    return [
      "### 🛠️ DeepSeek Workstation & MCP Tools Guide",
      "",
      "**Available Skills:**",
      lines.join("\n"),
      "",
      "---",
      "### 🚀 How to Work with Projects & Code:",
      "1. **Explore & See Existing Projects:**",
      '   - Type `@filesystem /explain list projects` or ask DeepSeek: `"List all projects and folders in /home/adham/projects"`.',
      "   - DeepSeek will automatically invoke `list_directory` or `bash` (`ls -la /home/adham/projects`).",
      "",
      "2. **Create a New Project:**",
      '   - Ask DeepSeek: `"Create a new project named my-app in /home/adham/projects with Bun"`.',
      "   - DeepSeek will use `@bash` to run `mkdir -p /home/adham/projects/my-app && cd /home/adham/projects/my-app && bun init -y`.",
      "",
      "3. **Combine Skills & MCP Servers:**",
      "   - Combine any skill with server mentions, e.g.: `@filesystem /review analyze index.js` or `@bash /tests write unit tests for app.ts`.",
      "   - Use `@all` to give DeepSeek access to all workstation tools (Filesystem, Bash execution, and Memory).",
      "",
      "💡 *Tip: Toggle the **⚡ Auto-run** checkbox above the input to let safe actions execute automatically!*",
    ].join("\n");
  }

  function matchSkill(text, skills) {
    const m = String(text || "").match(/^\s*\/([a-z0-9_-]+)\b([\s\S]*)$/i);
    if (!m) return null;
    const name = m[1].toLowerCase();
    const skill = skills.find((s) => s.name === name);
    if (!skill) return null;
    return { skill: skill, rest: m[2].trim() };
  }

  function expandSkill(skill, rest, skills) {
    if (skill.prompt === "__HELP__") return helpText(skills || DEFAULT_SKILLS);
    const tail = rest ? "\n\n" + rest : "";
    return skill.prompt + tail;
  }

  function filterSkills(query, skills) {
    const list = skills || DEFAULT_SKILLS;
    if (!query) return list;
    const lower = String(query).toLowerCase().trim();
    return list.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        (s.description && s.description.toLowerCase().includes(lower)),
    );
  }

  root.DSSkills = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_SKILLS: DEFAULT_SKILLS.map(normalizeSkill),
    loadSkills: loadSkills,
    saveCustomSkills: saveCustomSkills,
    getCustomSkills: getCustomSkills,
    matchSkill: matchSkill,
    expandSkill: expandSkill,
    helpText: helpText,
    filterSkills: filterSkills,
    normalizeSkill: normalizeSkill,
    slugify: slugify,
  };
})(typeof window !== "undefined" ? window : globalThis);
