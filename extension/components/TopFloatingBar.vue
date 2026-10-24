<script setup lang="ts">
import { ref } from "vue";
import { useStudioState } from "../composables/useStudioState";
import { useBridgeWs } from "../composables/useBridgeWs";
import ServerPills from "./ServerPills.vue";
import WatchdogBadge from "./WatchdogBadge.vue";
import ChatExportMenu from "./ChatExportMenu.vue";
import { Activity, Cpu, Pause, Sparkles, GitBranch } from "lucide-vue-next";
import { useWorkspaceDrawer } from "../composables/useWorkspaceDrawer";

const { bridgeConnected, bridgeStatusText, isServerStopped } = useStudioState();
const { connect } = useBridgeWs();
const { toggleDrawer, gitStatus } = useWorkspaceDrawer();
const isHovered = ref(false);
</script>

<template>
  <div
    class="fixed top-3 right-6 z-[999999] font-sans pointer-events-auto select-none flex items-center"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Strictly Compact Liquid Glass Morphing Pill Container (Fixed h-8) -->
    <div
      class="glass glass--subtle glass--liquid h-8 max-h-8 flex items-center flex-nowrap whitespace-nowrap rounded-full border border-white/15 shadow-xl backdrop-blur-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] cursor-pointer"
      :class="[
        isHovered
          ? 'max-w-[900px] overflow-visible px-3.5 bg-slate-900/95 border-indigo-400/40 shadow-indigo-500/10'
          : 'max-w-[105px] overflow-hidden px-2.5 bg-slate-900/80 hover:scale-105',
      ]"
      :title="`DeepSeek Studio (${bridgeStatusText}) - Hover to expand controls`"
    >
      <!-- Always visible indicator & title -->
      <div class="flex items-center gap-2 shrink-0">
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
        <span class="text-[11px] font-semibold text-slate-100 tracking-tight"
          >Studio</span
        >
      </div>

      <!-- Animated Reveal Panel on Hover (Only rendered on hover to prevent height stretching) -->
      <Transition
        enter-active-class="transition-all duration-200 ease-out"
        enter-from-class="opacity-0 translate-x-2"
        enter-to-class="opacity-100 translate-x-0"
        leave-active-class="transition-all duration-150 ease-in"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <div
          v-if="isHovered"
          class="flex items-center flex-nowrap whitespace-nowrap gap-2.5 pl-3 ml-2.5 border-l border-white/10 shrink-0 h-full overflow-visible"
        >
          <!-- Reconnect & Status Trigger -->
          <button
            type="button"
            class="flex items-center gap-1.5 text-[11px] font-medium cursor-pointer hover:opacity-80 transition-opacity whitespace-nowrap shrink-0"
            :class="[
              bridgeConnected
                ? 'text-emerald-400'
                : isServerStopped
                  ? 'text-amber-400'
                  : 'text-slate-400',
            ]"
            :title="
              bridgeConnected ? 'MCP Bridge active' : 'Click to reconnect'
            "
            @click="connect"
          >
            <component
              :is="bridgeConnected ? Activity : isServerStopped ? Pause : Cpu"
              :size="12"
              class="shrink-0"
              :class="{ 'animate-pulse': bridgeConnected }"
            />
            <span class="whitespace-nowrap">{{ bridgeStatusText }}</span>
          </button>

          <!-- Workspace Drawer Trigger -->
          <button
            type="button"
            @click="toggleDrawer()"
            class="flex items-center gap-1.5 text-[11px] font-medium text-slate-300 hover:text-indigo-300 transition-colors cursor-pointer px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10"
            title="Toggle Workspace Drawer (Ctrl+B)"
          >
            <GitBranch :size="12" class="text-indigo-400 shrink-0" />
            <span>Workspace</span>
            <span
              v-if="gitStatus.stats.total > 0"
              class="w-3.5 h-3.5 rounded-full text-[9px] bg-indigo-500 text-white font-bold flex items-center justify-center ml-0.5"
            >
              {{ gitStatus.stats.total }}
            </span>
          </button>

          <!-- Export Chat Dropdown -->
          <ChatExportMenu />

          <!-- Watchdog Countdown Badge -->
          <WatchdogBadge />

          <!-- Server Pills -->
          <ServerPills />
        </div>
      </Transition>
    </div>
  </div>
</template>
