<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { useStudioState } from '../../composables/useStudioState';
import { useBridgeWs } from '../../composables/useBridgeWs';
import { useWatchdog } from '../../composables/useWatchdog';
import { useToolParser } from '../../composables/useToolParser';
import { useActionCards } from '../../composables/useActionCards';

import ServerPills from '../../components/ServerPills.vue';
import WatchdogBadge from '../../components/WatchdogBadge.vue';
import ActionCard from '../../components/ActionCard.vue';

const { bridgeConnected, bridgeStatusText, activeActions, loadSettings } = useStudioState();
const { connect } = useBridgeWs();
const { startWatchdog, stopWatchdog } = useWatchdog();
const { parseToolCallsFromText } = useToolParser();
const { registerActions } = useActionCards();

let scannerInterval: any = null;

function scanMessagesForTools() {
  const mdBlocks = Array.from(document.querySelectorAll('div.ds-markdown')).filter(
    (el) => !el.closest("div[class*='think' i], div[class*='thought' i]")
  );
  if (mdBlocks.length === 0) return;

  const latest = mdBlocks[mdBlocks.length - 1];
  const text = latest.textContent || '';
  const detected = parseToolCallsFromText(text);
  if (detected.length > 0) {
    registerActions(detected);
  }
}

onMounted(async () => {
  await loadSettings();
  connect();
  startWatchdog();
  scannerInterval = setInterval(scanMessagesForTools, 1200);
});

onUnmounted(() => {
  stopWatchdog();
  if (scannerInterval) clearInterval(scannerInterval);
});
</script>

<template>
  <div class="ds-studio-root">
    <!-- Top Floating Toolbar -->
    <div class="ds-studio-bar">
      <div class="bar-left">
        <div class="bridge-status" :class="{ online: bridgeConnected }">
          <span class="status-dot"></span>
          <span class="status-label">Studio {{ bridgeStatusText }}</span>
        </div>
        <ServerPills />
      </div>

      <div class="bar-right">
        <WatchdogBadge />
      </div>
    </div>

    <!-- Floating Action Cards Overlay -->
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
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  pointer-events: none;
}

.ds-studio-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 9999px;
  padding: 6px 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(12px);
  pointer-events: auto;
}

.bar-left, .bar-right {
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
  color: #94a3b8;
  padding-right: 6px;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.bridge-status.online {
  color: #4ade80;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ef4444;
}

.bridge-status.online .status-dot {
  background: #22c55e;
  box-shadow: 0 0 6px #22c55e;
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
