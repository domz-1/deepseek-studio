<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useProjects } from "../composables/useProjects";
import { settings } from "../composables/useStudioState";
import {
  FolderGit2,
  Folder,
  Globe,
  ChevronDown,
  Check,
  Search,
} from "lucide-vue-next";

const { projects, activeProjectName, loadProjects, selectProject } =
  useProjects();
const isOpen = ref(false);
const searchQuery = ref("");

onMounted(async () => {
  await loadProjects();
  window.addEventListener("click", handleClickOutside, true);
});

onUnmounted(() => {
  window.removeEventListener("click", handleClickOutside, true);
});

function handleClickOutside(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (!t.closest(".ds-sidebar-project-container")) {
    isOpen.value = false;
  }
}

const filteredProjects = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return projects.value;
  return projects.value.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.path && p.path.toLowerCase().includes(q)),
  );
});

function toggle() {
  isOpen.value = !isOpen.value;
}

function choose(path: string) {
  selectProject(path);
  isOpen.value = false;
  searchQuery.value = "";
}
</script>

<template>
  <div
    class="ds-sidebar-project-container relative mx-3 my-2 font-sans select-none"
  >
    <!-- Project Trigger Button -->
    <div
      class="glass glass--subtle glass-interactive flex justify-between items-center px-3 py-2 rounded-xl text-slate-200 text-xs cursor-pointer border border-white/10 hover:border-indigo-400/30 transition-all"
      title="Switch active workspace project"
      @click="toggle"
    >
      <div class="flex items-center gap-2 overflow-hidden">
        <component
          :is="settings.activeProject ? FolderGit2 : Globe"
          :size="14"
          class="text-indigo-400 shrink-0"
        />
        <span class="truncate font-medium text-slate-100">{{
          activeProjectName
        }}</span>
      </div>
      <ChevronDown
        :size="13"
        class="text-slate-400 shrink-0 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </div>

    <!-- Dropdown Menu -->
    <div
      v-if="isOpen"
      class="glass glass--strong absolute top-full left-0 right-0 mt-1.5 max-h-72 rounded-2xl border border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-2xl z-[99999] overflow-hidden flex flex-col p-1.5"
    >
      <div class="p-1 mb-1 border-b border-white/10">
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

      <div class="overflow-y-auto max-h-56 flex flex-col gap-0.5">
        <div
          class="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-slate-200 cursor-pointer transition-all hover:bg-white/10"
          :class="{
            'bg-indigo-500/25 font-semibold text-white':
              !settings.activeProject,
          }"
          @click="choose('')"
        >
          <Globe :size="13" class="text-indigo-400 shrink-0" />
          <span class="flex-1">All Workspaces</span>
          <Check
            v-if="!settings.activeProject"
            :size="12"
            class="text-indigo-400 shrink-0"
          />
        </div>

        <div
          v-for="p in filteredProjects"
          :key="p.path"
          class="flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs text-slate-200 cursor-pointer transition-all hover:bg-white/10"
          :class="{
            'bg-indigo-500/25 font-semibold text-white':
              settings.activeProject === p.path,
          }"
          @click="choose(p.path)"
        >
          <Folder :size="13" class="text-indigo-400 shrink-0" />
          <div class="flex-1 overflow-hidden flex flex-col">
            <span class="truncate font-medium text-slate-100">{{
              p.name
            }}</span>
            <span
              class="text-[10px] text-slate-400 truncate font-mono opacity-80"
              >{{ p.path }}</span
            >
          </div>
          <Check
            v-if="settings.activeProject === p.path"
            :size="12"
            class="text-indigo-400 shrink-0 ml-auto"
          />
        </div>
      </div>
    </div>
  </div>
</template>
