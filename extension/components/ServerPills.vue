<script setup lang="ts">
import { useStudioState } from "../composables/useStudioState";

const { servers, onlineServerCount } = useStudioState();
</script>

<template>
  <div class="ds-server-pills">
    <div
      v-for="server in servers"
      :key="server.name"
      class="server-pill"
      :class="server.status"
      :title="`${server.name}: ${server.status} (${server.toolCount || 0} tools)`"
    >
      <span class="status-dot"></span>
      <span class="server-name">{{ server.name }}</span>
      <span v-if="server.toolCount" class="tool-count">{{
        server.toolCount
      }}</span>
    </div>

    <div v-if="servers.length === 0" class="no-servers">
      <span>No MCP servers connected</span>
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
  gap: 5px;
  background: rgba(15, 23, 42, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 11.5px;
  font-family: inherit;
  transition: all 0.15s ease;
}

.server-pill.online {
  border-color: rgba(34, 197, 94, 0.3);
}

.server-pill.online .status-dot {
  background: #22c55e;
  box-shadow: 0 0 6px rgba(34, 197, 94, 0.6);
}

.server-pill.offline .status-dot {
  background: #ef4444;
}

.server-pill.busy .status-dot {
  background: #f59e0b;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
}

.server-name {
  font-weight: 500;
}

.tool-count {
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 5px;
  border-radius: 8px;
  font-size: 10px;
  color: #94a3b8;
}

.no-servers {
  font-size: 11px;
  color: #64748b;
  padding: 2px 6px;
}
</style>
