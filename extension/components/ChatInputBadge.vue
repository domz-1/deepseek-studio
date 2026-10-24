<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useStudioState } from "../composables/useStudioState";
import { useBridgeWs } from "../composables/useBridgeWs";
import { useDeepSeekDom } from "../composables/useDeepSeekDom";
import { usePromptExecution } from "../composables/usePromptExecution";
import SlashMentionMenu from "./SlashMentionMenu.vue";
import ChatProjectSelector from "./ChatProjectSelector.vue";
import {
  Cpu,
  Globe,
  Folder,
  Terminal,
  Brain,
  Wrench,
  Sparkles,
  Activity,
} from "lucide-vue-next";

const { bridgeConnected, isServerStopped, servers } = useStudioState();
const { connect } = useBridgeWs();
const { getChatInput } = useDeepSeekDom();
const { typeHumanizedText } = usePromptExecution();

const menuMode = ref<"slash" | "mention" | null>(null);
const menuQuery = ref("");
const menuCoords = ref<{ bottom: string; left: string; width: string }>({
  bottom: "80px",
  left: "24px",
  width: "380px",
});

function getServerIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("chrome") || n.includes("web")) return Globe;
  if (n.includes("file") || n.includes("fs")) return Folder;
  if (n.includes("bash") || n.includes("shell") || n.includes("cmd"))
    return Terminal;
  if (n.includes("memory") || n.includes("knowledge")) return Brain;
  return Wrench;
}

function updateMenuCoords(input: HTMLTextAreaElement) {
  const rect = input.getBoundingClientRect();
  const width = Math.min(400, window.innerWidth - 32);
  const left = Math.max(
    16,
    Math.min(rect.left, window.innerWidth - width - 16),
  );
  menuCoords.value = {
    bottom: `${window.innerHeight - rect.top + 8}px`,
    left: `${left}px`,
    width: `${width}px`,
  };
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

function addMention(mentionText: string) {
  const input = getChatInput();
  if (!input) return;
  input.focus();
  const current = input.value || "";
  if (!current.includes(mentionText)) {
    const sep = current.trim() ? " " : "";
    typeHumanizedText(input, `${current.trim()}${sep}${mentionText} `);
  }
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

    <!-- Liquid Glass MCP Bar -->
    <div
      class="glass glass--subtle glass--liquid flex items-center flex-wrap gap-1.5 px-2.5 py-1.5 rounded-xl border border-white/10 text-xs text-slate-200"
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

      <!-- Workspace Project Selector Pill with Dropdown -->
      <ChatProjectSelector />

      <!-- Server Chips -->
      <div class="flex items-center flex-wrap gap-1">
        <button
          v-for="server in servers"
          :key="server.name"
          type="button"
          class="glass-interactive inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-indigo-500/20 border border-white/10 text-[11px] text-slate-300 hover:text-white transition-all"
          :title="`Insert @${server.name} (${server.toolCount} tools)`"
          @click.prevent="addMention(`@${server.name}`)"
        >
          <component
            :is="getServerIcon(server.name)"
            :size="11"
            class="text-indigo-400"
          />
          <span>@{{ server.name }}</span>
          <span
            v-if="server.toolCount"
            class="text-[9.5px] bg-white/10 px-1 rounded font-mono text-slate-400"
          >
            {{ server.toolCount }}
          </span>
        </button>

        <button
          type="button"
          class="glass-interactive inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/40 text-[11px] font-semibold text-white shadow-sm transition-all"
          title="Insert @all tools into prompt"
          @click.prevent="addMention('@all')"
        >
          <Sparkles :size="11" class="text-indigo-300" />
          <span>@all</span>
        </button>
      </div>
    </div>
  </div>
</template>
