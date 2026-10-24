<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useWorkspaceDrawer } from "../composables/useWorkspaceDrawer";
import {
  Terminal,
  RefreshCw,
  Trash2,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
} from "lucide-vue-next";

const { logs, loadingLogs, fetchLogs, clearLogs } = useWorkspaceDrawer();
const expandedLogs = ref<Record<string, boolean>>({});
const copiedId = ref<string | null>(null);

onMounted(() => {
  fetchLogs();
});

function toggleLog(id: string) {
  expandedLogs.value[id] = !expandedLogs.value[id];
}

async function copyText(id: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
    copiedId.value = id;
    setTimeout(() => {
      if (copiedId.value === id) copiedId.value = null;
    }, 1800);
  } catch (_) {}
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch (_) {
    return iso;
  }
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden text-xs text-slate-200">
    <!-- Header with Action Buttons -->
    <div
      class="p-2.5 border-b border-white/10 bg-slate-900/60 flex items-center justify-between shrink-0"
    >
      <div class="flex items-center gap-2">
        <Terminal :size="14" class="text-indigo-400" />
        <span class="font-medium text-slate-200">Execution Logs</span>
        <span
          class="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 border border-white/10 text-slate-400"
        >
          {{ logs.length }} entries
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <button
          @click="fetchLogs"
          class="p-1.5 hover:bg-white/10 rounded text-slate-400 hover:text-slate-100 transition-colors"
          title="Refresh Logs"
        >
          <RefreshCw :size="13" :class="{ 'animate-spin': loadingLogs }" />
        </button>
        <button
          v-if="logs.length > 0"
          @click="clearLogs"
          class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 flex items-center gap-1 transition-colors"
          title="Clear all logs"
        >
          <Trash2 :size="12" />
          <span>Clear</span>
        </button>
      </div>
    </div>

    <!-- Logs Stream Body -->
    <div class="flex-1 overflow-y-auto p-2 space-y-2 bg-slate-950">
      <div
        v-if="loadingLogs && logs.length === 0"
        class="flex items-center justify-center py-12 text-slate-500 gap-2"
      >
        <RefreshCw :size="14" class="animate-spin text-indigo-400" />
        <span>Loading logs...</span>
      </div>
      <div
        v-else-if="logs.length === 0"
        class="flex flex-col items-center justify-center py-12 text-slate-500 gap-2"
      >
        <Terminal :size="24" class="text-slate-600" />
        <span>No recent tool execution logs recorded yet.</span>
      </div>
      <div
        v-for="entry in logs"
        :key="entry.id"
        class="border border-white/10 rounded-lg bg-slate-900/80 overflow-hidden font-mono text-[11px]"
      >
        <!-- Log Row Header -->
        <div
          @click="toggleLog(entry.id)"
          class="flex items-center justify-between p-2 cursor-pointer hover:bg-white/5 transition-colors"
        >
          <div class="flex items-center gap-2 truncate">
            <ChevronDown
              v-if="expandedLogs[entry.id]"
              :size="12"
              class="text-slate-500 shrink-0"
            />
            <ChevronRight v-else :size="12" class="text-slate-500 shrink-0" />
            <CheckCircle2
              v-if="entry.status === 'success'"
              :size="13"
              class="text-emerald-400 shrink-0"
            />
            <XCircle v-else :size="13" class="text-rose-400 shrink-0" />
            <span class="font-semibold text-slate-100 truncate">{{
              entry.name
            }}</span>
            <span class="text-[10px] text-slate-500 font-sans"
              >({{ entry.duration }}ms)</span
            >
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[10px] text-slate-500 font-sans">{{
              formatTime(entry.time)
            }}</span>
            <button
              @click.stop="
                copyText(
                  entry.id,
                  entry.output || JSON.stringify(entry.args, null, 2),
                )
              "
              class="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-slate-200 transition-colors"
              title="Copy output"
            >
              <Check
                v-if="copiedId === entry.id"
                :size="12"
                class="text-emerald-400"
              />
              <Copy v-else :size="12" />
            </button>
          </div>
        </div>

        <!-- Expanded Log Details -->
        <div
          v-if="expandedLogs[entry.id]"
          class="p-2.5 border-t border-white/10 bg-black/40 space-y-2"
        >
          <!-- Arguments -->
          <div v-if="entry.args && Object.keys(entry.args).length > 0">
            <div
              class="text-[10px] text-slate-500 font-sans font-medium uppercase tracking-wider mb-1"
            >
              Parameters
            </div>
            <pre
              class="p-2 rounded bg-slate-950/80 text-indigo-300 text-[10px] overflow-x-auto whitespace-pre"
              >{{ JSON.stringify(entry.args, null, 2) }}</pre>
          </div>

          <!-- Output -->
          <div>
            <div
              class="text-[10px] text-slate-500 font-sans font-medium uppercase tracking-wider mb-1"
            >
              Output
            </div>
            <pre
              class="p-2 rounded bg-slate-950/80 text-[10px] overflow-x-auto whitespace-pre max-h-48"
              :class="
                entry.status === 'error' ? 'text-rose-300' : 'text-slate-300'
              "
              >{{ entry.output || "(no text output returned)" }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
