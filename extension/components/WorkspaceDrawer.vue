<script setup lang="ts">
import { computed } from "vue";
import { useWorkspaceDrawer } from "../composables/useWorkspaceDrawer";
import WorkspaceGitTab from "./WorkspaceGitTab.vue";
import WorkspaceFilesTab from "./WorkspaceFilesTab.vue";
import WorkspaceLogsTab from "./WorkspaceLogsTab.vue";
import { GitBranch, FolderTree, Terminal, X, Sparkles } from "lucide-vue-next";

const {
  isDrawerOpen,
  activeTab,
  gitStatus,
  logs,
  currentProject,
  closeDrawer,
  refreshActiveTab,
} = useWorkspaceDrawer();

function selectTab(tab: "changes" | "files" | "logs") {
  activeTab.value = tab;
  refreshActiveTab();
}

const projectName = computed(() => {
  const parts = currentProject.value.split("/").filter(Boolean);
  return parts.pop() || "Workspace";
});
</script>

<template>
  <div>
    <!-- Backdrop Overlay on mobile/small viewports -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isDrawerOpen"
        @click="closeDrawer"
        class="fixed inset-0 bg-black/40 backdrop-blur-xs z-[999998] md:hidden"
      ></div>
    </Transition>

    <!-- Slide-out Drawer Panel -->
    <Transition
      enter-active-class="transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      enter-from-class="translate-x-full"
      enter-to-class="translate-x-0"
      leave-active-class="transition-transform duration-200 ease-in"
      leave-from-class="translate-x-0"
      leave-to-class="translate-x-full"
    >
      <div
        v-if="isDrawerOpen"
        class="fixed top-0 right-0 h-full w-[480px] sm:w-[560px] max-w-[95vw] z-[999999] bg-slate-900/95 backdrop-blur-2xl border-l border-white/10 shadow-2xl flex flex-col font-sans select-none"
      >
        <!-- Drawer Header -->
        <div
          class="p-3 border-b border-white/10 flex items-center justify-between bg-slate-950/60 shrink-0"
        >
          <div class="flex items-center gap-2.5">
            <div
              class="w-6 h-6 rounded-lg bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400"
            >
              <Sparkles :size="13" />
            </div>
            <div>
              <div class="flex items-center gap-2">
                <span
                  class="text-xs font-semibold text-slate-100 tracking-tight"
                  >Workspace Drawer</span
                >
                <span
                  class="px-1.5 py-0.2 rounded text-[10px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-mono"
                >
                  {{ projectName }}
                </span>
              </div>
            </div>
          </div>
          <button
            @click="closeDrawer"
            class="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 hover:text-slate-100 transition-colors"
            title="Close Drawer (Ctrl+B)"
          >
            <X :size="16" />
          </button>
        </div>

        <!-- Tab Selector Bar -->
        <div
          class="flex items-center px-3 pt-2 gap-2 bg-slate-950/40 border-b border-white/10 shrink-0"
        >
          <!-- Changes Tab Button -->
          <button
            @click="selectTab('changes')"
            class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors relative"
            :class="[
              activeTab === 'changes'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200',
            ]"
          >
            <GitBranch :size="13" />
            <span>Changes</span>
            <span
              v-if="gitStatus.stats.total > 0"
              class="w-4 h-4 rounded-full text-[9px] bg-indigo-500 text-white font-bold flex items-center justify-center ml-0.5"
            >
              {{ gitStatus.stats.total }}
            </span>
          </button>

          <!-- Files Tab Button -->
          <button
            @click="selectTab('files')"
            class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors"
            :class="[
              activeTab === 'files'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200',
            ]"
          >
            <FolderTree :size="13" />
            <span>Files</span>
          </button>

          <!-- Logs Tab Button -->
          <button
            @click="selectTab('logs')"
            class="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors"
            :class="[
              activeTab === 'logs'
                ? 'border-indigo-400 text-indigo-300'
                : 'border-transparent text-slate-400 hover:text-slate-200',
            ]"
          >
            <Terminal :size="13" />
            <span>Logs</span>
            <span
              v-if="logs.length > 0"
              class="px-1 rounded text-[9px] bg-slate-800 text-slate-400 border border-white/10 ml-0.5"
            >
              {{ logs.length }}
            </span>
          </button>
        </div>

        <!-- Drawer Body Content -->
        <div class="flex-1 min-h-0 overflow-hidden relative">
          <WorkspaceGitTab v-if="activeTab === 'changes'" />
          <WorkspaceFilesTab v-else-if="activeTab === 'files'" />
          <WorkspaceLogsTab v-else-if="activeTab === 'logs'" />
        </div>

        <!-- Footer / Shortcut Bar -->
        <div
          class="px-3 py-1.5 bg-slate-950 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-500 shrink-0 font-mono"
        >
          <span class="truncate max-w-[280px]" :title="currentProject">{{
            currentProject
          }}</span>
          <span
            class="shrink-0 bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-400 border border-white/5"
          >
            Toggle: Ctrl+B
          </span>
        </div>
      </div>
    </Transition>
  </div>
</template>
