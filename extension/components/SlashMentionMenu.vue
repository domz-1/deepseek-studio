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
  coords?: { bottom?: string; top?: string; left: string; width: string };
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
    // Show ONLY active MCP server titles
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
    return [allItem, ...serverItems].filter(
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

function scrollToActive() {
  requestAnimationFrame(() => {
    const activeEl = document.querySelector(".ds-slash-item-active");
    activeEl?.scrollIntoView({ block: "nearest" });
  });
}

function handleKeydown(e: KeyboardEvent) {
  const len = filteredItems.value.length;
  if (len === 0) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    selectedIndex.value = (selectedIndex.value + 1) % len;
    scrollToActive();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    selectedIndex.value = (selectedIndex.value - 1 + len) % len;
    scrollToActive();
  } else if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (filteredItems.value[selectedIndex.value]) {
      selectItem(filteredItems.value[selectedIndex.value]);
    }
  } else if (e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
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
            bottom: coords.bottom !== 'auto' ? coords.bottom : undefined,
            top: coords.top !== 'auto' ? coords.top : undefined,
            left: coords.left,
            width: coords.width,
            zIndex: 99999999,
          }
        : {}
    "
    class="glass glass--strong w-[420px] max-w-[94vw] rounded-3xl overflow-hidden select-none border border-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl bg-slate-900/95 text-slate-100 font-sans animate-in fade-in zoom-in-95 duration-150"
    :class="[!coords && 'absolute bottom-full left-0 mb-2']"
  >
    <!-- Rounded Header -->
    <div
      class="flex items-center gap-2 px-4 py-2.5 border-b border-white/10 text-[11px] font-semibold text-slate-300 bg-white/[0.04]"
    >
      <component
        :is="mode === 'slash' ? Zap : Sparkles"
        :size="14"
        class="text-indigo-400 shrink-0"
      />
      <span class="flex-1 text-slate-200 tracking-tight">{{
        mode === "slash" ? "Agent Skills" : "Active MCP Servers"
      }}</span>
      <span
        class="bg-indigo-500/20 text-indigo-300 text-[10px] px-2.5 py-0.5 rounded-full font-mono font-medium border border-indigo-400/30"
      >
        {{ filteredItems.length }}
      </span>
    </div>

    <!-- Scrollable Items List -->
    <div class="max-h-72 overflow-y-auto p-2 flex flex-col gap-1">
      <div
        v-for="(item, idx) in filteredItems"
        :key="item.name"
        class="px-3.5 py-2 rounded-2xl cursor-pointer transition-all flex flex-col gap-0.5"
        :class="[
          idx === selectedIndex
            ? 'bg-indigo-500/25 border border-indigo-400/40 shadow-sm ds-slash-item-active'
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
          <span class="text-indigo-400 font-bold font-mono text-[11px]">{{
            mode === "slash" ? "/" : "@"
          }}</span>
          <span class="font-semibold text-white tracking-tight">{{
            item.name
          }}</span>
        </div>
        <div class="text-[11px] text-slate-400 pl-5 truncate opacity-90">
          {{ item.description }}
        </div>
      </div>
    </div>
  </div>
</template>
