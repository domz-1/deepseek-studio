// DeepSeek MCP Studio — UI Cards
(function (root) {
  "use strict";
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
        root.DSExecution?.executeBatchTools(
          payload,
          controls,
          callKey,
          targetEl,
        );
      } else {
        root.DSExecution?.executeTool(payload, controls, callKey, targetEl);
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
            root.DSExecution?.executeBatchTools(
              payload,
              controls,
              callKey,
              targetEl,
            );
          } else {
            root.DSExecution?.executeTool(payload, controls, callKey, targetEl);
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

  root.DSCards = { renderPermissionCard, renderGrillQuestionCard };
})(window);
