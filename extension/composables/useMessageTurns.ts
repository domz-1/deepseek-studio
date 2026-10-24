import { ref } from "vue";
import { useToolParser } from "./useToolParser";
import { useActionCards } from "./useActionCards";
import { useDeepSeekDom } from "./useDeepSeekDom";
import { activeActions } from "./useStudioState";
import type { ToolCallAction } from "../types";

export interface MessageTurn {
  id: string;
  anchorId: string;
  actions: ToolCallAction[];
}

export function useMessageTurns() {
  const messageTurns = ref<MessageTurn[]>([]);
  const { parseToolCallsFromText } = useToolParser();
  const { registerActions } = useActionCards();
  const { isGenerating } = useDeepSeekDom();

  function scanMessagesForTools() {
    const mdBlocks = Array.from(
      document.querySelectorAll("div.ds-markdown"),
    ).filter(
      (el) => !el.closest("div[class*='think' i], div[class*='thought' i]"),
    ) as HTMLElement[];

    if (mdBlocks.length === 0) return;

    const generating = isGenerating();

    for (let i = 0; i < mdBlocks.length; i++) {
      const block = mdBlocks[i];
      const isLatest = i === mdBlocks.length - 1;

      // Skip blocks already processed
      if (block.hasAttribute("data-ds-scanned")) {
        continue;
      }

      // If this is the latest block and DeepSeek is still generating tokens, wait
      if (isLatest && generating) {
        continue;
      }

      const rawText = block.textContent || "";
      let detected = parseToolCallsFromText(rawText);

      // Fallback if browser parsed custom XML tags as DOM elements
      if (detected.length === 0 && block.innerHTML.includes("tool_call")) {
        const htmlUnescaped = block.innerHTML
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&");
        detected = parseToolCallsFromText(htmlUnescaped);
      }

      if (detected.length === 0) {
        // If block has finished generating and has no tool calls, mark scanned
        if (!isLatest) {
          block.setAttribute("data-ds-scanned", "true");
        }
        continue;
      }

      // Detected tool calls in this block - create turn and in-place anchor
      const turnId =
        "turn_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
      const anchorId = "ds-anchor-" + turnId;

      const anchor = document.createElement("div");
      anchor.id = anchorId;
      anchor.className =
        "ds-inline-tool-mount w-full my-2.5 pointer-events-auto";

      // Locate insertion point right before the first tool call element
      const toolEl =
        block.querySelector("tool_call, [class*='tool_call' i]") ||
        Array.from(block.children).find(
          (c) =>
            (c.textContent || "").includes("<tool_call>") ||
            (c.innerHTML || "").includes("tool_call"),
        );

      if (toolEl) {
        toolEl.insertAdjacentElement("beforebegin", anchor);
      } else {
        block.appendChild(anchor);
      }

      // Hide raw tool call tags from DOM
      block
        .querySelectorAll(
          "tool_call, [class*='tool_call' i], tool_name, parameters, parameter, arguments, tool_result",
        )
        .forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });

      block.querySelectorAll("p, pre, code").forEach((el) => {
        const txt = el.textContent || "";
        if (txt.includes("<tool_call>") || txt.includes("tool_call>")) {
          const stripped = txt
            .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
            .replace(/<\/?[a-zA-Z0-9_:-]+>/g, "")
            .trim();
          if (stripped === "") {
            (el as HTMLElement).style.display = "none";
          }
        }
      });

      block.setAttribute("data-ds-scanned", "true");

      const isHistory = block.hasAttribute("data-ds-history") || !isLatest;
      if (isHistory) {
        detected.forEach((a) => {
          a.status = "completed";
          (a as any).sent = true;
        });
        messageTurns.value.push({
          id: turnId,
          anchorId,
          actions: detected,
        });
      } else {
        messageTurns.value.push({
          id: turnId,
          anchorId,
          actions: detected,
        });
        registerActions(detected);
      }
    }
  }

  function resetTurns() {
    messageTurns.value = [];
    activeActions.value = [];
    // Clean up any legacy anchors
    document
      .querySelectorAll(".ds-inline-tool-mount, #ds-inline-action-anchor")
      .forEach((el) => el.remove());
    // Mark existing blocks as history so navigating to old chats never triggers execution
    document
      .querySelectorAll("div.ds-markdown")
      .forEach((el) => el.setAttribute("data-ds-history", "true"));
  }

  return {
    messageTurns,
    scanMessagesForTools,
    resetTurns,
  };
}
