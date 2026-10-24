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
const buttonRef = ref<HTMLButtonElement | null>(null);
const coords = ref<{ bottom: string; left: string; width: string }>({
  bottom: "80px",
  left: "24px",
  width: "280px",
});

const filteredProjects = computed(() => {
  const q = searchQuery.value.toLowerCase().trim();
  if (!q) return projects.value;
  return projects.value.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      (p.path && p.path.toLowerCase().includes(q)),
  );
});

function toggleDropdown() {
  isOpen.value = !isOpen.value;
  if (isOpen.value && buttonRef.value) {
    const rect = buttonRef.value.getBoundingClientRect();
    const width = 280;
    const left = Math.max(
      16,
      Math.min(rect.left, window.innerWidth - width - 16),
    );
    coords.value = {
      bottom: `${window.innerHeight - rect.top + 8}px`,
      left: `${left}px`,
      width: `${width}px`,
    };
  }
}

function chooseProject(path: string) {
  selectProject(path);
  isOpen.value = false;
  searchQuery.value = "";
}

function handleClickOutside(e: MouseEvent) {
  const t = e.target as HTMLElement;
  if (
    !t.closest(".project-dropdown-container") &&
    !t.closest(".ds-project-teleport-menu")
  ) {
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
      ref="buttonRef"
      type="button"
      class="glass-interactive inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[11px] font-medium text-slate-200 transition-all max-w-[200px]"
      :title="`Current Workspace: ${activeProjectName}`"
      @click="toggleDropdown"
    >
      <FolderGit2 :size="12" class="text-indigo-400 shrink-0" />
      <span class="truncate">{{ activeProjectName }}</span>
      <ChevronDown
        :size="11"
        class="text-slate-400 shrink-0 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
      />
    </button>

    <!-- Teleported Floating Dropdown Menu -->
    <Teleport to="body">
      <div
        v-if="isOpen"
        :style="{
          position: 'fixed',
          bottom: coords.bottom,
          left: coords.left,
          width: coords.width,
          zIndex: 99999999,
        }"
        class="ds-project-teleport-menu glass glass--strong max-h-72 rounded-2xl border border-white/15 bg-slate-900/95 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col p-1.5 font-sans select-none"
      >
        <div class="p-1.5 mb-1 border-b border-white/10">
          <div
            class="flex items-center gap-1.5 px-2 py-1 bg-black/40 rounded-lg border border-white/10"
          >
            <Search :size="12" class="text-slate-400 shrink-0" />
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Search projects..."
              class="bg-transparent text-[11px] text-white placeholder-slate-400 outline-none w-full"
              @click.stop
            />
          </div>
        </div>

        <div class="overflow-y-auto max-h-56 flex flex-col gap-0.5">
          <div
            class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs cursor-pointer hover:bg-white/10 transition-all"
            :class="{
              'bg-indigo-500/25 text-white font-medium':
                activeProjectName === 'All Workspaces',
            }"
            @click="chooseProject('')"
          >
            <Globe :size="13" class="text-indigo-400 shrink-0" />
            <span class="flex-1 text-[11.5px]">All Workspaces</span>
            <Check
              v-if="activeProjectName === 'All Workspaces'"
              :size="12"
              class="text-indigo-400"
            />
          </div>

          <div
            v-for="p in filteredProjects"
            :key="p.path"
            class="flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs cursor-pointer hover:bg-white/10 transition-all"
            :class="{
              'bg-indigo-500/25 text-white font-medium':
                activeProjectName === p.name,
            }"
            @click="chooseProject(p.path)"
          >
            <Folder :size="13" class="text-indigo-400 shrink-0" />
            <div class="flex-1 overflow-hidden">
              <div class="truncate font-medium text-slate-100 text-[11.5px]">
                {{ p.name }}
              </div>
              <div
                class="text-[9.5px] text-slate-400 truncate font-mono opacity-80"
              >
                {{ p.path }}
              </div>
            </div>
            <Check
              v-if="activeProjectName === p.name"
              :size="12"
              class="text-indigo-400 shrink-0"
            />
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
