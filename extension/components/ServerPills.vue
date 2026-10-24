<script setup lang="ts">
import { useStudioState } from "../composables/useStudioState";
import { Globe, Folder, Terminal, Brain, Wrench, Radio } from "lucide-vue-next";

const { servers } = useStudioState();

function getServerIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("chrome") || n.includes("web")) return Globe;
  if (n.includes("file") || n.includes("fs")) return Folder;
  if (n.includes("bash") || n.includes("shell") || n.includes("cmd"))
    return Terminal;
  if (n.includes("memory") || n.includes("knowledge")) return Brain;
  return Wrench;
}
</script>

<template>
  <div class="ds-server-pills">
    <div
      v-for="server in servers"
      :key="server.name"
      class="server-pill glass glass--subtle glass-interactive"
      :class="server.status"
      :title="`${server.name}: ${server.status} (${server.toolCount || 0} tools)`"
    >
      <component
        :is="getServerIcon(server.name)"
        :size="12"
        class="server-icon"
      />
      <span class="server-name">{{ server.name }}</span>
      <span v-if="server.toolCount" class="tool-count">{{
        server.toolCount
      }}</span>
    </div>

    <div v-if="servers.length === 0" class="no-servers">
      <Radio :size="12" class="pulse-icon" />
      <span>No active MCP servers</span>
    </div>
  </div>
</template>

<style scoped>
.ds-server-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.server-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: var(--r-pill, 9999px);
  font-size: 11.5px;
  font-family: inherit;
  color: var(--text, #edeff7);
  transition: all 250ms var(--ease, ease-out);
}

.server-pill:hover {
  border-color: rgba(124, 147, 255, 0.45);
  box-shadow: 0 4px 16px rgba(77, 107, 254, 0.2);
}

.server-icon {
  color: var(--ds-blue-400, #7c93ff);
}

.server-pill.online {
  border-color: rgba(77, 107, 254, 0.3);
}

.server-name {
  font-weight: 500;
  letter-spacing: -0.01em;
}

.tool-count {
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  color: var(--text-muted, #9aa1bc);
  font-weight: 600;
}

.no-servers {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-muted, #9aa1bc);
  padding: 2px 6px;
}

.pulse-icon {
  color: #ef4444;
  animation: pulse 1.5s infinite alternate;
}

@keyframes pulse {
  0% {
    opacity: 0.4;
  }
  100% {
    opacity: 1;
  }
}
</style>
