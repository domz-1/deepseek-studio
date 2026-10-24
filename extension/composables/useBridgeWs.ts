import {
  bridgeConnected,
  bridgeStatusText,
  servers,
  tools,
} from "./useStudioState";
import type { McpServer, McpTool } from "../types";

export function useBridgeWs() {
  let pollTimer: any = null;

  async function fetchBridgeStatus() {
    try {
      const response = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_MCP" }, (res) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(res);
        });
      });

      if (response && response.ok && response.data) {
        bridgeConnected.value = true;
        bridgeStatusText.value = "Connected";

        // Response structure: response.data.tools or array
        const rawTools: McpTool[] = Array.isArray(response.data)
          ? response.data
          : response.data.tools || [];

        tools.value = rawTools;
        const serverMap = new Map<string, McpTool[]>();
        rawTools.forEach((t: McpTool) => {
          const sName = t.server || (t as any).serverName || "tools";
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
      } else {
        bridgeConnected.value = false;
        bridgeStatusText.value = "Offline";
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
    const res = await new Promise<any>((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "CALL",
          payload: {
            tool: toolName,
            arguments: args,
          },
        },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (!response || !response.ok) {
            reject(new Error(response?.error || "Tool execution failed"));
          } else {
            resolve(response.data);
          }
        },
      );
    });

    return res?.result || res?.output || res;
  }

  return {
    connect,
    executeToolCall,
    fetchBridgeStatus,
  };
}
