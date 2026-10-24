<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useProjects } from "../composables/useProjects";
import { settings } from "../composables/useStudioState";
import { useChatProjects } from "../composables/useChatProjects";
import {
  Folder,
  ChevronRight,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Check,
  Trash2,
  FolderGit2,
} from "lucide-vue-next";

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
  applySidebarFilter,
} = useChatProjects();

const openFolders = ref<Record<string, boolean>>({});
const showAllChats = ref<Record<string, boolean>>({});
const showAddInput = ref(false);
const newPathInput = ref("");
const activeMenuPath = ref<string | null>(null);

onMounted(async () => {
  await loadProjects();
  await loadChatProjects();
  applySidebarFilter();

  // Expand active project by default, or the first project
  if (settings.activeProject) {
    openFolders.value[settings.activeProject] = true;
  } else if (projects.value.length > 0) {
    openFolders.value[projects.value[0].path] = true;
  }

  window.addEventListener("click", () => {
    activeMenuPath.value = null;
  });
});

function toggleFolder(path: string) {
  openFolders.value[path] = !openFolders.value[path];
  selectProject(path);
}

function toggleShowAll(path: string) {
  showAllChats.value[path] = !showAllChats.value[path];
}

function getVisibleChats(proj: any) {
  if (showAllChats.value[proj.path]) return proj.chats;
  return proj.chats.slice(0, 4);
}

async function handleAddProject() {
  const val = newPathInput.value.trim();
  if (!val) return;
  await addCustomProject(val);
  newPathInput.value = "";
  showAddInput.value = false;
  openFolders.value[val] = true;
}

function toggleMenu(path: string, e: MouseEvent) {
  e.stopPropagation();
  activeMenuPath.value = activeMenuPath.value === path ? null : path;
}
</script>

<template>
  <div
    class="ds-sidebar-tree-container mx-2 my-1.5 font-sans select-none text-slate-200"
  >
    <!-- Header: PROJECTS count + Add Button -->
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
      <button
        type="button"
        class="p-1 rounded-md hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
        title="Add Project"
        @click="showAddInput = !showAddInput"
      >
        <Plus :size="13" />
      </button>
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

    <!-- Project Tree Folders -->
    <div class="flex flex-col gap-0.5">
      <div v-for="proj in projectTree" :key="proj.path" class="flex flex-col">
        <!-- Folder Row -->
        <div
          class="group/proj relative flex items-center justify-between px-2 py-1 rounded-lg cursor-pointer transition-colors text-xs"
          :class="[
            settings.activeProject === proj.path
              ? 'bg-indigo-500/15 text-indigo-200 font-medium'
              : 'text-slate-300 hover:bg-white/5 hover:text-white',
          ]"
          @click="toggleFolder(proj.path)"
        >
          <!-- Left: Chevron + Folder Icon + Name -->
          <div class="flex items-center gap-1.5 truncate min-w-0 mr-1">
            <component
              :is="openFolders[proj.path] ? ChevronDown : ChevronRight"
              :size="13"
              class="text-slate-400 shrink-0"
            />
            <component
              :is="settings.activeProject === proj.path ? FolderGit2 : Folder"
              :size="13"
              class="text-indigo-400 shrink-0"
            />
            <span class="truncate text-[12px]">{{ proj.name }}</span>
            <span
              v-if="proj.chatCount > 0"
              class="text-[9.5px] text-slate-500 font-mono"
            >
              ({{ proj.chatCount }})
            </span>
          </div>

          <!-- Right: Actions on Hover (+ & ...) -->
          <div
            class="flex items-center gap-0.5 opacity-0 group-hover/proj:opacity-100 transition-opacity"
          >
            <button
              type="button"
              class="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
              title="Start new chat in this project"
              @click.stop="createNewChatInProject(proj.path)"
            >
              <Plus :size="12" />
            </button>
            <button
              type="button"
              class="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
              title="Options"
              @click="toggleMenu(proj.path, $event)"
            >
              <MoreHorizontal :size="12" />
            </button>
          </div>

          <!-- Options Popover -->
          <div
            v-if="activeMenuPath === proj.path"
            class="absolute right-2 top-7 z-50 bg-slate-900 border border-white/15 rounded-xl shadow-xl p-1 flex flex-col gap-0.5 text-[11px] min-w-[130px]"
            @click.stop
          >
            <button
              type="button"
              class="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/10 text-left text-slate-200"
              @click="
                selectProject(proj.path);
                activeMenuPath = null;
              "
            >
              <Check :size="11" class="text-indigo-400" />
              <span>Set as Active</span>
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-rose-500/20 text-left text-rose-300"
              @click="
                deleteProject(proj.path);
                activeMenuPath = null;
              "
            >
              <Trash2 :size="11" />
              <span>Remove</span>
            </button>
          </div>
        </div>

        <!-- Nested Chat Tree Items -->
        <div
          v-if="openFolders[proj.path] && proj.chats.length > 0"
          class="flex flex-col ml-3 pl-2 border-l border-white/10 my-0.5"
        >
          <div
            v-for="chat in getVisibleChats(proj)"
            :key="chat.id"
            class="flex items-center justify-between px-2 py-1 rounded-lg text-xs cursor-pointer transition-colors group/chat"
            :class="[
              chat.isActive
                ? 'bg-indigo-500/25 text-indigo-100 font-medium'
                : 'text-slate-400 hover:text-slate-100 hover:bg-white/5',
            ]"
            @click="openChat(chat.id)"
          >
            <!-- Title & Status -->
            <div class="flex items-center gap-1.5 truncate min-w-0 mr-1.5">
              <Check
                v-if="chat.isDone"
                :size="11"
                class="text-emerald-400 shrink-0"
                title="Completed task"
              />
              <span
                v-else
                class="w-1.5 h-1.5 rounded-full shrink-0"
                :class="
                  chat.isActive ? 'bg-indigo-400 animate-pulse' : 'bg-slate-600'
                "
              ></span>
              <span class="truncate text-[11px]">{{ chat.title }}</span>
            </div>

            <!-- Relative Time (e.g. 18h, 2d) -->
            <span class="text-[9.5px] text-slate-500 shrink-0 font-mono">
              {{ chat.timeAgo }}
            </span>
          </div>

          <!-- See all (X) Toggle -->
          <button
            v-if="proj.chats.length > 4"
            type="button"
            class="text-[10px] text-indigo-400/80 hover:text-indigo-300 px-2 py-0.5 text-left transition-colors"
            @click.stop="toggleShowAll(proj.path)"
          >
            {{
              showAllChats[proj.path]
                ? "Show less"
                : `See all (${proj.chats.length})`
            }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
