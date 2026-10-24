<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";
import { useDeepSeekDom } from "../composables/useDeepSeekDom";
import SlashMentionMenu from "./SlashMentionMenu.vue";

const { getChatInput } = useDeepSeekDom();

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
  width: "310px",
});

function updateMenuCoords(input: HTMLTextAreaElement) {
  const rect = input.getBoundingClientRect();
  const width = Math.min(310, window.innerWidth - 32);
  const left = Math.max(
    16,
    Math.min(rect.left, window.innerWidth - width - 16),
  );

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

  // Derive pattern from insertedText prefix (/ or @) for bulletproof token replacement
  const isSlash = insertedText.startsWith("/");
  const pattern = isSlash
    ? /(?:^|\s)\/+[a-zA-Z0-9_\-\.]*$/
    : /(?:^|\s)@+[a-zA-Z0-9_\-\.]*$/;

  const replacedBefore = textBefore.replace(pattern, (match) => {
    return match.startsWith(" ") ? ` ${insertedText}` : insertedText;
  });

  const fullText = `${replacedBefore}${textAfter}`;
  const proto = Object.getPrototypeOf(input);
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (nativeSetter) {
    nativeSetter.call(input, fullText);
  } else {
    input.value = fullText;
  }
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.focus();
  const newPos = replacedBefore.length;
  input.setSelectionRange(newPos, newPos);
  menuMode.value = null;
  menuQuery.value = "";
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
  <!-- Floating Slash & Mention Popup (teleported to body, zero DOM clutter on input) -->
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
</template>
