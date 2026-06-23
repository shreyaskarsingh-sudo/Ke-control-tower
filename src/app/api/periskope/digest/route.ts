import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";

const PERISKOPE_API_KEY = process.env.PERISKOPE_API_KEY!;
const PHONES = [process.env.PERISKOPE_PHONE_1, process.env.PERISKOPE_PHONE_2].filter(Boolean) as string[];
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

function tsToMs(ts?: number | string): number {
  if (!ts) return 0;
  if (typeof ts === "string") { const ms = new Date(ts).getTime(); return isNaN(ms) ? 0 : ms; }
  return ts > 1e10 ? ts : ts * 1000;
}

async function periRequest(path: string, phone: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.periskope.app/v1${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { "Authorization": `Bearer ${PERISKOPE_API_KEY}`, "x-phone": phone },
    next: { revalidate: 0 },
  });
  if (!res.ok) throw new Error(`Periskope ${res.status}`);
  return res.json();
}

function getChatStatus(chat: Record<string, unknown>): string {
  const msg = chat.latest_message as Record<string, unknown> | null;
  if (!msg) return "empty";
  if (msg.from_me || msg.fromMe) return "responded";
  if ((chat.message_unread_count as number) > 0) return "pending";
  return "closed";
}

async function fetchGroupMessages(chatId: string): Promise<Record<string, unknown>[]> {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const phone of PHONES) {
    try {
      const url = new URL(`https://api.periskope.app/v1/chats/${encodeURIComponent(chatId)}/messages`);
      url.searchParams.set("limit", "30");
      url.searchParams.set("sort_order", "desc");
      const res = await fetch(url.toString(), {
        headers: { "Authorization": `Bearer ${PERISKOPE_API_KEY}`, "x-phone": phone },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const msgs = (data.messages as Record<string, unknown>[]) || [];
      return msgs.filter((m) => tsToMs(m.timestamp as number | string) >= cutoff);
    } catch { /* try next */ }
  }
  return [];
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Client passes user_phone (from localStorage) for mention detection
  const body = await req.json().catch(() => ({}));
  const userPhone = (body.user_phone as string | undefined)?.replace(/[^0-9]/g, "") || null;
  const phoneId = userPhone ? `${userPhone}@c.us` : null;

  // Fetch all org groups
  const results = await Promise.allSettled(
    PHONES.map((phone) =>
      periRequest("/chats", phone, {
        chat_type: "group",
        limit: "500",
        sort_by: "latest_message_timestamp",
        sort_order: "desc",
      })
    )
  );

  const chatMap = new Map<string, Record<string, unknown>>();
  results.forEach((r) => {
    if (r.status === "fulfilled") {
      ((r.value as Record<string, unknown>).chats as Record<string, unknown>[] || []).forEach((c) => {
        const id = c.chat_id as string;
        if (!chatMap.has(id)) chatMap.set(id, { ...c, status: getChatStatus(c) });
      });
    }
  });

  const allChats = Array.from(chatMap.values());

  // 1. Assigned groups (strict — email match only)
  const assigned = allChats.filter((c) => (c.assigned_to as string | null) === session.email);

  // 2. Mention groups (phone-based, exclude already-assigned)
  const assignedIds = new Set(assigned.map((c) => c.chat_id as string));
  const mentionGroups = phoneId
    ? allChats.filter((c) => {
        if (assignedIds.has(c.chat_id as string)) return false;
        const ids = ((c.latest_message as Record<string, unknown>)?.mentioned_ids as string[]) || [];
        return ids.includes(phoneId);
      })
    : [];

  const pendingAssigned = assigned.filter((c) => c.status === "pending");
  const pendingMentions = mentionGroups.filter((c) => c.status === "pending" || (c.message_unread_count as number) > 0);

  // Fetch messages: up to 4 assigned + up to 2 mention groups
  const toFetch = [
    ...pendingAssigned.slice(0, 4).map((c) => ({ chat: c, source: "assigned" as const })),
    ...pendingMentions.slice(0, 2).map((c) => ({ chat: c, source: "mention" as const })),
  ];

  const groupData = await Promise.allSettled(
    toFetch.map(async ({ chat, source }) => {
      const msgs = await fetchGroupMessages(chat.chat_id as string);
      return { name: chat.chat_name as string, msgs, source };
    })
  );

  const transcripts: string[] = [];
  groupData.forEach((r) => {
    if (r.status !== "fulfilled" || !r.value.msgs.length) return;
    const { name, msgs, source } = r.value;
    const tag = source === "mention" ? " [you were @mentioned]" : "";
    const lines = msgs
      .slice()
      .reverse()
      .map((m) => {
        const sender = !!(m.from_me ?? m.fromMe) ? "You (KwikEngage)" : ((m.sender_name as string) || "Customer");
        const body = ((m.body as string) || "").replace(/\n+/g, " ").substring(0, 200);
        return `  [${sender}]: ${body}`;
      })
      .join("\n");
    transcripts.push(`### Group: ${name}${tag}\n${lines}`);
  });

  const summary = {
    total_assigned: assigned.length,
    pending_count: pendingAssigned.length,
    mention_count: mentionGroups.length,
    groups_analyzed: transcripts.length,
  };

  if (!transcripts.length) {
    return NextResponse.json({ digest: null, ...summary });
  }

  const mentionNote = mentionGroups.length
    ? ` and ${mentionGroups.length} group${mentionGroups.length > 1 ? "s" : ""} where you were @mentioned`
    : "";

  const prompt = `You are a WhatsApp group assistant for a Customer Success Manager at GoKwik (KwikEngage).

The CSM has ${assigned.length} assigned WhatsApp groups${mentionNote}. Below are the last 7 days of messages from groups needing attention (oldest first within each group). Groups marked [you were @mentioned] are not directly assigned but require your attention.

${transcripts.join("\n\n")}

Provide a concise action-focused digest:

**Immediate Actions** (groups needing a reply NOW)
List each group that needs an immediate response with one line explaining why. Prioritise @mentioned groups. Max 5 items.

**Follow-Up Items**
Anything the CSM promised, needs to check, or should circle back on. Max 4 items.

**Insights**
Any patterns or things worth noting across these groups. 1-2 sentences max.

Be specific, direct, and actionable. Skip anything already resolved.`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });
    const digest = (response.content[0] as { type: string; text: string }).text || "";
    return NextResponse.json({ digest, ...summary });
  } catch (err) {
    console.error("Anthropic digest error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
