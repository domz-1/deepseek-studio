// DeepSeek MCP Studio — Projects & Workspace Management Module
(function (root) {
  "use strict";

  function getCustomProjects() {
    try {
      return JSON.parse(
        localStorage.getItem("deepseek_mcp_custom_projects") || "[]",
      );
    } catch (_) {
      return [];
    }
  }

  function fetchAllProjects(cb) {
    const customs = getCustomProjects();
    if (!root.DSState || !root.DSState.isContextValid()) {
      cb(customs);
      return;
    }
    try {
      chrome.runtime.sendMessage({ type: "GET_PROJECTS" }, (res) => {
        if (chrome.runtime.lastError) {
          cb(customs);
          return;
        }
        let list = [];
        if (res?.ok && Array.isArray(res.data?.projects)) {
          list = res.data.projects;
          root.DSState.projectList = list;
        }
        const all = [...customs, ...list];
        const seen = new Set();
        const unique = [];
        for (const item of all) {
          if (!seen.has(item.path)) {
            seen.add(item.path);
            unique.push(item);
          }
        }
        cb(unique);
      });
    } catch (_) {
      cb(customs);
    }
  }

  function showAddProjectModal(onConfirm) {
    const existing = document.getElementById("ds-add-project-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "ds-add-project-modal";
    overlay.className = "ds-modal-overlay";

    overlay.innerHTML = `
      <div class="ds-modal-card">
        <div class="ds-modal-title">
          <span class="ds-ic" data-ic="folder"></span>
          <span>Add Local Project Workspace</span>
        </div>
        <div class="ds-modal-desc">
          Enter the absolute folder path of your project (e.g. <code>/home/adham/my-app</code>). It will be indexed instantly by <code>fd</code> for fast <code>@file</code> search.
        </div>
        <input type="text" class="ds-modal-input" placeholder="/home/adham/projects/..." value="/home/adham/projects/" spellcheck="false" />
        <div class="ds-modal-actions">
          <button class="ds-btn ds-btn-no cancel-btn" type="button">Cancel</button>
          <button class="ds-btn ds-btn-ok confirm-btn" type="button">Add Project</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector(".ds-modal-input");
    const cancelBtn = overlay.querySelector(".cancel-btn");
    const confirmBtn = overlay.querySelector(".confirm-btn");

    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    const close = () => overlay.remove();

    cancelBtn.onclick = close;
    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };

    const submit = () => {
      const val = input.value.trim();
      if (!val) return;
      close();
      onConfirm(val);
    };

    confirmBtn.onclick = submit;
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        submit();
      } else if (e.key === "Escape") {
        close();
      }
    };
  }

  function updateProjectLabel() {
    const label = document.getElementById("mcp-project-label");
    if (!label) return;
    const sel = root.DSState ? root.DSState.selectedProject : "";
    const name = sel
      ? sel.split("/").filter(Boolean).pop() || sel
      : "Select Project";
    label.textContent = name;
    label.title = sel;
  }

  function injectSidebarProjectFilter() {
    let newChatBtn = Array.from(
      document.querySelectorAll("button, div[role='button'], a"),
    ).find((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      const aria = (el.getAttribute("aria-label") || "").toLowerCase();
      return text.includes("new chat") || aria.includes("new chat");
    });

    let sidebar = null;
    let insertBeforeNode = null;

    if (newChatBtn) {
      let curr = newChatBtn.parentElement;
      for (let depth = 0; depth < 5 && curr; depth++) {
        if (
          curr.tagName === "ASIDE" ||
          curr.tagName === "NAV" ||
          curr.classList.contains("ds-sidebar") ||
          curr.querySelector("div[class*='history'], nav, aside")
        ) {
          sidebar = curr;
          break;
        }
        curr = curr.parentElement;
      }
      if (!sidebar && newChatBtn.parentElement?.parentElement) {
        sidebar = newChatBtn.parentElement.parentElement;
      }
      insertBeforeNode =
        newChatBtn.parentElement?.nextElementSibling ||
        newChatBtn.nextElementSibling;
    }

    if (!sidebar) {
      sidebar =
        document.querySelector("aside") ||
        document.querySelector("nav") ||
        document.querySelector("div[class*='sidebar']") ||
        document.querySelector("div[class*='left']") ||
        document.querySelector("div[class*='chat-history']");
    }

    if (!sidebar) return;

    let filterWrap = document.getElementById("ds-sidebar-project-filter");
    if (filterWrap && filterWrap.parentElement !== sidebar) {
      filterWrap.remove();
      filterWrap = null;
    }

    if (!filterWrap) {
      filterWrap = document.createElement("div");
      filterWrap.id = "ds-sidebar-project-filter";
      filterWrap.className = "ds-sidebar-filter";

      const head = document.createElement("div");
      head.className = "ds-sidebar-filter-head";
      head.innerHTML = `
        <span><span class="ds-ic" data-ic="folder"></span> Workspaces</span>
        <span class="ds-chip-more" style="font-size:9px;cursor:pointer;" id="ds-sidebar-all-projects">All</span>
      `;

      const chips = document.createElement("div");
      chips.className = "ds-sidebar-chips";
      chips.id = "ds-sidebar-chips";

      filterWrap.appendChild(head);
      filterWrap.appendChild(chips);

      const allBtn = head.querySelector("#ds-sidebar-all-projects");
      if (allBtn) {
        allBtn.onclick = () => {
          if (root.DSState) root.DSState.selectedProject = "";
          localStorage.setItem("deepseek_mcp_selected_project", "");
          updateProjectLabel();
          chips
            .querySelectorAll(".ds-sidebar-chip")
            .forEach((b) => b.classList.remove("is-active"));
        };
      }

      if (insertBeforeNode && insertBeforeNode.parentElement === sidebar) {
        sidebar.insertBefore(filterWrap, insertBeforeNode);
      } else {
        sidebar.insertBefore(filterWrap, sidebar.firstChild);
      }
    }

    const chipsContainer = document.getElementById("ds-sidebar-chips");
    if (!chipsContainer || chipsContainer.children.length > 0) return;

    fetchAllProjects((unique) => {
      const projects = unique.slice(0, 10);
      chipsContainer.innerHTML = projects
        .map((p) => {
          const isActive =
            root.DSState && p.path === root.DSState.selectedProject;
          const short = p.name
            .replace(/^⭐\s*/, "")
            .split("/")
            .pop();
          return `<button class="ds-sidebar-chip ${isActive ? "is-active" : ""}" data-path="${p.path}" title="${p.path}" type="button">${short}</button>`;
        })
        .join("");

      chipsContainer.querySelectorAll(".ds-sidebar-chip").forEach((btn) => {
        btn.onclick = () => {
          if (root.DSState) root.DSState.selectedProject = btn.dataset.path;
          localStorage.setItem(
            "deepseek_mcp_selected_project",
            btn.dataset.path,
          );
          chipsContainer
            .querySelectorAll(".ds-sidebar-chip")
            .forEach((b) => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          updateProjectLabel();
        };
      });
    });
  }

  function addProject(rawPath, cb) {
    if (!rawPath) return;
    let cleanPath = rawPath.trim();
    if (cleanPath.startsWith("~")) {
      cleanPath = `/home/adham${cleanPath.slice(1)}`;
    }
    cleanPath = cleanPath.replace(/\/+$/, "");

    const name = cleanPath.split("/").filter(Boolean).pop() || cleanPath;
    const projectItem = { name: `⭐ ${name}`, path: cleanPath, custom: true };

    // 1. Save in local customs cache
    let customs = getCustomProjects();
    const existingIdx = customs.findIndex((c) => c.path === cleanPath);
    if (existingIdx !== -1) {
      customs[existingIdx] = projectItem;
    } else {
      customs.unshift(projectItem);
    }
    localStorage.setItem(
      "deepseek_mcp_custom_projects",
      JSON.stringify(customs),
    );

    // 2. Persist to bridge server
    try {
      chrome.runtime.sendMessage(
        { type: "ADD_PROJECT", path: cleanPath, name },
        (res) => {
          if (cb) cb(res?.data?.project || projectItem);
        },
      );
    } catch (_) {
      if (cb) cb(projectItem);
    }
  }

  root.DSProjects = {
    getCustomProjects,
    fetchAllProjects,
    addProject,
    showAddProjectModal,
    updateProjectLabel,
    injectSidebarProjectFilter,
  };
})(window);
