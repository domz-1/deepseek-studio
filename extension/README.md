# DeepSeek Studio (Vue 3 + WXT Edition)

Modular, production-ready Chrome Extension for DeepSeek Chat and Model Context Protocol (MCP) tools, rebuilt from scratch with **WXT**, **Vue 3 (Composition API)**, and **Bun**.

## Architecture & Composables

Every module and composable is strictly constrained to <= 200-300 lines for maximum maintainability:

| Module / Composable                  | Lines | Purpose                                                                  |
| :----------------------------------- | :---- | :----------------------------------------------------------------------- |
| `composables/useDeepSeekDom.ts`      | 150   | Resilient DOM traversal, chat input, send button, stopped detection      |
| `composables/useBridgeWs.ts`         | 121   | WebSocket RPC client to local Bridge server (port 8080/8088)             |
| `composables/useToolParser.ts`       | 111   | Tolerant parser for DSML XML (`<\|DSML\|invoke>`), JSON, and custom tags |
| `composables/usePromptExecution.ts`  | 98    | Humanized typing with jitter, input setter bypass, enter dispatch        |
| `composables/useWatchdog.ts`         | 77    | Smooth countdown for auto-continue & retry with coordinate clicking      |
| `composables/useStudioState.ts`      | 70    | Central reactive store for settings, servers, tools, and actions         |
| `composables/useActionCards.ts`      | 60    | Tool execution queue, card approval, and chat feedback                   |
| `composables/useProjects.ts`         | 50    | Workspace project profiles and switching                                 |
| `composables/useSkills.ts`           | 37    | Skill storage, trigger matching, and prompt templates                    |
| `components/ActionCard.vue`          | 178   | Interactive tool execution card with arguments and status                |
| `components/ServerPills.vue`         | 90    | Floating live status pills for connected MCP servers                     |
| `components/WatchdogBadge.vue`       | 68    | Auto-continue countdown badge with instant force-click                   |
| `entrypoints/content/ContentApp.vue` | 144   | Shadow DOM host mounting UI directly in `chat.deepseek.com`              |
| `entrypoints/popup/PopupApp.vue`     | 252   | Extension popup controls (port, auto-continue, auto-approve)             |

## Development & Build

All package commands use `bun`:

```bash
# Start Vite development server with Hot Module Reloading (HMR)
bunx wxt

# Build production Manifest v3 extension
bunx wxt build
```

The production output is generated in:
`/home/adham/projects/adham/deepseek-studio-vue/.output/chrome-mv3`

## How to Load in Browser

1. Open `brave://extensions` or `chrome://extensions`.
2. Enable **Developer mode** in the top right.
3. Click **Load unpacked**.
4. Select the folder:
   `/home/adham/projects/adham/deepseek-studio-vue/.output/chrome-mv3`
5. Navigate to [chat.deepseek.com](https://chat.deepseek.com).
