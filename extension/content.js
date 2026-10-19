// DeepSeek MCP Studio — Content Script (Orchestrator)
// Coordinates UI badges, permission cards, batch/tool execution, and DOM observers.
// State is managed by window.DSState, mention/skeleton by window.DSMention,
// queue by window.DSQueue, and retry/heartbeat by window.DSWatchdog.

(function () {
  "use strict";

  // UI Badges & Indicator
  function updateServerBadges() {
    const container = document.getElementById("deepseek-mcp-badge");
    if (!container) return;

    const serversWrap = container.querySelector("#mcp-server-pills");
    if (!serversWrap) return;

    serversWrap.innerHTML = window.DSComponents.serverPills(
      window.DSState.activeTools,
      window.DSState.serverStatus,
    );

    serversWrap.querySelectorAll(".ds-pill, .ds-chip-item").forEach((btn) => {
      btn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const srv = btn.dataset.srv;
        const mention = srv === "all" ? "@all" : `@${srv}`;
        const el = window.DSState.getChatInput();
        if (el) {
          el.focus();
          if (!el.value.includes(mention)) {
            const sep = el.value.trim() ? " " : "";
            window.DSState.setInputValue(
              el,
              `${el.value.trim()}${sep}${mention} `,
            );
          }
        }
      };
    });
  }

  function injectChatBadge() {
    const input = window.DSState.getChatInput();
    if (!input) return;

    const targetParent =
      input.closest("div.ds-textarea-wrapper") || input.parentElement;
    if (!targetParent) return;

    let wrap = document.getElementById("deepseek-mcp-badge");
    if (wrap && wrap.parentElement !== targetParent.parentElement) {
      wrap.remove();
      wrap = null;
    }

    if (!wrap) {
      wrap = document.createElement("div");
      wrap.id = "deepseek-mcp-badge";
      wrap.className = "ds-badge-bar";
      wrap.innerHTML = window.DSComponents.badgeBar({
        selectedProject: window.DSState.selectedProject,
      });

      const projTrigger = wrap.querySelector("#mcp-project-trigger");
      if (projTrigger) {
        projTrigger.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.DSProjects?.fetchAllProjects((projects) => {
            if (window.DSUI?.showProjectMenu) {
              window.DSUI.showProjectMenu(
                projTrigger,
                projects,
                window.DSState.selectedProject,
                (chosen) => {
                  window.DSState.selectedProject = chosen.path;
                  localStorage.setItem(
                    "deepseek_mcp_selected_project",
                    window.DSState.selectedProject,
                  );
                  window.DSProjects?.updateProjectLabel();
                  const chips = document.getElementById("ds-sidebar-chips");
                  if (chips) {
                    chips.querySelectorAll(".ds-sidebar-chip").forEach((b) => {
                      b.classList.toggle(
                        "is-active",
                        b.dataset.path === window.DSState.selectedProject,
                      );
                    });
                  }
                },
              );
            }
          });
        };
      }

      const addBtn = wrap.querySelector("#mcp-add-project-btn");
      if (addBtn) {
        addBtn.onclick = () => {
          window.DSProjects?.showAddProjectModal((cleanPath) => {
            if (!cleanPath) return;
            const name =
              cleanPath.split("/").filter(Boolean).pop() || cleanPath;
            let customs = window.DSProjects?.getCustomProjects() || [];
            if (!customs.find((c) => c.path === cleanPath)) {
              customs.unshift({ name: `⭐ ${name}`, path: cleanPath });
              localStorage.setItem(
                "deepseek_mcp_custom_projects",
                JSON.stringify(customs),
              );
            }
            window.DSState.selectedProject = cleanPath;
            localStorage.setItem(
              "deepseek_mcp_selected_project",
              window.DSState.selectedProject,
            );
            window.DSProjects?.updateProjectLabel();
            const filter = document.getElementById("ds-sidebar-project-filter");
            if (filter) filter.remove();
            window.DSProjects?.injectSidebarProjectFilter();
          });
        };
      }

      const ralphBtn = wrap.querySelector("#mcp-ralph-loop-btn");
      function updateRalphBtn() {
        if (!ralphBtn) return;
        if (window.DSState.isRalphLoopActive) {
          ralphBtn.innerHTML = `🔁 Ralph: ON`;
          ralphBtn.style.color = "#10b981";
          ralphBtn.style.borderColor = "#10b981";
          ralphBtn.style.fontWeight = "bold";
        } else {
          ralphBtn.innerHTML = `🔁 Ralph: OFF`;
          ralphBtn.style.color = "var(--ds-fg-muted)";
          ralphBtn.style.borderColor = "var(--ds-border)";
          ralphBtn.style.fontWeight = "normal";
        }
      }
      updateRalphBtn();

      if (ralphBtn) {
        ralphBtn.onclick = async () => {
          window.DSState.isRalphLoopActive = !window.DSState.isRalphLoopActive;
          localStorage.setItem(
            "deepseek_mcp_ralph_loop",
            window.DSState.isRalphLoopActive,
          );
          updateRalphBtn();
          try {
            chrome.runtime.sendMessage({
              type: "TOGGLE_RALPH",
              payload: { enabled: window.DSState.isRalphLoopActive },
            });
          } catch (_) {}
        };
      }

      const undoBtn = wrap.querySelector("#mcp-undo-tool-btn");
      if (undoBtn) {
        undoBtn.onclick = async () => {
          try {
            const res = await new Promise((resolve) =>
              chrome.runtime.sendMessage({ type: "UNDO" }, resolve),
            );
            if (res?.ok && res.data?.restored) {
              undoBtn.textContent = `✓ Reverted ${res.data.restored.split("/").pop()}`;
              setTimeout(() => {
                undoBtn.innerHTML = `<span class="ds-ic" data-ic="arrowRight" style="transform:rotate(180deg);display:inline-block;"></span> Undo`;
              }, 3000);
            } else {
              alert(res?.data?.error || "No file snapshots in undo history.");
            }
          } catch (e) {
            console.warn("[MCP] Undo failed:", e);
          }
        };
      }

      targetParent.parentElement.insertBefore(wrap, targetParent);
    }

    window.DSProjects?.updateProjectLabel();
    updateServerBadges();
    window.DSState.updateTaskBadge();

    if (!window.DSState.activeTools.length) {
      window.DSState.fetchActiveTools().then(() => {
        updateServerBadges();
      });
    }

    // Inject message queue bar below badge bar
    if (window.DSQueue?.injectMessageQueueBar) {
      window.DSQueue.injectMessageQueueBar(targetParent);
    }
  }

  // Batch Tool execution & card rendering
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

  function renderPermissionCard(
    targetEl,
    payload,
    callKey,
    isAlreadyExecuted = false,
  ) {
    if (targetEl) {
      if (
        targetEl.tagName === "PRE" ||
        targetEl.classList.contains("md-code-block")
      ) {
        targetEl.style.display = "none";
      } else {
        try {
          const rawHtml = targetEl.innerHTML;
          let cleanedHtml = rawHtml
            .replace(
              /(&lt;|<)[\|\uff5c\s]*DSML[\s\S]*?(\/)[\|\uff5c\s]*DSML[\|\uff5c\s]*calls(&gt;|>)/gi,
              "",
            )
            .replace(
              /(&lt;|<)[\|\uff5c\s]*DSML[\s\S]*?(\/)[\|\uff5c\s]*DSML[\|\uff5c\s]*invoke(&gt;|>)/gi,
              "",
            )
            .replace(
              /(&lt;|<)[\|\uff5c\s]*DSML[\|\uff5c\s]*calls(&gt;|>)/gi,
              "",
            )
            .replace(
              /(&lt;|<)\/[\|\uff5c\s]*DSML[\|\uff5c\s]*calls(&gt;|>)/gi,
              "",
            )
            .replace(
              /(&lt;|<)\/?(tool_calls?|function_calls?|call|calls?|invoke|invokes?|action|actions?|tool|tools?|mcp_call|mcp_calls?)(?:\s+[^>]*?)?(&gt;|>)/gi,
              "",
            );

          cleanedHtml = cleanedHtml.replace(
            /(&lt;|<)\/?([a-zA-Z0-9_\-\.:\|]+)(?:\s+[^>]*?)?(&gt;|>)/gi,
            (match, open, tagName) => {
              const lower = tagName.toLowerCase().replace(/^[|]+|[|]+$/g, "");
              const standardTags = [
                "b",
                "i",
                "u",
                "strong",
                "em",
                "p",
                "div",
                "span",
                "code",
                "pre",
                "a",
                "li",
                "ul",
                "ol",
                "table",
                "tr",
                "td",
                "th",
                "h1",
                "h2",
                "h3",
                "h4",
                "h5",
                "h6",
                "blockquote",
                "hr",
                "br",
                "img",
              ];
              if (standardTags.includes(lower)) return match;
              return "";
            },
          );

          if (cleanedHtml.trim() !== rawHtml.trim()) {
            targetEl.innerHTML = cleanedHtml;
          }
        } catch (_) {}
      }
    }

    const isBatch = Array.isArray(payload);
    const isSafe = isBatch
      ? payload.every((p) => window.DSTools.SAFE_TOOLS.has(p.name))
      : window.DSTools.SAFE_TOOLS.has(payload.name);

    const card = document.createElement("div");
    card.className =
      "deepseek-mcp-action-card ds-card" +
      (isSafe ? "" : " is-danger") +
      (isAlreadyExecuted ? " is-historical" : "");
    card.innerHTML = window.DSComponents.permissionCard({
      payload,
      isSafe,
      isHistorical: isAlreadyExecuted,
      isBatch,
      batchCount: isBatch ? payload.length : 1,
    });

    if (isAlreadyExecuted) {
      const btn = card.querySelector(".view-raw-btn");
      if (btn && targetEl) {
        btn.onclick = () => {
          targetEl.style.display =
            targetEl.style.display === "none" ? "block" : "none";
        };
      }
      targetEl.insertAdjacentElement("afterend", card);
      return;
    }

    const btn = card.querySelector(".view-raw-btn");
    if (btn && targetEl) {
      btn.onclick = () => {
        targetEl.style.display =
          targetEl.style.display === "none" ? "block" : "none";
      };
    }

    targetEl.insertAdjacentElement("afterend", card);

    const controls = card.querySelector(".card-controls");

    card.querySelector(".ok").onclick = async () => {
      try {
        const edited = JSON.parse(card.querySelector(".ed").value);
        if (isBatch && Array.isArray(edited)) {
          payload = edited;
        } else if (!isBatch && edited) {
          payload.arguments = edited;
        }
      } catch (_) {}
      if (isBatch) {
        executeBatchTools(payload, controls, callKey, targetEl);
      } else {
        executeTool(payload, controls, callKey, targetEl);
      }
    };

    card.querySelector(".no").onclick = () => {
      targetEl.setAttribute("data-mcp-executed", "true");
      window.DSState.executedCalls.add(callKey);
      const title = isBatch ? `batch of ${payload.length} tools` : payload.name;
      controls.innerHTML = window.DSComponents.status.rejected(title);
      window.DSState.sendText(`I skipped "${title}". Please continue.`);
    };

    if (window.DSState.autoApprove) {
      const title = isBatch ? `batch of ${payload.length} tools` : payload.name;
      controls.innerHTML = window.DSComponents.status.autoRunning(title);
      setTimeout(
        () => {
          if (isBatch) {
            executeBatchTools(payload, controls, callKey, targetEl);
          } else {
            executeTool(payload, controls, callKey, targetEl);
          }
        },
        isSafe ? 30 : 150,
      );
    }
  }

  function renderGrillQuestionCard(
    targetEl,
    grillData,
    callKey,
    isHistorical = false,
  ) {
    if (targetEl) {
      targetEl.style.display = "none";
    }

    const card = document.createElement("div");
    card.className =
      "deepseek-mcp-action-card deepseek-grill-card ds-card ds-grill";

    const qList = grillData.is_multi_question
      ? grillData.questions
      : [grillData];

    if (isHistorical) {
      card.innerHTML = `
        <div class="ds-grill-hist">
          <div class="ds-title">
            <span><span class="ds-ic" data-ic="flame"></span> Answered Grill-Me Decision</span>
            <span class="ds-grill-count">(${qList.length} question${qList.length > 1 ? "s" : ""})</span>
          </div>
          <button class="ds-btn ds-btn-raw view-raw-btn" type="button">Toggle JSON</button>
        </div>
      `;
      const btn = card.querySelector(".view-raw-btn");
      if (btn && targetEl) {
        btn.onclick = () => {
          targetEl.style.display =
            targetEl.style.display === "none" ? "block" : "none";
        };
      }
      targetEl.insertAdjacentElement("afterend", card);
      return;
    }

    let questionsHtml = qList
      .map((q, qIdx) => {
        const isMultiSelect = Boolean(q.multi_select);
        const optionsHtml = (q.options || [])
          .map((opt, i) => {
            const optId =
              typeof opt === "object" && opt?.id
                ? opt.id
                : String.fromCharCode(65 + i);
            const label =
              typeof opt === "string"
                ? opt
                : opt.label || opt.text || opt.title || "";
            const details =
              typeof opt === "object" ? opt.details || opt.desc || "" : "";
            return `
              <label class="ds-grill-opt grill-opt-card" data-q-idx="${qIdx}" data-opt-id="${optId}">
                <input type="${isMultiSelect ? "checkbox" : "radio"}" name="grill_q_${qIdx}" value="${optId}" />
                <div class="ds-grill-opt-body">
                  <b class="ds-grill-opt-label">[${optId}] ${label}</b>
                  ${details ? `<span class="ds-grill-opt-desc">${details}</span>` : ""}
                </div>
              </label>
            `;
          })
          .join("");

        return `
          <div class="ds-grill-q grill-single-q-block" data-q-idx="${qIdx}">
            <div class="ds-grill-q-title">
              ${qList.length > 1 ? `<b>#${qIdx + 1}:</b> ` : ""}${q.question}
              ${isMultiSelect ? '<span class="ds-grill-multi">(Select multiple that apply)</span>' : ""}
            </div>
            <div class="ds-grill-options grill-options-grid">
              ${optionsHtml}
            </div>
          </div>
        `;
      })
      .join("");

    card.innerHTML = `
      <div class="ds-grill-head">
        <div class="ds-grill-title">
          <span><span class="ds-ic" data-ic="flame"></span> Architecture Decision Point</span>
        </div>
        <div class="ds-title">
          <span class="ds-grill-badge">Interactive Interview</span>
          <button class="ds-btn ds-btn-raw toggle-raw-json-btn" type="button">JSON</button>
        </div>
      </div>
      <div class="grill-questions-container">
        ${questionsHtml}
      </div>
      <div class="ds-grill-custom grill-custom-wrap">
        <input type="text" class="ds-grill-custom-input grill-custom-input" placeholder="Add custom notes or alternative rationale (optional)..." />
        <div class="ds-grill-submit-row">
          <button class="ds-grill-submit grill-submit-btn" type="button">
            <span>Submit Decision <span class="ds-ic" data-ic="arrowRight"></span></span>
          </button>
        </div>
      </div>
    `;

    targetEl.insertAdjacentElement("afterend", card);

    const toggleBtn = card.querySelector(".toggle-raw-json-btn");
    if (toggleBtn && targetEl) {
      toggleBtn.onclick = () => {
        targetEl.style.display =
          targetEl.style.display === "none" ? "block" : "none";
      };
    }

    card.querySelectorAll(".grill-opt-card").forEach((optEl) => {
      optEl.onclick = () => {
        const input = optEl.querySelector("input");
        if (input.type === "radio") {
          const qIdx = optEl.getAttribute("data-q-idx");
          card
            .querySelectorAll(`.grill-opt-card[data-q-idx="${qIdx}"]`)
            .forEach((sibling) => sibling.classList.remove("is-selected"));
          optEl.classList.add("is-selected");
        } else {
          optEl.classList.toggle("is-selected", input.checked);
        }
      };
    });

    const submitBtn = card.querySelector(".grill-submit-btn");
    const customInput = card.querySelector(".grill-custom-input");

    const doSubmitDecision = (isAuto = false) => {
      if (card.__grillAutoTimer) {
        clearInterval(card.__grillAutoTimer);
        card.__grillAutoTimer = null;
      }

      const answers = [];

      qList.forEach((q, idx) => {
        let checkedInputs = Array.from(
          card.querySelectorAll(`input[name="grill_q_${idx}"]:checked`),
        );

        if (isAuto && checkedInputs.length === 0) {
          const recIndex = (q.options || []).findIndex((o) => {
            const text =
              typeof o === "string" ? o : `${o.label || ""} ${o.details || ""}`;
            return text.toLowerCase().includes("recommended");
          });
          const targetIdx = recIndex !== -1 ? recIndex : 0;
          const opt = (q.options || [])[targetIdx];
          if (opt) {
            const optId =
              typeof opt === "object" && opt?.id
                ? opt.id
                : String.fromCharCode(65 + targetIdx);
            const inputEl = card.querySelector(
              `input[name="grill_q_${idx}"][value="${optId}"]`,
            );
            if (inputEl) inputEl.checked = true;
            checkedInputs = [inputEl].filter(Boolean);
          }
        }

        const selectedIds = checkedInputs.map((i) => i.value);
        const selectedOpts = (q.options || []).filter((o, i) =>
          selectedIds.includes(
            typeof o === "object" && o?.id ? o.id : String.fromCharCode(65 + i),
          ),
        );

        if (selectedOpts.length > 0) {
          const labelStr = selectedOpts
            .map((o, i) => {
              const id =
                typeof o === "object" && o?.id
                  ? o.id
                  : String.fromCharCode(65 + i);
              const lbl =
                typeof o === "string" ? o : o.label || o.text || o.title || "";
              return `[${id}] "${lbl}"`;
            })
            .join(", ");
          const detailsStr = selectedOpts
            .map((o) => (typeof o === "object" ? o.details : ""))
            .filter(Boolean)
            .join("; ");
          answers.push(
            `Question "${q.question}":\n- Decision: ${labelStr}${detailsStr ? `\n- Details: ${detailsStr}` : ""}`,
          );
        }
      });

      const customText = customInput ? customInput.value.trim() : "";
      if (customText) {
        answers.push(`- Custom Rationale/Notes: ${customText}`);
      }

      if (answers.length === 0 && !customText) {
        if (!isAuto) {
          alert(
            "Please select an option or type a custom response before submitting.",
          );
        }
        return;
      }

      if (targetEl) {
        targetEl.setAttribute("data-mcp-executed", "true");
      }
      window.DSState.executedCalls.add(callKey);
      try {
        sessionStorage.setItem(
          "deepseek_mcp_executed",
          JSON.stringify(Array.from(window.DSState.executedCalls)),
        );
      } catch (_) {}

      const reasonPrefix = isAuto
        ? "[Auto-selected Recommended Options after 2m timeout]\n"
        : "";
      const fullAnswer = `${reasonPrefix}My Architecture Decision:\n${answers.join("\n\n")}\n\nWhat is the next step or question?`;

      card.innerHTML = `
        <div class="ds-grill-answered">
          <span><span class="ds-ic" data-ic="check"></span> ${isAuto ? "Recommended Decisions Auto-Submitted (Timeout)!" : "Architecture Decision Submitted!"}</span>
        </div>
      `;

      window.DSState.sendText(fullAnswer, true);
    };

    submitBtn.onclick = () => doSubmitDecision(false);

    const startTime = Date.now();
    const timerBadge = document.createElement("span");
    timerBadge.className = "ds-grill-badge";
    timerBadge.style.cssText =
      "background:var(--ds-bg-hover);color:var(--ds-fg-muted);margin-left:6px;font-size:10px;";
    timerBadge.textContent = "Auto-answering in 2:00";
    const titleContainer = card.querySelector(".ds-grill-head .ds-title");
    if (titleContainer) {
      titleContainer.insertBefore(timerBadge, titleContainer.firstChild);
    }

    card.__grillAutoTimer = setInterval(() => {
      if (
        !document.body.contains(card) ||
        card.querySelector(".ds-grill-answered")
      ) {
        clearInterval(card.__grillAutoTimer);
        return;
      }

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(
        0,
        window.DSState.GRILL_AUTO_TIMEOUT_MS - elapsed,
      );
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      timerBadge.textContent = `Auto-answering in ${mins}:${secs < 10 ? "0" : ""}${secs}`;

      if (remaining <= 0) {
        clearInterval(card.__grillAutoTimer);
        card.__grillAutoTimer = null;
        console.log(
          "[DeepSeek Studio] 2 minutes passed without answering. Auto-selecting recommended options and submitting...",
        );
        doSubmitDecision(true);
      }
    }, 1000);
  }

  function scanMessages() {
    const codeBlocks = Array.from(
      document.querySelectorAll("div.md-code-block, pre, div.ds-markdown"),
    );
    if (!codeBlocks.length) return;

    codeBlocks.forEach((el) => {
      if (el.hasAttribute("data-mcp-attached")) return;
      const nextEl = el.nextElementSibling;
      if (nextEl && nextEl.classList.contains("deepseek-mcp-action-card")) {
        el.setAttribute("data-mcp-attached", "true");
        return;
      }

      const text = el.textContent || "";

      // 1. Check for interactive Grill-Me Question JSON
      if (
        (text.includes("grill_question") || text.includes('"questions"')) &&
        window.DSTools?.extractGrillQuestion
      ) {
        const grillData = window.DSTools.extractGrillQuestion(text);
        if (grillData && (grillData.question || grillData.questions)) {
          el.setAttribute("data-mcp-attached", "true");
          const qTitle =
            grillData.question || grillData.questions[0]?.question || "multi";
          const callKey = `grill:${qTitle.slice(0, 80)}`;
          const isElementExecuted =
            el.getAttribute("data-mcp-executed") === "true";

          renderGrillQuestionCard(el, grillData, callKey, isElementExecuted);
          return;
        }
      }

      // 2. Check for tool calls (JSON, DeepSeek DSML, or custom/any XML tags)
      const hasPossibleCall =
        text.includes("{") ||
        text.includes("<") ||
        text.includes("name") ||
        text.includes("invoke") ||
        text.includes("DSML");

      if (!hasPossibleCall) return;

      const allCalls = window.DSTools?.extractAllMcpCalls
        ? window.DSTools.extractAllMcpCalls(text)
        : [window.DSTools?.extractMcpCall(text)].filter(Boolean);

      if (allCalls && allCalls.length > 0) {
        el.setAttribute("data-mcp-attached", "true");

        const isElementExecuted =
          el.getAttribute("data-mcp-executed") === "true";

        if (!el.dataset.mcpId) {
          el.dataset.mcpId = `mcp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        }

        if (allCalls.length === 1) {
          const payload = allCalls[0];
          const callKey = `${el.dataset.mcpId}:${payload.name}`;
          renderPermissionCard(el, payload, callKey, isElementExecuted);
        } else {
          const callKey = `${el.dataset.mcpId}:batch_${allCalls.length}`;
          renderPermissionCard(el, allCalls, callKey, isElementExecuted);
        }
      }
    });
  }

  // MutationObserver to watch new chat messages & input
  new MutationObserver(() => {
    clearTimeout(window.DSState.debounceTimer);
    window.DSState.debounceTimer = setTimeout(() => {
      scanMessages();
      window.DSMention?.attachInputMentionInterceptor();
      injectChatBadge();
      window.DSProjects?.injectSidebarProjectFilter();
      window.DSWatchdog?.checkAndHandleRetryButton();
    }, 200);
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });

  // Initial boot
  window.DSState.fetchActiveTools().then(() => {
    updateServerBadges();
  });
  window.DSState.refreshSkills();
  window.DSMention?.attachInputMentionInterceptor();
  scanMessages();
  window.DSProjects?.injectSidebarProjectFilter();
  window.DSWatchdog?.checkAndHandleRetryButton();
})();
