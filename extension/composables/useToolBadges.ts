import type { Component } from "vue";
import type { ToolCallAction } from "../types";
import {
  Terminal,
  FileText,
  Folder,
  Globe,
  Brain,
  CheckCircle2,
  Wrench,
} from "lucide-vue-next";

export interface ToolBadgeStyle {
  bg: string;
  text: string;
  border: string;
}

export function getToolCategory(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("bash") || n.includes("shell") || n.includes("command")) {
    return "Bash";
  }
  if (n.includes("read")) return "Read";
  if (n.includes("write") || n.includes("edit")) return "Write";
  if (n.includes("list") || n.includes("dir") || n.includes("tree"))
    return "List";
  if (n.includes("chrome") || n.includes("page")) return "Chrome";
  if (n.includes("memory")) return "Memory";
  if (n.includes("task_done")) return "Task Done";
  return "Tool";
}

export function getBadgeStyle(cat: string): ToolBadgeStyle {
  switch (cat) {
    case "Bash":
      return {
        bg: "bg-purple-500/15",
        text: "text-purple-300",
        border: "border-purple-500/30",
      };
    case "Read":
      return {
        bg: "bg-sky-500/15",
        text: "text-sky-300",
        border: "border-sky-500/30",
      };
    case "Write":
      return {
        bg: "bg-amber-500/15",
        text: "text-amber-300",
        border: "border-amber-500/30",
      };
    case "List":
      return {
        bg: "bg-cyan-500/15",
        text: "text-cyan-300",
        border: "border-cyan-500/30",
      };
    case "Chrome":
      return {
        bg: "bg-blue-500/15",
        text: "text-blue-300",
        border: "border-blue-500/30",
      };
    case "Task Done":
      return {
        bg: "bg-emerald-500/15",
        text: "text-emerald-300",
        border: "border-emerald-500/30",
      };
    default:
      return {
        bg: "bg-indigo-500/15",
        text: "text-indigo-300",
        border: "border-indigo-500/30",
      };
  }
}

export function getToolIcon(name: string): Component {
  const cat = getToolCategory(name);
  if (cat === "Bash") return Terminal;
  if (cat === "Read" || cat === "Write") return FileText;
  if (cat === "List") return Folder;
  if (cat === "Chrome") return Globe;
  if (cat === "Memory") return Brain;
  if (cat === "Task Done") return CheckCircle2;
  return Wrench;
}

export function getStepPreview(act: ToolCallAction): string {
  const args = act.arguments || {};
  if (args.command) return String(args.command);
  if (args.path) return String(args.path);
  if (args.url) return String(args.url);
  if (args.summary) return String(args.summary);
  if (args.query) return String(args.query);
  const keys = Object.keys(args);
  return keys.length > 0 ? `${keys[0]}: ${String(args[keys[0]])}` : act.name;
}

export function formatResult(res: any): string {
  if (!res) return "";
  if (typeof res === "string") return res;
  if (res.structuredContent?.content) return res.structuredContent.content;
  if (res.content?.[0]?.text) return res.content[0].text;
  try {
    return JSON.stringify(res, null, 2);
  } catch {
    return String(res);
  }
}
