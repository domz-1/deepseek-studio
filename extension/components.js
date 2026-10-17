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
    const names = Object.keys(serverStatus || {})
      .filter((s) => serverStatus[s] && serverStatus[s].online)
      .slice(0, 3); // Show only the first 3 active tools cleanly!

    return names
      .map((name) =>
        pill({
          id: name,
          label: name,
          count: serverStatus[name].count,
          online: true,
        }),
      )
      .join("");
  }

  function badgeBar({ selectedProject }) {
    return `
      <div class="ds-pills" id="mcp-server-pills"></div>
      <div class="ds-task" id="mcp-task-indicator"></div>
      <div class="ds-project-wrap" style="display:inline-flex;align-items:center;gap:6px;margin-left:auto;">
        <span class="ds-ic" data-ic="folder" style="color:var(--ds-accent);font-size:12px;"></span>
        <select class="ds-project-select" id="mcp-project-select" title="Active Project">
          <option value="">Select Project...</option>
        </select>
        <button class="ds-project-btn" id="mcp-add-project-btn" type="button" title="Add custom project path">
          ${ic("plus")} Add
        </button>
      </div>`;
  }

  // ---- Running-task chip -------------------------------------------------
  function taskChip(count) {
    return `
      <span class="ds-pulse"></span>
      <span>Running task (${count})...</span>
      <button class="ds-btn ds-btn-no ds-btn-xs" id="mcp-kill-all-btn" type="button">${ic("close")} Kill</button>`;
  }

  // ---- Permission card ---------------------------------------------------
  function permissionCard({ payload, isSafe, isHistorical }) {
    const code = `<code class="ds-card-code">${escape(payload.name)}</code>`;
    const raw = `<button class="ds-btn ds-btn-raw view-raw-btn" type="button">Toggle JSON</button>`;
    const args = escape(JSON.stringify(payload.arguments || {}, null, 2));

    if (isHistorical) {
      return `
        <div class="ds-card-head">
          <div class="ds-title">${ic("check")} <span>Completed Historical Call:</span> ${code}</div>
          ${raw}
        </div>
        <div class="ds-card-label">Arguments:</div>
        <pre class="ds-card-pre">${args}</pre>`;
    }

    const title = isSafe
      ? `${ic("search")} MCP Read / Safe`
      : `${ic("zap")} MCP Action / Bash`;

    return `
      <div class="ds-card-head">
        <div class="ds-title">${title} ${code}</div>
        ${raw}
      </div>
      <div class="ds-card-label">Arguments:</div>
      <textarea class="ds-card-ed ed" spellcheck="false">${args}</textarea>
      <div class="ds-card-controls card-controls">
        <button class="ds-btn ds-btn-ok ok" type="button">${ic("check")} Run Now</button>
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
        <button class="ds-btn ds-btn-no ds-btn-sm mcp-card-kill-btn" type="button">${ic("close")} Kill Task</button>
      </div>`,
    done: (name) =>
      `<div class="ds-note ds-note-success">${ic("check")} Done: <code>${escape(name)}</code></div>`,
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
