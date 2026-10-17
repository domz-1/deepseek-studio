// DeepSeek MCP Studio — Skills engine
// A "skill" is a reusable prompt bundle triggered by /skillname.
// Skills live in chrome.storage.local under the key "ds_skills".

(function (root) {
  const STORAGE_KEY = "ds_skills";

  const DEFAULT_SKILLS = [
    { id: "help", name: "help", emoji: "❓", description: "List every available skill and how to use them.", prompt: "__HELP__", builtin: true },
    { id: "explain", name: "explain", emoji: "🧠", description: "Explain code or a concept clearly, step by step.", prompt: "Explain the following clearly and concisely, step by step, with a short example where useful:", builtin: true },
    { id: "review", name: "review", emoji: "🔍", description: "Senior code review: bugs, edge cases, security, style.", prompt: "Act as a senior engineer. Review the following code for bugs, edge cases, security issues, performance, and style. Be specific and prioritize fixes:", builtin: true },
    { id: "refactor", name: "refactor", emoji: "🛠️", description: "Refactor code for readability and maintainability.", prompt: "Refactor the following code for readability, maintainability, and correctness. Preserve behavior and explain the key changes:", builtin: true },
    { id: "tests", name: "tests", emoji: "🧪", description: "Write unit tests for the given code.", prompt: "Write thorough unit tests for the following code. Cover happy paths, edge cases, and failures. Use the project's existing test framework if known:", builtin: true },
    { id: "debug", name: "debug", emoji: "🐞", description: "Find the root cause of a bug and propose a fix.", prompt: "Help me debug the following. Identify the most likely root cause, explain the reasoning, then give a concrete fix:", builtin: true },
    { id: "commit", name: "commit", emoji: "📝", description: "Write a Conventional Commits message from a diff.", prompt: "Write a Conventional Commits message (type(scope): subject + body) for the following changes:", builtin: true },
    { id: "summarize", name: "summarize", emoji: "📄", description: "Summarize text into key bullet points.", prompt: "Summarize the following into concise, high-signal bullet points:", builtin: true },
    { id: "translate-ar", name: "translate-ar", emoji: "🇸🇦", description: "Translate text to Arabic.", prompt: "Translate the following text into natural, fluent Arabic:", builtin: true },
    { id: "translate-en", name: "translate-en", emoji: "🇬🇧", description: "Translate text to English.", prompt: "Translate the following text into natural, fluent English:", builtin: true }
  ];

  function slugify(s) {
    return String(s || "").toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "").slice(0, 40);
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
      builtin: !!raw.builtin
    };
  }

  async function loadSkills() {
    let custom = [];
    try {
      const got = await chrome.storage.local.get(STORAGE_KEY);
      custom = (got && got[STORAGE_KEY]) || [];
    } catch (_) {
      try { custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch (_) {}
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
    const payload = {}; payload[STORAGE_KEY] = clean;
    try { await chrome.storage.local.set(payload); } catch (_) { localStorage.setItem(STORAGE_KEY, JSON.stringify(clean)); }
    return clean;
  }

  async function getCustomSkills() {
    try {
      const got = await chrome.storage.local.get(STORAGE_KEY);
      return (got && got[STORAGE_KEY]) || [];
    } catch (_) {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch (_) { return []; }
    }
  }

  function helpText(skills) {
    const lines = skills.map((s) => "- `/" + s.name + "` " + s.emoji + " — " + s.description);
    return ["**Available skills** — type `/name` then your message:", ""].concat(lines).concat(["", "Tip: `/skillname` alone shows the skill; add text after it to run it on that text. Skills combine with `@server` mentions."]).join("\n");
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

  root.DSSkills = {
    STORAGE_KEY: STORAGE_KEY,
    DEFAULT_SKILLS: DEFAULT_SKILLS.map(normalizeSkill),
    loadSkills: loadSkills,
    saveCustomSkills: saveCustomSkills,
    getCustomSkills: getCustomSkills,
    matchSkill: matchSkill,
    expandSkill: expandSkill,
    helpText: helpText,
    normalizeSkill: normalizeSkill,
    slugify: slugify
  };
})(typeof window !== "undefined" ? window : globalThis);
