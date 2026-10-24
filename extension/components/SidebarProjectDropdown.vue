<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useProjects } from "../composables/useProjects";
import { settings } from "../composables/useStudioState";
import { FolderGit2, Folder, Globe, ChevronDown, Check } from "lucide-vue-next";

const { projects, loadProjects, selectProject } = useProjects();
const isOpen = ref(false);

onMounted(async () => {
  await loadProjects();
});

function toggle() {
  isOpen.value = !isOpen.value;
}

function choose(path: string) {
  selectProject(path);
  isOpen.value = false;
}
</script>

<template>
  <div class="ds-sidebar-project-container">
    <div
      class="project-btn glass glass--subtle glass-interactive"
      @click="toggle"
      title="Switch active workspace project"
    >
      <div class="project-left">
        <component
          :is="settings.activeProject ? FolderGit2 : Globe"
          :size="14"
          class="folder-ic"
        />
        <span class="project-name">{{
          settings.activeProject || "All Workspaces"
        }}</span>
      </div>
      <ChevronDown :size="13" class="chevron" :class="{ open: isOpen }" />
    </div>

    <div v-if="isOpen" class="project-menu glass glass--strong">
      <div
        class="project-menu-item"
        :class="{ active: !settings.activeProject }"
        @click="choose('')"
      >
        <Globe :size="13" class="item-icon" />
        <span class="item-title">All Workspaces</span>
        <Check v-if="!settings.activeProject" :size="12" class="check-icon" />
      </div>

      <div
        v-for="p in projects"
        :key="p.path"
        class="project-menu-item"
        :class="{ active: settings.activeProject === p.path }"
        @click="choose(p.path)"
      >
        <Folder :size="13" class="item-icon" />
        <div class="item-info">
          <div class="item-title">{{ p.name }}</div>
          <div class="item-path">{{ p.path }}</div>
        </div>
        <Check
          v-if="settings.activeProject === p.path"
          :size="12"
          class="check-icon"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.ds-sidebar-project-container {
  position: relative;
  margin: 8px 12px;
  font-family: inherit;
  user-select: none;
}

.project-btn {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: var(--r-sm, 10px);
  color: var(--text, #edeff7);
  font-size: 12.5px;
  cursor: pointer;
}

.project-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.folder-ic {
  color: var(--ds-blue-400, #7c93ff);
  flex-shrink: 0;
}

.project-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.chevron {
  color: var(--text-muted, #9aa1bc);
  transition: transform 250ms var(--ease, ease-out);
  flex-shrink: 0;
}

.chevron.open {
  transform: rotate(180deg);
}

.project-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 6px;
  border-radius: var(--r-md, 16px);
  max-height: 240px;
  overflow-y: auto;
  z-index: 99999;
  padding: 6px;
}

.project-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--r-sm, 10px);
  font-size: 12px;
  color: var(--text, #edeff7);
  cursor: pointer;
  transition: all 150ms var(--ease, ease-out);
}

.project-menu-item:hover {
  background: rgba(77, 107, 254, 0.15);
  color: #ffffff;
}

.project-menu-item.active {
  background: rgba(77, 107, 254, 0.25);
  color: #ffffff;
  font-weight: 600;
}

.item-icon {
  color: var(--ds-blue-400, #7c93ff);
  flex-shrink: 0;
}

.item-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex: 1;
}

.item-title {
  font-weight: 500;
}

.item-path {
  font-size: 10px;
  color: var(--text-muted, #9aa1bc);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.check-icon {
  color: var(--ds-blue-400, #7c93ff);
  margin-left: auto;
  flex-shrink: 0;
}
</style>
