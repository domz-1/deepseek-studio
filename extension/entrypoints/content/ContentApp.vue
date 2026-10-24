<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useStudioState, settings } from "../../composables/useStudioState";
import { useBridgeWs } from "../../composables/useBridgeWs";
import { useWatchdog } from "../../composables/useWatchdog";
import { useSkills } from "../../composables/useSkills";
import { useProjects } from "../../composables/useProjects";
import { useChatProjects } from "../../composables/useChatProjects";
import { useToolParser } from "../../composables/useToolParser";
import { useActionCards } from "../../composables/useActionCards";
import { useDeepSeekDom } from "../../composables/useDeepSeekDom";
import { useAgentSystemPrompt } from "../../composables/useAgentSystemPrompt";

import ActionCard from "../../components/ActionCard.vue";
import ChatInputBadge from "../../components/ChatInputBadge.vue";
import SidebarProjectDropdown from "../../components/SidebarProjectDropdown.vue";
import TopFloatingBar from "../../components/TopFloatingBar.vue";

const { activeActions, loadSettings } = useStudioState();
const { connect } = useBridgeWs();
const { startWatchdog, stopWatchdog } = useWatchdog();
const { loadSkills } = useSkills();
const { loadProjects } = useProjects();
const { loadChatProjects, tagCurrentChat, applySidebarFilter } =
  useChatProjects();
const { initPromptAutoInjection } = useAgentSystemPrompt();
const { parseToolCallsFromText } = useToolParser();
const { registerActions } = useActionCards();
const { getChatInput, getSendButton } = useDeepSeekDom();

const showInputBadge = ref(false);
const showSidebarDropdown = ref(false);
let scannerInterval: any = null;
let domDetector: any = null;
let lastKnownPath = "";

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

  // 2. Sidebar Project dropdown anchor: locate 'New chat' row (div._7b40dad or text match)
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

  // 3. Track URL route change for chat-to-project tagging and filtering
  const currentPath = window.location.pathname;
  if (currentPath !== lastKnownPath) {
    lastKnownPath = currentPath;
    tagCurrentChat();
    applySidebarFilter();
  }
}

onMounted(async () => {
  await loadSettings();
  await loadSkills();
  await loadProjects();
  await loadChatProjects();
  connect();
  startWatchdog();

  // Initial tag and filter
  tagCurrentChat();
  applySidebarFilter();

  // Initialize Claude Fable System Prompt auto-injection on first message
  initPromptAutoInjection(getChatInput, getSendButton);

  window.addEventListener("popstate", () => {
    tagCurrentChat();
    applySidebarFilter();
  });

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
  <div class="font-sans pointer-events-none">
    <!-- Top-Right Smooth Hover-Expanded Floating Studio Dot/Bar -->
    <TopFloatingBar />

    <!-- Teleported Chat Input Badge into chat.deepseek.com input area -->
    <Teleport v-if="showInputBadge" to="#ds-chat-input-badge-anchor">
      <ChatInputBadge />
    </Teleport>

    <!-- Teleported Sidebar Project Dropdown below 'New chat' -->
    <Teleport v-if="showSidebarDropdown" to="#ds-sidebar-project-anchor">
      <SidebarProjectDropdown />
    </Teleport>

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
