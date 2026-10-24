import { skills } from "./useStudioState";
import type { SkillItem } from "../types";

export function useSkills() {
  async function loadSkills() {
    try {
      const stored = await chrome.storage.local.get(["skills"]);
      if (Array.isArray(stored.skills) && stored.skills.length > 0) {
        skills.value = stored.skills;
      } else {
        // Default built-in agent skills
        skills.value = [
          {
            id: "find-skills",
            name: "find-skills",
            description: "Find and discover new agent skills from skills.sh",
            content:
              "Search skills.sh or run npx skills find to discover new agent skills.",
            triggers: ["/find-skills", "@find-skills", "find skill"],
          },
          {
            id: "auto-skills",
            name: "auto-skills",
            description:
              "Auto-scan and sync all local skills from ~/.agents/skills",
            content:
              "Auto-detect local agent skills and register their capabilities.",
            triggers: ["/auto-skills", "@auto-skills", "sync skills"],
          },
          {
            id: "filesystem",
            name: "filesystem",
            description:
              "Safe filesystem inspection, reading, searching and editing",
            content:
              "Use filesystem MCP server to inspect directories and read/write files safely.",
            triggers: ["/fs", "@filesystem"],
          },
        ];
      }
    } catch (_) {}
  }

  async function saveSkill(skill: SkillItem) {
    const idx = skills.value.findIndex((s) => s.id === skill.id);
    if (idx !== -1) {
      skills.value[idx] = skill;
    } else {
      skills.value.push(skill);
    }
    await chrome.storage.local.set({ skills: skills.value });
  }

  function findSkillByTrigger(trigger: string): SkillItem | undefined {
    const clean = trigger.toLowerCase().trim();
    return skills.value.find(
      (s) =>
        s.name.toLowerCase() === clean ||
        s.triggers?.some((t) => t.toLowerCase() === clean),
    );
  }

  return {
    skills,
    loadSkills,
    saveSkill,
    findSkillByTrigger,
  };
}
