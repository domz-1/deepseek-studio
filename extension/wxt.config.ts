import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'DeepSeek Studio (Vue 3)',
    short_name: 'DS Studio Vue',
    description:
      'High-performance modular Vue 3 extension connecting DeepSeek Chat to local MCP tools with auto-continue watchdog.',
    version: '2.0.0',
    permissions: ['storage', 'activeTab', 'scripting', 'unlimitedStorage'],
    host_permissions: [
      'https://chat.deepseek.com/*',
      'http://localhost/*',
      'http://127.0.0.1/*',
      'https://*/*',
    ],
    icons: {
      16: 'icon.png',
      32: 'icon.png',
      48: 'icon.png',
      128: 'icon.png',
    },
    action: {
      default_title: 'DeepSeek Studio Vue',
      default_popup: 'popup.html',
      default_icon: {
        16: 'icon.png',
        32: 'icon.png',
        48: 'icon.png',
        128: 'icon.png',
      },
    },
  },
});
