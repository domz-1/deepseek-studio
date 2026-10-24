import { defineConfig } from "wxt";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  modules: ["@wxt-dev/module-vue"],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: "DeepSeek Studio - Local MCP & AI Agent Platform",
    short_name: "DeepSeek Studio",
    description:
      "Connect DeepSeek Chat to local MCP tools, project workspaces, custom skills, auto-continue watchdog, and Liquid Glass UI.",
    version: "2.1.0",
    permissions: ["storage", "activeTab", "scripting", "unlimitedStorage"],
    host_permissions: [
      "https://chat.deepseek.com/*",
      "http://localhost/*",
      "http://127.0.0.1/*",
      "https://*/*",
    ],
    icons: {
      16: "icon.png",
      32: "icon.png",
      48: "icon.png",
      128: "icon.png",
    },
    action: {
      default_title: "DeepSeek Studio",
      default_popup: "popup.html",
      default_icon: {
        16: "icon.png",
        32: "icon.png",
        48: "icon.png",
        128: "icon.png",
      },
    },
  },
});
