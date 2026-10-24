<script setup lang="ts">
import { ref } from "vue";
import { useStudioState } from "../composables/useStudioState";
import { useBridgeWs } from "../composables/useBridgeWs";
import ServerPills from "./ServerPills.vue";
import WatchdogBadge from "./WatchdogBadge.vue";
import { Activity, Cpu, Pause, Sparkles } from "lucide-vue-next";

const { bridgeConnected, bridgeStatusText, isServerStopped } = useStudioState();
const { connect } = useBridgeWs();
const isHovered = ref(false);
</script>

<template>
  <div
    class="fixed top-3 right-6 z-[999999] font-sans pointer-events-auto select-none"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Collapsed Dot / Pill -->
    <div
      v-if="!isHovered"
      class="glass glass--subtle glass--liquid glass-interactive flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/10 shadow-lg cursor-pointer transition-all duration-300 hover:scale-105"
      :title="`DeepSeek Studio (${bridgeStatusText}) - Hover to expand`"
    >
      <span
        class="w-2 h-2 rounded-full shrink-0"
        :class="[
          bridgeConnected
            ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse'
            : isServerStopped
              ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
              : 'bg-slate-500',
        ]"
      ></span>
      <Sparkles :size="12" class="text-indigo-400 shrink-0" />
      <span class="text-[11px] font-semibold text-slate-200 tracking-tight"
        >Studio</span
      >
    </div>

    <!-- Expanded Liquid Glass Floating Control Bar -->
    <div
      v-else
      class="glass glass--strong glass--liquid flex items-center gap-3 rounded-full px-3.5 py-1.5 border border-white/15 shadow-2xl backdrop-blur-2xl transition-all duration-300 text-xs"
    >
      <div
        class="flex items-center gap-1.5 pr-2 border-r border-white/10 text-[11px] font-semibold cursor-pointer"
        :class="[
          bridgeConnected
            ? 'text-emerald-400'
            : isServerStopped
              ? 'text-amber-400'
              : 'text-slate-400',
        ]"
        :title="bridgeConnected ? 'MCP Bridge active' : 'Click to reconnect'"
        @click="connect"
      >
        <component
          :is="bridgeConnected ? Activity : isServerStopped ? Pause : Cpu"
          :size="13"
          class="shrink-0"
          :class="{ 'animate-pulse': bridgeConnected }"
        />
        <span>Studio {{ bridgeStatusText }}</span>
      </div>

      <!-- Server Pills -->
      <ServerPills />

      <!-- Watchdog Countdown Badge -->
      <WatchdogBadge />
    </div>
  </div>
</template>
