import { skills } from "./useStudioState";
import type { SkillItem } from "../types";

export function useSkills() {
  async function loadSkills() {
    try {
      const stored = await chrome.storage.local.get(["skills"]);
      if (Array.isArray(stored.skills) && stored.skills.length > 0) {
        skills.value = stored.skills;
      }
    } catch (_) {}

    try {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_SKILLS" }, (response) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response);
        });
      });

      if (
        res?.ok &&
        Array.isArray(res.data?.skills) &&
        res.data.skills.length > 0
      ) {
        skills.value = res.data.skills;
        await chrome.storage.local.set({ skills: skills.value });
      }
    } catch (_) {}
  }

  async function saveSkill(skill: SkillItem) {
    const idx = skills.value.findIndex(
      (s) => s.id === skill.id || s.name === skill.name,
    );
    if (idx !== -1) {
      skills.value[idx] = skill;
    } else {
      skills.value.push(skill);
    }
    await chrome.storage.local.set({ skills: skills.value });
  }

  function findSkillByTrigger(trigger: string): SkillItem | undefined {
    const clean = trigger
      .toLowerCase()
      .trim()
      .replace(/^[\/@]/, "");
    return skills.value.find(
      (s) =>
        s.name.toLowerCase() === clean ||
        s.id.toLowerCase() === clean ||
        s.triggers?.some(
          (t) => t.toLowerCase().replace(/^[\/@]/, "") === clean,
        ),
    );
  }

  function expandSkillContent(skill: SkillItem, userQuery?: string): string {
    const header = `### Agent Skill: ${skill.name}\n${skill.description}\n\n`;
    const body = skill.content || "";
    const extra = userQuery?.trim()
      ? `\n\n**User Task:**\n${userQuery.trim()}`
      : "";
    return `${header}${body}${extra}`;
  }

  return {
    skills,
    loadSkills,
    saveSkill,
    findSkillByTrigger,
    expandSkillContent,
  };
}
