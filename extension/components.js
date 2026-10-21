// DeepSeek MCP Studio — presentational templates.
// Pure functions that return HTML strings. No DOM access, no event wiring.
// All styling comes from theme.css component classes (ds-*).
(function (root) {
  const ic = (name) => `<span class="ds-ic" data-ic="${name}"></span>`;

  const escape = (s) =>
    String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  // ---- Server pills + badge bar ------------------------------------------
  function pill({ id, label, count, online, isAll }) {
    const cls = isAll ? "ds-pill is-all" : "ds-pill";
    const dot = isAll ? ic("sparkles") : '<span class="ds-dot"></span>';
    const cnt = `<span class="ds-count">(${count || 0})</span>`;
    return `<button class="${cls}" data-srv="${escape(id)}" type="button">${dot}<b>@${escape(label)}</b> ${cnt}</button>`;
  }

  function serverPills(tools, serverStatus) {
    const onlineServers = Object.keys(serverStatus || {}).filter(
      (s) => serverStatus[s] && serverStatus[s].online,
    );
    const top3 = onlineServers.slice(0, 3);
    const remainingCount = Math.max(0, onlineServers.length - 3);

    const itemsHtml = top3
      .map(
        (name) =>
          `<span class="ds-chip-item" data-srv="${escape(name)}"><span class="ds-dot"></span><b>@${escape(name)}</b><span class="ds-count">(${serverStatus[name].count || 0})</span></span>`,
      )
      .join("");

    const moreHtml =
      remainingCount > 0
        ? `<span class="ds-chip-more" title="${onlineServers.slice(3).join(", ")}">+${remainingCount} more</span>`
        : "";

    return `<div class="ds-mcp-unified-chip">${itemsHtml}${moreHtml}</div>`;
  }

  function badgeBar({ selectedProject }) {
    const projName = selectedProject
      ? selectedProject.split("/").pop()
      : "Workspace";
    return `
      <div class="ds-badge-bar-left">
        <div class="ds-pills" id="mcp-server-pills"></div>
        <div class="ds-task" id="mcp-task-indicator"></div>
        <button class="ds-project-btn ds-watchdog-btn" id="mcp-watchdog-btn" type="button" title="Watchdog Status. Left-Click: Force Continue. Right-Click: Change Delay.">
          <span class="ds-watchdog-dot"></span>
          <span class="ds-watchdog-label" id="mcp-watchdog-label">Ready</span>
          <span class="ds-watchdog-restart-ic" title="Force Continue">↻</span>
        </button>
      </div>
      <div class="ds-project-wrap">
        <button class="ds-project-trigger" id="mcp-project-trigger" type="button" title="Select active workspace">
          <span class="ds-ic" data-ic="folder"></span>
          <span class="ds-project-label" id="mcp-project-label">${projName}</span>
          <span class="ds-ic" data-ic="arrowRight" style="font-size:8px;transform:rotate(90deg);opacity:0.6;"></span>
        </button>
        <button class="ds-project-btn ds-btn-icon" id="mcp-add-project-btn" type="button" title="Add custom project path">
          ${ic("plus")}
        </button>
        <button class="ds-project-btn" id="mcp-ralph-loop-btn" type="button" title="Toggle Ralph Loop (auto-verifies edits)">
          🔁 Ralph
        </button>
        <button class="ds-project-btn" id="mcp-undo-tool-btn" type="button" title="Undo last tool file modification">
          <span class="ds-ic" data-ic="arrowRight" style="transform:rotate(180deg);display:inline-block;"></span> Undo
        </button>
        <button class="ds-project-btn ds-btn-icon" id="mcp-toggle-auto-msg" type="button" title="Toggle automated tool output messages">
          <span class="ds-ic" data-ic="eye-off"></span>
          <span id="mcp-toggle-auto-msg-label"></span>
        </button>
        <button class="ds-project-btn" id="mcp-toggle-queue-btn" type="button" title="Open/Close Message Queue">
          <span class="ds-ic" data-ic="clock"></span>
          <span id="mcp-queue-count-label">Queue</span>
        </button>
      </div>`;
  }

  // ---- Running-task chip -------------------------------------------------
  function taskChip(count, isPaused = false) {
    if (isPaused) {
      return `
        <span class="ds-ic" data-ic="clock" style="color:var(--ds-warn,#f59e0b);display:inline-block;"></span>
        <span style="color:var(--ds-warn,#f59e0b);">Paused (${count || 1} task)</span>
        <button class="ds-btn ds-btn-ok ds-btn-xs" id="mcp-resume-task-btn" type="button" title="Resume autonomous task">▶ Resume</button>
        <button class="ds-btn ds-btn-no ds-btn-xs" id="mcp-kill-all-btn" type="button" title="Stop & Kill entire task completely">${ic("close")} Stop All</button>`;
    }
    return `
      <span class="ds-pulse"></span>
      <span>Running task (${count})...</span>
      <button class="ds-btn ds-btn-warn ds-btn-xs" id="mcp-pause-task-btn" type="button" title="Pause autonomous task loop">⏸ Pause</button>
      <button class="ds-btn ds-btn-no ds-btn-xs" id="mcp-kill-all-btn" type="button" title="Stop & Kill entire task completely">${ic("close")} Stop All</button>`;
  }

  // ---- Permission card ---------------------------------------------------
  function permissionCard({
    payload,
    isSafe,
    isHistorical,
    isBatch,
    batchCount,
    resultOutput,
  }) {
    const isMulti = isBatch || (Array.isArray(payload) && payload.length > 1);
    const code = isMulti
      ? `<code class="ds-card-code">Batch (${batchCount || payload.length} tools)</code>`
      : `<code class="ds-card-code">${escape(payload.name)}</code>`;
    const raw = `<button class="ds-btn ds-btn-raw view-raw-btn" type="button">Toggle JSON</button>`;
    const args = escape(
      JSON.stringify(isMulti ? payload : payload.arguments || {}, null, 2),
    );

    if (isHistorical) {
      const resultHtml = resultOutput
        ? `<details class="ds-card-result-details" style="margin-top:6px;font-size:11px;">
             <summary style="cursor:pointer;opacity:0.8;font-weight:600;">View Result Data (${resultOutput.length} chars)</summary>
             <pre class="ds-card-pre" style="max-height:160px;overflow:auto;margin-top:4px;padding:6px;background:rgba(0,0,0,0.25);border-radius:4px;font-family:monospace;white-space:pre-wrap;">${escape(resultOutput.slice(0, 3000))}</pre>
           </details>`
        : "";

      return `
        <div class="ds-card-head ds-mb0">
          <div class="ds-title" style="font-size:12px;display:flex;align-items:center;gap:6px;">
            <span style="color:#10b981;font-weight:bold;">✓</span>
            <span style="opacity:0.85;">Executed:</span> ${code}
          </div>
          <div style="display:inline-flex;gap:4px;align-items:center;">
            <button class="ds-btn ds-btn-ok ds-btn-xs mcp-dispatch-btn" type="button" style="font-size:11px;padding:2px 8px;" title="Send tool output to DeepSeek">📤 Send Output</button>
            <button class="ds-btn ds-btn-xs mcp-rerun-btn" type="button" style="font-size:11px;padding:2px 8px;opacity:0.9;" title="Re-execute this tool now">🔄 Re-run</button>
            ${raw}
          </div>
        </div>
        <details class="ds-card-args-details" style="margin-top:6px;">
          <summary style="cursor:pointer;font-size:11px;opacity:0.75;padding:2px 0;user-select:none;">${isMulti ? "Batch Tool Calls" : "Arguments & Parameters"} (${args.length} chars)</summary>
          <pre class="ds-card-pre" style="margin-top:4px;max-height:220px;overflow:auto;">${args}</pre>
        </details>
        ${resultHtml}`;
    }

    const title = isMulti
      ? `${ic("sparkles")} MCP Batch Execution`
      : isSafe
        ? `${ic("search")} MCP Read / Safe`
        : `${ic("zap")} MCP Action / Bash`;

    return `
      <div class="ds-card-head">
        <div class="ds-title">${title} ${code}</div>
        ${raw}
      </div>
      <div class="ds-card-label">${isMulti ? "Batch Tool Calls:" : "Arguments:"}</div>
      <textarea class="ds-card-ed ed" spellcheck="false">${args}</textarea>
      <div class="ds-card-controls card-controls">
        <button class="ds-btn ds-btn-ok ok" type="button">${ic("check")} ${isMulti ? "Run Batch Now" : "Run Now"}</button>
        <button class="ds-btn ds-btn-no no" type="button">${ic("close")} Reject</button>
      </div>`;
  }

  // ---- Card status states ------------------------------------------------
  const status = {
    running: (name) =>
      `<div class="ds-note ds-note-accent">${ic("clock")} Running <code>${escape(name)}</code>...</div>`,
    runningWithKill: (name) =>
      `<div class="ds-card-head ds-mb0">
        <div class="ds-note ds-note-accent ds-pad0">${ic("clock")} Running <code>${escape(name)}</code>...</div>
        <div style="display:inline-flex;gap:4px;">
          <button class="ds-btn ds-btn-warn ds-btn-xs mcp-card-pause-btn" type="button" title="Pause autonomous task loop">⏸ Pause</button>
          <button class="ds-btn ds-btn-no ds-btn-xs mcp-card-kill-btn" type="button" title="Stop & Kill entire task completely">${ic("close")} Stop All</button>
        </div>
      </div>`,
    done: (name, resultPreview) => {
      const previewHtml = resultPreview
        ? `<details class="ds-card-result-details" style="margin-top:6px;font-size:11px;">
             <summary style="cursor:pointer;opacity:0.8;font-weight:600;">View Result Data (${resultPreview.length} chars)</summary>
             <pre class="ds-card-pre" style="max-height:160px;overflow:auto;margin-top:4px;padding:6px;background:rgba(0,0,0,0.25);border-radius:4px;font-family:monospace;white-space:pre-wrap;">${escape(resultPreview.slice(0, 3000))}</pre>
           </details>`
        : "";
      return `
        <div class="ds-card-head ds-mb0" style="display:flex;align-items:center;justify-content:space-between;width:100%;">
          <div class="ds-note ds-note-success ds-pad0">${ic("check")} Done: <code>${escape(name)}</code></div>
          <button class="ds-btn ds-btn-ok ds-btn-xs mcp-dispatch-btn" type="button" style="font-size:11px;padding:2px 8px;" title="Send tool output to DeepSeek">📤 Send Output</button>
        </div>
        ${previewHtml}`;
    },
    error: (msg) =>
      `<div class="ds-note ds-note-danger">${ic("alert")} Error: ${escape(msg)}</div>`,
    rejected: (name) =>
      `<div class="ds-note ds-note-muted">${ic("close")} Rejected: ${escape(name)}</div>`,
    autoRunning: (name) =>
      `<div class="ds-note ds-note-success">${ic("zap")} Auto-executing <code>${escape(name)}</code>...</div>`,
  };

  // ---- File row (autocomplete) ------------------------------------------
  // Returns inner markup only; the caller owns the .ds-file-row element.
  function fileRow(file) {
    const sizeKb = file.size ? (file.size / 1024).toFixed(1) + " KB" : "";
    const shortPath =
      file.path.length > 40 ? "…" + file.path.slice(-40) : file.path;
    return `
      <div class="ds-file-meta">
        <span class="ds-file-name">${ic("file")} ${escape(file.name)}</span>
        <span class="ds-file-path">${escape(shortPath)}</span>
      </div>
      <span class="ds-file-size">${sizeKb}</span>`;
  }

  root.DSComponents = {
    ic,
    escape,
    pill,
    serverPills,
    badgeBar,
    taskChip,
    permissionCard,
    status,
    fileRow,
  };
})(typeof window !== "undefined" ? window : globalThis);
