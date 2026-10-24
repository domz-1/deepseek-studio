<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
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
  coords?: { bottom: string; left: string; width: string };
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
        (s.description || "").toLowerCase().includes(q) ||
        (s.triggers || []).some((t) => t.toLowerCase().includes(q)),
    );
  } else {
    const toolItems = tools.value.map((t) => ({
      name: t.name,
      description: t.description || `Tool from ${t.server || "hub"}`,
      type: "tool",
    }));
    const serverItems = servers.value.map((s) => ({
      name: s.name,
      description: `${s.toolCount || 0} tools active`,
      type: "server",
    }));
    const allItem = {
      name: "all",
      description: `Include all active MCP tools (${tools.value.length} tools)`,
      type: "server",
    };
    return [allItem, ...serverItems, ...toolItems].filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description || "").toLowerCase().includes(q),
    );
  }
});

watch(
  () => props.query,
  () => {
    selectedIndex.value = 0;
  },
);

function selectItem(item: any) {
  if (props.mode === "slash") {
    emit("select", `/${item.name} `);
  } else {
    emit("select", `@${item.name} `);
  }
}

function handleKeydown(e: KeyboardEvent) {
  const len = filteredItems.value.length;
  if (len === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % len;
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value - 1 + len) % len;
  } else if (e.key === "Enter" || e.key === "Tab") {
    if (filteredItems.value[selectedIndex.value]) {
      e.preventDefault();
      selectItem(filteredItems.value[selectedIndex.value]);
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    emit("close");
  }
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown, true);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeydown, true);
});
</script>

<template>
  <div
    v-if="filteredItems.length > 0"
    :style="
      coords
        ? {
            position: 'fixed',
            bottom: coords.bottom,
            left: coords.left,
            width: coords.width,
            zIndex: 99999999,
          }
        : {}
    "
    class="glass glass--strong w-96 max-w-[92vw] rounded-2xl overflow-hidden select-none border border-white/10 shadow-2xl backdrop-blur-xl bg-slate-900/90 text-slate-100 font-sans"
    :class="[!coords && 'absolute bottom-full left-0 mb-2']"
  >
    <div
      class="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/10 text-xs font-semibold text-slate-400 bg-white/5"
    >
      <component
        :is="mode === 'slash' ? Zap : Sparkles"
        :size="14"
        class="text-indigo-400 shrink-0"
      />
      <span class="flex-1 text-slate-200 tracking-tight">{{
        mode === "slash" ? "Skills & Commands" : "Tools & Servers"
      }}</span>
      <span
        class="bg-white/10 text-slate-300 text-[10.5px] px-2 py-0.5 rounded-full font-mono font-medium"
      >
        {{ filteredItems.length }}
      </span>
    </div>

    <div class="max-h-60 overflow-y-auto p-1.5 flex flex-col gap-1">
      <div
        v-for="(item, idx) in filteredItems"
        :key="item.name"
        class="px-3 py-2 rounded-xl cursor-pointer transition-all flex flex-col gap-0.5"
        :class="[
          idx === selectedIndex
            ? 'bg-indigo-500/25 border border-indigo-400/30 shadow-sm'
            : 'hover:bg-white/5 border border-transparent',
        ]"
        @click="selectItem(item)"
        @mouseenter="selectedIndex = idx"
      >
        <div class="flex items-center gap-2 text-xs font-medium text-slate-100">
          <component
            :is="mode === 'slash' ? Zap : getItemIcon(item.name)"
            :size="13"
            class="text-indigo-400 shrink-0"
          />
          <span class="text-indigo-400 font-bold font-mono">{{
            mode === "slash" ? "/" : "@"
          }}</span>
          <span class="font-semibold text-white">{{ item.name }}</span>
        </div>
        <div class="text-[11px] text-slate-400 pl-5 truncate">
          {{ item.description }}
        </div>
      </div>
    </div>
  </div>
</template>
