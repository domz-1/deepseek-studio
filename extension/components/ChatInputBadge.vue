<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useStudioState } from "../composables/useStudioState";
import { useBridgeWs } from "../composables/useBridgeWs";
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

const { bridgeConnected, isServerStopped, servers } = useStudioState();
const { connect } = useBridgeWs();
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
  const pattern = menuMode.value === "slash" ? /\/([\w-]*)$/ : /@([^\s@]*)$/;
  typeHumanizedText(input, current.replace(pattern, insertedText));
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
      <div
        class="badge-status-pill glass-interactive"
        :class="{ online: bridgeConnected, stopped: isServerStopped }"
        :title="
          bridgeConnected
            ? 'MCP Bridge connected and active'
            : 'Click to retry connecting to Bridge'
        "
        @click="connect"
      >
        <span
          class="status-pulse-dot"
          :class="{ online: bridgeConnected, stopped: isServerStopped }"
        ></span>
        <component
          :is="bridgeConnected ? Activity : Cpu"
          :size="12"
          class="status-icon"
        />
        <span class="status-text">{{
          bridgeConnected
            ? "MCP Active"
            : isServerStopped
              ? "Paused"
              : "Bridge Offline"
        }}</span>
      </div>

      <div class="server-chips">
        <button
          v-for="server in servers"
          :key="server.name"
          type="button"
          class="chip-item glass-interactive"
          :class="{ active: server.status === 'online' }"
          :title="`Insert @${server.name} (${server.toolCount} tools)`"
          @click.prevent="addMention(`@${server.name}`)"
        >
          <component
            :is="getServerIcon(server.name)"
            :size="12"
            class="chip-icon"
          />
          <span class="chip-name">@{{ server.name }}</span>
          <span v-if="server.toolCount" class="chip-count">{{
            server.toolCount
          }}</span>
        </button>

        <button
          type="button"
          class="chip-item all-chip glass-interactive"
          title="Insert @all tools into prompt"
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
  margin-bottom: 6px;
}

.ds-chat-input-badge {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 5px 10px;
  border-radius: var(--r-sm, 10px);
  font-family:
    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 11.5px;
  color: var(--text, #edeff7);
}

.badge-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: var(--r-pill, 9999px);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-muted, #9aa1bc);
  font-weight: 500;
  font-size: 11px;
  cursor: pointer;
  transition: all 200ms var(--ease, ease);
}

.badge-status-pill.online {
  background: rgba(77, 107, 254, 0.12);
  border-color: rgba(77, 107, 254, 0.35);
  color: var(--ds-blue-400, #7c93ff);
}
.badge-status-pill.stopped {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.35);
  color: #fbbf24;
}

.status-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
  flex-shrink: 0;
}
.status-pulse-dot.online {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
  animation: pulse 1.6s infinite alternate;
}
.status-pulse-dot.stopped {
  background: #f59e0b;
  box-shadow: 0 0 6px rgba(245, 158, 11, 0.5);
}

.server-chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}
.chip-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--text-muted, #9aa1bc);
  padding: 3px 8px;
  border-radius: var(--r-pill, 9999px);
  font-size: 11px;
  cursor: pointer;
  transition: all 200ms var(--ease, ease-out);
  outline: none;
}
.chip-item:hover {
  background: rgba(77, 107, 254, 0.15);
  border-color: rgba(124, 147, 255, 0.45);
  color: #ffffff;
  transform: translateY(-1px);
}
.chip-icon {
  color: var(--ds-blue-400, #7c93ff);
}
.chip-count {
  font-size: 9.5px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted, #9aa1bc);
  padding: 0 4px;
  border-radius: 6px;
  font-weight: 600;
}

.all-chip {
  background: linear-gradient(
    135deg,
    rgba(77, 107, 254, 0.28),
    rgba(58, 87, 232, 0.18)
  );
  border-color: rgba(124, 147, 255, 0.45);
  color: #ffffff;
  font-weight: 600;
}
.all-icon {
  color: var(--ds-blue-400, #7c93ff);
}

@keyframes pulse {
  0% {
    opacity: 0.5;
    transform: scale(0.9);
  }
  100% {
    opacity: 1;
    transform: scale(1.15);
  }
}
</style>
