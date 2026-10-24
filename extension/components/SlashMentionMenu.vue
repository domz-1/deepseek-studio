<script setup lang="ts">
import { ref, computed } from "vue";
import { useSkills } from "../composables/useSkills";
import { useStudioState } from "../composables/useStudioState";
import { useDeepSeekDom } from "../composables/useDeepSeekDom";
import type { SkillItem } from "../types";

const props = defineProps<{
  query: string;
  mode: "slash" | "mention";
}>();

const emit = defineEmits<{
  (e: "select", text: string): void;
  (e: "close"): void;
}>();

const { skills } = useSkills();
const { tools, servers } = useStudioState();
const selectedIndex = ref(0);

const filteredItems = computed(() => {
  const q = props.query.toLowerCase().trim();
  if (props.mode === "slash") {
    return skills.value.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description || "").toLowerCase().includes(q),
    );
  } else {
    // Mode mention: servers & tools
    const toolItems = tools.value.map((t) => ({
      name: t.name,
      description: t.description,
      type: "tool",
    }));
    const serverItems = servers.value.map((s) => ({
      name: s.name,
      description: `${s.toolCount || 0} tools`,
      type: "server",
    }));
    return [...serverItems, ...toolItems].filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q),
    );
  }
});

function selectItem(item: any) {
  if (props.mode === "slash") {
    emit("select", `/${item.name} `);
  } else {
    emit("select", `@${item.name} `);
  }
}
</script>

<template>
  <div v-if="filteredItems.length > 0" class="ds-slash-menu">
    <div class="menu-header">
      <span class="header-icon">{{ mode === "slash" ? "⚡" : "🛠️" }}</span>
      <span class="header-title">{{
        mode === "slash" ? "Skills & Commands" : "Tools & Servers"
      }}</span>
      <span class="header-count">{{ filteredItems.length }}</span>
    </div>

    <div class="menu-list">
      <div
        v-for="(item, idx) in filteredItems"
        :key="item.name"
        class="menu-item"
        :class="{ active: idx === selectedIndex }"
        @click="selectItem(item)"
        @mouseenter="selectedIndex = idx"
      >
        <div class="item-title">
          <span class="item-prefix">{{ mode === "slash" ? "/" : "@" }}</span>
          <strong>{{ item.name }}</strong>
        </div>
        <div class="item-desc">{{ item.description }}</div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ds-slash-menu {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 8px;
  width: 360px;
  max-width: 90vw;
  background: #0f172a;
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 10px;
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.6);
  z-index: 9999999;
  font-family: inherit;
  overflow: hidden;
  user-select: none;
}

.menu-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(30, 41, 59, 0.8);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11.5px;
  color: #94a3b8;
  font-weight: 600;
}

.header-count {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.1);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10.5px;
}

.menu-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
}

.menu-item {
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.12s ease;
}

.menu-item:hover,
.menu-item.active {
  background: rgba(59, 130, 246, 0.18);
}

.item-title {
  font-size: 13px;
  color: #60a5fa;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 2px;
}

.item-prefix {
  color: #3b82f6;
  font-weight: bold;
}

.item-desc {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
