import { ref, computed } from "vue";
import { settings, projects, saveSettings } from "./useStudioState";

export interface ChatStatusInfo {
  status: "done" | "in_progress";
  summary?: string;
  timestamp: number;
}

export const chatProjectMap = ref<Record<string, string>>({});
export const chatTitles = ref<Record<string, string>>({});
export const chatStatusMap = ref<Record<string, ChatStatusInfo>>({});
export const filterByActiveProject = ref<boolean>(false);

export function useChatProjects() {
  async function loadChatProjects() {
    try {
      const stored = await chrome.storage.local.get([
        "ds_chat_projects",
        "ds_chat_titles",
        "ds_chat_status",
        "ds_filter_by_project",
      ]);
      if (stored.ds_chat_projects)
        chatProjectMap.value = stored.ds_chat_projects;
      if (stored.ds_chat_titles) chatTitles.value = stored.ds_chat_titles;
      if (stored.ds_chat_status) chatStatusMap.value = stored.ds_chat_status;
      if (typeof stored.ds_filter_by_project === "boolean") {
        filterByActiveProject.value = stored.ds_filter_by_project;
      }
    } catch (_) {}
  }

  async function saveChatProjects() {
    try {
      await chrome.storage.local.set({
        ds_chat_projects: chatProjectMap.value,
        ds_chat_titles: chatTitles.value,
        ds_chat_status: chatStatusMap.value,
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

  function formatTimeAgo(timestamp?: number): string {
    if (!timestamp) return "";
    const sec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
    if (sec < 60) return "just now";
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 7) return `${day}d`;
    const wk = Math.floor(day / 7);
    return `${wk}w`;
  }

  async function tagCurrentChat(projectPath?: string) {
    const chatId = getCurrentChatId();
    if (!chatId) return;

    const targetProject = projectPath || settings.activeProject;
    if (!targetProject) return;

    let modified = false;
    if (chatProjectMap.value[chatId] !== targetProject) {
      chatProjectMap.value[chatId] = targetProject;
      modified = true;
    }
    if (!chatStatusMap.value[chatId]) {
      chatStatusMap.value[chatId] = {
        status: "in_progress",
        timestamp: Date.now(),
      };
      modified = true;
    }

    if (modified) {
      await saveChatProjects();
      applySidebarFilter();
    }
  }

  async function markChatDone(chatId?: string, summary?: string) {
    const id = chatId || getCurrentChatId();
    if (!id) return;

    chatStatusMap.value[id] = {
      status: "done",
      summary: summary || "Task completed",
      timestamp: Date.now(),
    };
    await saveChatProjects();
  }

  async function markChatInProgress(chatId?: string) {
    const id = chatId || getCurrentChatId();
    if (!id) return;

    chatStatusMap.value[id] = {
      status: "in_progress",
      timestamp: Date.now(),
    };
    await saveChatProjects();
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

  const projectTree = computed(() => {
    const currentId = getCurrentChatId();
    return projects.value.map((proj) => {
      const folderName = proj.name || proj.path.split("/").pop() || "project";
      const matchingChats: {
        id: string;
        title: string;
        url: string;
        timeAgo: string;
        isDone: boolean;
        isActive: boolean;
      }[] = [];

      for (const [id, assignedPath] of Object.entries(chatProjectMap.value)) {
        if (assignedPath === proj.path || assignedPath.endsWith(proj.path)) {
          const statusInfo = chatStatusMap.value[id];
          matchingChats.push({
            id,
            title: chatTitles.value[id] || `Chat ${id.slice(0, 8)}`,
            url: `/a/chat/s/${id}`,
            timeAgo: formatTimeAgo(statusInfo?.timestamp),
            isDone: statusInfo?.status === "done",
            isActive: currentId === id,
          });
        }
      }

      // Sort chats with most recently updated first
      matchingChats.sort((a, b) => {
        const timeA = chatStatusMap.value[a.id]?.timestamp || 0;
        const timeB = chatStatusMap.value[b.id]?.timestamp || 0;
        return timeB - timeA;
      });

      return {
        name: folderName,
        path: proj.path,
        chatCount: matchingChats.length,
        chats: matchingChats,
      };
    });
  });

  function createNewChatInProject(projectPath: string) {
    settings.activeProject = projectPath;
    saveSettings();

    // Trigger click on DeepSeek's 'New chat' button
    const newChatBtn =
      document.querySelector<HTMLElement>("div._7b40dad") ||
      Array.from(document.querySelectorAll<HTMLElement>("div, button, a")).find(
        (el) => (el.textContent || "").trim().toLowerCase() === "new chat",
      );
    if (newChatBtn) {
      newChatBtn.click();
    } else {
      window.location.href = "/";
    }
  }

  function openChat(chatId: string) {
    const existingLink = document.querySelector<HTMLAnchorElement>(
      `a[href*='/a/chat/s/${chatId}']`,
    );
    if (existingLink) {
      existingLink.click();
    } else {
      window.location.href = `/a/chat/s/${chatId}`;
    }
  }

  function applySidebarFilter() {
    const chatLinks = Array.from(
      document.querySelectorAll<HTMLAnchorElement>("a[href*='/a/chat/s/']"),
    );
    if (chatLinks.length === 0) return;

    let titlesChanged = false;
    let index = 0;

    for (const link of chatLinks) {
      const href = link.getAttribute("href") || "";
      const match = href.match(/\/a\/chat\/s\/([a-zA-Z0-9-]+)/);
      const chatId = match ? match[1] : null;
      if (!chatId) continue;

      // Extract and cache title
      const titleEl = link.querySelector("div.c08e6e93") || link;
      const titleText = (titleEl.textContent || "").trim();
      if (titleText && chatTitles.value[chatId] !== titleText) {
        chatTitles.value[chatId] = titleText;
        titlesChanged = true;
      }

      // Default timestamp if none exists
      if (!chatStatusMap.value[chatId]) {
        chatStatusMap.value[chatId] = {
          status: "in_progress",
          timestamp: Date.now() - index * 1000 * 3600 * 6,
        };
        titlesChanged = true;
      }
      index++;
    }

    if (titlesChanged) {
      saveChatProjects();
    }
  }

  return {
    chatProjectMap,
    chatTitles,
    chatStatusMap,
    filterByActiveProject,
    activeProjectChatCount,
    projectTree,
    loadChatProjects,
    saveChatProjects,
    getCurrentChatId,
    tagCurrentChat,
    markChatDone,
    markChatInProgress,
    formatTimeAgo,
    createNewChatInProject,
    openChat,
    getProjectChatCount,
    applySidebarFilter,
  };
}
