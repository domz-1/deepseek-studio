<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useStudioState } from "../../composables/useStudioState";
import { useBridgeWs } from "../../composables/useBridgeWs";
import { useWatchdog } from "../../composables/useWatchdog";
import { useSkills } from "../../composables/useSkills";
import { useProjects } from "../../composables/useProjects";
import { useChatProjects } from "../../composables/useChatProjects";
import { useAgentSystemPrompt } from "../../composables/useAgentSystemPrompt";
import { useDeepSeekDom } from "../../composables/useDeepSeekDom";
import { useMessageTurns } from "../../composables/useMessageTurns";
import { useMessageHider } from "../../composables/useMessageHider";

import InlineToolExecution from "../../components/InlineToolExecution.vue";
import ChatInputBadge from "../../components/ChatInputBadge.vue";
import SidebarProjectDropdown from "../../components/SidebarProjectDropdown.vue";
import TopFloatingBar from "../../components/TopFloatingBar.vue";

const { loadSettings } = useStudioState();
const { connect } = useBridgeWs();
const { startWatchdog, stopWatchdog } = useWatchdog();
const { loadSkills } = useSkills();
const { loadProjects } = useProjects();
const {
  loadChatProjects,
  tagCurrentChat,
  applySidebarFilter,
  getCurrentChatId,
} = useChatProjects();
const { initPromptAutoInjection } = useAgentSystemPrompt();
const { getChatInput, getSendButton } = useDeepSeekDom();
const { messageTurns, scanMessagesForTools, resetTurns } = useMessageTurns();
const { processAutomatedMessages } = useMessageHider();

const showSidebarDropdown = ref(false);
let scannerInterval: any = null;
let domDetector: any = null;
let lastKnownPath = "";
let lastChatId: string | null = null;

function checkDomMounts() {
  // Clean up any legacy badge anchor
  const oldAnchor = document.getElementById("ds-chat-input-badge-anchor");
  if (oldAnchor) oldAnchor.remove();

  // Clean up legacy global action anchor
  const oldActionAnchor = document.getElementById("ds-inline-action-anchor");
  if (oldActionAnchor) oldActionAnchor.remove();

  // 1. Sidebar Project dropdown anchor: locate 'New chat' row
  let newChatRow = document.querySelector("div._7b40dad");
  if (!newChatRow) {
    const found = Array.from(document.querySelectorAll("div, button, a")).find(
      (el) => {
        const text = (el.textContent || "").trim().toLowerCase();
        return text === "new chat" || text.includes("new chat");
      },
    );
    newChatRow =
      found?.closest("div[class*='7b40dad'], div[class*='newChat' i]") ||
      found?.parentElement ||
      null;
  }

  if (newChatRow) {
    let anchor = document.getElementById("ds-sidebar-project-anchor");
    if (!anchor) {
      anchor = document.createElement("div");
      anchor.id = "ds-sidebar-project-anchor";
      newChatRow.insertAdjacentElement("afterend", anchor);
    }
    showSidebarDropdown.value = !!anchor;
  } else {
    showSidebarDropdown.value = false;
  }

  // 2. Track URL route change for chat-to-project tagging and filtering
  const currentPath = window.location.pathname;
  const currentChatId = getCurrentChatId();
  if (currentPath !== lastKnownPath) {
    const isRealChatSwitch =
      (lastChatId !== null &&
        currentChatId !== null &&
        lastChatId !== currentChatId) ||
      (lastChatId !== null && currentChatId === null);

    if (isRealChatSwitch) {
      resetTurns();
    }
    lastChatId = currentChatId;
    lastKnownPath = currentPath;
    tagCurrentChat();
    applySidebarFilter();
  }
}

function tickScanner() {
  scanMessagesForTools();
  processAutomatedMessages();
}

onMounted(async () => {
  await loadSettings();
  await loadSkills();
  await loadProjects();
  await loadChatProjects();
  connect();
  startWatchdog();

  lastChatId = getCurrentChatId();
  lastKnownPath = window.location.pathname;

  // Initial tag and filter
  tagCurrentChat();
  applySidebarFilter();

  // Initialize Claude Fable System Prompt auto-injection on first message
  initPromptAutoInjection(getChatInput, getSendButton);

  window.addEventListener("popstate", () => {
    const currentChatId = getCurrentChatId();
    if (lastChatId !== currentChatId) {
      resetTurns();
    }
    lastChatId = currentChatId;
    lastKnownPath = window.location.pathname;
    tagCurrentChat();
    applySidebarFilter();
  });

  scannerInterval = setInterval(tickScanner, 700);
  domDetector = setInterval(checkDomMounts, 1000);
});

onUnmounted(() => {
  stopWatchdog();
  if (scannerInterval) clearInterval(scannerInterval);
  if (domDetector) clearInterval(domDetector);
});
</script>

<template>
  <div class="font-sans pointer-events-none">
    <!-- Top-Right Smooth Hover-Expanded Floating Studio Dot/Bar -->
    <TopFloatingBar />

    <!-- Chat Slash & Mention Popups (teleported internally to body) -->
    <ChatInputBadge />

    <!-- Teleported Sidebar Project Dropdown below 'New chat' -->
    <Teleport v-if="showSidebarDropdown" to="#ds-sidebar-project-anchor">
      <SidebarProjectDropdown />
    </Teleport>

    <!-- Inline Expandable MCP Tool Execution in Chat (In-place per turn) -->
    <template v-for="turn in messageTurns" :key="turn.id">
      <Teleport :to="'#' + turn.anchorId">
        <InlineToolExecution :actions="turn.actions" />
      </Teleport>
    </template>
  </div>
</template>
