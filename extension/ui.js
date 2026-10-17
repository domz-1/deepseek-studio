// DeepSeek MCP Studio — UI Module (autocomplete, badges, cards)
(function (root) {
  let autocompleteMenu = null;
  let skillMenu = null;

  function removeAutocomplete() {
    if (autocompleteMenu) {
      autocompleteMenu.remove();
      autocompleteMenu = null;
    }
  }

  function removeSkillMenu() {
    if (skillMenu) {
      skillMenu.remove();
      skillMenu = null;
    }
  }

  function showAutocomplete(
    inputEl,
    query,
    activeTools,
    serverStatus,
    fileResults,
    onSelect,
  ) {
    removeAutocomplete();
    const availableServers = Object.keys(serverStatus).length
      ? Object.keys(serverStatus)
      : ["filesystem", "bash", "memory"];

    const allOptions = [
      {
        id: "all",
        label: "@all",
        count: activeTools.length,
        desc: "All MCP Tools",
      },
      ...availableServers.map((s) => {
        const st = serverStatus[s] || {};
        return {
          id: s,
          label: `@${s}`,
          count: st.count || 0,
          desc: `${s} server tools`,
        };
      }),
    ];

    const filtered = allOptions.filter(
      (o) =>
        !query ||
        o.id.toLowerCase().startsWith(query.toLowerCase()) ||
        o.label.toLowerCase().startsWith(query.toLowerCase()),
    );

    const files = (fileResults || []).filter(
      (f) =>
        !query ||
        f.name.toLowerCase().includes(query.toLowerCase()) ||
        f.path.toLowerCase().includes(query.toLowerCase())
    );

    if (!filtered.length && !files.length) return;

    const menu = document.createElement("div");
    autocompleteMenu = menu;
    menu.id = "deepseek-mcp-autocomplete";

    const rect = inputEl.getBoundingClientRect();
    const menuWidth = 280;
    const leftPos = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - menuWidth - 20),
    );
    const bottomPos = window.innerHeight - rect.top + 10;

    menu.style.cssText = `
      position: fixed !important;
      bottom: ${bottomPos}px !important;
      left: ${leftPos}px !important;
      width: ${menuWidth}px !important;
      max-height: 320px !important;
      overflow-y: auto !important;
      background: #181825 !important;
      border: 1px solid #45475a !important;
      border-radius: 10px !important;
      box-shadow: 0 12px 32px rgba(0,0,0,0.7) !important;
      z-index: 2147483647 !important;
      padding: 6px !important;
      min-width: 220px !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      color: #cdd6f4 !important;
      box-sizing: border-box !important;
    `;

    filtered.forEach((opt) => {
      const item = document.createElement("div");
      item.style.cssText = `
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 7px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        transition: background 0.15s;
      `;
      item.innerHTML = `
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="color:#89b4fa;font-weight:bold;">${opt.label}</span>
          <span style="font-size:10px;color:#a6adc8;">${opt.desc}</span>
        </div>
        <span style="background:#313244;color:#a6e3a1;padding:1px 6px;border-radius:8px;font-size:10px;font-weight:bold;">${opt.count}</span>
      `;

      item.onmouseenter = () => {
        item.style.background = "#313244";
      };
      item.onmouseleave = () => {
        item.style.background = "transparent";
      };

      item.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(opt.label);
        removeAutocomplete();
      };

      menu.appendChild(item);
    });

    if (files.length) {
      const sep = document.createElement("div");
      sep.style.cssText = `
        margin: 4px 6px;
        border-top: 1px solid #313244;
      `;
      menu.appendChild(sep);

      files.slice(0, 30).forEach((f) => {
        const item = document.createElement("div");
        item.style.cssText = `
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 7px 10px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 12px;
          transition: background 0.15s;
        `;
        const sizeKb = f.size ? (f.size / 1024).toFixed(1) + " KB" : "";
        const shortPath = f.path.length > 40 ? "…" + f.path.slice(-40) : f.path;
        item.innerHTML = `
          <div style="display:flex;flex-direction:column;gap:2px;overflow:hidden;">
            <span style="color:#a6e3a1;font-weight:bold;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">📄 ${f.name}</span>
            <span style="font-size:10px;color:#a6adc8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${shortPath}</span>
          </div>
          <span style="color:#a6adc8;font-size:9px;white-space:nowrap;margin-left:8px;">${sizeKb}</span>
        `;
        item.onmouseenter = () => { item.style.background = "#313244"; };
        item.onmouseleave = () => { item.style.background = "transparent"; };
        item.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect(f.path);
          removeAutocomplete();
        };
        menu.appendChild(item);
      });
    }

    document.body.appendChild(menu);
  }

  function showSkillAutocomplete(inputEl, query, loadedSkills, onSelect) {
    removeSkillMenu();
    if (!root.DSSkills) return;

    const matches = root.DSSkills.filterSkills(query, loadedSkills);
    if (!matches.length) return;

    const menu = document.createElement("div");
    skillMenu = menu;
    menu.id = "deepseek-mcp-skill-menu";

    const rect = inputEl.getBoundingClientRect();
    const menuWidth = 460;
    const leftPos = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - menuWidth - 20),
    );
    const bottomPos = window.innerHeight - rect.top + 10;

    menu.style.cssText = `
      position: fixed !important;
      bottom: ${bottomPos}px !important;
      left: ${leftPos}px !important;
      width: ${menuWidth}px !important;
      max-height: 380px !important;
      overflow-y: auto !important;
      background: #181825 !important;
      border: 1px solid #45475a !important;
      border-radius: 12px !important;
      box-shadow: 0 12px 32px rgba(0,0,0,0.7) !important;
      z-index: 2147483647 !important;
      padding: 8px !important;
      font-family: system-ui, -apple-system, sans-serif !important;
      color: #cdd6f4 !important;
      box-sizing: border-box !important;
    `;

    const header = document.createElement("div");
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 10px 8px 10px;
      font-size: 11px;
      font-weight: 700;
      color: #cba6f7;
      border-bottom: 1px solid #313244;
      margin-bottom: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    `;
    header.innerHTML = `<span>⚡ Skills</span><span style="color:#a6adc8;font-size:10px;">${matches.length} available</span>`;
    menu.appendChild(header);

    matches.forEach((sk, idx) => {
      const item = document.createElement("div");
      item.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 3px;
        padding: 8px 10px;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        transition: background 0.12s;
        ${idx === 0 ? "background: #313244;" : ""}
      `;
      item.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:16px;">${sk.emoji || "⚡"}</span>
          <b style="color:#89b4fa;font-size:13px;">/${sk.name}</b>
          ${sk.builtin ? "" : '<span style="background:#f9e2af;color:#11111b;padding:1px 5px;border-radius:6px;font-size:9px;font-weight:700;">CUSTOM</span>'}
        </div>
        <div style="font-size:11px;color:#a6adc8;padding-left:24px;line-height:1.3;">${sk.description || ""}</div>
      `;

      item.onmouseenter = () => {
        menu
          .querySelectorAll("div[data-skill-item]")
          .forEach((el) => (el.style.background = "transparent"));
        item.style.background = "#313244";
      };
      item.onmouseleave = () => {
        item.style.background = "transparent";
      };
      item.setAttribute("data-skill-item", "true");

      item.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        onSelect(sk.name);
        removeSkillMenu();
      };

      menu.appendChild(item);
    });

    document.body.appendChild(menu);
  }

  root.DSUI = {
    showAutocomplete,
    removeAutocomplete,
    showSkillAutocomplete,
    removeSkillMenu,
  };
})(typeof window !== "undefined" ? window : globalThis);
