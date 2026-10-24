<script setup lang="ts">
import { ref, computed } from "vue";
import { useActionCards } from "../composables/useActionCards";
import {
  getToolCategory,
  getBadgeStyle,
  getToolIcon,
  getStepPreview,
  formatResult,
} from "../composables/useToolBadges";
import type { ToolCallAction } from "../types";
import {
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Play,
  X,
  Wrench,
  Copy,
  Check,
} from "lucide-vue-next";

const props = defineProps<{ actions: ToolCallAction[] }>();
const { approveAction, rejectAction } = useActionCards();

const isExpanded = ref(true);
const expandedSteps = ref<Record<string, boolean>>({});
const copiedId = ref<string | null>(null);

function toggleStep(id: string) {
  expandedSteps.value[id] = !expandedSteps.value[id];
}

function copyOutput(id: string, text: string) {
  navigator.clipboard.writeText(text);
  copiedId.value = id;
  setTimeout(() => {
    if (copiedId.value === id) copiedId.value = null;
  }, 1800);
}

const runningActions = computed(() =>
  props.actions.filter((a) => a.status === "running"),
);
const pendingActions = computed(() =>
  props.actions.filter((a) => a.status === "pending"),
);

const headerTitle = computed(() => {
  if (runningActions.value.length > 0)
    return `Running commands and tools (${runningActions.value.length} active)...`;
  if (pendingActions.value.length > 0)
    return `Waiting for approval (${pendingActions.value.length} pending)`;
  return `Ran commands and read files (${props.actions.length} steps)`;
});
</script>

<template>
  <div
    v-if="actions && actions.length > 0"
    class="ds-inline-tool-box my-3 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-950/90 backdrop-blur-2xl shadow-xl overflow-hidden font-sans text-slate-200 transition-all select-none"
  >
    <!-- Header Accordion Row with Status Pill -->
    <div
      class="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-white/[0.03] transition-colors border-b border-white/[0.06]"
      @click="isExpanded = !isExpanded"
    >
      <div
        class="flex items-center gap-2.5 text-xs font-semibold text-slate-200"
      >
        <span
          v-if="runningActions.length > 0"
          class="relative flex h-2.5 w-2.5"
        >
          <span
            class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"
          ></span>
          <span
            class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"
          ></span>
        </span>
        <span
          v-else-if="pendingActions.length === 0"
          class="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)] shrink-0"
        ></span>
        <Wrench v-else :size="13" class="text-indigo-400 shrink-0" />

        <span class="tracking-tight">{{ headerTitle }}</span>
      </div>

      <div class="flex items-center gap-2">
        <span
          class="text-[10px] px-2 py-0.5 rounded-full font-mono bg-white/[0.08] border border-white/10 text-slate-300 font-medium"
        >
          {{ actions.length }}
        </span>
        <component
          :is="isExpanded ? ChevronUp : ChevronDown"
          :size="14"
          class="text-slate-400 transition-transform duration-200"
        />
      </div>
    </div>

    <!-- Collapsible Step List -->
    <div v-show="isExpanded" class="p-2 flex flex-col gap-1.5">
      <div
        v-for="act in actions"
        :key="act.id"
        class="rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/10 transition-all overflow-hidden"
      >
        <!-- Single Line Item Header -->
        <div
          class="flex items-center justify-between px-3 py-2 cursor-pointer text-[11.5px]"
          @click="toggleStep(act.id)"
        >
          <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
            <!-- Distinct Category Badge -->
            <span
              class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px] font-semibold border shrink-0"
              :class="[
                getBadgeStyle(getToolCategory(act.name)).bg,
                getBadgeStyle(getToolCategory(act.name)).text,
                getBadgeStyle(getToolCategory(act.name)).border,
              ]"
            >
              <component :is="getToolIcon(act.name)" :size="11" />
              <span>{{ getToolCategory(act.name) }}</span>
            </span>

            <span
              class="font-mono text-slate-300 truncate text-[11px] tracking-tight opacity-90"
            >
              {{ getStepPreview(act) }}
            </span>
          </div>

          <!-- Status Badges -->
          <div class="flex items-center gap-1.5 shrink-0">
            <template v-if="act.status === 'pending'">
              <button
                class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-semibold text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 cursor-pointer transition-colors"
                @click.stop="approveAction(act)"
              >
                <Play :size="10" />
                <span>Run</span>
              </button>
              <button
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 cursor-pointer transition-colors"
                @click.stop="rejectAction(act)"
              >
                <X :size="10" />
                <span>Skip</span>
              </button>
            </template>

            <span
              v-else-if="act.status === 'running'"
              class="inline-flex items-center gap-1.5 text-[10.5px] font-mono text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 rounded-full"
            >
              <Loader2 :size="10" class="animate-spin" />
              <span>running</span>
            </span>

            <span
              v-else-if="act.status === 'completed'"
              class="inline-flex items-center gap-1 text-[10.5px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.15)]"
            >
              <CheckCircle2 :size="11" />
              <span>done</span>
            </span>

            <span
              v-else-if="act.status === 'error'"
              class="inline-flex items-center gap-1 text-[10.5px] font-mono text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2.5 py-0.5 rounded-full"
            >
              <AlertCircle :size="11" />
              <span>error</span>
            </span>
          </div>
        </div>

        <!-- Expandable Detail Drawer with Copy Button -->
        <div
          v-if="expandedSteps[act.id]"
          class="px-3 pb-2.5 pt-1.5 border-t border-white/[0.06] bg-black/30 text-[11px] font-mono flex flex-col gap-2"
        >
          <div>
            <div
              class="text-[9.5px] uppercase tracking-wider text-slate-400 font-bold mb-1"
            >
              Arguments
            </div>
            <pre
              class="p-2 rounded-lg bg-slate-950/90 border border-white/10 text-slate-300 overflow-x-auto max-h-28 text-[10.5px]"
              >{{ JSON.stringify(act.arguments, null, 2) }}</pre>
          </div>

          <div v-if="act.result">
            <div class="flex items-center justify-between mb-1">
              <span
                class="text-[9.5px] uppercase tracking-wider text-emerald-400 font-bold"
                >Output</span
              >
              <button
                class="inline-flex items-center gap-1 text-[9.5px] px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 cursor-pointer transition-colors"
                @click="copyOutput(act.id, formatResult(act.result))"
              >
                <component
                  :is="copiedId === act.id ? Check : Copy"
                  :size="10"
                  :class="
                    copiedId === act.id ? 'text-emerald-400' : 'text-slate-400'
                  "
                />
                <span>{{ copiedId === act.id ? "Copied" : "Copy" }}</span>
              </button>
            </div>
            <pre
              class="p-2 rounded-lg bg-slate-950/90 border border-emerald-500/25 text-slate-200 overflow-x-auto max-h-48 whitespace-pre-wrap text-[10.5px]"
              >{{ formatResult(act.result) }}</pre>
          </div>

          <div
            v-if="act.error"
            class="text-rose-400 bg-rose-500/10 p-2 rounded-lg border border-rose-500/30"
          >
            {{ act.error }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
