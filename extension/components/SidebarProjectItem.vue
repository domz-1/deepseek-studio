<script setup lang="ts">
import { ref } from "vue";
import { settings } from "../composables/useStudioState";
import {
  Folder,
  FolderGit2,
  ChevronRight,
  ChevronDown,
  Plus,
  MoreHorizontal,
  Trash2,
  Pin,
} from "lucide-vue-next";

const props = defineProps<{
  proj: any;
  isOpen: boolean;
}>();

const emit = defineEmits<{
  (e: "toggle", path: string): void;
  (e: "newChat", path: string): void;
  (e: "delete", path: string): void;
  (e: "openChat", chatId: string): void;
  (e: "togglePin", chatId: string): void;
}>();

const showMenu = ref(false);
const showAllChats = ref(false);

function getVisibleChats() {
  if (showAllChats.value) return props.proj.chats;
  return props.proj.chats.slice(0, 8);
}
</script>

<template>
  <div class="flex flex-col">
    <!-- Folder Row -->
    <div
      class="group/proj relative flex items-center justify-between px-2 py-1.5 rounded-lg cursor-pointer transition-colors text-xs"
      :class="[
        settings.activeProject === proj.path
          ? 'bg-indigo-500/15 text-indigo-200 font-medium'
          : 'text-slate-300 hover:bg-white/5 hover:text-white',
      ]"
      @click="emit('toggle', proj.path)"
    >
      <div class="flex items-center gap-1.5 truncate min-w-0 mr-1">
        <component
          :is="isOpen ? ChevronDown : ChevronRight"
          :size="13"
          class="text-slate-400 shrink-0"
        />
        <component
          :is="settings.activeProject === proj.path ? FolderGit2 : Folder"
          :size="13"
          class="text-indigo-400 shrink-0"
        />
        <span class="truncate text-[12px]">{{ proj.name }}</span>
        <span
          v-if="proj.chatCount > 0"
          class="text-[9.5px] text-slate-500 font-mono"
        >
          ({{ proj.chatCount }})
        </span>
      </div>

      <!-- Right: Action Buttons (+ and ...) -->
      <div
        class="flex items-center gap-0.5 opacity-0 group-hover/proj:opacity-100 transition-opacity"
      >
        <button
          type="button"
          class="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
          title="Start new chat in this project"
          @click.stop="emit('newChat', proj.path)"
        >
          <Plus :size="12" />
        </button>
        <button
          type="button"
          class="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white"
          title="Options"
          @click.stop="showMenu = !showMenu"
        >
          <MoreHorizontal :size="12" />
        </button>
      </div>

      <!-- Popover Menu -->
      <div
        v-if="showMenu"
        class="absolute right-2 top-7 z-50 bg-slate-900 border border-white/15 rounded-xl shadow-xl p-1 flex flex-col gap-0.5 text-[11px] min-w-[130px]"
        @click.stop
      >
        <button
          type="button"
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-white/10 text-left text-slate-200"
          @click="
            settings.activeProject = proj.path;
            showMenu = false;
          "
        >
          <span>Set Active</span>
        </button>
        <button
          v-if="proj.custom"
          type="button"
          class="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-rose-500/20 text-left text-rose-400"
          @click="
            emit('delete', proj.path);
            showMenu = false;
          "
        >
          <Trash2 :size="11" />
          <span>Remove Project</span>
        </button>
      </div>
    </div>

    <!-- Chats List inside Folder -->
    <div
      v-if="isOpen && proj.chats && proj.chats.length > 0"
      class="pl-4 pr-1 py-0.5 flex flex-col gap-0.5 border-l border-white/5 ml-3"
    >
      <div
        v-for="c in getVisibleChats()"
        :key="c.id"
        class="group/chat flex items-center justify-between px-2 py-1 rounded-md text-[11px] hover:bg-white/5 cursor-pointer text-slate-400 hover:text-slate-200 transition-colors"
        @click="emit('openChat', c.id)"
      >
        <span class="truncate mr-1">{{ c.title }}</span>
        <button
          type="button"
          class="p-0.5 rounded hover:bg-white/10 text-slate-500 hover:text-amber-400"
          @click.stop="emit('togglePin', c.id)"
        >
          <Pin
            :size="10"
            :class="{ 'fill-amber-400 text-amber-400': c.pinned }"
          />
        </button>
      </div>
      <button
        v-if="proj.chats.length > 8"
        type="button"
        class="text-[10px] text-indigo-400 hover:text-indigo-300 py-0.5 px-2 text-left"
        @click="showAllChats = !showAllChats"
      >
        {{
          showAllChats ? "Show less" : `+${proj.chats.length - 8} more chats`
        }}
      </button>
    </div>
  </div>
</template>
