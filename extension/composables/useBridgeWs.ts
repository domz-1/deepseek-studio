import {
  bridgeConnected,
  bridgeStatusText,
  isServerStopped,
  isTogglingServer,
  servers,
  tools,
  settings,
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
        if (response.data.active === false) {
          bridgeConnected.value = false;
          isServerStopped.value = true;
          bridgeStatusText.value = "Stopped";
          servers.value = [];
          tools.value = [];
          return;
        }

        bridgeConnected.value = true;
        isServerStopped.value = false;
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
        chrome.storage.local
          .set({
            cached_tools: rawTools,
            cached_servers: newServers,
          })
          .catch(() => {});
      } else {
        bridgeConnected.value = false;
        bridgeStatusText.value = "Offline";
      }
    } catch (_) {
      bridgeConnected.value = false;
      bridgeStatusText.value = "Offline";
    }
  }

  async function startServer(): Promise<boolean> {
    isTogglingServer.value = true;
    try {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: "SERVER_START" }, (r) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(r);
        });
      });
      await fetchBridgeStatus();
      return !!res?.ok;
    } catch {
      return false;
    } finally {
      isTogglingServer.value = false;
    }
  }

  async function stopServer(): Promise<boolean> {
    isTogglingServer.value = true;
    try {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: "SERVER_STOP" }, (r) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(r);
        });
      });
      await fetchBridgeStatus();
      return !!res?.ok;
    } catch {
      return false;
    } finally {
      isTogglingServer.value = false;
    }
  }

  async function restartServer(): Promise<boolean> {
    isTogglingServer.value = true;
    try {
      const res = await new Promise<any>((resolve) => {
        chrome.runtime.sendMessage({ type: "SERVER_RESTART" }, (r) => {
          if (chrome.runtime.lastError) resolve(null);
          else resolve(r);
        });
      });
      await fetchBridgeStatus();
      return !!res?.ok;
    } catch {
      return false;
    } finally {
      isTogglingServer.value = false;
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
      const timer = setTimeout(() => {
        reject(new Error(`Tool execution timed out after 60s for ${toolName}`));
      }, 60000);

      chrome.runtime.sendMessage(
        {
          type: "CALL",
          payload: {
            name: toolName,
            tool: toolName,
            arguments: args,
            project: settings.activeProject || "/home/adham/projects/adham",
          },
        },
        (response) => {
          clearTimeout(timer);
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
    startServer,
    stopServer,
    restartServer,
  };
}
