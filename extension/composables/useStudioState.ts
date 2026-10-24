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
  bridgePort: 43210,
  autoApprove: true,
  autoContinue: true,
  autoContinueDelay: 5,
  humanSpeed: "natural",
  activeProject: "",
  customSystemPrompt: "",
});

export const bridgeConnected = ref(false);
export const bridgeStatusText = ref("Connecting...");
export const isServerStopped = ref(false);
export const isTogglingServer = ref(false);
export const servers = ref<McpServer[]>([]);
export const tools = ref<McpTool[]>([]);
export const activeActions = ref<ToolCallAction[]>([]);
export const projects = ref<ProjectWorkspace[]>([]);
export const skills = ref<SkillItem[]>([]);
export const isGenerating = ref(false);
export const isTaskActive = ref(false);

export async function saveSettings(patch?: Partial<StudioSettings>) {
  if (patch) Object.assign(settings, patch);
  try {
    await chrome.storage.local.set(patch || settings);
  } catch (_) {}
}

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
        "cached_tools",
        "cached_servers",
      ]);
      if (stored.bridgePort) settings.bridgePort = Number(stored.bridgePort);
      else settings.bridgePort = 43210;
      if (stored.autoApprove !== undefined)
        settings.autoApprove = Boolean(stored.autoApprove);
      else settings.autoApprove = true;
      if (stored.autoContinue !== undefined)
        settings.autoContinue = Boolean(stored.autoContinue);
      if (stored.autoContinueDelay)
        settings.autoContinueDelay = Number(stored.autoContinueDelay);
      if (stored.humanSpeed) settings.humanSpeed = stored.humanSpeed;
      if (stored.activeProject) settings.activeProject = stored.activeProject;
      if (
        Array.isArray(stored.cached_tools) &&
        stored.cached_tools.length > 0 &&
        tools.value.length === 0
      ) {
        tools.value = stored.cached_tools;
      }
      if (
        Array.isArray(stored.cached_servers) &&
        stored.cached_servers.length > 0 &&
        servers.value.length === 0
      ) {
        servers.value = stored.cached_servers;
      }
    } catch (_) {}
  }

  return {
    settings,
    bridgeConnected,
    bridgeStatusText,
    isServerStopped,
    isTogglingServer,
    servers,
    tools,
    activeActions,
    projects,
    skills,
    isGenerating,
    isTaskActive,
    onlineServerCount,
    totalToolCount,
    pendingActions,
    loadSettings,
    saveSettings,
  };
}
