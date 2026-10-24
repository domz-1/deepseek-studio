import { ref } from "vue";
import {
  bridgeConnected,
  bridgeStatusText,
  servers,
  tools,
  settings,
} from "./useStudioState";
import type { McpServer, McpTool } from "../types";

export function useBridgeWs() {
  let pollTimer: any = null;

  async function fetchBridgeStatus() {
    const port = settings.bridgePort || 43210;
    const url = `http://127.0.0.1:${port}/mcp`;

    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      bridgeConnected.value = true;
      bridgeStatusText.value = "Connected";

      // Parse tools and group them into servers
      if (Array.isArray(data)) {
        tools.value = data;
        const serverMap = new Map<string, McpTool[]>();
        data.forEach((t: McpTool) => {
          const sName = t.server || "default";
          if (!serverMap.has(sName)) serverMap.set(sName, []);
          serverMap.get(sName)!.push(t);
        });

        const newServers: McpServer[] = [];
        serverMap.forEach((sTools, sName) => {
          newServers.push({
            name: sName,
            status: "online",
            toolCount: sTools.length,
            tools: sTools,
          });
        });
        servers.value = newServers;
      }
    } catch (_) {
      bridgeConnected.value = false;
      bridgeStatusText.value = "Offline";
    }
  }

  function connect() {
    fetchBridgeStatus();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(fetchBridgeStatus, 3000);
  }

  async function executeToolCall(
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    const port = settings.bridgePort || 43210;
    const url = `http://127.0.0.1:${port}/call`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tool: toolName,
        arguments: args,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(errText || `Tool call failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.result || data.output || data;
  }

  return {
    connect,
    executeToolCall,
    fetchBridgeStatus,
  };
}
