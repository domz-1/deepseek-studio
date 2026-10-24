import { projects, settings } from "./useStudioState";
import type { ProjectWorkspace } from "../types";

export function useProjects() {
  async function loadProjects() {
    try {
      const stored = await chrome.storage.local.get([
        "projects",
        "activeProject",
      ]);
      if (Array.isArray(stored.projects)) {
        projects.value = stored.projects;
      }
      if (stored.activeProject) {
        settings.activeProject = stored.activeProject;
      }
    } catch (_) {}
  }

  async function saveProject(project: ProjectWorkspace) {
    const idx = projects.value.findIndex((p) => p.name === project.name);
    if (idx !== -1) {
      projects.value[idx] = project;
    } else {
      projects.value.push(project);
    }
    await chrome.storage.local.set({ projects: projects.value });
  }

  async function selectProject(projectName: string) {
    settings.activeProject = projectName;
    await chrome.storage.local.set({ activeProject: projectName });
  }

  async function deleteProject(projectName: string) {
    projects.value = projects.value.filter((p) => p.name !== projectName);
    if (settings.activeProject === projectName) {
      settings.activeProject = "";
    }
    await chrome.storage.local.set({
      projects: projects.value,
      activeProject: settings.activeProject,
    });
  }

  return {
    projects,
    loadProjects,
    saveProject,
    selectProject,
    deleteProject,
  };
}
