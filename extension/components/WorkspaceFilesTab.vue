<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useWorkspaceDrawer } from "../composables/useWorkspaceDrawer";
import type { FileTreeNode } from "../types/workspace";
import WorkspaceFilePreview from "./WorkspaceFilePreview.vue";
import { useChatInjection } from "../composables/useChatInjection";
import {
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  RefreshCw,
  Search,
  ChevronRight,
  ChevronDown,
  MessageSquarePlus,
} from "lucide-vue-next";

const { fileTree, loadingTree, selectedFile, fetchFileTree, previewFile } =
  useWorkspaceDrawer();
const { injectSnippetToChat } = useChatInjection();

const searchQuery = ref("");
const openFolders = ref<Record<string, boolean>>({});

onMounted(() => {
  fetchFileTree();
});

function toggleFolder(path: string) {
  openFolders.value[path] = !openFolders.value[path];
}

function matchesSearch(node: FileTreeNode, q: string): boolean {
  if (node.name.toLowerCase().includes(q)) return true;
  if (node.children) {
    return node.children.some((c) => matchesSearch(c, q));
  }
  return false;
}

const filteredTree = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return fileTree.value;
  return fileTree.value.filter((node) => matchesSearch(node, q));
});

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden text-xs text-slate-200">
    <!-- Header with Search & Refresh -->
    <div
      class="p-2.5 border-b border-white/10 bg-slate-900/60 flex items-center gap-2 shrink-0"
    >
      <div class="flex-1 relative">
        <Search
          :size="12"
          class="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter workspace files..."
          class="w-full bg-slate-950 border border-white/10 rounded-md pl-7 pr-2.5 py-1 text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-[11px]"
        />
      </div>
      <button
        @click="fetchFileTree"
        class="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-slate-100 transition-colors"
        title="Refresh File Tree"
      >
        <RefreshCw :size="13" :class="{ 'animate-spin': loadingTree }" />
      </button>
    </div>

    <!-- File Tree Explorer -->
    <div
      class="max-h-56 overflow-y-auto border-b border-white/10 bg-slate-950/40 p-2 space-y-0.5 shrink-0"
    >
      <div
        v-if="loadingTree"
        class="flex items-center justify-center py-6 text-slate-500 gap-2"
      >
        <RefreshCw :size="13" class="animate-spin text-indigo-400" />
        <span>Scanning workspace...</span>
      </div>
      <div
        v-else-if="filteredTree.length === 0"
        class="py-6 text-center text-slate-500"
      >
        No files found in this workspace.
      </div>
      <template v-else>
        <div v-for="node in filteredTree" :key="node.path" class="select-none">
          <!-- Directory Row -->
          <div
            v-if="node.type === 'dir'"
            @click="toggleFolder(node.path)"
            class="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-white/5 cursor-pointer text-slate-300 font-mono text-[11px]"
          >
            <ChevronDown
              v-if="openFolders[node.path]"
              :size="12"
              class="text-slate-500"
            />
            <ChevronRight v-else :size="12" class="text-slate-500" />
            <FolderOpen
              v-if="openFolders[node.path]"
              :size="13"
              class="text-amber-400 shrink-0"
            />
            <Folder v-else :size="13" class="text-amber-400 shrink-0" />
            <span class="truncate font-medium">{{ node.name }}</span>
          </div>

          <!-- Directory Children -->
          <div
            v-if="
              node.type === 'dir' &&
              (openFolders[node.path] || searchQuery.trim())
            "
            class="pl-4 space-y-0.5 border-l border-white/5 ml-3"
          >
            <div
              v-for="sub in node.children"
              :key="sub.path"
              @click="
                sub.type === 'dir'
                  ? toggleFolder(sub.path)
                  : previewFile(sub.path)
              "
              class="group flex items-center justify-between px-2 py-1 rounded hover:bg-white/5 cursor-pointer text-slate-300 font-mono text-[11px]"
              :class="
                selectedFile === sub.path
                  ? 'bg-indigo-500/15 text-indigo-200'
                  : ''
              "
            >
              <div class="flex items-center gap-1.5 truncate">
                <Folder
                  v-if="sub.type === 'dir'"
                  :size="12"
                  class="text-amber-400 shrink-0"
                />
                <FileCode
                  v-else-if="
                    ['ts', 'js', 'vue', 'tsx', 'jsx'].includes(sub.ext || '')
                  "
                  :size="12"
                  class="text-cyan-400 shrink-0"
                />
                <FileText v-else :size="12" class="text-slate-400 shrink-0" />
                <span class="truncate">{{ sub.name }}</span>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button
                  v-if="sub.type === 'file'"
                  @click.stop="injectSnippetToChat('', sub.path)"
                  class="p-0.5 hover:bg-indigo-500/30 text-indigo-300 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Mention in Chat (Ctrl+L)"
                >
                  <MessageSquarePlus :size="11" />
                </button>
                <span
                  v-if="sub.size"
                  class="text-[9px] text-slate-500 font-sans"
                >
                  {{ formatBytes(sub.size) }}
                </span>
              </div>
            </div>
          </div>

          <!-- Root File Row -->
          <div
            v-else-if="node.type === 'file'"
            @click="previewFile(node.path)"
            class="group flex items-center justify-between px-2 py-1 rounded hover:bg-white/5 cursor-pointer text-slate-300 font-mono text-[11px]"
            :class="
              selectedFile === node.path
                ? 'bg-indigo-500/15 text-indigo-200'
                : ''
            "
          >
            <div class="flex items-center gap-1.5 truncate">
              <FileCode
                v-if="
                  ['ts', 'js', 'vue', 'tsx', 'jsx'].includes(node.ext || '')
                "
                :size="12"
                class="text-cyan-400 shrink-0"
              />
              <FileText v-else :size="12" class="text-slate-400 shrink-0" />
              <span class="truncate">{{ node.name }}</span>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button
                @click.stop="injectSnippetToChat('', node.path)"
                class="p-0.5 hover:bg-indigo-500/30 text-indigo-300 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                title="Mention in Chat (Ctrl+L)"
              >
                <MessageSquarePlus :size="11" />
              </button>
              <span
                v-if="node.size"
                class="text-[9px] text-slate-500 font-sans"
              >
                {{ formatBytes(node.size) }}
              </span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Modular File Preview Component -->
    <WorkspaceFilePreview />
  </div>
</template>
