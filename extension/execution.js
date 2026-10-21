// DeepSeek MCP Studio — Execution Logic
(function (root) {
  "use strict";

  function formatToolResult(data) {
    if (!data) return "";
    if (Array.isArray(data.content)) {
      return data.content
        .map((item) => {
          if (item && item.type === "text" && typeof item.text === "string") {
            try {
              const parsed = JSON.parse(item.text);
              return JSON.stringify(parsed, null, 2);
            } catch (_) {
              return item.text;
            }
          }
          return JSON.stringify(item, null, 2);
        })
        .join("\n\n");
    }
    if (typeof data === "string") {
      try {
        return JSON.stringify(JSON.parse(data), null, 2);
      } catch (_) {
        return data;
      }
    }
    return JSON.stringify(data, null, 2);
  }

  async function executeBatchTools(payloads, cardStatusEl, callKey, targetEl) {
    if (!Array.isArray(payloads) || payloads.length === 0) return;
    if (payloads.length === 1) {
      return executeTool(payloads[0], cardStatusEl, callKey, targetEl);
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (cardStatusEl) {
      cardStatusEl.innerHTML = `<div class="ds-card-head ds-mb0">
        <div class="ds-note ds-note-accent ds-pad0"><span class="ds-ic" data-ic="clock"></span> Running batch of ${payloads.length} tools in parallel...</div>
        <div style="display:inline-flex;gap:4px;">
          <button class="ds-btn ds-btn-warn ds-btn-xs mcp-card-pause-btn" type="button" title="Pause autonomous task loop">⏸ Pause</button>
          <button class="ds-btn ds-btn-no ds-btn-xs mcp-card-kill-btn" type="button" title="Stop & Kill entire task completely"><span class="ds-ic" data-ic="close"></span> Stop All</button>
        </div>
      </div>`;
      const killBtn = cardStatusEl.querySelector(".mcp-card-kill-btn");
      if (killBtn) {
        killBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.DSState.killFullTask();
        };
      }
      const pauseBtn = cardStatusEl.querySelector(".mcp-card-pause-btn");
      if (pauseBtn) {
        pauseBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.DSState.pauseTask();
        };
      }
    }

    window.DSState.runningTaskCount += payloads.length;
    window.DSState.updateTaskBadge();

    try {
      const results = await Promise.all(
        payloads.map(async (payload, idx) => {
          const callId = `${batchId}_${idx}`;
          payload.callId = callId;

          const selProj = window.DSState.selectedProject;
          if (selProj) {
            payload.project = selProj;
            payload.arguments = payload.arguments || {};
            if (
              (payload.name === "execute_command" || payload.name === "bash") &&
              !payload.arguments.cwd
            ) {
              payload.arguments.cwd = selProj;
            }
            if (
              payload.arguments.path &&
              typeof payload.arguments.path === "string" &&
              !payload.arguments.path.startsWith("/")
            ) {
              payload.arguments.path =
                `${selProj}/${payload.arguments.path}`.replace(/\/+/g, "/");
            }
          }

          try {
            const bgRes = await new Promise((r) =>
              chrome.runtime.sendMessage({ type: "CALL", payload }, r),
            );
            if (!bgRes?.ok)
              throw new Error(bgRes?.error || "Bridge unreachable");
            const data = bgRes.data;
            if (data?.isError) {
              if (data.isCancelled)
                throw new Error("Task was cancelled by user");
              const errMsg =
                data.error ||
                (Array.isArray(data.content) && data.content[0]?.text) ||
                "Execution failed";
              throw new Error(errMsg);
            }
            return {
              name: payload.name,
              output: formatToolResult(data).slice(0, 8000),
              success: true,
            };
          } catch (err) {
            return {
              name: payload.name,
              output: `Error: ${err.message}`,
              success: false,
            };
          }
        }),
      );

      if (targetEl) {
        targetEl.setAttribute("data-mcp-executed", "true");
      }
      if (callKey) {
        if (window.DSState.markCallExecuted) {
          window.DSState.markCallExecuted(callKey);
        } else {
          window.DSState.executedCalls.add(callKey);
          window.DSState.saveExecuted?.();
        }
      }

      if (cardStatusEl) {
        cardStatusEl.innerHTML = `<div class="ds-note ds-note-success"><span class="ds-ic" data-ic="check"></span> Completed batch of ${payloads.length} tools.</div>`;
      }

      const isArabic = sessionStorage.getItem("deepseek_mcp_arabic") === "true";
      const arDiscussion = isArabic
        ? "\n\n[توجيه إلزامي: تناقش وتكلم مع المستخدم بالعربي أولاً موضحاً: (1) ما تم إنجازه واكتشافه من نتائج الحزمة، (2) ما ستفعله الآن ولماذا، (3) ما تبقى لإتمام المهمة، ثم استدعِ الأداة التالية]."
        : "\n\n[Analyze these results, discuss progress and next steps, then proceed with the next tool call.]";

      const batchMessage =
        `[MCP_AUTO_RESULT]\n` +
        `Batch Results for ${payloads.length} parallel calls:\n` +
        results
          .map(
            (r, i) =>
              `### Tool ${i + 1}: ${r.name}\n\`\`\`json\n${r.output}\n\`\`\``,
          )
          .join("\n\n") +
        arDiscussion;

      if (window.DSState.isPaused || !window.DSState.isTaskActive) {
        console.log(
          "[DS Studio] Batch completed while paused or stopped. Skipping auto-dispatch.",
        );
        return;
      }
      await window.DSState.sendText(batchMessage);
    } catch (err) {
      if (cardStatusEl) {
        cardStatusEl.innerHTML = window.DSComponents.status.error(err.message);
      }
      if (window.DSState.isPaused || !window.DSState.isTaskActive) {
        return;
      }
      await window.DSState.sendText(
        `[MCP_AUTO_RESULT]\nExecution notice on batch: ${err.message}`,
      );
    } finally {
      window.DSState.runningTaskCount = Math.max(
        0,
        window.DSState.runningTaskCount - payloads.length,
      );
      window.DSState.updateTaskBadge();
      window.DSState.scrollToBottom();
    }
  }

  // Tool execution & card rendering
  async function executeTool(payload, cardStatusEl, callKey, targetEl) {
    const callId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    payload.callId = callId;

    payload.arguments = payload.arguments || {};

    if (
      (payload.name === "execute_command" || payload.name === "bash") &&
      !payload.arguments.command &&
      targetEl
    ) {
      const parentMessage =
        targetEl.closest(
          "div.ds-markdown, div.md-code-block, pre, div[class*='message']",
        ) || targetEl.parentElement;
      const fullText =
        (parentMessage ? parentMessage.textContent : targetEl.textContent) ||
        "";
      const bashTagMatch = fullText.match(
        /<(?:bash|sh|shell)>([\s\S]*?)<\/(?:bash|sh|shell)>/i,
      );
      if (bashTagMatch && bashTagMatch[1].trim()) {
        payload.arguments.command = bashTagMatch[1].trim();
      }
    }

    const selProj = window.DSState.selectedProject;
    if (selProj) {
      payload.project = selProj;
      if (
        (payload.name === "execute_command" || payload.name === "bash") &&
        !payload.arguments.cwd
      ) {
        payload.arguments.cwd = selProj;
      }
      if (
        payload.arguments.path &&
        typeof payload.arguments.path === "string" &&
        !payload.arguments.path.startsWith("/")
      ) {
        payload.arguments.path = `${selProj}/${payload.arguments.path}`.replace(
          /\/+/g,
          "/",
        );
      }
    }

    if (cardStatusEl) {
      cardStatusEl.innerHTML = window.DSComponents.status.runningWithKill(
        payload.name,
      );
      const killBtn = cardStatusEl.querySelector(".mcp-card-kill-btn");
      if (killBtn) {
        killBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.DSState.killFullTask();
        };
      }
      const pauseBtn = cardStatusEl.querySelector(".mcp-card-pause-btn");
      if (pauseBtn) {
        pauseBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.DSState.pauseTask();
        };
      }
    }

    window.DSState.runningTaskCount++;
    window.DSState.updateTaskBadge();

    try {
      const bgRes = await new Promise((r) =>
        chrome.runtime.sendMessage({ type: "CALL", payload }, r),
      );
      if (!bgRes?.ok) throw new Error(bgRes?.error || "Bridge unreachable");
      const data = bgRes.data;
      if (data?.isError) {
        if (data.isCancelled) throw new Error("Task was cancelled by user");
        const errMsg =
          data.error ||
          (Array.isArray(data.content) && data.content[0]?.text) ||
          "Execution failed";
        throw new Error(errMsg);
      }

      if (targetEl) {
        targetEl.setAttribute("data-mcp-executed", "true");
      }

      if (callKey) {
        if (window.DSState.markCallExecuted) {
          window.DSState.markCallExecuted(callKey);
        } else {
          window.DSState.executedCalls.add(callKey);
          window.DSState.saveExecuted?.();
        }
      }

      const out = formatToolResult(data).slice(0, 15000);
      if (cardStatusEl) {
        cardStatusEl.innerHTML = window.DSComponents.status.done(
          payload.name,
          out,
        );
      }

      const isArabic = sessionStorage.getItem("deepseek_mcp_arabic") === "true";
      const arabicNote = isArabic
        ? "\n[تنبيه: اشرح خطوتك التالية بالعربية دائماً]."
        : "";

      const templates = window.DSQueue?.HUMAN_RESULT_TEMPLATES || [
        (name, o) =>
          `[MCP_AUTO_RESULT]\nTool ${name} completed:\n\`\`\`json\n${o}\n\`\`\`\nProceed autonomously.${arabicNote}`,
      ];
      const template = templates[Math.floor(Math.random() * templates.length)];
      let message = template(payload.name, out);
      if (!message.startsWith("[MCP_AUTO_RESULT]")) {
        message = `[MCP_AUTO_RESULT]\n${message}`;
      }
      if (arabicNote && !message.includes("[تنبيه:")) {
        message += arabicNote;
      }

      if (window.DSState.isPaused || !window.DSState.isTaskActive) {
        console.log(
          "[DS Studio] Tool completed while paused or stopped. Skipping auto-dispatch.",
        );
        return;
      }

      await window.DSState.sendText(message);
    } catch (err) {
      if (cardStatusEl) {
        cardStatusEl.innerHTML = window.DSComponents.status.error(err.message);
      }
      if (window.DSState.isPaused || !window.DSState.isTaskActive) {
        return;
      }
      await window.DSState.sendText(
        `[MCP_AUTO_RESULT]\nExecution notice on ${payload.name}: ${err.message}`,
      );
    } finally {
      window.DSState.runningTaskCount = Math.max(
        0,
        window.DSState.runningTaskCount - 1,
      );
      window.DSState.updateTaskBadge();
      window.DSState.scrollToBottom();
    }
  }

  root.DSExecution = { executeBatchTools, executeTool, formatToolResult };
})(window);
