<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { useProjects } from "../composables/useProjects";
import { settings } from "../composables/useStudioState";
import { useChatProjects } from "../composables/useChatProjects";
import {
  FolderGit2,
  Folder,
  Globe,
  ChevronDown,
  Check,
  Search,
  Plus,
  Filter,
  Star,
  MessageSquare,
} from "lucide-vue-next";

const {
  projects,
  activeProjectName,
  loadProjects,
  selectProject,
  addCustomProject,
} = useProjects();
const {
  filterByActiveProject,
  activeProjectChatCount,
  activeProjectChats,
  getCurrentChatId,
  setFilterByProject,
  applySidebarFilter,
} = useChatProjects();

const isOpen = ref(false);
const searchQuery = ref("");
const showAddInput = ref(false);
const newPathInput = ref("");
const triggerRef = ref<HTMLElement | null>(null);
const dropdownCoords = ref<{ top: string; left: string; width: string }>({
  top: "0px",
  left: "0px",
  width: "270px",
});

function cleanName(raw: string) {
  return (raw || "").replace(/^[⭐📁✨\s]+/, "").trim();
}

function updateCoords() {
  if (!triggerRef.value) return;
  const rect = triggerRef.value.getBoundingClientRect();
  dropdownCoords.value = {
    top: `${rect.bottom + 6}px`,
    left: `${Math.max(8, rect.left)}px`,
    width: `${Math.max(270, rect.width)}px`,
  };
}

onMounted(async () => {
  await loadProjects();
  window.addEventListener(
    "click",
    (e) => {
      const t = e.target as HTMLElement;
      if (
        !t.closest(".ds-sidebar-project-container") &&
        !t.closest(".ds-sidebar-project-menu")
      ) {
        isOpen.value = false;
        showAddInput.value = false;
      }
    },
    true,
  );
  window.addEventListener("resize", updateCoords);
});

onUnmounted(() => {
  window.removeEventListener("resize", updateCoords);
});

const filteredProjects = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return projects.value;
  return projects.value.filter(
    (p) =>
      cleanName(p.name).toLowerCase().includes(q) ||
      (p.path && p.path.toLowerCase().includes(q)),
  );
});

function toggleDropdown() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) nextTick(updateCoords);
}

async function chooseProject(path: string) {
  await selectProject(path);
  isOpen.value = false;
  searchQuery.value = "";
  applySidebarFilter();
}

async function handleAddProject() {
  const val = newPathInput.value.trim();
  if (!val) return;
  await addCustomProject(val);
  newPathInput.value = "";
  showAddInput.value = false;
  isOpen.value = false;
  applySidebarFilter();
}
</script>

<template>
  <div
    ref="triggerRef"
    class="ds-sidebar-project-container mx-2.5 my-1.5 font-sans select-none"
  >
    <!-- Main Project Card in Sidebar -->
    <div
      class="glass glass--subtle glass-interactive flex flex-col gap-1.5 p-2 rounded-2xl border border-white/10 hover:border-indigo-400/40 transition-all bg-white/[0.03] shadow-md"
    >
      <!-- Trigger Button -->
      <div
        class="flex items-center justify-between cursor-pointer px-1 py-0.5"
        :title="`Current Project: ${settings.activeProject || 'All Workspaces'}`"
        @click="toggleDropdown"
      >
        <div class="flex items-center gap-2 overflow-hidden">
          <component
            :is="settings.activeProject ? FolderGit2 : Globe"
            :size="14"
            class="text-indigo-400 shrink-0"
          />
          <div class="flex flex-col min-w-0">
            <span
              class="text-[9.5px] text-slate-400 uppercase tracking-wider font-semibold"
              >Active Project</span
            >
            <span class="truncate font-semibold text-slate-100 text-xs">{{
              cleanName(activeProjectName)
            }}</span>
          </div>
        </div>
        <ChevronDown
          :size="14"
          class="text-slate-400 shrink-0 transition-transform duration-200"
          :class="{ 'rotate-180': isOpen }"
        />
      </div>

      <!-- Filter Toggle & Count -->
      <div
        class="flex items-center justify-between pt-1 border-t border-white/10 text-[10px]"
      >
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-0.5 rounded-full border transition-all"
          :class="[
            filterByActiveProject
              ? 'bg-indigo-500/25 border-indigo-400/50 text-indigo-300 font-semibold'
              : 'bg-white/5 border-white/10 text-slate-400 hover:text-slate-200',
          ]"
          @click="setFilterByProject(!filterByActiveProject)"
        >
          <Filter :size="10" />
          <span>{{
            filterByActiveProject ? "Filtered to Project" : "All Chats"
          }}</span>
        </button>
        <span class="text-slate-400 text-[10px]"
          >{{ activeProjectChatCount }} chats in project</span
        >
      </div>

      <!-- Grouped Project Chats List -->
      <div
        v-if="settings.activeProject && activeProjectChats.length > 0"
        class="mt-1 pt-1 border-t border-white/10 flex flex-col gap-0.5"
      >
        <div
          class="text-[9px] uppercase font-bold text-indigo-300 tracking-wider px-1 flex items-center justify-between"
        >
          <span>Project Group Chats</span>
          <span
            class="bg-indigo-400/20 text-indigo-200 px-1.5 rounded-full text-[8.5px] font-mono"
            >{{ activeProjectChats.length }}</span
          >
        </div>
        <div class="max-h-28 overflow-y-auto flex flex-col gap-0.5 pr-0.5">
          <a
            v-for="c in activeProjectChats"
            :key="c.id"
            :href="c.url"
            class="px-2 py-1 rounded-lg text-xs text-slate-300 hover:text-white hover:bg-white/10 flex items-center gap-1.5 transition-all truncate"
            :class="{
              'bg-indigo-500/20 text-indigo-200 font-medium':
                getCurrentChatId() === c.id,
            }"
          >
            <MessageSquare :size="10" class="text-indigo-400 shrink-0" />
            <span class="truncate text-[10.5px]">{{ c.title }}</span>
          </a>
        </div>
      </div>
    </div>

    <!-- Teleported Floating Dropdown Menu -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        class="ds-sidebar-project-menu glass glass--strong fixed rounded-2xl border border-white/15 bg-slate-900/95 backdrop-blur-2xl shadow-[0_16px_40px_rgba(0,0,0,0.5)] z-[99999999] overflow-hidden flex flex-col p-2 text-slate-100 font-sans"
        :style="{
          top: dropdownCoords.top,
          left: dropdownCoords.left,
          width: dropdownCoords.width,
          maxHeight: '380px',
        }"
      >
        <!-- Search bar -->
        <div
          class="flex items-center gap-1.5 px-2.5 py-1.5 bg-black/40 rounded-xl border border-white/10 mb-1.5"
        >
          <Search :size="13" class="text-slate-400 shrink-0" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search projects..."
            class="bg-transparent text-xs text-white placeholder-slate-400 outline-none w-full"
            @click.stop
          />
        </div>

        <!-- Add Custom Project -->
        <div
          v-if="!showAddInput"
          class="px-1 py-1 mb-1 border-b border-white/10"
        >
          <button
            type="button"
            class="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/30 text-indigo-300 text-[11px] font-medium transition-all"
            @click.stop="showAddInput = true"
          >
            <Plus :size="12" />
            <span>+ Add Project / Custom Path</span>
          </button>
        </div>
        <div
          v-else
          class="flex items-center gap-1.5 p-1 mb-1 border-b border-white/10"
          @click.stop
        >
          <input
            v-model="newPathInput"
            type="text"
            placeholder="/path/to/project"
            class="bg-black/50 border border-white/15 text-xs text-white px-2 py-1 rounded-lg w-full outline-none"
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

        <!-- Project List with Lucide Icons (No Emojis) -->
        <div class="overflow-y-auto max-h-56 flex flex-col gap-0.5 p-0.5">
          <div
            class="flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer text-xs transition-all"
            :class="[
              !settings.activeProject
                ? 'bg-indigo-500/25 text-white font-medium border border-indigo-400/30'
                : 'hover:bg-white/5 text-slate-300 border border-transparent',
            ]"
            @click="chooseProject('')"
          >
            <div class="flex items-center gap-2 overflow-hidden">
              <Globe :size="13" class="text-indigo-400 shrink-0" />
              <span>All Workspaces</span>
            </div>
            <Check
              v-if="!settings.activeProject"
              :size="13"
              class="text-indigo-400 shrink-0"
            />
          </div>

          <div
            v-for="p in filteredProjects"
            :key="p.path || p.name"
            class="flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer text-xs transition-all"
            :class="[
              settings.activeProject === p.path
                ? 'bg-indigo-500/25 text-white font-medium border border-indigo-400/30'
                : 'hover:bg-white/5 text-slate-300 border border-transparent',
            ]"
            @click="chooseProject(p.path)"
          >
            <div class="flex items-center gap-2 overflow-hidden min-w-0">
              <Star
                v-if="p.custom"
                :size="13"
                class="text-amber-400 fill-amber-400/20 shrink-0"
              />
              <FolderGit2 v-else :size="13" class="text-indigo-400 shrink-0" />
              <div class="flex flex-col min-w-0">
                <span
                  class="truncate font-medium text-slate-100 text-[11.5px]"
                  >{{ cleanName(p.name) }}</span
                >
                <span class="truncate text-[10px] text-slate-400 opacity-80">{{
                  p.path
                }}</span>
              </div>
            </div>
            <Check
              v-if="settings.activeProject === p.path"
              :size="13"
              class="text-indigo-400 shrink-0 ml-1"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
