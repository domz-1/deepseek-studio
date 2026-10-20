// DeepSeek MCP Studio — Mention & Autocomplete Module
(function (root) {
  const skeletonCache = new Map();

  async function getProjectSkeleton(projectPath) {
    if (!projectPath) return "";
    if (skeletonCache.has(projectPath)) return skeletonCache.get(projectPath);
    try {
      const res = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "GET_SKELETON", project: projectPath },
          resolve,
        );
      });
      if (res?.ok && res.data?.skeleton) {
        skeletonCache.set(projectPath, res.data.skeleton);
        return res.data.skeleton;
      }
    } catch (_) {}
    return "";
  }

  function attachInputMentionInterceptor() {
    const input = root.DSState.getChatInput();
    if (!input) return;

    // Continuously ensure send button has listener even when re-rendered by DeepSeek
    const sendBtn = root.DSState.getSendButton();
    if (sendBtn && !sendBtn.__mcpListen) {
      sendBtn.__mcpListen = true;
      sendBtn.addEventListener("click", async (e) => {
        const val = input.value.trim();
        if (val) {
          const handled = await processAndSubmitInput(val, e);
          if (!handled) {
            root.DSState.startNewTask(val);
          }
        }
      });
    }

    if (input.__mcpAttached) return;
    input.__mcpAttached = true;

    input.addEventListener("input", () => {
      // Whenever user types, clear stopped watchdog state and lingering continue buttons
      root.DSState.resetTaskStateOnTyping();

      const val = input.value;
      const slashMatch = val.match(/\/([\w-]*)$/);
      const mentionMatch = val.match(/@([^\s@]*)$/);

      if (slashMatch) {
        window.DSUI.removeAutocomplete();
        window.DSUI.showSkillAutocomplete(
          input,
          slashMatch[1],
          root.DSState.loadedSkills,
          (name) => {
            const currentVal = input.value;
            const newVal = currentVal.replace(/\/[\w-]*$/, `/${name} `);
            root.DSState.setInputValue(input, newVal);
          },
        );
      } else if (mentionMatch) {
        window.DSUI.removeSkillMenu();
        const q = mentionMatch[1];
        if (input.__mentionDebounce) clearTimeout(input.__mentionDebounce);
        input.__mentionDebounce = setTimeout(async () => {
          let fileResults = [];
          try {
            const res = await new Promise((r) =>
              chrome.runtime.sendMessage(
                {
                  type: "FS_INDEX",
                  q,
                  project: root.DSState.selectedProject,
                  limit: 30,
                },
                r,
              ),
            );
            if (res?.ok && res.data?.results) fileResults = res.data.results;
          } catch (_) {}
          window.DSUI.showAutocomplete(
            input,
            q,
            root.DSState.activeTools,
            root.DSState.serverStatus,
            fileResults,
            (label, fileObj) => {
              const currentVal = input.value;
              if (fileObj && fileObj.path) {
                const fileLink = `@file:${fileObj.name} [file://${fileObj.path}] `;
                const newVal = currentVal.replace(/@[^\s@]*$/, fileLink);
                root.DSState.setInputValue(input, newVal);
                return;
              }
              const newVal = currentVal.replace(/@[^\s@]*$/, `${label} `);
              root.DSState.setInputValue(input, newVal);
            },
          );
        }, 100);
      } else {
        window.DSUI.removeAutocomplete();
        window.DSUI.removeSkillMenu();
      }
    });

    async function processAndSubmitInput(rawVal, e) {
      if (!rawVal) return false;

      // Detect any @mention in the message
      const mentionMatches = rawVal.match(/@([\w-]+)/i);
      const activeMention = mentionMatches ? mentionMatches[0] : null;

      // Detect any /skill in the message
      const skillMatch = rawVal.match(/\/([a-z0-9_-]+)\b([\s\S]*)$/i);

      // Case 1: Has /skill (with or without @mention)
      if (window.DSSkills && skillMatch) {
        const skillName = skillMatch[1].toLowerCase();

        // Ensure skills list is loaded
        if (!root.DSState.loadedSkills?.length) {
          root.DSState.loadedSkills =
            (await window.DSSkills.loadSkills()) || [];
        }

        let targetSkill = root.DSState.loadedSkills?.find(
          (s) => s.name === skillName,
        );

        if (!targetSkill) {
          root.DSState.loadedSkills =
            (await window.DSSkills.loadSkills()) || [];
          targetSkill = root.DSState.loadedSkills?.find(
            (s) => s.name === skillName,
          );
        }

        if (!targetSkill && skillName === "chrome") {
          targetSkill = {
            name: "chrome",
            prompt:
              "Act as an expert Chrome automation & web security auditor using Chrome DevTools MCP tools.\n" +
              "1. Handle authentication: check cookies/sessionStorage/localStorage with evaluate_script or fill login forms with fill_form and click.\n" +
              "2. Log and intercept all network traffic via list_network_requests.\n" +
              "3. Fetch and expose response payloads for key API endpoints via get_network_request.\n" +
              "4. Render a clear markdown table of all network endpoints and format response data in structured ```json blocks.\n\n" +
              "Target application or URL to test:",
            servers: ["chrome"],
            builtin: true,
          };
        }

        if (targetSkill) {
          if (e) {
            e.preventDefault();
            e.stopPropagation();
          }

          let rest = rawVal
            .replace(new RegExp(`/${skillName}\\b`, "i"), "")
            .trim();
          if (activeMention) {
            rest = rest.replace(new RegExp(activeMention, "gi"), "").trim();
          }

          let prompt = window.DSSkills.expandSkill(
            targetSkill,
            rest,
            root.DSState.loadedSkills,
          );

          // Inject active MCP tools, project context, and skeleton!
          await root.DSState.fetchActiveTools();
          if (root.DSState.activeTools.length) {
            const targetServer =
              activeMention ||
              (targetSkill.servers && targetSkill.servers[0]
                ? `@${targetSkill.servers[0]}`
                : null) ||
              (targetSkill.name === "chrome" ? "@chrome" : null);

            const selectedTools = targetServer
              ? window.DSTools.filterToolsByMention(
                  targetServer,
                  root.DSState.activeTools,
                )
              : root.DSState.activeTools;
            const skeleton = await getProjectSkeleton(
              root.DSState.selectedProject,
            );
            prompt = `${window.DSTools.buildSysPrompt(selectedTools, root.DSState.selectedProject, skeleton, targetServer || activeMention)}\n${prompt}`;
          }

          root.DSState.lastSentMessage = prompt;
          root.DSState.recordActivity();
          root.DSState.isTaskActive = true;
          await root.DSState.sendText(prompt, true);
          return true;
        }
      }

      // Case 2: Only @mention (no /skill)
      if (activeMention) {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }

        await root.DSState.fetchActiveTools();
        if (!root.DSState.activeTools.length) {
          alert("No active MCP tools found on port 43210.");
          return true;
        }

        const selectedTools = window.DSTools.filterToolsByMention(
          activeMention,
          root.DSState.activeTools,
        );
        const userText = rawVal
          .replace(new RegExp(activeMention, "gi"), "")
          .trim();

        const skeleton = await getProjectSkeleton(root.DSState.selectedProject);
        const sysPrompt = window.DSTools.buildSysPrompt(
          selectedTools,
          root.DSState.selectedProject,
          skeleton,
          activeMention,
        );
        const combined = userText ? `${sysPrompt}\n\n${userText}` : sysPrompt;
        root.DSState.lastSentMessage = combined;
        root.DSState.recordActivity();
        root.DSState.isTaskActive = true;
        await root.DSState.sendText(combined, true);
        return true;
      }

      return false;
    }

    input.addEventListener(
      "keydown",
      async (e) => {
        if (e.key === "Escape") {
          window.DSUI.removeAutocomplete();
          window.DSUI.removeSkillMenu();
          return;
        }

        if (e.key === "Enter" && !e.shiftKey) {
          window.DSUI.removeAutocomplete();
          window.DSUI.removeSkillMenu();
          const rawVal = input.value.trim();
          if (!rawVal) return;

          const handled = await processAndSubmitInput(rawVal, e);
          if (!handled) {
            root.DSState.startNewTask(rawVal);
          }
        }
      },
      true,
    );
  }

  // Popup injection listener
  chrome.runtime.onMessage.addListener(async (msg) => {
    if (msg.type === "INJECT_NOW" && msg.tools) {
      root.DSState.activeTools = msg.tools;
      const skeleton = await getProjectSkeleton(root.DSState.selectedProject);
      root.DSState.sendText(
        window.DSTools.buildSysPrompt(
          msg.tools,
          root.DSState.selectedProject,
          skeleton,
        ),
      );
    }
  });

  root.DSMention = {
    getProjectSkeleton,
    attachInputMentionInterceptor,
    attachInputMentionInterface: attachInputMentionInterceptor,
    getChatInput: () => root.DSState.getChatInput(),
    setInputValue: (el, val) => root.DSState.setInputValue(el, val),
  };
})(window);
