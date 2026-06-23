const KE_MCP_URL = process.env.KE_MCP_URL || "http://10.8.2.63:3006/mcp";

interface McpSession {
  sessionId: string;
}

interface McpToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

function parseSseData(raw: string): unknown {
  const lines = raw.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        return JSON.parse(line.slice(6));
      } catch {
        // skip
      }
    }
  }
  return null;
}

export async function initMcpSession(): Promise<McpSession> {
  const res = await fetch(KE_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "ke-control-tower", version: "1.0" },
      },
    }),
  });

  const sessionId = res.headers.get("mcp-session-id");
  if (!sessionId) throw new Error("MCP session init failed — no session ID in response");

  return { sessionId };
}

export async function callMcpTool(
  session: McpSession,
  toolName: string,
  toolArgs: Record<string, unknown> = {}
): Promise<McpToolResult> {
  const res = await fetch(KE_MCP_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "mcp-session-id": session.sessionId,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method: "tools/call",
      params: { name: toolName, arguments: toolArgs },
    }),
  });

  if (!res.ok) {
    throw new Error(`MCP HTTP ${res.status} calling ${toolName}`);
  }

  const raw = await res.text();
  const parsed = parseSseData(raw) as { result?: McpToolResult; error?: { message: string } } | null;

  if (!parsed) throw new Error(`MCP: empty response from ${toolName}`);
  if (parsed.error) throw new Error(`MCP tool error (${toolName}): ${parsed.error.message}`);
  if (!parsed.result) throw new Error(`MCP: no result from ${toolName}`);

  return parsed.result;
}

export function extractText(result: McpToolResult): string {
  return result.content
    .filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}
