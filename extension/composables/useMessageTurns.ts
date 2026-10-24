import { ref } from "vue";
import { useToolParser } from "./useToolParser";
import { useActionCards } from "./useActionCards";
import { useDeepSeekDom } from "./useDeepSeekDom";
import { activeActions, isTaskActive } from "./useStudioState";
import type { ToolCallAction } from "../types";

export interface MessageTurn {
  id: string;
  anchorId: string;
  actions: ToolCallAction[];
}

export function useMessageTurns() {
  const messageTurns = ref<MessageTurn[]>([]);
  const { parseToolCallsFromText, stripToolCalls } = useToolParser();
  const { registerActions } = useActionCards();
  const { isGenerating } = useDeepSeekDom();

  function scanMessagesForTools() {
    const mdBlocks = Array.from(
      document.querySelectorAll("div.ds-markdown"),
    ).filter(
      (el) => !el.closest("div[class*='think' i], div[class*='thought' i]"),
    ) as HTMLElement[];

    if (mdBlocks.length === 0) return;

    // Sweep all existing mounts to ensure any newly appended siblings stay hidden
    document.querySelectorAll(".ds-inline-tool-mount").forEach((anchor) => {
      let sib = anchor.nextElementSibling;
      while (sib) {
        if (
          !sib.classList.contains("ds-inline-tool-mount") &&
          (sib as HTMLElement).style.display !== "none"
        ) {
          (sib as HTMLElement).style.display = "none";
        }
        sib = sib.nextElementSibling;
      }
    });

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

      const rawText = block.innerText || block.textContent || "";
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
        block.querySelector(
          "tool_call, [class*='tool_call' i], invoke, parameter, [class*='dsml' i]",
        ) ||
        Array.from(block.children).find((c) => {
          const t = c.textContent || "";
          const h = c.innerHTML || "";
          return (
            t.includes("<tool_call>") ||
            h.includes("tool_call") ||
            t.includes("DSML") ||
            h.includes("DSML") ||
            t.includes("invoke") ||
            h.includes("invoke")
          );
        });

      if (toolEl) {
        toolEl.insertAdjacentElement("beforebegin", anchor);
      } else {
        block.appendChild(anchor);
      }

      // 1. Hide all raw tool call siblings after anchor (parameters, code, HTML snippets, closing tags)
      let sib = anchor.nextElementSibling;
      while (sib) {
        if (!sib.classList.contains("ds-inline-tool-mount")) {
          (sib as HTMLElement).style.display = "none";
        }
        sib = sib.nextElementSibling;
      }

      // 2. Hide raw tool call tags from DOM
      block
        .querySelectorAll(
          "tool_call, [class*='tool_call' i], tool_name, parameters, parameter, arguments, tool_result, invoke, [class*='dsml' i]",
        )
        .forEach((el) => {
          (el as HTMLElement).style.display = "none";
        });

      // 3. Hide any snippet elements containing tool syntax
      block.querySelectorAll("p, pre, code, span, div").forEach((el) => {
        if (el.closest(".ds-inline-tool-mount")) return;
        const txt = el.textContent || "";
        const isToolSnippet =
          txt.includes("<tool_call>") ||
          txt.includes("tool_call>") ||
          txt.includes("DSML") ||
          txt.includes("invoke") ||
          txt.includes("\uff5c\uff5c") ||
          txt.includes("<|DSML|") ||
          txt.includes("<||") ||
          txt.includes("<tool_result>");

        if (isToolSnippet) {
          (el as HTMLElement).style.display = "none";
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
        detected.forEach((a) => {
          (a as any).turnId = turnId;
        });
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
    isTaskActive.value = false;
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
