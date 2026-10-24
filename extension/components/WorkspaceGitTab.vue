<script setup lang="ts">
import { onMounted } from "vue";
import { useWorkspaceDrawer } from "../composables/useWorkspaceDrawer";
import WorkspaceDiffViewer from "./WorkspaceDiffViewer.vue";
import { GitBranch, GitCommit, RotateCcw, RefreshCw, X } from "lucide-vue-next";

const {
  gitStatus,
  loadingStatus,
  activeDiffFile,
  isCommitModalOpen,
  commitMessage,
  isCommitting,
  fetchGitStatus,
  fetchGitDiff,
  revertFile,
  commitChanges,
} = useWorkspaceDrawer();

onMounted(() => {
  fetchGitStatus();
});

async function handleCommit() {
  if (!commitMessage.value.trim() || isCommitting.value) return;
  await commitChanges(commitMessage.value);
}

function getStatusBadge(code: string) {
  if (code.includes("?"))
    return {
      text: "?",
      bg: "bg-purple-500/20 text-purple-300 border-purple-500/40",
    };
  if (code.includes("A"))
    return {
      text: "A",
      bg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
    };
  if (code.includes("D"))
    return { text: "D", bg: "bg-rose-500/20 text-rose-300 border-rose-500/40" };
  return {
    text: "M",
    bg: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  };
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden text-xs text-slate-200">
    <!-- Top Action Bar -->
    <div
      class="flex items-center justify-between p-3 border-b border-white/10 bg-slate-900/60 shrink-0"
    >
      <div class="flex items-center gap-2">
        <GitBranch :size="14" class="text-indigo-400" />
        <span class="font-mono font-medium text-slate-300">{{
          gitStatus.branch || "no git"
        }}</span>
        <span
          class="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-white/10 text-slate-400"
        >
          {{ gitStatus.stats.total }} changes
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          @click="fetchGitStatus"
          class="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-slate-100 transition-colors"
          title="Refresh Git Status"
        >
          <RefreshCw :size="13" :class="{ 'animate-spin': loadingStatus }" />
        </button>
        <button
          v-if="gitStatus.stats.total > 0"
          @click="revertFile('all')"
          class="px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1 transition-colors"
          title="Discard all changes"
        >
          <RotateCcw :size="12" />
          <span>Discard All</span>
        </button>
        <button
          v-if="gitStatus.stats.total > 0"
          @click="isCommitModalOpen = true"
          class="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-medium flex items-center gap-1 shadow-sm transition-colors"
        >
          <GitCommit :size="12" />
          <span>Commit</span>
        </button>
      </div>
    </div>

    <!-- Changed Files List -->
    <div
      class="max-h-48 overflow-y-auto border-b border-white/10 bg-slate-950/40 p-2 space-y-1 shrink-0"
    >
      <div
        v-if="gitStatus.files.length === 0"
        class="py-4 text-center text-slate-500"
      >
        No uncommitted changes in this workspace.
      </div>
      <div
        v-for="f in gitStatus.files"
        :key="f.path"
        @click="fetchGitDiff(f.path)"
        class="group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition-colors border"
        :class="[
          activeDiffFile === f.path
            ? 'bg-indigo-500/15 border-indigo-500/40 text-slate-100'
            : 'border-transparent hover:bg-white/5 text-slate-300',
        ]"
      >
        <div class="flex items-center gap-2 truncate">
          <span
            class="w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center border shrink-0"
            :class="getStatusBadge(f.code).bg"
          >
            {{ getStatusBadge(f.code).text }}
          </span>
          <span class="truncate font-mono text-[11px]">{{ f.path }}</span>
        </div>
        <div
          class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <button
            @click.stop="revertFile(f.path)"
            class="p-1 hover:bg-rose-500/20 rounded text-rose-400"
            title="Discard file changes"
          >
            <RotateCcw :size="11" />
          </button>
        </div>
      </div>
    </div>

    <!-- Modular Diff Viewer Component -->
    <WorkspaceDiffViewer />

    <!-- Commit Dialog Modal -->
    <div
      v-if="isCommitModalOpen"
      class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <div
        class="bg-slate-900 border border-white/15 rounded-xl shadow-2xl p-4 w-full max-w-sm space-y-3"
      >
        <div
          class="flex items-center justify-between pb-2 border-b border-white/10"
        >
          <div class="flex items-center gap-2 font-medium text-slate-100">
            <GitCommit :size="14" class="text-indigo-400" />
            <span>Commit Changes</span>
          </div>
          <button
            @click="isCommitModalOpen = false"
            class="text-slate-400 hover:text-slate-200"
          >
            <X :size="14" />
          </button>
        </div>
        <p class="text-[11px] text-slate-400">
          Enter a commit message. Auto-lowercased to comply with your git
          conventions.
        </p>
        <textarea
          v-model="commitMessage"
          rows="3"
          placeholder="e.g. add workspace drawer component"
          class="w-full bg-slate-950 border border-white/10 rounded-lg p-2 text-xs text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
        ></textarea>
        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            @click="isCommitModalOpen = false"
            class="px-3 py-1.5 rounded text-slate-400 hover:text-slate-200 hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            @click="handleCommit"
            :disabled="!commitMessage.trim() || isCommitting"
            class="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-medium flex items-center gap-1.5"
          >
            <RefreshCw v-if="isCommitting" :size="12" class="animate-spin" />
            <span>{{ isCommitting ? "Committing..." : "Commit" }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
