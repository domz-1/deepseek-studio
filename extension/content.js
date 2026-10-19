// DeepSeek MCP Studio — Content Script Bootloader & Orchestrator
(function () {
  "use strict";

  if (window.DSState?.init) {
    window.DSState.init();
  }

  if (window.DSState?.fetchActiveTools) {
    window.DSState.fetchActiveTools().then(() => {
      window.DSBadges?.updateServerBadges();
    });
  }

  if (window.DSState?.refreshSkills) {
    window.DSState.refreshSkills();
  }

  window.DSBadges?.injectChatBadge();
  window.DSProjects?.injectSidebarProjectFilter();
  window.DSMention?.attachInputMentionInterceptor();
  window.DSScanner?.scanMessages();
  window.DSScanner?.initObserver();
  window.DSWatchdog?.checkAndHandleRetryButton();

  console.log("[DS Studio] Modular orchestrator loaded successfully.");
})();
