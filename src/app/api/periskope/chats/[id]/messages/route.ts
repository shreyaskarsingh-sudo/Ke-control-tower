import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const PERISKOPE_API_KEY = process.env.PERISKOPE_API_KEY!;
const PHONES = [process.env.PERISKOPE_PHONE_1, process.env.PERISKOPE_PHONE_2].filter(Boolean) as string[];

async function periRequest(path: string, phone: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.periskope.app/v1${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: {
      "Authorization": `Bearer ${PERISKOPE_API_KEY}`,
      "x-phone": phone,
    },
  });
  if (!res.ok) throw new Error(`Periskope ${res.status}`);
  return res.json();
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const chatId = decodeURIComponent(id);

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const phone of PHONES) {
    try {
      const data = await periRequest(`/chats/${encodeURIComponent(chatId)}/messages`, phone, {
        limit: "100",
        sort_order: "desc",
      });
      const allMsgs = ((data as Record<string, unknown>).messages as Record<string, unknown>[]) || [];
      const filtered = allMsgs
        .filter((m) => {
          const ts = m.timestamp as number | string | undefined;
          if (!ts) return true;
          const ms = typeof ts === "string" ? new Date(ts).getTime() : ts > 1e10 ? ts : ts * 1000;
          return isNaN(ms) || ms >= cutoff;
        })
        .map((m) => {
          const raw = m as Record<string, unknown>;

          // Periskope uses from_me (snake_case) — normalize to fromMe for the UI
          const fromMe = !!(raw.from_me ?? raw.fromMe);

          // Periskope puts the sender's phone in sender_phone (e.g. "917703871917@c.us")
          const senderPhoneRaw = raw.sender_phone as string | undefined;
          const senderPhone = senderPhoneRaw ? senderPhoneRaw.replace(/@.*$/, "") : null;
          // Format as +91 XXXXX XXXXX for Indian numbers
          const formattedPhone = senderPhone
            ? senderPhone.startsWith("91") && senderPhone.length === 12
              ? `+91 ${senderPhone.slice(2, 7)} ${senderPhone.slice(7)}`
              : `+${senderPhone}`
            : null;

          const displayName = formattedPhone || null;

          return { ...raw, sender_name: displayName, fromMe };
        });
      // Reverse to oldest-first so the frontend can scroll to bottom = newest
      return NextResponse.json({ ...(data as object), messages: filtered.slice().reverse(), total_fetched: allMsgs.length });
    } catch { /* try next phone */ }
  }

  return NextResponse.json({ error: "Chat not found on any phone" }, { status: 404 });
}
