import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";

const PERISKOPE_API_KEY = process.env.PERISKOPE_API_KEY!;
const PHONES = [process.env.PERISKOPE_PHONE_1, process.env.PERISKOPE_PHONE_2].filter(Boolean) as string[];
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function tsToMs(ts?: number | string): number {
  if (!ts) return 0;
  if (typeof ts === "string") {
    const ms = new Date(ts).getTime();
    return isNaN(ms) ? 0 : ms;
  }
  return ts > 1e10 ? ts : ts * 1000;
}

async function fetchMessages(chatId: string): Promise<Record<string, unknown>[]> {
  for (const phone of PHONES) {
    try {
      const url = new URL(`https://api.periskope.app/v1/chats/${encodeURIComponent(chatId)}/messages`);
      url.searchParams.set("limit", "100");
      url.searchParams.set("sort_order", "desc");
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${PERISKOPE_API_KEY}`, "x-phone": phone },
      });
      if (!res.ok) continue;
      const data = await res.json();
      return (data.messages as Record<string, unknown>[]) || [];
    } catch { /* try next */ }
  }
  return [];
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { chatId, chatName } = await req.json();
  if (!chatId) return NextResponse.json({ error: "chatId required" }, { status: 400 });

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - thirtyDaysMs;

  const rawMessages = await fetchMessages(chatId);
  const recent = rawMessages
    .filter((m) => tsToMs(m.timestamp as number | string) >= cutoff)
    .slice(0, 80); // cap at 80 messages to keep prompt reasonable

  if (!recent.length) {
    return NextResponse.json({ analysis: "No messages found in the last 30 days for this group." });
  }

  // Build a clean transcript (oldest first, no PII beyond sender names)
  const transcript = recent
    .slice()
    .reverse()
    .map((m) => {
      const sender = (m.fromMe ? "Agent" : (m.sender_name as string) || "Customer") as string;
      const body = ((m.body as string) || "").replace(/\n+/g, " ").substring(0, 300);
      return `[${sender}]: ${body}`;
    })
    .join("\n");

  const prompt = `You are analyzing a WhatsApp business group chat for a Customer Success Manager at GoKwik.

Group name: ${chatName || chatId}
Messages (last 30 days, oldest first):

${transcript}

Provide a concise analysis in the following structure:

**Current Status**
One sentence on what is happening right now in this group.

**Key Issues / Requests**
Bullet points of the main issues, questions, or requests raised (max 5 bullets).

**Action Items**
What the CSM needs to do or follow up on (max 4 bullets).

**Sentiment**
Overall sentiment: Positive / Neutral / Needs Attention — with a one-line reason.

Keep the analysis factual, brief, and actionable. Do not speculate beyond what the messages say.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    });
    const text = (response.content[0] as { type: string; text: string }).text || "";
    return NextResponse.json({ analysis: text, message_count: recent.length });
  } catch (err) {
    console.error("Anthropic error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
