<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useProjects } from "../composables/useProjects";
import { settings } from "../composables/useStudioState";

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
    <div class="project-btn" @click="toggle">
      <div class="project-left">
        <span class="folder-ic">📁</span>
        <span class="project-name">{{
          settings.activeProject || "All Workspaces"
        }}</span>
      </div>
      <span class="chevron" :class="{ open: isOpen }">▼</span>
    </div>

    <div v-if="isOpen" class="project-menu">
      <div
        class="project-menu-item"
        :class="{ active: !settings.activeProject }"
        @click="choose('')"
      >
        <span>🌐</span>
        <span>All Workspaces</span>
      </div>
      <div
        v-for="p in projects"
        :key="p.path"
        class="project-menu-item"
        :class="{ active: settings.activeProject === p.path }"
        @click="choose(p.path)"
      >
        <span>📁</span>
        <div class="item-info">
          <div class="item-title">{{ p.name }}</div>
          <div class="item-path">{{ p.path }}</div>
        </div>
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
  background: rgba(30, 41, 59, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 8px 12px;
  color: #cbd5e1;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.project-btn:hover {
  background: rgba(30, 41, 59, 0.95);
  border-color: rgba(59, 130, 246, 0.4);
  color: #f8fafc;
}

.project-left {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
}

.project-name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 500;
}

.chevron {
  font-size: 9px;
  color: #94a3b8;
  transition: transform 0.2s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.project-menu {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: #0f172a;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  max-height: 220px;
  overflow-y: auto;
  z-index: 99999;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
  padding: 4px;
}

.project-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  color: #cbd5e1;
  cursor: pointer;
  transition: background 0.15s;
}

.project-menu-item:hover {
  background: rgba(59, 130, 246, 0.15);
  color: #60a5fa;
}

.project-menu-item.active {
  background: rgba(59, 130, 246, 0.25);
  color: #93c5fd;
  font-weight: 600;
}

.item-info {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.item-title {
  font-weight: 500;
}

.item-path {
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
