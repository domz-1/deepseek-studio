export interface McpTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  serverName?: string;
  category?: string;
}

export interface McpServer {
  name: string;
  status: "online" | "offline" | "busy" | "error";
  toolCount: number;
  tools: McpTool[];
  url?: string;
  error?: string;
}

export interface ToolCallAction {
  id: string;
  callId: string;
  name: string;
  arguments: Record<string, any>;
  rawBlock: string;
  status:
    "pending" | "approved" | "rejected" | "running" | "completed" | "error";
  result?: any;
  error?: string;
  timestamp: number;
  turnIndex?: number;
}

export interface ProjectWorkspace {
  name: string;
  path: string;
  description?: string;
  tools?: string[];
  systemPrompt?: string;
  active?: boolean;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  content: string;
  category?: string;
  triggers?: string[];
}

export interface StudioSettings {
  bridgePort: number;
  autoApprove: boolean;
  autoContinue: boolean;
  autoContinueDelay: number; // in seconds (default 5)
  humanSpeed: "natural" | "fast" | "instant";
  activeProject?: string;
  customSystemPrompt?: string;
}
