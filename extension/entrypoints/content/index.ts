import { createApp } from "vue";
import ContentApp from "./ContentApp.vue";
import "../../assets/design-system.css";

export default defineContentScript({
  matches: ["*://chat.deepseek.com/*"],
  runAt: "document_idle",

  main() {
    console.log("[DeepSeek Studio Vue] Initializing Content Script...");

    function ensureMounted() {
      if (document.getElementById("deepseek-studio-mount")) return;

      const mountPoint = document.createElement("div");
      mountPoint.id = "deepseek-studio-mount";
      document.body.appendChild(mountPoint);

      const app = createApp(ContentApp);
      app.mount(mountPoint);
      console.log("[DeepSeek Studio Vue] Mounted successfully to DOM.");
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", ensureMounted);
    } else {
      ensureMounted();
    }
  },
});
