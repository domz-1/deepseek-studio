<script setup lang="ts">
import { useWatchdog } from "../composables/useWatchdog";
import { Clock, RotateCw, CornerDownLeft } from "lucide-vue-next";

const { isPending, countdown, actionType, forceTrigger } = useWatchdog();
</script>

<template>
  <div
    v-if="isPending"
    class="glass glass--accent glass-interactive inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-sans text-white cursor-pointer select-none border border-white/20 shadow-lg"
    :title="`Click to immediately trigger ${actionType}`"
    @click="forceTrigger"
  >
    <component
      :is="actionType === 'Retry' ? RotateCw : Clock"
      :size="13"
      class="animate-pulse text-indigo-200 shrink-0"
    />
    <span>
      Auto-{{ actionType }} in
      <strong class="font-bold underline">{{ countdown }}s</strong>
    </span>
    <span
      class="inline-flex items-center gap-0.5 text-[10.5px] text-white/80 border-l border-white/20 pl-2 ml-1"
    >
      <CornerDownLeft :size="10" />
      <span>Click</span>
    </span>
  </div>
</template>
