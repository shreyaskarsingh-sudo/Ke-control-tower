import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gmailFetch } from "@/lib/gmail-client";
import { hasToken } from "@/lib/token-store";

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  } catch {
    return "";
  }
}

function extractText(payload: Record<string, unknown>): string {
  const mimeType = (payload.mimeType as string) ?? "";
  const body = payload.body as { data?: string; size?: number };

  if (mimeType === "text/plain" && body?.data) {
    return decodeBase64(body.data);
  }
  if (mimeType === "text/html" && body?.data) {
    return decodeBase64(body.data).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  const parts = (payload.parts as Record<string, unknown>[]) ?? [];
  // Prefer text/plain over text/html
  for (const part of parts) {
    if ((part.mimeType as string) === "text/plain") {
      const text = extractText(part);
      if (text) return text;
    }
  }
  for (const part of parts) {
    const text = extractText(part);
    if (text) return text;
  }
  return "";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasToken(session.email, "gmail")) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const threadId = searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  try {
    const res = await gmailFetch(session.email, `/threads/${threadId}?format=full`);
    if (!res.ok) throw new Error(`Gmail thread fetch ${res.status}`);
    const thread = await res.json();

    const messages = (thread.messages as Record<string, unknown>[]) ?? [];

    const parsed = messages.map((msg) => {
      const payload = msg.payload as Record<string, unknown>;
      const headers = (payload?.headers as { name: string; value: string }[]) ?? [];
      const from = getHeader(headers, "From");
      const to = getHeader(headers, "To");
      const date = getHeader(headers, "Date");
      const subject = getHeader(headers, "Subject");
      const body = extractText(payload);
      const internalDate = (msg.internalDate as string) ?? "";

      return {
        id: msg.id as string,
        from,
        to,
        date,
        subject,
        body: body.slice(0, 3000), // cap at 3k chars per message
        timestamp: internalDate ? new Date(parseInt(internalDate)).toISOString() : date,
      };
    });

    return NextResponse.json({ messages: parsed });
  } catch (err) {
    console.error("[gmail/thread] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
