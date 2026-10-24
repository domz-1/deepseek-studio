<script setup lang="ts">
import type { ToolCallAction } from "../types";
import { useActionCards } from "../composables/useActionCards";
import {
  Wrench,
  Terminal,
  Play,
  X,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-vue-next";

const props = defineProps<{
  action: ToolCallAction;
}>();

const { approveAction, rejectAction } = useActionCards();
</script>

<template>
  <div
    class="glass glass--strong rounded-2xl p-3.5 my-1.5 font-sans text-slate-100 border border-white/10 shadow-xl backdrop-blur-xl"
    :class="[
      action.status === 'pending' && 'border-indigo-500/30',
      action.status === 'running' && 'border-amber-500/30',
      action.status === 'completed' && 'border-emerald-500/30',
      action.status === 'error' && 'border-rose-500/30',
    ]"
  >
    <div class="flex justify-between items-center mb-2">
      <div class="flex items-center gap-2">
        <component
          :is="
            action.name.includes('shell') || action.name.includes('bash')
              ? Terminal
              : Wrench
          "
          :size="14"
          class="text-indigo-400 shrink-0"
        />
        <span class="font-semibold text-white text-sm tracking-tight">{{
          action.name
        }}</span>
        <span
          class="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold uppercase tracking-wider"
          :class="[
            action.status === 'pending' &&
              'bg-blue-500/15 border border-blue-500/30 text-blue-300',
            action.status === 'running' &&
              'bg-amber-500/15 border border-amber-500/30 text-amber-300',
            action.status === 'completed' &&
              'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300',
            action.status === 'error' &&
              'bg-rose-500/15 border border-rose-500/30 text-rose-300',
          ]"
        >
          {{ action.status }}
        </span>
      </div>
    </div>

    <div class="my-1.5">
      <pre
        class="bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-[11.5px] font-mono text-slate-200 max-h-32 overflow-y-auto"
        >{{ JSON.stringify(action.arguments, null, 2) }}</pre>
    </div>

    <div v-if="action.status === 'pending'" class="flex gap-2 mt-2.5">
      <button
        class="glass glass--accent glass-interactive inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-white shadow-md cursor-pointer border border-white/20 transition-all"
        @click="approveAction(action)"
      >
        <Play :size="12" />
        <span>Run Tool</span>
      </button>
      <button
        class="glass glass--subtle glass-interactive inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-slate-300 hover:text-rose-300 hover:bg-rose-500/15 border border-white/10 hover:border-rose-500/30 cursor-pointer transition-all"
        @click="rejectAction(action)"
      >
        <X :size="12" />
        <span>Reject</span>
      </button>
    </div>

    <div
      v-else-if="action.status === 'running'"
      class="flex items-center gap-2 text-amber-300 text-xs mt-2"
    >
      <Loader2 :size="13" class="animate-spin shrink-0" />
      <span>Executing tool on local bridge...</span>
    </div>

    <div v-else-if="action.status === 'completed'" class="mt-2">
      <div
        class="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 mb-1"
      >
        <CheckCircle2 :size="12" />
        <span>Result:</span>
      </div>
      <pre
        class="bg-slate-950/80 border border-white/10 rounded-xl p-2.5 text-[11.5px] font-mono text-slate-200 max-h-32 overflow-y-auto"
        >{{
          typeof action.result === "object"
            ? JSON.stringify(action.result, null, 2)
            : action.result
        }}</pre>
    </div>

    <div
      v-else-if="action.status === 'error'"
      class="flex items-center gap-1.5 text-rose-400 text-xs mt-2"
    >
      <AlertCircle :size="13" class="shrink-0" />
      <span>Error: {{ action.error }}</span>
    </div>
  </div>
</template>
