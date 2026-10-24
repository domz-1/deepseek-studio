<script setup lang="ts">
import { computed } from "vue";
import { useWorkspaceDrawer } from "../composables/useWorkspaceDrawer";
import { useChatInjection } from "../composables/useChatInjection";
import {
  Code2,
  ExternalLink,
  RefreshCw,
  FileQuestion,
  MessageSquarePlus,
} from "lucide-vue-next";

const { activeDiffFile, diffContent, loadingDiff, openInEditor } =
  useWorkspaceDrawer();
const { addActiveSelectionToChat } = useChatInjection();

const diffLines = computed(() => {
  if (!diffContent.value) return [];
  return diffContent.value.split("\n").map((line, idx) => {
    let type: "header" | "add" | "del" | "chunk" | "normal" = "normal";
    if (line.startsWith("diff --git") || line.startsWith("index "))
      type = "header";
    else if (line.startsWith("@@")) type = "chunk";
    else if (line.startsWith("+") && !line.startsWith("+++")) type = "add";
    else if (line.startsWith("-") && !line.startsWith("---")) type = "del";
    return { id: idx, text: line, type };
  });
});
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden">
    <!-- Header -->
    <div
      class="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-white/10 shrink-0"
    >
      <div
        class="truncate text-slate-400 font-mono text-[11px] flex items-center gap-1.5"
      >
        <Code2 :size="13" class="text-indigo-400 shrink-0" />
        <span class="truncate">{{ activeDiffFile || "Diff Inspector" }}</span>
      </div>
      <div v-if="activeDiffFile" class="flex items-center gap-1.5 shrink-0">
        <button
          @click="addActiveSelectionToChat(activeDiffFile, diffContent)"
          class="text-[10px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 transition-colors"
          title="Add diff to Chat (Ctrl+L)"
        >
          <MessageSquarePlus :size="11" />
          <span>Add to Chat (Ctrl+L)</span>
        </button>
        <button
          @click="openInEditor(activeDiffFile, 'vscode')"
          class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1"
        >
          <span>VS Code</span>
          <ExternalLink :size="10" />
        </button>
        <button
          @click="openInEditor(activeDiffFile, 'cursor')"
          class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1"
        >
          <span>Cursor</span>
          <ExternalLink :size="10" />
        </button>
      </div>
    </div>

    <!-- Code View -->
    <div
      class="flex-1 overflow-auto bg-slate-950 p-2 font-mono text-[11px] leading-relaxed"
    >
      <div
        v-if="loadingDiff"
        class="flex items-center justify-center py-8 text-slate-500 gap-2"
      >
        <RefreshCw :size="14" class="animate-spin text-indigo-400" />
        <span>Generating diff...</span>
      </div>
      <div
        v-else-if="!activeDiffFile"
        class="flex flex-col items-center justify-center py-12 text-slate-500 gap-2"
      >
        <FileQuestion :size="24" class="text-slate-600" />
        <span>Select a changed file above to inspect diff</span>
      </div>
      <div v-else class="space-y-0.5">
        <div
          v-for="l in diffLines"
          :key="l.id"
          class="px-2 py-0.5 rounded whitespace-pre overflow-x-auto"
          :class="[
            l.type === 'add'
              ? 'bg-emerald-950/40 text-emerald-300 font-medium'
              : '',
            l.type === 'del'
              ? 'bg-rose-950/40 text-rose-300 font-medium line-through'
              : '',
            l.type === 'chunk' ? 'text-cyan-400 bg-cyan-950/20 font-bold' : '',
            l.type === 'header' ? 'text-slate-500 text-[10px]' : '',
            l.type === 'normal' ? 'text-slate-300' : '',
          ]"
        >
          {{ l.text }}
        </div>
      </div>
    </div>
  </div>
</template>
