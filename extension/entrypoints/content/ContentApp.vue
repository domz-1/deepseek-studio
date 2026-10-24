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

import InlineToolExecution from "../../components/InlineToolExecution.vue";
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

const showSidebarDropdown = ref(false);
const hasActionMount = ref(false);
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

  const recent = mdBlocks.slice(-3);
  for (const block of recent) {
    const rawText = block.textContent || "";
    let detected = parseToolCallsFromText(rawText);

    // Fallback if browser parsed <tool_call> as DOM elements instead of text nodes
    if (detected.length === 0 && block.innerHTML.includes("tool_call")) {
      const htmlUnescaped = block.innerHTML
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
      detected = parseToolCallsFromText(htmlUnescaped);
    }

    if (detected.length > 0) {
      registerActions(detected);
    }

    // Clean up raw <tool_call> tags from DOM so user isn't distracted
    if (
      block.innerHTML.includes("tool_call") ||
      (block.textContent && block.textContent.includes("<tool_call>"))
    ) {
      block
        .querySelectorAll(
          "tool_call, [class*='tool_call' i], tool_name, parameters, arguments",
        )
        .forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });

      block.querySelectorAll("p, pre, code").forEach((el) => {
        const txt = el.textContent || "";
        if (txt.includes("<tool_call>") || txt.includes("tool_call>")) {
          const stripped = txt
            .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
            .replace(/<\/?[a-zA-Z0-9_:-]+>/g, "")
            .trim();
          if (stripped === "") {
            (el as HTMLElement).style.display = "none";
          } else {
            el.innerHTML = el.innerHTML
              .replace(/&lt;tool_call&gt;[\s\S]*?&lt;\/tool_call&gt;/gi, "")
              .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
          }
        }
      });
    }
  }
}

function checkDomMounts() {
  // Clean up any legacy input badge anchor so input area is 100% clean
  const oldAnchor = document.getElementById("ds-chat-input-badge-anchor");
  if (oldAnchor) oldAnchor.remove();

  // 1. Sidebar Project dropdown anchor: locate 'New chat' row (div._7b40dad or text match)
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

  // 2. Chat inline tool execution anchor: locate latest assistant markdown block
  const mdBlocks = Array.from(
    document.querySelectorAll("div.ds-markdown"),
  ).filter(
    (el) => !el.closest("div[class*='think' i], div[class*='thought' i]"),
  );
  if (mdBlocks.length > 0) {
    const latest = mdBlocks[mdBlocks.length - 1];
    let anchor = document.getElementById("ds-inline-action-anchor");
    if (!anchor) {
      anchor = document.createElement("div");
      anchor.id = "ds-inline-action-anchor";
      anchor.className = "ds-inline-action-anchor w-full pointer-events-auto";
    }
    if (latest.previousElementSibling !== anchor) {
      latest.insertAdjacentElement("beforebegin", anchor);
    }
    hasActionMount.value = true;
  } else {
    hasActionMount.value = false;
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

    <!-- Chat Slash & Mention Popups (teleported internally to body) -->
    <ChatInputBadge />

    <!-- Teleported Sidebar Project Dropdown below 'New chat' -->
    <Teleport v-if="showSidebarDropdown" to="#ds-sidebar-project-anchor">
      <SidebarProjectDropdown />
    </Teleport>

    <!-- Inline Expandable MCP Tool Execution in Chat (Matching Image 2) -->
    <Teleport
      v-if="hasActionMount && activeActions.length > 0"
      to="#ds-inline-action-anchor"
    >
      <InlineToolExecution />
    </Teleport>
  </div>
</template>
