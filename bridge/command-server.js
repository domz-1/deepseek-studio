#!/usr/bin/env bun
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const server = new Server(
  { name: "mcp-shell-commander", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "execute_command",
        description:
          "Execute a bash shell command on the host machine and return stdout and stderr.",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description:
                "The shell command to run (e.g. ls -la, git status, bun --version)",
            },
            cwd: {
              type: "string",
              description:
                "Working directory to execute command in (optional, defaults to /home/adham)",
            },
          },
          required: ["command"],
        },
      },
      {
        name: "bash",
        description:
          "Execute a bash shell command (alias for execute_command).",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The shell command to run",
            },
            cwd: {
              type: "string",
              description: "Working directory (optional)",
            },
          },
          required: ["command"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;
  if (toolName === "execute_command" || toolName === "bash") {
    let { command, cwd = "/home/adham" } = request.params.arguments || {};
    // Fallback if DeepSeek sends command in 'cmd' or 'arg'
    if (!command && request.params.arguments?.cmd) {
      command = request.params.arguments.cmd;
    }
    if (!command) {
      return {
        isError: true,
        content: [{ type: "text", text: "Error: No command provided to run" }],
      };
    }

    // Safety guard: prevent commands that kill the bridge itself
    if (
      command.includes("server.js") &&
      (command.includes("pkill") || command.includes("kill"))
    ) {
      return {
        content: [
          {
            type: "text",
            text: "(Skipped killing bridge process to keep session alive)",
          },
        ],
      };
    }

    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      return {
        content: [
          {
            type: "text",
            text:
              stdout ||
              stderr ||
              "(Command executed successfully with no output)",
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Command error:\n${err.message}\n${err.stderr || ""}`,
          },
        ],
      };
    }
  }
  throw new Error(`Unknown tool: ${toolName}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
