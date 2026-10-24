import { computed } from "vue";
import { projects, settings } from "./useStudioState";
import type { ProjectWorkspace } from "../types";

export function useProjects() {
  const activeProjectName = computed(() => {
    if (!settings.activeProject) return "All Workspaces";
    const found = projects.value.find(
      (p) =>
        p.path === settings.activeProject || p.name === settings.activeProject,
    );
    if (found) return found.name;
    const parts = settings.activeProject.split("/").filter(Boolean);
    return parts.pop() || settings.activeProject;
  });

  async function loadProjects() {
    try {
      const stored = await chrome.storage.local.get([
        "projects",
        "activeProject",
      ]);
      if (Array.isArray(stored.projects) && stored.projects.length > 0) {
        projects.value = stored.projects;
      }
      if (stored.activeProject) {
        settings.activeProject = stored.activeProject;
      }
    } catch (_) {}

    try {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_PROJECTS" }, (response) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(response);
        });
      });

      if (res?.ok && Array.isArray(res.data?.projects)) {
        const bridgeProjects: ProjectWorkspace[] = res.data.projects;
        const map = new Map<string, ProjectWorkspace>();

        for (const p of projects.value) {
          if (p.path) map.set(p.path, p);
        }
        for (const bp of bridgeProjects) {
          if (bp.path) {
            const existing = map.get(bp.path);
            map.set(bp.path, { ...existing, ...bp });
          }
        }

        projects.value = Array.from(map.values()).map((p) => ({
          ...p,
          name: (p.name || "").replace(/^[⭐📁✨\s]+/, "").trim(),
        }));
        await chrome.storage.local.set({ projects: projects.value });

        if (!settings.activeProject && projects.value.length > 0) {
          const current =
            projects.value.find((p) => p.name.includes("(Current)")) ||
            projects.value[0];
          if (current?.path) {
            settings.activeProject = current.path;
            await chrome.storage.local.set({ activeProject: current.path });
          }
        }
      }
    } catch (_) {}
  }

  async function selectProject(projectPath: string) {
    settings.activeProject = projectPath;
    await chrome.storage.local.set({ activeProject: projectPath });
  }

  async function saveProject(project: ProjectWorkspace) {
    const idx = projects.value.findIndex(
      (p) => p.path === project.path || p.name === project.name,
    );
    if (idx !== -1) {
      projects.value[idx] = project;
    } else {
      projects.value.unshift(project);
    }
    await chrome.storage.local.set({ projects: projects.value });
  }

  async function deleteProject(projectPath: string) {
    projects.value = projects.value.filter((p) => p.path !== projectPath);
    if (settings.activeProject === projectPath) {
      settings.activeProject = "";
    }
    await chrome.storage.local.set({
      projects: projects.value,
      activeProject: settings.activeProject,
    });
  }

  async function addCustomProject(rawPath: string, customName?: string) {
    const cleanPath = rawPath.trim();
    if (!cleanPath) return;
    const name =
      customName?.trim() ||
      cleanPath.split("/").filter(Boolean).pop() ||
      cleanPath;
    const newProj: ProjectWorkspace = {
      name,
      path: cleanPath,
      custom: true,
      addedAt: Date.now(),
    };
    await saveProject(newProj);
    await selectProject(cleanPath);
    return newProj;
  }

  return {
    projects,
    activeProjectName,
    loadProjects,
    selectProject,
    saveProject,
    deleteProject,
    addCustomProject,
  };
}
