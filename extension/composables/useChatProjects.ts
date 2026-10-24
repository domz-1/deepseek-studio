import { ref, computed } from "vue";
import { settings } from "./useStudioState";

export const chatProjectMap = ref<Record<string, string>>({});
export const filterByActiveProject = ref<boolean>(false);

export function useChatProjects() {
  async function loadChatProjects() {
    try {
      const stored = await chrome.storage.local.get([
        "ds_chat_projects",
        "ds_filter_by_project",
      ]);
      if (stored.ds_chat_projects) {
        chatProjectMap.value = stored.ds_chat_projects;
      }
      if (typeof stored.ds_filter_by_project === "boolean") {
        filterByActiveProject.value = stored.ds_filter_by_project;
      }
    } catch (_) {}
  }

  async function saveChatProjects() {
    try {
      await chrome.storage.local.set({
        ds_chat_projects: chatProjectMap.value,
        ds_filter_by_project: filterByActiveProject.value,
      });
    } catch (_) {}
  }

  function getCurrentChatId(): string | null {
    const match = window.location.pathname.match(
      /\/a\/chat\/s\/([a-zA-Z0-9-]+)/,
    );
    return match ? match[1] : null;
  }

  async function tagCurrentChat(projectPath?: string) {
    const chatId = getCurrentChatId();
    if (!chatId) return;

    const targetProject = projectPath || settings.activeProject;
    if (!targetProject) return;

    if (chatProjectMap.value[chatId] !== targetProject) {
      chatProjectMap.value[chatId] = targetProject;
      await saveChatProjects();
      applySidebarFilter();
    }
  }

  async function setFilterByProject(enabled: boolean) {
    filterByActiveProject.value = enabled;
    await saveChatProjects();
    applySidebarFilter();
  }

  function getProjectChatCount(projectPath: string): number {
    if (!projectPath) return 0;
    return Object.values(chatProjectMap.value).filter(
      (p) => p === projectPath || p.endsWith(projectPath),
    ).length;
  }

  const activeProjectChatCount = computed(() => {
    return getProjectChatCount(settings.activeProject);
  });

  function applySidebarFilter() {
    const chatLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href*='/a/chat/s/']"),
    );
    if (chatLinks.length === 0) return;

    const currentProject = settings.activeProject;
    const isFiltering = filterByActiveProject.value && !!currentProject;

    for (const link of chatLinks) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/\/a\/chat\/s\/([a-zA-Z0-9-]+)/);
      const chatId = match ? match[1] : null;

      if (!isFiltering) {
        link.style.display = "";
        link.style.opacity = "1";
        continue;
      }

      const assignedProject = chatId ? chatProjectMap.value[chatId] : null;
      const belongs = assignedProject === currentProject;

      if (belongs) {
        link.style.display = "";
        link.style.opacity = "1";
      } else {
        link.style.display = "none";
      }
    }

    const groups = Array.from(document.querySelectorAll("div._3098d02"));
    for (const group of groups) {
      if (!isFiltering) {
        (group as HTMLElement).style.display = "";
        continue;
      }
      const visibleLinks = group.querySelectorAll(
        "a[href*='/a/chat/s/']:not([style*='display: none'])",
      );
      (group as HTMLElement).style.display =
        visibleLinks.length > 0 ? "" : "none";
    }
  }

  return {
    chatProjectMap,
    filterByActiveProject,
    activeProjectChatCount,
    loadChatProjects,
    saveChatProjects,
    getCurrentChatId,
    tagCurrentChat,
    setFilterByProject,
    getProjectChatCount,
    applySidebarFilter,
  };
}
