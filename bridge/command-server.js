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
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "execute_command") {
    const { command, cwd = "/home/adham" } = request.params.arguments || {};
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
  throw new Error(`Unknown tool: ${request.params.name}`);
});

const transport = new StdioServerTransport();
await server.connect(transport);
