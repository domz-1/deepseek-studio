<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useStudioState } from "../composables/useStudioState";
import { useDeepSeekDom } from "../composables/useDeepSeekDom";
import { usePromptExecution } from "../composables/usePromptExecution";
import SlashMentionMenu from "./SlashMentionMenu.vue";
import {
  Cpu,
  Globe,
  Folder,
  Terminal,
  Brain,
  Wrench,
  Sparkles,
  Activity,
} from "lucide-vue-next";

const { bridgeConnected, servers } = useStudioState();
const { getChatInput } = useDeepSeekDom();
const { typeHumanizedText } = usePromptExecution();

const menuMode = ref<"slash" | "mention" | null>(null);
const menuQuery = ref("");

function getServerIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("chrome") || n.includes("web")) return Globe;
  if (n.includes("file") || n.includes("fs")) return Folder;
  if (n.includes("bash") || n.includes("shell") || n.includes("cmd"))
    return Terminal;
  if (n.includes("memory") || n.includes("knowledge")) return Brain;
  return Wrench;
}

function onInputChange() {
  const input = getChatInput();
  if (!input) return;
  const val = input.value || "";

  const slashMatch = val.match(/\/([\w-]*)$/);
  const mentionMatch = val.match(/@([^\s@]*)$/);

  if (slashMatch) {
    menuMode.value = "slash";
    menuQuery.value = slashMatch[1] || "";
  } else if (mentionMatch) {
    menuMode.value = "mention";
    menuQuery.value = mentionMatch[1] || "";
  } else {
    menuMode.value = null;
  }
}

function handleMenuSelect(insertedText: string) {
  const input = getChatInput();
  if (!input) return;
  const current = input.value || "";

  if (menuMode.value === "slash") {
    const updated = current.replace(/\/([\w-]*)$/, insertedText);
    typeHumanizedText(input, updated);
  } else if (menuMode.value === "mention") {
    const updated = current.replace(/@([^\s@]*)$/, insertedText);
    typeHumanizedText(input, updated);
  }
  menuMode.value = null;
}

function addMention(mentionText: string) {
  const input = getChatInput();
  if (!input) return;
  input.focus();
  const current = input.value || "";
  if (!current.includes(mentionText)) {
    const sep = current.trim() ? " " : "";
    typeHumanizedText(input, `${current.trim()}${sep}${mentionText} `);
  }
}

let inputWatcher: any = null;

onMounted(() => {
  const input = getChatInput();
  if (input) {
    input.addEventListener("input", onInputChange);
  }
  inputWatcher = setInterval(() => {
    const el = getChatInput();
    if (el && !(el as any).__dsInputWatched) {
      (el as any).__dsInputWatched = true;
      el.addEventListener("input", onInputChange);
    }
  }, 1000);
});

onUnmounted(() => {
  if (inputWatcher) clearInterval(inputWatcher);
});
</script>

<template>
  <div class="ds-chat-input-wrapper">
    <!-- Slash & Mention Popup Menu -->
    <SlashMentionMenu
      v-if="menuMode"
      :query="menuQuery"
      :mode="menuMode"
      @select="handleMenuSelect"
      @close="menuMode = null"
    />

    <!-- Liquid Glass MCP Bar -->
    <div class="ds-chat-input-badge glass glass--subtle glass--liquid">
      <div class="badge-status-pill" :class="{ online: bridgeConnected }">
        <component
          :is="bridgeConnected ? Cpu : Activity"
          :size="13"
          class="status-icon"
        />
        <span class="status-text">{{
          bridgeConnected ? "MCP Active" : "Bridge Offline"
        }}</span>
        <span class="live-pulse" v-if="bridgeConnected"></span>
      </div>

      <div class="server-chips">
        <button
          v-for="server in servers"
          :key="server.name"
          type="button"
          class="chip-item glass-interactive"
          :class="server.status"
          :title="`Insert @${server.name} (${server.toolCount} tools)`"
          @click.prevent="addMention(`@${server.name}`)"
        >
          <component
            :is="getServerIcon(server.name)"
            :size="12"
            class="chip-icon"
          />
          <span class="chip-name">@{{ server.name }}</span>
        </button>

        <button
          type="button"
          class="chip-item all-chip glass-interactive"
          title="Insert @all tools"
          @click.prevent="addMention('@all')"
        >
          <Sparkles :size="12" class="all-icon" />
          <span>@all</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ds-chat-input-wrapper {
  position: relative;
  width: 100%;
  margin-bottom: 8px;
}

.ds-chat-input-badge {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 12px;
  border-radius: var(--r-md, 16px);
  font-family:
    -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
  font-size: 12px;
  color: var(--text, #edeff7);
}

.badge-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: var(--r-pill, 9999px);
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #f87171;
  font-weight: 600;
  font-size: 11px;
  letter-spacing: -0.01em;
}

.badge-status-pill.online {
  background: rgba(77, 107, 254, 0.15);
  border-color: rgba(77, 107, 254, 0.4);
  color: #7c93ff;
}

.live-pulse {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #4d6bfe;
  box-shadow: 0 0 8px #4d6bfe;
  animation: pulse 1.6s infinite alternate;
}

.server-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}

.chip-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-muted, #9aa1bc);
  padding: 4px 10px;
  border-radius: var(--r-pill, 9999px);
  font-size: 11.5px;
  cursor: pointer;
  transition: all 200ms var(--ease, ease-out);
  outline: none;
}

.chip-item:hover {
  background: rgba(77, 107, 254, 0.18);
  border-color: rgba(124, 147, 255, 0.5);
  color: #ffffff;
  transform: translateY(-1px);
}

.chip-icon {
  color: #7c93ff;
}

.all-chip {
  background: linear-gradient(
    135deg,
    rgba(77, 107, 254, 0.25),
    rgba(58, 87, 232, 0.15)
  );
  border-color: rgba(124, 147, 255, 0.4);
  color: #ffffff;
  font-weight: 600;
}

.all-icon {
  color: #7c93ff;
}

@keyframes pulse {
  0% {
    opacity: 0.5;
    transform: scale(0.9);
  }
  100% {
    opacity: 1;
    transform: scale(1.1);
  }
}
</style>
