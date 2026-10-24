import { ref, reactive, computed } from "vue";
import type {
  McpServer,
  McpTool,
  ToolCallAction,
  ProjectWorkspace,
  SkillItem,
  StudioSettings,
} from "../types";

export const settings = reactive<StudioSettings>({
  bridgePort: 8080,
  autoApprove: false,
  autoContinue: true,
  autoContinueDelay: 5,
  humanSpeed: "natural",
  activeProject: "",
  customSystemPrompt: "",
});

export const bridgeConnected = ref(false);
export const bridgeStatusText = ref("Connecting...");
export const servers = ref<McpServer[]>([]);
export const tools = ref<McpTool[]>([]);
export const activeActions = ref<ToolCallAction[]>([]);
export const projects = ref<ProjectWorkspace[]>([]);
export const skills = ref<SkillItem[]>([]);
export const isGenerating = ref(false);

export function useStudioState() {
  const onlineServerCount = computed(
    () => servers.value.filter((s) => s.status === "online").length,
  );
  const totalToolCount = computed(() => tools.value.length);
  const pendingActions = computed(() =>
    activeActions.value.filter((a) => a.status === "pending"),
  );

  async function loadSettings() {
    try {
      const stored = await chrome.storage.local.get([
        "bridgePort",
        "autoApprove",
        "autoContinue",
        "autoContinueDelay",
        "humanSpeed",
        "activeProject",
      ]);
      if (stored.bridgePort) settings.bridgePort = Number(stored.bridgePort);
      if (stored.autoApprove !== undefined)
        settings.autoApprove = Boolean(stored.autoApprove);
      if (stored.autoContinue !== undefined)
        settings.autoContinue = Boolean(stored.autoContinue);
      if (stored.autoContinueDelay)
        settings.autoContinueDelay = Number(stored.autoContinueDelay);
      if (stored.humanSpeed) settings.humanSpeed = stored.humanSpeed;
      if (stored.activeProject) settings.activeProject = stored.activeProject;
    } catch (_) {}
  }

  async function saveSettings(patch: Partial<StudioSettings>) {
    Object.assign(settings, patch);
    try {
      await chrome.storage.local.set(patch);
    } catch (_) {}
  }

  return {
    settings,
    bridgeConnected,
    bridgeStatusText,
    servers,
    tools,
    activeActions,
    projects,
    skills,
    isGenerating,
    onlineServerCount,
    totalToolCount,
    pendingActions,
    loadSettings,
    saveSettings,
  };
}
