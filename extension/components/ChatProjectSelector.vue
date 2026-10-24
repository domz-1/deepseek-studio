<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useProjects } from "../composables/useProjects";
import {
  FolderGit2,
  Folder,
  Globe,
  ChevronDown,
  Check,
  Search,
} from "lucide-vue-next";

const { projects, activeProjectName, selectProject } = useProjects();
const isOpen = ref(false);
const searchQuery = ref("");

const filteredProjects = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return projects.value;
  return projects.value.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.path && p.path.toLowerCase().includes(q)),
  );
});

function chooseProject(path: string) {
  selectProject(path);
  isOpen.value = false;
  searchQuery.value = "";
}

function handleClickOutside(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (!t.closest(".project-dropdown-container")) {
    isOpen.value = false;
  }
}

onMounted(() => {
  window.addEventListener("click", handleClickOutside, true);
});

onUnmounted(() => {
  window.removeEventListener("click", handleClickOutside, true);
});
</script>

<template>
  <div class="relative project-dropdown-container">
    <button
      type="button"
      class="glass-interactive inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-200 transition-all max-w-[200px]"
      :title="`Current Workspace: ${activeProjectName}`"
      @click="isOpen = !isOpen"
    >
      <FolderGit2 :size="12" class="text-indigo-400 shrink-0" />
      <span class="truncate">{{ activeProjectName }}</span>
      <ChevronDown
        :size="11"
        class="text-slate-400 shrink-0 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <!-- Dropdown Menu -->
    <div
      v-if="isOpen"
      class="absolute bottom-full left-0 mb-2 w-72 max-h-64 rounded-xl border border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-2xl z-[9999999] overflow-hidden flex flex-col"
    >
      <div class="p-2 border-b border-white/10 bg-white/5">
        <div
          class="flex items-center gap-1.5 px-2 py-1 bg-black/40 rounded-lg border border-white/10"
        >
          <Search :size="12" class="text-slate-400 shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search projects..."
            class="bg-transparent text-xs text-white placeholder-slate-400 outline-none w-full"
            @click.stop
          />
        </div>
      </div>

      <div class="overflow-y-auto max-h-48 p-1 flex flex-col gap-0.5">
        <div
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-white/10"
          :class="{
            'bg-indigo-500/25 text-white font-medium':
              activeProjectName === 'All Workspaces',
          }"
          @click="chooseProject('')"
        >
          <Globe :size="13" class="text-indigo-400 shrink-0" />
          <span class="flex-1">All Workspaces</span>
          <Check
            v-if="activeProjectName === 'All Workspaces'"
            :size="12"
            class="text-indigo-400"
          />
        </div>

        <div
          v-for="p in filteredProjects"
          :key="p.path"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer hover:bg-white/10"
          :class="{
            'bg-indigo-500/25 text-white font-medium':
              activeProjectName === p.name,
          }"
          @click="chooseProject(p.path)"
        >
          <Folder :size="13" class="text-indigo-400 shrink-0" />
          <div class="flex-1 overflow-hidden">
            <div class="truncate font-medium text-slate-100">
              {{ p.name }}
            </div>
            <div class="text-[10px] text-slate-400 truncate font-mono">
              {{ p.path }}
            </div>
          </div>
          <Check
            v-if="activeProjectName === p.name"
            :size="12"
            class="text-indigo-400"
          />
        </div>
      </div>
    </div>
  </div>
</template>
