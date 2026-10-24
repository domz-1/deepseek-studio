import { ref, computed } from "vue";
import { settings, projects, saveSettings } from "./useStudioState";

export interface ChatStatusInfo {
  status: "done" | "in_progress";
  summary?: string;
  timestamp: number;
}

export const chatProjectMap = ref<Record<string, string>>({}),
  chatTitles = ref<Record<string, string>>({}),
  chatStatusMap = ref<Record<string, ChatStatusInfo>>({}),
  pinnedChats = ref<Record<string, boolean>>({}),
  filterByActiveProject = ref<boolean>(false);

export function useChatProjects() {
  async function loadChatProjects() {
    try {
      const s = await chrome.storage.local.get([
        "ds_chat_projects",
        "ds_chat_titles",
        "ds_chat_status",
        "ds_pinned_chats",
        "ds_filter_by_project",
      ]);
      if (s.ds_chat_projects) chatProjectMap.value = s.ds_chat_projects;
      if (s.ds_chat_titles) chatTitles.value = s.ds_chat_titles;
      if (s.ds_chat_status) chatStatusMap.value = s.ds_chat_status;
      if (s.ds_pinned_chats) pinnedChats.value = s.ds_pinned_chats;
      if (typeof s.ds_filter_by_project === "boolean")
        filterByActiveProject.value = s.ds_filter_by_project;
    } catch (_) {}
  }

  async function saveChatProjects() {
    try {
      await chrome.storage.local.set({
        ds_chat_projects: chatProjectMap.value,
        ds_chat_titles: chatTitles.value,
        ds_chat_status: chatStatusMap.value,
        ds_pinned_chats: pinnedChats.value,
        ds_filter_by_project: filterByActiveProject.value,
      });
    } catch (_) {}
  }

  async function togglePinChat(chatId: string) {
    if (!chatId) return;
    pinnedChats.value[chatId] = !pinnedChats.value[chatId];
    await saveChatProjects();
  }

  function getCurrentChatId(): string | null {
    return (
      window.location.pathname.match(/\/a\/chat\/s\/([a-zA-Z0-9-]+)/)?.[1] ||
      null
    );
  }

  function formatTimeAgo(ts?: number): string {
    if (!ts) return "";
    const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}d`;
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
    chatStatusMap.value[id] = { status: "in_progress", timestamp: Date.now() };
    await saveChatProjects();
  }

  function getProjectChatCount(projectPath: string): number {
    if (!projectPath) return 0;
    return Object.values(chatProjectMap.value).filter(
      (p) => p === projectPath || p.endsWith(projectPath),
    ).length;
  }

  const activeProjectChatCount = computed(() =>
    getProjectChatCount(settings.activeProject),
  );

  const projectTree = computed(() => {
    const currentId = getCurrentChatId();
    return projects.value.map((proj) => {
      const folderName = proj.name || proj.path.split("/").pop() || "project";
      const matchingChats: any[] = [];

      for (const [id, assignedPath] of Object.entries(chatProjectMap.value)) {
        if (assignedPath === proj.path || assignedPath.endsWith(proj.path)) {
          const statusInfo = chatStatusMap.value[id];
          matchingChats.push({
            id,
            title: chatTitles.value[id] || `Chat ${id.slice(0, 8)}`,
            url: `/a/chat/s/${id}`,
            timeAgo: formatTimeAgo(statusInfo?.timestamp),
            isDone: statusInfo?.status === "done",
            isPinned: !!pinnedChats.value[id],
            isActive: currentId === id,
          });
        }
      }

      matchingChats.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return (
          (chatStatusMap.value[b.id]?.timestamp || 0) -
          (chatStatusMap.value[a.id]?.timestamp || 0)
        );
      });

      return {
        name: folderName,
        path: proj.path,
        chatCount: matchingChats.length,
        chats: matchingChats,
      };
    });
  });

  async function createNewChatInProject(projectPath: string) {
    settings.activeProject = projectPath;
    await saveSettings({ activeProject: projectPath });
    const btn = document.querySelector<HTMLElement>(
      "div._7b40dad button, button[aria-label*='New chat' i], a[href='/']",
    );
    if (btn) btn.click();
    setTimeout(() => {
      if (window.location.pathname.startsWith("/a/chat/s/"))
        window.location.href = "/";
    }, 150);
  }

  function openChat(chatId: string) {
    const link = document.querySelector<HTMLAnchorElement>(
      `a[href*='/a/chat/s/${chatId}']`,
    );
    if (link) link.click();
    else window.location.href = `/a/chat/s/${chatId}`;
  }

  function applySidebarFilter() {
    if (!document.getElementById("ds-hide-native-new-chat-style")) {
      const s = document.createElement("style");
      s.id = "ds-hide-native-new-chat-style";
      s.textContent =
        "div._7b40dad, div[class*='newChat' i], button[class*='newChat' i] { display: none !important; }";
      document.head.appendChild(s);
    }

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

      const titleEl = link.querySelector("div.c08e6e93") || link;
      const titleText = (titleEl.textContent || "").trim();
      if (titleText && chatTitles.value[chatId] !== titleText) {
        chatTitles.value[chatId] = titleText;
        titlesChanged = true;
      }

      if (!chatStatusMap.value[chatId]) {
        chatStatusMap.value[chatId] = {
          status: "in_progress",
          timestamp: Date.now() - index * 3600000 * 6,
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
    pinnedChats,
    filterByActiveProject,
    activeProjectChatCount,
    projectTree,
    loadChatProjects,
    saveChatProjects,
    getCurrentChatId,
    tagCurrentChat,
    markChatDone,
    markChatInProgress,
    togglePinChat,
    formatTimeAgo,
    createNewChatInProject,
    openChat,
    getProjectChatCount,
    applySidebarFilter,
  };
}
