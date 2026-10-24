<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Cpu, Activity } from "lucide-vue-next";
import { useStudioState } from "../../composables/useStudioState";
import { useBridgeWs } from "../../composables/useBridgeWs";
import { useWatchdog } from "../../composables/useWatchdog";
import { useToolParser } from "../../composables/useToolParser";
import { useActionCards } from "../../composables/useActionCards";
import { useDeepSeekDom } from "../../composables/useDeepSeekDom";

import ServerPills from "../../components/ServerPills.vue";
import WatchdogBadge from "../../components/WatchdogBadge.vue";
import ActionCard from "../../components/ActionCard.vue";
import ChatInputBadge from "../../components/ChatInputBadge.vue";
import SidebarProjectDropdown from "../../components/SidebarProjectDropdown.vue";

const { bridgeConnected, bridgeStatusText, activeActions, loadSettings } =
  useStudioState();
const { connect } = useBridgeWs();
const { startWatchdog, stopWatchdog } = useWatchdog();
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
    showInputBadge.value = true;
    const parent =
      input.closest("div.ds-textarea-wrapper") || input.parentElement;
    const mountContainer = document.getElementById(
      "ds-chat-input-badge-anchor",
    );
    if (parent && !mountContainer) {
      const anchor = document.createElement("div");
      anchor.id = "ds-chat-input-badge-anchor";
      parent.parentElement?.insertBefore(anchor, parent);
    }
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

  const sidebarAnchor = document.getElementById("ds-sidebar-project-anchor");
  if (newChatBtn && !sidebarAnchor) {
    showSidebarDropdown.value = true;
    const anchor = document.createElement("div");
    anchor.id = "ds-sidebar-project-anchor";
    const targetParent =
      newChatBtn.parentElement?.parentElement || newChatBtn.parentElement;
    targetParent?.parentElement?.insertBefore(anchor, targetParent.nextSibling);
  }
}

onMounted(async () => {
  await loadSettings();
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
  <div class="ds-studio-root">
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
    <div class="ds-studio-bar glass glass--strong glass--liquid">
      <div class="bar-left">
        <div class="bridge-status" :class="{ online: bridgeConnected }">
          <component
            :is="bridgeConnected ? Activity : Cpu"
            :size="13"
            class="status-icon"
            :class="{ 'pulse-active': bridgeConnected }"
          />
          <span class="status-label">Studio {{ bridgeStatusText }}</span>
        </div>
        <ServerPills />
      </div>

      <div class="bar-right">
        <WatchdogBadge />
      </div>
    </div>

    <!-- Interactive MCP Action Cards in Chat -->
    <div v-if="activeActions.length > 0" class="ds-cards-container">
      <ActionCard
        v-for="act in activeActions.slice(-3)"
        :key="act.id"
        :action="act"
      />
    </div>
  </div>
</template>

<style scoped>
.ds-studio-root {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 999999;
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial,
    sans-serif;
  pointer-events: none;
}

.ds-studio-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-radius: var(--r-pill, 9999px);
  padding: 6px 14px;
  pointer-events: auto;
}

.bar-left,
.bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bridge-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-muted, #94a3b8);
  padding-right: 8px;
  border-right: 1px solid var(--border, rgba(255, 255, 255, 0.1));
}

.bridge-status.online {
  color: #4ade80;
}

.status-icon {
  flex-shrink: 0;
}

.bridge-status.online .status-icon {
  color: #4ade80;
  filter: drop-shadow(0 0 4px rgba(74, 222, 128, 0.5));
}

.pulse-active {
  animation: pulse-glow 2s infinite ease-in-out;
}

@keyframes pulse-glow {
  0%,
  100% {
    opacity: 0.8;
    transform: scale(0.95);
  }
  50% {
    opacity: 1;
    transform: scale(1.05);
  }
}

.ds-cards-container {
  position: fixed;
  bottom: 70px;
  right: 16px;
  width: 380px;
  max-width: calc(100vw - 32px);
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: auto;
}
</style>
