import { skills } from "./useStudioState";
import type { SkillItem } from "../types";

export function useSkills() {
  async function loadSkills() {
    try {
      const stored = await chrome.storage.local.get(["skills"]);
      if (Array.isArray(stored.skills)) {
        skills.value = stored.skills;
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
