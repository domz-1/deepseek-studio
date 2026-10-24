import { ref } from "vue";

export function useChatExport() {
  const isExporting = ref(false);
  const lastExportError = ref("");

  const getChatSessionId = () =>
    window.location.pathname.match(/\/s\/([a-zA-Z0-9_-]+)/)?.[1] || "";
  const getChatTitle = () =>
    document.title.replace(/\s*-\s*DeepSeek.*$/i, "").trim() ||
    "DeepSeek Conversation";

  async function fetchMessages(): Promise<any[]> {
    const sessionId = getChatSessionId();
    try {
      const tokenObj = localStorage.getItem("userToken");
      const token = tokenObj ? JSON.parse(tokenObj)?.value : "";
      if (sessionId && token) {
        const res = await fetch(
          `/api/v0/chat/history_messages?chat_session_id=${sessionId}`,
          { headers: { authorization: `Bearer ${token}` } },
        );
        const data = await res.json();
        if (data.code === 0 && data.data?.biz_data?.chat_messages) {
          return data.data.biz_data.chat_messages;
        }
      }
    } catch (_) {}

    // Fallback: DOM scraping
    const list: any[] = [];
    document.querySelectorAll(".ds-message").forEach((el) => {
      const isUser =
        el.classList.contains("d29f3d7d") ||
        (!el.querySelector(".ds-markdown") &&
          !el.classList.contains("ds-markdown"));
      const text = (el.textContent || "").trim();
      const thinkEl = el.querySelector(
        'div[class*="think"], div[class*="thought"]',
      );
      const contentEl = el.querySelector(
        ".ds-assistant-message-main-content, .ds-markdown",
      );

      list.push({
        role: isUser ? "USER" : "ASSISTANT",
        fragments: [
          ...(thinkEl
            ? [{ type: "THINK", content: thinkEl.textContent?.trim() }]
            : []),
          {
            type: "RESPONSE",
            content: contentEl ? contentEl.textContent?.trim() : text,
          },
        ],
      });
    });
    return list;
  }

  function cleanUserPrompt(raw: string): string {
    if (!raw.includes("<agent_system_instructions>")) return raw;
    const parts = raw.split("</agent_system_instructions>");
    const humanPart = (parts[1] || "").trim();
    return humanPart || raw;
  }

  async function generateMarkdown(): Promise<string> {
    const title = getChatTitle();
    const date = new Date().toISOString().replace("T", " ").slice(0, 19);
    const msgs = await fetchMessages();

    let md = `# ${title}\n\n`;
    md += `> Exported from **DeepSeek Studio** on \`${date}\`\n\n---\n\n`;

    for (const msg of msgs) {
      if (msg.role === "USER") {
        const raw =
          msg.fragments?.map((f: any) => f.content).join("\n") ||
          msg.content ||
          "";
        if (raw.startsWith("[MCP_AUTO_RESULT]")) {
          md += `### ⚡ Tool Result\n\n\`\`\`json\n${raw.replace("[MCP_AUTO_RESULT]", "").trim()}\n\`\`\`\n\n---\n\n`;
        } else {
          md += `### 👤 User\n\n${cleanUserPrompt(raw)}\n\n---\n\n`;
        }
      } else if (msg.role === "ASSISTANT") {
        md += `### 🤖 DeepSeek\n\n`;
        const think = msg.fragments?.find((f: any) => f.type === "THINK");
        if (think && think.content) {
          const secs = think.elapsed_secs
            ? ` (${Math.round(think.elapsed_secs)}s)`
            : "";
          md += `<details>\n<summary>💭 Thought Process${secs}</summary>\n\n${think.content}\n\n</details>\n\n`;
        }
        const resp = msg.fragments?.find((f: any) => f.type === "RESPONSE");
        if (resp && resp.content) {
          md += `${resp.content}\n\n`;
        }
        md += `---\n\n`;
      }
    }
    return md;
  }

  async function generateJson(): Promise<string> {
    const title = getChatTitle();
    const sessionId = getChatSessionId();
    const msgs = await fetchMessages();
    return JSON.stringify(
      {
        title,
        sessionId,
        exportedAt: new Date().toISOString(),
        totalMessages: msgs.length,
        messages: msgs,
      },
      null,
      2,
    );
  }

  function triggerDownload(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 150);
  }

  function sanitizeFilename(name: string): string {
    return (
      name
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .slice(0, 50) || "chat"
    );
  }

  async function exportAsMarkdown(): Promise<void> {
    isExporting.value = true;
    lastExportError.value = "";
    try {
      const md = await generateMarkdown();
      const fn = `${sanitizeFilename(getChatTitle())}_${new Date().toISOString().slice(0, 10)}.md`;
      triggerDownload(md, fn, "text/markdown;charset=utf-8");
    } catch (e: any) {
      lastExportError.value = e.message || "Export failed";
    } finally {
      isExporting.value = false;
    }
  }

  async function exportAsJson(): Promise<void> {
    isExporting.value = true;
    lastExportError.value = "";
    try {
      const json = await generateJson();
      const fn = `${sanitizeFilename(getChatTitle())}_${new Date().toISOString().slice(0, 10)}.json`;
      triggerDownload(json, fn, "application/json;charset=utf-8");
    } catch (e: any) {
      lastExportError.value = e.message || "Export failed";
    } finally {
      isExporting.value = false;
    }
  }

  async function copyMarkdownToClipboard(): Promise<boolean> {
    isExporting.value = true;
    try {
      const md = await generateMarkdown();
      await navigator.clipboard.writeText(md);
      return true;
    } catch (_) {
      return false;
    } finally {
      isExporting.value = false;
    }
  }

  return {
    isExporting,
    lastExportError,
    exportAsMarkdown,
    exportAsJson,
    copyMarkdownToClipboard,
  };
}
