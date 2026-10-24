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
  const ws = ref<WebSocket | null>(null);
  let reconnectTimer: any = null;

  function connect() {
    if (
      ws.value &&
      (ws.value.readyState === WebSocket.OPEN ||
        ws.value.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const port = settings.bridgePort || 8080;
    const url = `ws://127.0.0.1:${port}/ws`;
    bridgeStatusText.value = "Connecting...";

    try {
      const socket = new WebSocket(url);
      ws.value = socket;

      socket.onopen = () => {
        bridgeConnected.value = true;
        bridgeStatusText.value = "Connected";
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        // Query available servers and tools
        socket.send(JSON.stringify({ type: "GET_SERVERS" }));
        socket.send(JSON.stringify({ type: "GET_TOOLS" }));
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handleBridgeMessage(data);
        } catch (_) {}
      };

      socket.onclose = () => {
        bridgeConnected.value = false;
        bridgeStatusText.value = "Disconnected";
        ws.value = null;
        scheduleReconnect();
      };

      socket.onerror = () => {
        try {
          socket.close();
        } catch (_) {}
      };
    } catch (_) {
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 3000);
  }

  function handleBridgeMessage(data: any) {
    if (data.type === "SERVERS" || data.type === "SERVERS_UPDATE") {
      if (Array.isArray(data.servers)) {
        servers.value = data.servers;
      }
    } else if (data.type === "TOOLS" || data.type === "TOOLS_UPDATE") {
      if (Array.isArray(data.tools)) {
        tools.value = data.tools;
      }
    }
  }

  async function executeToolCall(
    toolName: string,
    args: Record<string, any>,
  ): Promise<any> {
    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      throw new Error("Bridge server is offline");
    }

    const reqId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    return new Promise((resolve, reject) => {
      const handler = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          if (data.requestId === reqId || data.id === reqId) {
            ws.value?.removeEventListener("message", handler);
            if (data.error) {
              reject(new Error(data.error));
            } else {
              resolve(data.result || data.output || data);
            }
          }
        } catch (_) {}
      };

      ws.value?.addEventListener("message", handler);
      ws.value?.send(
        JSON.stringify({
          type: "EXECUTE_TOOL",
          requestId: reqId,
          tool: toolName,
          arguments: args,
        }),
      );

      // 60s timeout
      setTimeout(() => {
        ws.value?.removeEventListener("message", handler);
        reject(new Error("Tool execution timed out after 60s"));
      }, 60000);
    });
  }

  return {
    connect,
    executeToolCall,
  };
}
