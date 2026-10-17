// DeepSeek MCP Studio — UI Module (autocomplete menus).
// Presentation lives in theme.css (ds-* classes); this file only positions
// menus (dynamic coordinates) and wires interactions.
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

  // Only positional values are inline; visuals come from .ds-menu.
  function place(menu, inputEl, width, bottomGap) {
    const rect = inputEl.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 20),
    );
    menu.style.bottom = `${window.innerHeight - rect.top + (bottomGap || 10)}px`;
    menu.style.left = `${left}px`;
    menu.style.width = `${width}px`;
  }

  const ic = (n) => (window.DSComponents ? window.DSComponents.ic(n) : "");

  // ---- @mention menu (servers + files) -----------------------------------
  function showAutocomplete(
    inputEl,
    query,
    activeTools,
    serverStatus,
    fileResults,
    onSelect,
  ) {
    removeAutocomplete();
    const servers = Object.keys(serverStatus || {}).length
      ? Object.keys(serverStatus)
      : ["filesystem", "bash", "memory"];

    const allOptions = [
      {
        id: "all",
        label: "@all",
        count: activeTools.length,
        desc: "All MCP Tools",
      },
      ...servers.map((s) => {
        const st = serverStatus[s] || {};
        return {
          id: s,
          label: `@${s}`,
          count: st.count || 0,
          desc: `${s} server tools`,
        };
      }),
    ];

    const q = (query || "").toLowerCase();
    const filtered = allOptions.filter(
      (o) =>
        !q ||
        o.id.toLowerCase().startsWith(q) ||
        o.label.toLowerCase().startsWith(q),
    );
    const files = (fileResults || []).filter(
      (f) =>
        !q ||
        f.name.toLowerCase().includes(q) ||
        f.path.toLowerCase().includes(q),
    );

    if (!filtered.length && !files.length) return;

    const menu = document.createElement("div");
    autocompleteMenu = menu;
    menu.id = "deepseek-mcp-autocomplete";
    menu.className = "ds-menu";
    place(menu, inputEl, 300);

    filtered.forEach((opt) => {
      const item = document.createElement("div");
      item.className = "ds-menu-item";
      item.innerHTML = `
        <div class="ds-menu-item-main">
          <span class="ds-menu-label">${opt.label}</span>
          <span class="ds-menu-desc">${opt.desc}</span>
        </div>
        <span class="ds-menu-count">${opt.count}</span>`;
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
      sep.className = "ds-menu-sep";
      menu.appendChild(sep);

      files.slice(0, 30).forEach((f) => {
        const item = document.createElement("div");
        item.className = "ds-file-row";
        item.innerHTML = window.DSComponents.fileRow(f);
        item.onmousedown = (e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelect(f.path, f);
          removeAutocomplete();
        };
        menu.appendChild(item);
      });
    }

    document.body.appendChild(menu);
  }

  // ---- /skill menu -------------------------------------------------------
  function showSkillAutocomplete(inputEl, query, loadedSkills, onSelect) {
    removeSkillMenu();
    if (!root.DSSkills) return;

    const matches = root.DSSkills.filterSkills(query, loadedSkills);
    if (!matches.length) return;

    const menu = document.createElement("div");
    skillMenu = menu;
    menu.id = "deepseek-mcp-skill-menu";
    menu.className = "ds-menu is-skills";
    place(menu, inputEl, 460);

    const header = document.createElement("div");
    header.className = "ds-skill-head";
    header.innerHTML =
      `<span>${ic("zap")} Skills</span>` +
      `<span class="ds-menu-desc">${matches.length} available</span>`;
    menu.appendChild(header);

    matches.forEach((sk, idx) => {
      const item = document.createElement("div");
      item.className = "ds-skill-item" + (idx === 0 ? " is-active" : "");
      item.setAttribute("data-skill-item", "true");
      const flag = sk.builtin
        ? ""
        : '<span class="ds-skill-flag">CUSTOM</span>';
      item.innerHTML = `
        <div class="ds-skill-title">
          <span>${window.DSIcon ? window.DSIcon.forSkill(sk) : ""}</span>
          <b>/${sk.name}</b>${flag}
        </div>
        <div class="ds-skill-desc">${sk.description || ""}</div>`;

      item.onmouseenter = () => {
        menu
          .querySelectorAll("[data-skill-item]")
          .forEach((el) => el.classList.remove("is-active"));
        item.classList.add("is-active");
      };
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
