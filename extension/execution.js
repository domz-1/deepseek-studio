// DeepSeek MCP Studio — Execution Logic
(function (root) {
  "use strict";
  async function executeBatchTools(payloads, cardStatusEl, callKey, targetEl) {
    if (!Array.isArray(payloads) || payloads.length === 0) return;
    if (payloads.length === 1) {
      return executeTool(payloads[0], cardStatusEl, callKey, targetEl);
    }

    const batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    if (cardStatusEl) {
      cardStatusEl.innerHTML = `<div class="ds-card-head ds-mb0">
        <div class="ds-note ds-note-accent ds-pad0"><span class="ds-ic" data-ic="clock"></span> Running batch of ${payloads.length} tools in parallel...</div>
        <button class="ds-btn ds-btn-no ds-btn-sm mcp-card-kill-btn" type="button"><span class="ds-ic" data-ic="close"></span> Kill Batch</button>
      </div>`;
      const killBtn = cardStatusEl.querySelector(".mcp-card-kill-btn");
      if (killBtn) {
        killBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.DSState.killActiveTask(batchId);
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
              output: JSON.stringify(data.content || data, null, 2).slice(
                0,
                5000,
              ),
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
        window.DSState.executedCalls.add(callKey);
        try {
          sessionStorage.setItem(
            "deepseek_mcp_executed",
            JSON.stringify(Array.from(window.DSState.executedCalls)),
          );
        } catch (_) {}
      }

      if (cardStatusEl) {
        cardStatusEl.innerHTML = `<div class="ds-note ds-note-success"><span class="ds-ic" data-ic="check"></span> Completed batch of ${payloads.length} tools.</div>`;
      }

      const batchMessage =
        `Batch Results for ${payloads.length} parallel calls:\n` +
        results
          .map(
            (r, i) =>
              `### Tool ${i + 1}: ${r.name}\n\`\`\`json\n${r.output}\n\`\`\``,
          )
          .join("\n\n") +
        `\n\nAnalyze these batch results and continue executing the next step autonomously until complete.`;

      await window.DSState.sendText(batchMessage);
    } catch (err) {
      if (cardStatusEl) {
        cardStatusEl.innerHTML = window.DSComponents.status.error(err.message);
      }
      await window.DSState.sendText(
        `Execution notice on batch: ${err.message}`,
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
          window.DSState.killActiveTask(callId);
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
        window.DSState.executedCalls.add(callKey);
        try {
          sessionStorage.setItem(
            "deepseek_mcp_executed",
            JSON.stringify(Array.from(window.DSState.executedCalls)),
          );
        } catch (_) {}
      }

      const out = JSON.stringify(data.content || data, null, 2).slice(0, 10000);
      if (cardStatusEl) {
        cardStatusEl.innerHTML = window.DSComponents.status.done(payload.name);
      }

      const templates = window.DSQueue?.HUMAN_RESULT_TEMPLATES || [
        (name, o) =>
          `Tool ${name} completed:\n\`\`\`json\n${o}\n\`\`\`\nProceed autonomously.`,
      ];
      const template = templates[Math.floor(Math.random() * templates.length)];
      const message = template(payload.name, out);

      await window.DSState.sendText(message);
    } catch (err) {
      if (cardStatusEl) {
        cardStatusEl.innerHTML = window.DSComponents.status.error(err.message);
      }
      await window.DSState.sendText(
        `Execution notice on ${payload.name}: ${err.message}`,
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

  root.DSExecution = { executeBatchTools, executeTool };
})(window);
