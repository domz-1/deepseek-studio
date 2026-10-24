<script setup lang="ts">
import { useWatchdog } from "../composables/useWatchdog";
import { Clock, RotateCw, CornerDownLeft } from "lucide-vue-next";

const { isPending, countdown, actionType, forceTrigger } = useWatchdog();
</script>

<template>
  <div
    v-if="isPending"
    class="ds-watchdog-badge glass glass--accent glass-interactive"
    :title="`Click to immediately trigger ${actionType}`"
    @click="forceTrigger"
  >
    <component
      :is="actionType === 'Retry' ? RotateCw : Clock"
      :size="13"
      class="pulse-icon"
    />
    <span class="badge-text">
      Auto-{{ actionType }} in <strong>{{ countdown }}s</strong>
    </span>
    <span class="force-click">
      <CornerDownLeft :size="11" />
      <span>Click</span>
    </span>
  </div>
</template>

<style scoped>
.ds-watchdog-badge {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: var(--r-pill, 9999px);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  user-select: none;
}

.pulse-icon {
  display: inline-block;
  animation: pulse 1.2s infinite alternate;
}

.badge-text strong {
  font-weight: 700;
  text-decoration: underline;
}

.force-click {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  border-left: 1px solid rgba(255, 255, 255, 0.25);
  padding-left: 8px;
}

@keyframes pulse {
  0% {
    transform: scale(0.92);
    opacity: 0.8;
  }
  100% {
    transform: scale(1.08);
    opacity: 1;
  }
}
</style>
