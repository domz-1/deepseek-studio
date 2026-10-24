<script setup lang="ts">
import { ref, computed } from "vue";
import { useSkills } from "../composables/useSkills";
import { useStudioState } from "../composables/useStudioState";
import {
  Zap,
  Wrench,
  Sparkles,
  Terminal,
  Folder,
  Brain,
  Globe,
} from "lucide-vue-next";

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

function getItemIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("chrome") || n.includes("web")) return Globe;
  if (n.includes("file") || n.includes("fs")) return Folder;
  if (n.includes("bash") || n.includes("shell") || n.includes("cmd"))
    return Terminal;
  if (n.includes("memory") || n.includes("knowledge")) return Brain;
  return Wrench;
}

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
  <div
    v-if="filteredItems.length > 0"
    class="ds-slash-menu glass glass--strong"
  >
    <div class="menu-header">
      <component
        :is="mode === 'slash' ? Zap : Sparkles"
        :size="13"
        class="header-icon"
      />
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
          <component
            :is="mode === 'slash' ? Zap : getItemIcon(item.name)"
            :size="13"
            class="item-type-icon"
          />
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
  width: 380px;
  max-width: 90vw;
  border-radius: var(--r-md, 16px);
  z-index: 9999999;
  font-family: inherit;
  overflow: hidden;
  user-select: none;
}

.menu-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 11.5px;
  color: var(--text-muted, #9aa1bc);
  font-weight: 600;
}

.header-icon {
  color: var(--ds-blue-400, #7c93ff);
}

.header-count {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.08);
  padding: 1px 7px;
  border-radius: var(--r-pill, 9999px);
  font-size: 10.5px;
  color: var(--text, #edeff7);
}

.menu-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 6px;
}

.menu-item {
  padding: 8px 12px;
  border-radius: var(--r-sm, 10px);
  cursor: pointer;
  transition: all 150ms var(--ease, ease-out);
}

.menu-item:hover,
.menu-item.active {
  background: rgba(77, 107, 254, 0.18);
}

.item-title {
  font-size: 13px;
  color: var(--text, #edeff7);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 5px;
}

.item-type-icon {
  color: var(--ds-blue-400, #7c93ff);
}

.item-prefix {
  color: var(--ds-blue-500, #4d6bfe);
  font-weight: bold;
}

.item-desc {
  font-size: 11px;
  color: var(--text-muted, #9aa1bc);
  margin-top: 2px;
  margin-left: 18px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
