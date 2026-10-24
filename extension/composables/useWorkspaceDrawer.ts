import { ref, computed } from "vue";
import { settings } from "./useStudioState";
import type {
  GitFileStatus,
  GitStatusData,
  FileTreeNode,
  CommandLogEntry,
} from "../types/workspace";

export type { GitFileStatus, GitStatusData, FileTreeNode, CommandLogEntry };

const isDrawerOpen = ref(false);
const activeTab = ref<"changes" | "files" | "logs">("changes");
const gitStatus = ref<GitStatusData>({
  isGit: false,
  project: "",
  branch: "",
  files: [],
  stats: { total: 0, modified: 0, added: 0, deleted: 0, untracked: 0 },
});
const loadingStatus = ref(false);
const activeDiffFile = ref<string | null>(null);
const diffContent = ref<string>("");
const loadingDiff = ref(false);
const fileTree = ref<FileTreeNode[]>([]);
const loadingTree = ref(false);
const selectedFile = ref<string | null>(null);
const fileContent = ref<string>("");
const loadingFile = ref(false);
const logs = ref<CommandLogEntry[]>([]);
const loadingLogs = ref(false);
const isCommitModalOpen = ref(false);
const commitMessage = ref("");
const isCommitting = ref(false);

function sendMsg<T>(msg: any): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError || !res?.ok) {
        resolve(null);
      } else {
        resolve(res.data);
      }
    });
  });
}

export function useWorkspaceDrawer() {
  const currentProject = computed(
    () => settings.activeProject || "/home/adham/projects/adham",
  );

  function toggleDrawer(tab?: "changes" | "files" | "logs") {
    if (tab) activeTab.value = tab;
    isDrawerOpen.value = !isDrawerOpen.value;
    if (isDrawerOpen.value) refreshActiveTab();
  }

  function openDrawer(tab?: "changes" | "files" | "logs") {
    if (tab) activeTab.value = tab;
    isDrawerOpen.value = true;
    refreshActiveTab();
  }

  function closeDrawer() {
    isDrawerOpen.value = false;
  }

  async function fetchGitStatus() {
    loadingStatus.value = true;
    try {
      const data = await sendMsg<GitStatusData>({
        type: "WORKSPACE_GIT_STATUS",
        project: currentProject.value,
      });
      if (data) {
        gitStatus.value = data;
        if (
          !activeDiffFile.value &&
          data.files.length > 0 &&
          data.files[0]?.path
        ) {
          fetchGitDiff(data.files[0].path);
        }
      }
    } finally {
      loadingStatus.value = false;
    }
  }

  async function fetchGitDiff(file?: string) {
    loadingDiff.value = true;
    if (file) activeDiffFile.value = file;
    try {
      const data = await sendMsg<{ file: string; diff: string }>({
        type: "WORKSPACE_GIT_DIFF",
        project: currentProject.value,
        file: file || activeDiffFile.value || undefined,
      });
      if (data) diffContent.value = data.diff || "No changes detected.";
    } finally {
      loadingDiff.value = false;
    }
  }

  async function revertFile(path?: string) {
    const ok = await sendMsg({
      type: "WORKSPACE_GIT_REVERT",
      payload: { project: currentProject.value, file: path || "all" },
    });
    if (ok) {
      if (path === activeDiffFile.value) activeDiffFile.value = null;
      await fetchGitStatus();
      if (activeDiffFile.value) await fetchGitDiff(activeDiffFile.value);
    }
  }

  async function commitChanges(message: string) {
    if (!message.trim()) return false;
    isCommitting.value = true;
    try {
      const res = await sendMsg({
        type: "WORKSPACE_GIT_COMMIT",
        payload: {
          project: currentProject.value,
          message: message.trim().toLowerCase(),
        },
      });
      if (res) {
        commitMessage.value = "";
        isCommitModalOpen.value = false;
        activeDiffFile.value = null;
        diffContent.value = "";
        await fetchGitStatus();
        return true;
      }
      return false;
    } finally {
      isCommitting.value = false;
    }
  }

  async function fetchFileTree() {
    loadingTree.value = true;
    try {
      const data = await sendMsg<{ project: string; tree: FileTreeNode[] }>({
        type: "WORKSPACE_FILE_TREE",
        project: currentProject.value,
      });
      if (data) fileTree.value = data.tree || [];
    } finally {
      loadingTree.value = false;
    }
  }

  async function previewFile(fullPath: string) {
    selectedFile.value = fullPath;
    loadingFile.value = true;
    try {
      const data = await sendMsg<{ content: string }>({
        type: "WORKSPACE_READ_FILE",
        payload: { path: fullPath, maxLines: 500 },
      });
      fileContent.value = data?.content || "// Empty or unreadable file";
    } finally {
      loadingFile.value = false;
    }
  }

  async function fetchLogs() {
    loadingLogs.value = true;
    try {
      const data = await sendMsg<{ logs: CommandLogEntry[] }>({
        type: "WORKSPACE_TERMINAL_LOGS",
      });
      if (data) logs.value = data.logs || [];
    } finally {
      loadingLogs.value = false;
    }
  }

  async function clearLogs() {
    await sendMsg({ type: "WORKSPACE_CLEAR_LOGS" });
    logs.value = [];
  }

  function openInEditor(filePath: string, editor: "vscode" | "cursor") {
    const full = filePath.startsWith("/")
      ? filePath
      : `${currentProject.value}/${filePath}`;
    window.location.href = `${editor}://file/${full}`;
  }

  function refreshActiveTab() {
    if (activeTab.value === "changes") fetchGitStatus();
    else if (activeTab.value === "files") fetchFileTree();
    else if (activeTab.value === "logs") fetchLogs();
  }

  return {
    isDrawerOpen,
    activeTab,
    gitStatus,
    loadingStatus,
    activeDiffFile,
    diffContent,
    loadingDiff,
    fileTree,
    loadingTree,
    selectedFile,
    fileContent,
    loadingFile,
    logs,
    loadingLogs,
    isCommitModalOpen,
    commitMessage,
    isCommitting,
    currentProject,
    toggleDrawer,
    openDrawer,
    closeDrawer,
    fetchGitStatus,
    fetchGitDiff,
    revertFile,
    commitChanges,
    fetchFileTree,
    previewFile,
    fetchLogs,
    clearLogs,
    openInEditor,
    refreshActiveTab,
  };
}
