<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { Download, Copy, FileText, Check, Loader2 } from "lucide-vue-next";
import { useChatExport } from "../composables/useChatExport";

const { isExporting, exportAsMarkdown, exportAsJson, copyMarkdownToClipboard } =
  useChatExport();

const isOpen = ref(false);
const copied = ref(false);
const containerRef = ref<HTMLElement | null>(null);

function toggle() {
  isOpen.value = !isOpen.value;
}

async function handleCopy() {
  const ok = await copyMarkdownToClipboard();
  if (ok) {
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
      isOpen.value = false;
    }, 1500);
  }
}

async function handleMarkdown() {
  await exportAsMarkdown();
  isOpen.value = false;
}

async function handleJson() {
  await exportAsJson();
  isOpen.value = false;
}

function handleClickOutside(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => window.addEventListener("click", handleClickOutside));
onUnmounted(() => window.removeEventListener("click", handleClickOutside));
</script>

<template>
  <div ref="containerRef" class="relative inline-flex items-center">
    <button
      type="button"
      @click.stop="toggle"
      class="flex items-center gap-1.5 text-[11px] font-medium text-slate-300 hover:text-indigo-300 transition-colors cursor-pointer px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 whitespace-nowrap"
      :class="{ 'border-indigo-400/40 text-indigo-300': isOpen }"
      title="Export conversation (Markdown, JSON, or Copy)"
    >
      <Loader2
        v-if="isExporting"
        :size="12"
        class="animate-spin text-indigo-400 shrink-0"
      />
      <Download v-else :size="12" class="text-indigo-400 shrink-0" />
      <span>Export</span>
    </button>

    <!-- Glass Dropdown Menu -->
    <Transition
      enter-active-class="transition-all duration-150 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition-all duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="isOpen"
        class="absolute right-0 top-full mt-1.5 w-48 rounded-xl bg-slate-900/95 border border-white/15 backdrop-blur-2xl shadow-2xl p-1.5 z-[9999999] flex flex-col gap-1 font-sans text-slate-200 select-none"
      >
        <div
          class="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider border-b border-white/10"
        >
          Export Chat
        </div>

        <button
          type="button"
          @click="handleMarkdown"
          :disabled="isExporting"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-left disabled:opacity-50"
        >
          <FileText :size="13" class="text-indigo-400 shrink-0" />
          <div class="flex flex-col">
            <span>Download Markdown</span>
            <span class="text-[9px] text-slate-400"
              >.md formatted with thoughts</span
            >
          </div>
        </button>

        <button
          type="button"
          @click="handleCopy"
          :disabled="isExporting"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-left disabled:opacity-50"
        >
          <Check v-if="copied" :size="13" class="text-emerald-400 shrink-0" />
          <Copy v-else :size="13" class="text-cyan-400 shrink-0" />
          <div class="flex flex-col">
            <span>{{ copied ? "Copied!" : "Copy to Clipboard" }}</span>
            <span class="text-[9px] text-slate-400"
              >Full conversation text</span
            >
          </div>
        </button>

        <button
          type="button"
          @click="handleJson"
          :disabled="isExporting"
          class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-slate-200 hover:bg-white/10 hover:text-white transition-colors cursor-pointer text-left disabled:opacity-50"
        >
          <Download :size="13" class="text-amber-400 shrink-0" />
          <div class="flex flex-col">
            <span>Download JSON</span>
            <span class="text-[9px] text-slate-400">Raw messages & tokens</span>
          </div>
        </button>
      </div>
    </Transition>
  </div>
</template>
