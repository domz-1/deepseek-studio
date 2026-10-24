<script setup lang="ts">
import { useWatchdog } from "../composables/useWatchdog";

const { isPending, countdown, actionType, forceTrigger } = useWatchdog();
</script>

<template>
  <div
    v-if="isPending"
    class="ds-watchdog-badge"
    :title="`Click to immediately trigger ${actionType}`"
    @click="forceTrigger"
  >
    <span class="pulse-icon">⏱️</span>
    <span class="badge-text">
      Auto-{{ actionType }} in <strong>{{ countdown }}s</strong>
    </span>
    <span class="force-click">↵ Click now</span>
  </div>
</template>

<style scoped>
.ds-watchdog-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(15, 23, 42, 0.88);
  border: 1px solid rgba(59, 130, 246, 0.4);
  color: #e2e8f0;
  padding: 6px 14px;
  border-radius: 9999px;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  backdrop-filter: blur(8px);
  user-select: none;
  transition: all 0.2s ease;
}

.ds-watchdog-badge:hover {
  background: rgba(30, 41, 59, 0.95);
  border-color: rgba(59, 130, 246, 0.8);
  transform: translateY(-1px);
}

.pulse-icon {
  display: inline-block;
  animation: pulse 1s infinite alternate;
}

.badge-text strong {
  color: #60a5fa;
  font-weight: 600;
}

.force-click {
  font-size: 11px;
  color: #94a3b8;
  border-left: 1px solid rgba(148, 163, 184, 0.2);
  padding-left: 8px;
}

@keyframes pulse {
  0% {
    transform: scale(0.95);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.05);
    opacity: 1;
  }
}
</style>
