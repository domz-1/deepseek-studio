<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useStudioState } from "../composables/useStudioState";
import { useDeepSeekDom } from "../composables/useDeepSeekDom";
import { usePromptExecution } from "../composables/usePromptExecution";

const { bridgeConnected, bridgeStatusText, servers, tools } = useStudioState();
const { getChatInput } = useDeepSeekDom();
const { typeHumanizedText } = usePromptExecution();

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
</script>

<template>
  <div class="ds-chat-input-badge">
    <div class="badge-status-pill" :class="{ online: bridgeConnected }">
      <span class="status-indicator"></span>
      <span class="status-text">{{
        bridgeConnected ? "MCP Active" : "Bridge Offline"
      }}</span>
    </div>

    <div class="server-chips">
      <button
        v-for="server in servers"
        :key="server.name"
        type="button"
        class="chip-item"
        :title="`Click to insert @${server.name}`"
        @click.prevent="addMention(`@${server.name}`)"
      >
        <span class="chip-dot" :class="server.status"></span>
        <span class="chip-name">@{{ server.name }}</span>
      </button>

      <button
        type="button"
        class="chip-item all-chip"
        title="Insert @all tools"
        @click.prevent="addMention('@all')"
      >
        <span>@all</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.ds-chat-input-badge {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 6px 12px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  margin-bottom: 8px;
  font-family: inherit;
  font-size: 12px;
  color: #e2e8f0;
  backdrop-filter: blur(8px);
}

.badge-status-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.15);
  color: #f87171;
  font-weight: 600;
  font-size: 11px;
}

.badge-status-pill.online {
  background: rgba(34, 197, 94, 0.15);
  color: #4ade80;
}

.status-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
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
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #cbd5e1;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip-item:hover {
  background: rgba(59, 130, 246, 0.2);
  border-color: rgba(59, 130, 246, 0.5);
  color: #93c5fd;
}

.chip-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #94a3b8;
}

.chip-dot.online {
  background: #22c55e;
}

.chip-dot.offline {
  background: #ef4444;
}

.all-chip {
  background: rgba(59, 130, 246, 0.15);
  border-color: rgba(59, 130, 246, 0.3);
  color: #60a5fa;
  font-weight: 600;
}
</style>
