// DeepSeek MCP Studio — Badges & Injections
(function (root) {
  "use strict";
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
          window.DSProjects?.showAddProjectModal((rawPath) => {
            if (!rawPath) return;
            window.DSProjects?.addProject(rawPath, (saved) => {
              const cleanPath = saved?.path || rawPath;
              window.DSState.selectedProject = cleanPath;
              localStorage.setItem("deepseek_mcp_selected_project", cleanPath);
              window.DSProjects?.updateProjectLabel();
              const filter = document.getElementById(
                "ds-sidebar-project-filter",
              );
              if (filter) filter.remove();
              window.DSProjects?.injectSidebarProjectFilter();
            });
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

      const watchdogBtn = wrap.querySelector("#mcp-watchdog-btn");
      if (watchdogBtn) {
        watchdogBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (typeof window.DSWatchdog?.handleWatchdogClick === "function") {
            window.DSWatchdog.handleWatchdogClick();
          } else {
            console.log("[DS Studio] Watchdog module initializing...");
          }
        };

        watchdogBtn.oncontextmenu = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const intervals = [
            { label: "1.5s (Turbo)", ms: 1500 },
            { label: "5s", ms: 5 * 1000 },
            { label: "15s", ms: 15 * 1000 },
            { label: "30s", ms: 30 * 1000 },
            { label: "60s", ms: 60 * 1000 },
          ];
          const currentMs = window.DSState?.SAFE_INTERVAL_MS || 1500;
          const currIdx = intervals.findIndex((item) => item.ms === currentMs);
          const nextItem = intervals[(currIdx + 1) % intervals.length];
          if (typeof window.DSState?.setSafeInterval === "function") {
            window.DSState.setSafeInterval(nextItem.ms);
          }
          if (typeof window.DSWatchdog?.updateWatchdogUI === "function") {
            window.DSWatchdog.updateWatchdogUI(
              "idle",
              `⏱️ Delay: ${nextItem.label}`,
            );
          }
        };
      }

      const toggleAutoMsgBtn = wrap.querySelector("#mcp-toggle-auto-msg");
      if (toggleAutoMsgBtn) {
        toggleAutoMsgBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const current =
            localStorage.getItem("deepseek_mcp_hide_auto_messages") !== "false";
          localStorage.setItem(
            "deepseek_mcp_hide_auto_messages",
            current ? "false" : "true",
          );
          window.DSScanner?.processAutomatedMessages?.();
        };
      }

      const toggleQueueBtn = wrap.querySelector("#mcp-toggle-queue-btn");
      if (toggleQueueBtn) {
        toggleQueueBtn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          window.DSQueue?.toggleQueueBar?.();
        };
      }

      targetParent.parentElement.insertBefore(wrap, targetParent);
    }

    window.DSProjects?.updateProjectLabel();
    updateServerBadges();
    window.DSState.updateTaskBadge();
    window.DSScanner?.updateHiddenCounterBadge?.();

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
  root.DSBadges = { updateServerBadges, injectChatBadge };
})(window);
