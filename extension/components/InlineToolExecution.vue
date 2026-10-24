<script setup lang="ts">
import { ref, computed } from "vue";
import { activeActions } from "../composables/useStudioState";
import { useActionCards } from "../composables/useActionCards";
import type { ToolCallAction } from "../types";
import {
  Terminal,
  FileText,
  Folder,
  Globe,
  Brain,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
  Play,
  X,
  Wrench,
} from "lucide-vue-next";

const { approveAction, rejectAction } = useActionCards();

const isExpanded = ref(true);
const expandedSteps = ref<Record<string, boolean>>({});

function toggleStep(id: string) {
  expandedSteps.value[id] = !expandedSteps.value[id];
}

const runningActions = computed(() =>
  activeActions.value.filter((a) => a.status === "running"),
);
const pendingActions = computed(() =>
  activeActions.value.filter((a) => a.status === "pending"),
);
const completedActions = computed(() =>
  activeActions.value.filter((a) => a.status === "completed"),
);

const headerTitle = computed(() => {
  if (runningActions.value.length > 0) {
    return `Running commands and tools (${runningActions.value.length} active)...`;
  }
  if (pendingActions.value.length > 0) {
    return `Waiting for tool approval (${pendingActions.value.length} pending)`;
  }
  return `Ran commands and read files (${activeActions.value.length} steps)`;
});

function getToolCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("bash") || n.includes("shell") || n.includes("command"))
    return "Bash";
  if (n.includes("read")) return "Read";
  if (n.includes("write") || n.includes("edit")) return "Write";
  if (n.includes("list") || n.includes("dir") || n.includes("tree"))
    return "List";
  if (n.includes("chrome") || n.includes("page")) return "Chrome";
  if (n.includes("memory")) return "Memory";
  if (n.includes("task_done")) return "Task Done";
  return "Tool";
}

function getToolIcon(name: string) {
  const cat = getToolCategory(name);
  if (cat === "Bash") return Terminal;
  if (cat === "Read" || cat === "Write") return FileText;
  if (cat === "List") return Folder;
  if (cat === "Chrome") return Globe;
  if (cat === "Memory") return Brain;
  if (cat === "Task Done") return CheckCircle2;
  return Wrench;
}

function getStepPreview(act: ToolCallAction): string {
  const args = act.arguments || {};
  if (args.command) return String(args.command);
  if (args.path) return String(args.path);
  if (args.url) return String(args.url);
  if (args.summary) return String(args.summary);
  if (args.query) return String(args.query);
  const keys = Object.keys(args);
  if (keys.length > 0) return `${keys[0]}: ${String(args[keys[0]])}`;
  return act.name;
}

function formatResult(res: any): string {
  if (!res) return "";
  if (typeof res === "string") return res;
  if (res.structuredContent?.content) return res.structuredContent.content;
  if (res.content?.[0]?.text) return res.content[0].text;
  try {
    return JSON.stringify(res, null, 2);
  } catch {
    return String(res);
  }
}
</script>

<template>
  <div
    v-if="activeActions.length > 0"
    class="ds-inline-tool-box my-2.5 rounded-2xl border border-white/10 bg-slate-900/85 backdrop-blur-xl shadow-lg overflow-hidden font-sans text-slate-200 transition-all select-none"
  >
    <!-- Header Accordion Row -->
    <div
      class="flex items-center justify-between px-3.5 py-2 cursor-pointer hover:bg-white/[0.04] transition-colors border-b border-white/5"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex items-center gap-2 text-xs font-medium text-slate-200">
        <Loader2
          v-if="runningActions.length > 0"
          :size="13"
          class="animate-spin text-amber-400 shrink-0"
        />
        <CheckCircle2
          v-else-if="pendingActions.length === 0"
          :size="13"
          class="text-emerald-400 shrink-0"
        />
        <Wrench v-else :size="13" class="text-indigo-400 shrink-0" />
        <span class="tracking-tight font-semibold">{{ headerTitle }}</span>
      </div>

      <div class="flex items-center gap-2">
        <span
          class="text-[10px] px-2 py-0.5 rounded-full font-mono bg-white/5 border border-white/10 text-slate-400"
        >
          {{ activeActions.length }}
        </span>
        <component
          :is="isExpanded ? ChevronUp : ChevronDown"
          :size="14"
          class="text-slate-400"
        />
      </div>
    </div>

    <!-- Collapsible Step List (Single Line Rows matching Image 2) -->
    <div v-show="isExpanded" class="p-1.5 flex flex-col gap-1">
      <div
        v-for="act in activeActions"
        :key="act.id"
        class="rounded-xl border border-transparent hover:border-white/10 hover:bg-white/[0.03] transition-all overflow-hidden"
      >
        <!-- Single Line Item Header -->
        <div
          class="flex items-center justify-between px-2.5 py-1.5 cursor-pointer text-[11.5px]"
          @click="toggleStep(act.id)"
        >
          <div class="flex items-center gap-2 min-w-0 flex-1 pr-2">
            <component
              :is="getToolIcon(act.name)"
              :size="12"
              class="text-indigo-400 shrink-0"
            />
            <span class="font-semibold text-slate-300 text-[11px] shrink-0">
              {{ getToolCategory(act.name) }}
            </span>
            <span class="text-slate-500 font-bold">•</span>
            <span
              class="font-mono text-slate-300 truncate text-[11px] tracking-tight opacity-90"
            >
              {{ getStepPreview(act) }}
            </span>
          </div>

          <!-- Status Indicator / Actions -->
          <div class="flex items-center gap-1.5 shrink-0">
            <template v-if="act.status === 'pending'">
              <button
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-emerald-300 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 cursor-pointer"
                @click.stop="approveAction(act)"
              >
                <Play :size="10" />
                <span>Run</span>
              </button>
              <button
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-rose-300 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 cursor-pointer"
                @click.stop="rejectAction(act)"
              >
                <X :size="10" />
                <span>Skip</span>
              </button>
            </template>

            <span
              v-else-if="act.status === 'running'"
              class="inline-flex items-center gap-1 text-[10px] font-mono text-amber-300 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-full"
            >
              <Loader2 :size="10" class="animate-spin" />
              <span>running</span>
            </span>

            <span
              v-else-if="act.status === 'completed'"
              class="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-full"
            >
              <CheckCircle2 :size="10" />
              <span>done</span>
            </span>

            <span
              v-else-if="act.status === 'error'"
              class="inline-flex items-center gap-1 text-[10px] font-mono text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded-full"
            >
              <AlertCircle :size="10" />
              <span>error</span>
            </span>
          </div>
        </div>

        <!-- Expandable Detail Drawer per step -->
        <div
          v-if="expandedSteps[act.id]"
          class="px-2.5 pb-2 pt-1 border-t border-white/5 bg-black/20 text-[11px] font-mono flex flex-col gap-1.5"
        >
          <div>
            <div
              class="text-[9.5px] uppercase tracking-wider text-slate-400 font-bold mb-0.5"
            >
              Arguments:
            </div>
            <pre
              class="p-2 rounded-lg bg-slate-950/80 border border-white/10 text-slate-300 overflow-x-auto max-h-28 text-[10.5px]"
              >{{ JSON.stringify(act.arguments, null, 2) }}</pre>
          </div>

          <div v-if="act.result">
            <div
              class="text-[9.5px] uppercase tracking-wider text-emerald-400 font-bold mb-0.5"
            >
              Output:
            </div>
            <pre
              class="p-2 rounded-lg bg-slate-950/80 border border-emerald-500/20 text-slate-200 overflow-x-auto max-h-40 whitespace-pre-wrap text-[10.5px]"
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
