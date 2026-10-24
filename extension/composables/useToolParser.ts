import type { ToolCallAction } from "../types";

export function useToolParser() {
  function parseToolCallsFromText(text: string): ToolCallAction[] {
    if (!text) return [];
    const results: ToolCallAction[] = [];

    // Pre-normalize fullwidth pipes and spaced DSML delimiters
    const normText = text
      .replace(/[\uff5c]+/g, "|")
      .replace(/<\s*\|\s*DSML\s*\|\s*/gi, "<|DSML|")
      .replace(/<\/\s*\|\s*DSML\s*\|\s*/gi, "</|DSML|");

    // 1. Markdown ```tool_call or ```json
    const mdRegex = /```(?:tool_call|json)?\s*([\s\S]*?)```/gi;
    let mdMatch: RegExpExecArray | null;
    while ((mdMatch = mdRegex.exec(normText)) !== null) {
      try {
        const parsed = JSON.parse(mdMatch[1].trim());
        if (parsed.name) {
          results.push(
            createAction(
              parsed.name,
              parsed.arguments || parsed.parameters || {},
              mdMatch[0],
            ),
          );
        }
      } catch (_) {}
    }

    // 2. DSML Format (<|DSML|invoke name="..." >)
    if (normText.includes("DSML") || normText.includes("invoke")) {
      const invokeRegex =
        /(?:<\|DSML\|)?(?:i)?nvoke\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)(?:<\/(?:\|DSML\|)?invoke>|<\/(?:\|DSML\|)?calls>|$)/gi;
      let invMatch: RegExpExecArray | null;
      while ((invMatch = invokeRegex.exec(normText)) !== null) {
        const fnName = invMatch[1].trim();
        const body = invMatch[2] || "";
        const args: Record<string, any> = {};

        const paramRegex =
          /(?:<\|DSML\|)?parameter\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)(?:<\/(?:\|DSML\|)?parameter>|(?=(?:<\|DSML\|)?parameter)|$)/gi;
        let pm: RegExpExecArray | null;
        let hadParams = false;
        while ((pm = paramRegex.exec(body)) !== null) {
          hadParams = true;
          const pName = pm[1].trim();
          let pVal = pm[2].trim();
          try {
            pVal = JSON.parse(pVal);
          } catch (_) {}
          args[pName] = pVal;
        }

        if (!hadParams) {
          const cmdM = body.match(/>([^<]+)<\//);
          if (cmdM) {
            args.command = cmdM[1].trim();
          } else {
            args.command = body.replace(/<[^>]+>/g, "").trim();
          }
        }
        results.push(createAction(fnName, args, invMatch[0]));
      }
    }

    // 3. Custom tags (<shell>...</shell>, <bash>...</bash>, <tool_call>...</tool_call>)
    const tagRegex = /<(bash|shell|sh|execute_command)>([\s\S]*?)<\/\1>/gi;
    let tagMatch: RegExpExecArray | null;
    while ((tagMatch = tagRegex.exec(normText)) !== null) {
      results.push(
        createAction(
          tagMatch[1].trim(),
          { command: tagMatch[2].trim() },
          tagMatch[0],
        ),
      );
    }

    return results;
  }

  function createAction(
    name: string,
    args: Record<string, any>,
    rawBlock: string,
  ): ToolCallAction {
    let cleanName = name.trim();
    const cleanArgs = { ...args };

    if (!cleanArgs.command && cleanArgs.cmd) cleanArgs.command = cleanArgs.cmd;
    if (typeof cleanArgs === "string") cleanArgs.command = cleanArgs;

    return {
      id: `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      callId: `call_${Date.now()}`,
      name: cleanName,
      arguments: cleanArgs,
      rawBlock,
      status: "pending",
      timestamp: Date.now(),
    };
  }

  function stripToolCalls(text: string): string {
    if (!text) return "";
    return text
      .replace(/CopyDownload/gi, "")
      .replace(/```(?:tool_call|json)?\s*[\s\S]*?```/gi, "")
      .replace(
        /<\s*\|\s*DSML\s*\|\s*calls>[\s\S]*?<\/\s*\|\s*DSML\s*\|\s*calls>/gi,
        "",
      )
      .replace(
        /<\s*\|\s*DSML\s*\|\s*invoke[\s\S]*?<\/\s*\|\s*DSML\s*\|\s*invoke>/gi,
        "",
      )
      .replace(/<invoke\s+name=["'][\s\S]*?<\/invoke>/gi, "")
      .replace(
        /<(?:bash|shell|sh|execute_command)>[\s\S]*?<\/(?:bash|shell|sh|execute_command)>/gi,
        "",
      )
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
      .replace(/<[\s\S]*?(?:DSML|invoke|parameter)[\s\S]*?>/gi, "")
      .replace(/<\/[\s\S]*?(?:DSML|invoke|parameter)[\s\S]*?>/gi, "")
      .trim();
  }

  return {
    parseToolCallsFromText,
    stripToolCalls,
  };
}
