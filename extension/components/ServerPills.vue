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
  <div
    class="flex items-center flex-nowrap whitespace-nowrap gap-1.5 font-sans"
  >
    <div
      v-for="server in servers"
      :key="server.name"
      class="glass glass--subtle glass-interactive inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs text-slate-200 border border-white/10 hover:border-indigo-400/40 hover:shadow-md transition-all cursor-default"
      :class="{
        'border-indigo-400/30 bg-indigo-500/10': server.status === 'online',
      }"
      :title="`${server.name}: ${server.status} (${server.toolCount || 0} tools)`"
    >
      <component
        :is="getServerIcon(server.name)"
        :size="12"
        class="text-indigo-400 shrink-0"
      />
      <span class="font-medium tracking-tight">{{ server.name }}</span>
      <span
        v-if="server.toolCount"
        class="bg-white/10 text-slate-300 text-[9.5px] px-1.5 py-0.2 rounded-md font-mono font-semibold"
      >
        {{ server.toolCount }}
      </span>
    </div>

    <div
      v-if="servers.length === 0"
      class="inline-flex items-center gap-1.5 text-xs text-slate-400 px-1.5 py-0.5"
    >
      <Radio :size="12" class="text-rose-400 animate-pulse shrink-0" />
      <span>No active MCP servers</span>
    </div>
  </div>
</template>
