<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useProjects } from "../composables/useProjects";
import { settings } from "../composables/useStudioState";
import { useChatProjects } from "../composables/useChatProjects";
import SidebarProjectItem from "./SidebarProjectItem.vue";
import { Plus, Search } from "lucide-vue-next";

const {
  projects,
  loadProjects,
  selectProject,
  addCustomProject,
  deleteProject,
} = useProjects();
const {
  projectTree,
  loadChatProjects,
  createNewChatInProject,
  openChat,
  togglePinChat,
  applySidebarFilter,
} = useChatProjects();

const openFolders = ref<Record<string, boolean>>({});
const showAddInput = ref(false);
const newPathInput = ref("");
const searchQuery = ref("");

onMounted(async () => {
  await loadProjects();
  await loadChatProjects();
  applySidebarFilter();

  if (settings.activeProject) openFolders.value[settings.activeProject] = true;
  else if (projects.value.length > 0)
    openFolders.value[projects.value[0].path] = true;
});

function toggleFolder(path: string) {
  openFolders.value[path] = !openFolders.value[path];
  selectProject(path);
}

async function handleAddProject() {
  const val = newPathInput.value.trim();
  if (!val) return;
  await addCustomProject(val);
  newPathInput.value = "";
  showAddInput.value = false;
  openFolders.value[val] = true;
}

const filteredProjects = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return projectTree.value;
  return projectTree.value.filter(
    (p) => p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q),
  );
});
</script>

<template>
  <div
    class="ds-sidebar-tree-container mx-2 my-1.5 font-sans select-none text-slate-200"
  >
    <!-- Header: PROJECTS count + Search & Add Toggle -->
    <div
      class="flex items-center justify-between px-2 py-1 mb-1 text-slate-400"
    >
      <div class="flex items-center gap-1.5">
        <span
          class="text-[11px] font-semibold tracking-wider uppercase text-slate-400"
          >Projects</span
        >
        <span
          class="px-1.5 py-0.5 rounded-full text-[9px] font-mono bg-white/10 text-slate-300"
        >
          {{ projects.length }}
        </span>
      </div>
      <div class="flex items-center gap-1">
        <button
          type="button"
          class="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
          title="Add Project"
          @click="showAddInput = !showAddInput"
        >
          <Plus :size="13" />
        </button>
      </div>
    </div>

    <!-- Quick Search Filter for 100+ Projects -->
    <div v-if="projects.length > 8" class="px-1 mb-1.5">
      <div class="relative">
        <Search
          :size="11"
          class="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          v-model="searchQuery"
          type="text"
          :placeholder="`Filter ${projects.length} projects...`"
          class="w-full bg-black/40 border border-white/10 rounded-lg pl-6 pr-2 py-1 text-[11px] text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500/50"
        />
      </div>
    </div>

    <!-- Inline Add Project Form -->
    <div
      v-if="showAddInput"
      class="mb-2 p-1.5 bg-black/40 rounded-xl border border-white/10 flex items-center gap-1.5"
      @click.stop
    >
      <input
        v-model="newPathInput"
        type="text"
        placeholder="/path/to/project"
        class="bg-transparent text-xs text-white placeholder-slate-500 outline-none w-full px-1.5 py-1"
        @keydown.enter="handleAddProject"
      />
      <button
        type="button"
        class="bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] px-2 py-1 rounded-lg font-medium shrink-0"
        @click="handleAddProject"
      >
        Add
      </button>
    </div>

    <!-- Scrollable Project Tree List (Fixed Scrolling & Max Height) -->
    <div class="flex flex-col gap-0.5 max-h-[50vh] overflow-y-auto pr-1">
      <SidebarProjectItem
        v-for="proj in filteredProjects"
        :key="proj.path"
        :proj="proj"
        :is-open="!!openFolders[proj.path]"
        @toggle="toggleFolder"
        @new-chat="createNewChatInProject"
        @delete="deleteProject"
        @open-chat="openChat"
        @toggle-pin="togglePinChat"
      />
      <div
        v-if="filteredProjects.length === 0"
        class="text-[11px] text-slate-500 py-2 text-center"
      >
        No projects match search.
      </div>
    </div>
  </div>
</template>
