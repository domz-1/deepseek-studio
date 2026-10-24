<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Cpu, Activity, Pause } from "lucide-vue-next";
import { useStudioState } from "../../composables/useStudioState";
import { useBridgeWs } from "../../composables/useBridgeWs";
import { useWatchdog } from "../../composables/useWatchdog";
import { useSkills } from "../../composables/useSkills";
import { useProjects } from "../../composables/useProjects";
import { useToolParser } from "../../composables/useToolParser";
import { useActionCards } from "../../composables/useActionCards";
import { useDeepSeekDom } from "../../composables/useDeepSeekDom";

import ServerPills from "../../components/ServerPills.vue";
import WatchdogBadge from "../../components/WatchdogBadge.vue";
import ActionCard from "../../components/ActionCard.vue";
import ChatInputBadge from "../../components/ChatInputBadge.vue";
import SidebarProjectDropdown from "../../components/SidebarProjectDropdown.vue";

const {
  bridgeConnected,
  bridgeStatusText,
  isServerStopped,
  activeActions,
  loadSettings,
} = useStudioState();
const { connect } = useBridgeWs();
const { startWatchdog, stopWatchdog } = useWatchdog();
const { loadSkills } = useSkills();
const { loadProjects } = useProjects();
const { parseToolCallsFromText } = useToolParser();
const { registerActions } = useActionCards();
const { getChatInput } = useDeepSeekDom();

const showInputBadge = ref(false);
const showSidebarDropdown = ref(false);
let scannerInterval: any = null;
let domDetector: any = null;

function scanMessagesForTools() {
  const mdBlocks = Array.from(
    document.querySelectorAll("div.ds-markdown"),
  ).filter(
    (el) => !el.closest("div[class*='think' i], div[class*='thought' i]"),
  );
  if (mdBlocks.length === 0) return;

  const latest = mdBlocks[mdBlocks.length - 1];
  const text = latest.textContent || "";
  const detected = parseToolCallsFromText(text);
  if (detected.length > 0) {
    registerActions(detected);
  }
}

function checkDomMounts() {
  // 1. Chat input badge anchor
  const input = getChatInput();
  if (input) {
    const parent =
      input.closest("div.ds-textarea-wrapper") ||
      input.closest("div[class*='textarea' i]") ||
      input.parentElement;
    let anchor = document.getElementById("ds-chat-input-badge-anchor");
    if (!anchor && parent?.parentElement) {
      anchor = document.createElement("div");
      anchor.id = "ds-chat-input-badge-anchor";
      parent.parentElement.insertBefore(anchor, parent);
    }
    showInputBadge.value = !!anchor;
  } else {
    showInputBadge.value = false;
  }

  // 2. Sidebar Project dropdown anchor
  const newChatBtn = Array.from(
    document.querySelectorAll("button, div[role='button'], a"),
  ).find((el) => {
    const text = (el.textContent || "").trim().toLowerCase();
    const aria = (el.getAttribute("aria-label") || "").toLowerCase();
    return text.includes("new chat") || aria.includes("new chat");
  });

  if (newChatBtn) {
    let anchor = document.getElementById("ds-sidebar-project-anchor");
    if (!anchor) {
      anchor = document.createElement("div");
      anchor.id = "ds-sidebar-project-anchor";
      const container =
        newChatBtn.closest(
          "div[class*='newChat' i], div[class*='new-chat' i]",
        ) || newChatBtn.parentElement;
      container?.insertAdjacentElement("afterend", anchor);
    }
    showSidebarDropdown.value = !!anchor;
  } else {
    showSidebarDropdown.value = false;
  }
}

onMounted(async () => {
  await loadSettings();
  await loadSkills();
  await loadProjects();
  connect();
  startWatchdog();
  scannerInterval = setInterval(scanMessagesForTools, 1200);
  domDetector = setInterval(checkDomMounts, 1000);
});

onUnmounted(() => {
  stopWatchdog();
  if (scannerInterval) clearInterval(scannerInterval);
  if (domDetector) clearInterval(domDetector);
});
</script>

<template>
  <div class="fixed bottom-4 right-4 z-[999999] font-sans pointer-events-none">
    <!-- SVG Displacement filter for liquid refraction -->
    <svg
      style="position: absolute; width: 0; height: 0; pointer-events: none"
      aria-hidden="true"
    >
      <defs>
        <filter id="liquid" x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.04"
            numOctaves="3"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>

    <!-- Teleported Chat Input Badge into chat.deepseek.com input area -->
    <Teleport v-if="showInputBadge" to="#ds-chat-input-badge-anchor">
      <ChatInputBadge />
    </Teleport>

    <!-- Teleported Sidebar Project Dropdown -->
    <Teleport v-if="showSidebarDropdown" to="#ds-sidebar-project-anchor">
      <SidebarProjectDropdown />
    </Teleport>

    <!-- Bottom-Right Floating Bar -->
    <div
      class="glass glass--strong glass--liquid flex items-center justify-between gap-3 rounded-full px-3.5 py-1.5 pointer-events-auto border border-white/10 shadow-2xl text-xs select-none"
    >
      <div class="flex items-center gap-2">
        <div
          class="flex items-center gap-1.5 pr-2 border-r border-white/10 text-[11.5px] font-semibold"
          :class="[
            bridgeConnected
              ? 'text-emerald-400'
              : isServerStopped
                ? 'text-amber-400'
                : 'text-slate-400',
          ]"
        >
          <component
            :is="bridgeConnected ? Activity : isServerStopped ? Pause : Cpu"
            :size="13"
            class="shrink-0"
            :class="{ 'animate-pulse': bridgeConnected }"
          />
          <span>Studio {{ bridgeStatusText }}</span>
        </div>
        <ServerPills />
      </div>

      <div class="flex items-center gap-2">
        <WatchdogBadge />
      </div>
    </div>

    <!-- Interactive MCP Action Cards in Chat -->
    <div
      v-if="activeActions.length > 0"
      class="fixed bottom-16 right-4 w-96 max-w-[calc(100vw-32px)] flex flex-col gap-2 pointer-events-auto z-[999999]"
    >
      <ActionCard
        v-for="act in activeActions.slice(-3)"
        :key="act.id"
        :action="act"
      />
    </div>
  </div>
</template>
