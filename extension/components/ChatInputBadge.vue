<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useStudioState, settings } from "../composables/useStudioState";
import { useBridgeWs } from "../composables/useBridgeWs";
import { useProjects } from "../composables/useProjects";
import { useDeepSeekDom } from "../composables/useDeepSeekDom";
import { usePromptExecution } from "../composables/usePromptExecution";
import SlashMentionMenu from "./SlashMentionMenu.vue";
import { Cpu, Activity, FolderGit2 } from "lucide-vue-next";

const { bridgeConnected, isServerStopped } = useStudioState();
const { activeProjectName } = useProjects();
const { connect } = useBridgeWs();
const { getChatInput } = useDeepSeekDom();
const { typeHumanizedText } = usePromptExecution();

const menuMode = ref<"slash" | "mention" | null>(null);
const menuQuery = ref("");
const menuCoords = ref<{
  bottom?: string;
  top?: string;
  left: string;
  width: string;
}>({
  bottom: "80px",
  left: "24px",
  width: "420px",
});

function updateMenuCoords(input: HTMLTextAreaElement) {
  const rect = input.getBoundingClientRect();
  const width = Math.min(420, window.innerWidth - 32);
  const left = Math.max(
    16,
    Math.min(rect.left, window.innerWidth - width - 16),
  );

  // If there's ample room above (at least 320px), place above input; otherwise place below
  if (rect.top > 320) {
    menuCoords.value = {
      bottom: `${window.innerHeight - rect.top + 10}px`,
      top: "auto",
      left: `${left}px`,
      width: `${width}px`,
    };
  } else {
    menuCoords.value = {
      top: `${rect.bottom + 10}px`,
      bottom: "auto",
      left: `${left}px`,
      width: `${width}px`,
    };
  }
}

function checkInputState(e?: Event) {
  const target = (e?.target as HTMLElement) || getChatInput();
  const isInput =
    target instanceof HTMLTextAreaElement || target?.tagName === "TEXTAREA";
  if (!isInput) {
    if (e?.type === "click" && !target?.closest(".ds-slash-menu")) {
      menuMode.value = null;
    }
    return;
  }

  const input = target as HTMLTextAreaElement;
  const val = input.value || "";
  const cursor = input.selectionStart ?? val.length;
  const textBefore = val.slice(0, cursor);

  const slashMatch = textBefore.match(/(?:^|\s)\/([a-zA-Z0-9_-]*)$/);
  const mentionMatch = textBefore.match(/(?:^|\s)@([^\s@]*)$/);

  if (slashMatch) {
    menuMode.value = "slash";
    menuQuery.value = slashMatch[1] || "";
    updateMenuCoords(input);
  } else if (mentionMatch) {
    menuMode.value = "mention";
    menuQuery.value = mentionMatch[1] || "";
    updateMenuCoords(input);
  } else {
    menuMode.value = null;
  }
}

function handleMenuSelect(insertedText: string) {
  const input = getChatInput();
  if (!input) return;
  const current = input.value || "";
  const cursor = input.selectionStart ?? current.length;
  const textBefore = current.slice(0, cursor);
  const textAfter = current.slice(cursor);

  const pattern =
    menuMode.value === "slash"
      ? /(?:^|\s)\/[a-zA-Z0-9_-]*$/
      : /(?:^|\s)@[^\s@]*$/;

  const replacedBefore = textBefore.replace(pattern, (match) => {
    return match.startsWith(" ") ? ` ${insertedText}` : insertedText;
  });

  typeHumanizedText(input, `${replacedBefore}${textAfter}`);
  menuMode.value = null;
}

onMounted(() => {
  window.addEventListener("input", checkInputState, true);
  window.addEventListener("keyup", checkInputState, true);
  window.addEventListener("click", checkInputState, true);
});

onUnmounted(() => {
  window.removeEventListener("input", checkInputState, true);
  window.removeEventListener("keyup", checkInputState, true);
  window.removeEventListener("click", checkInputState, true);
});
</script>

<template>
  <div class="relative w-full mb-1.5 font-sans select-none">
    <!-- Teleported Floating Slash & Mention Popup -->
    <Teleport to="body">
      <SlashMentionMenu
        v-if="menuMode"
        :query="menuQuery"
        :mode="menuMode"
        :coords="menuCoords"
        @select="handleMenuSelect"
        @close="menuMode = null"
      />
    </Teleport>

    <!-- Sleek In-Chat MCP Status Pill (Project selector moved to sidebar) -->
    <div
      class="glass glass--subtle glass--liquid inline-flex items-center gap-2 px-2.5 py-1 rounded-full border border-white/10 text-xs text-slate-200"
    >
      <!-- Bridge Status Pill -->
      <button
        type="button"
        class="glass-interactive inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-medium transition-all"
        :class="[
          bridgeConnected
            ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-300'
            : isServerStopped
              ? 'bg-amber-500/15 border-amber-400/40 text-amber-300'
              : 'bg-white/5 border-white/10 text-slate-400',
        ]"
        :title="bridgeConnected ? 'MCP Bridge connected' : 'Click to connect'"
        @click="connect"
      >
        <span
          class="w-1.5 h-1.5 rounded-full shrink-0"
          :class="[
            bridgeConnected
              ? 'bg-emerald-400 shadow-[0_0_6px_#34d399] animate-pulse'
              : isServerStopped
                ? 'bg-amber-400 shadow-[0_0_6px_#fbbf24]'
                : 'bg-slate-500',
          ]"
        ></span>
        <component
          :is="bridgeConnected ? Activity : Cpu"
          :size="11"
          class="shrink-0"
        />
        <span>{{
          bridgeConnected
            ? "MCP Active"
            : isServerStopped
              ? "Paused"
              : "Offline"
        }}</span>
      </button>

      <!-- Non-intrusive Active Project Readout (DDL lives in Sidebar) -->
      <div
        v-if="settings.activeProject"
        class="flex items-center gap-1 text-[11px] text-slate-400 pr-1 truncate max-w-[200px]"
        :title="`Current active workspace project: ${settings.activeProject}`"
      >
        <FolderGit2 :size="11" class="text-indigo-400 shrink-0" />
        <span class="truncate text-slate-300 font-medium">{{
          activeProjectName
        }}</span>
      </div>
    </div>
  </div>
</template>
