<script setup lang="ts">
import { ref } from "vue";
import { useWorkspaceDrawer } from "../composables/useWorkspaceDrawer";
import { useChatInjection } from "../composables/useChatInjection";
import {
  FileText,
  RefreshCw,
  ExternalLink,
  MessageSquarePlus,
} from "lucide-vue-next";

const { selectedFile, fileContent, loadingFile, openInEditor } =
  useWorkspaceDrawer();
const { addActiveSelectionToChat } = useChatInjection();

const selectionTooltip = ref<{ x: number; y: number; text: string } | null>(
  null,
);

function handleCodeMouseUp(e: MouseEvent) {
  const sel = window.getSelection();
  const text = sel?.toString()?.trim();
  if (text && text.length > 0) {
    selectionTooltip.value = {
      x: e.clientX,
      y: Math.max(e.clientY - 40, 60),
      text,
    };
  } else {
    selectionTooltip.value = null;
  }
}

function handleAddSelection() {
  if (selectionTooltip.value?.text) {
    addActiveSelectionToChat(selectedFile.value, selectionTooltip.value.text);
    selectionTooltip.value = null;
  } else {
    addActiveSelectionToChat(selectedFile.value, fileContent.value);
  }
}
</script>

<template>
  <div class="flex-1 flex flex-col min-h-0 overflow-hidden relative">
    <!-- Header -->
    <div
      class="flex items-center justify-between px-3 py-1.5 bg-slate-900/80 border-b border-white/10 shrink-0"
    >
      <div class="truncate text-slate-400 font-mono text-[11px]">
        {{
          selectedFile
            ? selectedFile.split("/").slice(-2).join("/")
            : "File Preview"
        }}
      </div>
      <div v-if="selectedFile" class="flex items-center gap-1.5 shrink-0">
        <button
          @click="handleAddSelection"
          class="text-[10px] px-2 py-0.5 rounded bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 transition-colors"
          title="Add selected code or full file to Chat (Ctrl+L)"
        >
          <MessageSquarePlus :size="11" />
          <span>Add to Chat (Ctrl+L)</span>
        </button>
        <button
          @click="openInEditor(selectedFile, 'vscode')"
          class="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1"
        >
          <span>VS Code</span>
          <ExternalLink :size="10" />
        </button>
        <button
          @click="openInEditor(selectedFile, 'cursor')"
          class="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1"
        >
          <span>Cursor</span>
          <ExternalLink :size="10" />
        </button>
      </div>
    </div>

    <!-- Code View with mouseup selection listener -->
    <div
      @mouseup="handleCodeMouseUp"
      class="flex-1 overflow-auto bg-slate-950 p-2 font-mono text-[11px] leading-relaxed select-text"
    >
      <div
        v-if="loadingFile"
        class="flex items-center justify-center py-8 text-slate-500 gap-2"
      >
        <RefreshCw :size="14" class="animate-spin text-indigo-400" />
        <span>Reading file...</span>
      </div>
      <div
        v-else-if="!selectedFile"
        class="flex flex-col items-center justify-center py-12 text-slate-500 gap-2"
      >
        <FileText :size="24" class="text-slate-600" />
        <span>Click any file above to preview code</span>
      </div>
      <pre v-else class="text-slate-300 whitespace-pre font-mono">{{
        fileContent
      }}</pre>
    </div>

    <!-- Floating Selection Action Tooltip -->
    <div
      v-if="selectionTooltip"
      :style="{
        top: selectionTooltip.y + 'px',
        left: selectionTooltip.x + 'px',
      }"
      class="fixed z-[9999999] -translate-x-1/2 -translate-y-full"
    >
      <button
        @click="handleAddSelection"
        class="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium shadow-xl border border-white/20 flex items-center gap-1.5 cursor-pointer animate-fade-in"
      >
        <MessageSquarePlus :size="12" />
        <span>Add Selection to Chat (Ctrl+L)</span>
      </button>
    </div>
  </div>
</template>
