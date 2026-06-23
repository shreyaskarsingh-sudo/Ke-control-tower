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

function getChatStatus(chat: Record<string, unknown>): string {
  const msg = chat.latest_message as Record<string, unknown> | null;
  if (!msg) return "empty";
  if (msg.from_me || msg.fromMe) return "responded";
  if ((chat.message_unread_count as number) > 0) return "pending";
  return "closed";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userPhone = searchParams.get("user_phone");
  const userEmail = searchParams.get("user_email") || session.email;

  if (!userPhone) {
    return NextResponse.json({ error: "user_phone is required" }, { status: 400 });
  }

  const phoneId = userPhone.replace(/[^0-9]/g, "") + "@c.us";

  try {
    const results = await Promise.allSettled(
      PHONES.map((phone) =>
        periRequest("/chats", phone, {
          chat_type: "group",
          limit: "2000",
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

    let chats = Array.from(chatMap.values());
    if (userEmail) {
      chats = chats.filter((c) => ((c.chat_access as Record<string, boolean>) || {})[userEmail] === true);
    }

    const mentioned: (Record<string, unknown> & { mention_messages: unknown[] })[] = [];

    // Quick pass: latest_message.mentioned_ids
    chats.forEach((c) => {
      const ids = ((c.latest_message as Record<string, unknown>)?.mentioned_ids as string[]) || [];
      if (ids.includes(phoneId)) {
        mentioned.push({ ...c, mention_messages: [c.latest_message] });
      }
    });

    // Deep pass: fetch messages for unread groups (cap at 30)
    const alreadyFound = new Set(mentioned.map((c) => c.chat_id as string));
    const toScan = chats
      .filter((c) => (c.message_unread_count as number) > 0 && !alreadyFound.has(c.chat_id as string))
      .slice(0, 30);

    await Promise.allSettled(
      toScan.map(async (chat) => {
        for (const phone of PHONES) {
          try {
            const data = await periRequest(
              `/chats/${encodeURIComponent(chat.chat_id as string)}/messages`,
              phone,
              { limit: "20", sort_order: "desc" }
            );
            const msgs = ((data as Record<string, unknown>).messages as Record<string, unknown>[] || [])
              .filter((m) => ((m.mentioned_ids as string[]) || []).includes(phoneId));
            if (msgs.length > 0) mentioned.push({ ...chat, mention_messages: msgs.slice(0, 3) });
            break;
          } catch { /* try next phone */ }
        }
      })
    );

    mentioned.sort((a, b) => {
      const ta = (a.latest_message as Record<string, unknown>)?.timestamp as number;
      const tb = (b.latest_message as Record<string, unknown>)?.timestamp as number;
      if (!ta && !tb) return 0;
      if (!ta) return 1; if (!tb) return -1;
      const na = ta > 1e10 ? ta : ta * 1000;
      const nb = tb > 1e10 ? tb : tb * 1000;
      return nb - na;
    });

    return NextResponse.json({ ok: true, mentions: mentioned, scanned: toScan.length });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
