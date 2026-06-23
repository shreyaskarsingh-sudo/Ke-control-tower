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
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) throw new Error(`Periskope ${res.status} on ${path}`);
  return res.json();
}

function getChatStatus(chat: Record<string, unknown>): string {
  const msg = chat.latest_message as Record<string, unknown> | null;
  if (!msg) return "empty";
  const msgUnread = (chat.message_unread_count as number) || 0;
  if (msg.from_me || msg.fromMe) return "responded";
  if (msgUnread > 0) return "pending";
  return "closed";
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!PERISKOPE_API_KEY) {
    return NextResponse.json({ error: "PERISKOPE_API_KEY not configured" }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const userEmail = searchParams.get("user_email") || session.email;
  const userPhone = searchParams.get("user_phone");
  const filterMine = searchParams.get("filter_mine") === "true";
  const phoneId = userPhone ? userPhone.replace(/[^0-9]/g, "") + "@c.us" : null;

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
        ((r.value as Record<string, unknown>).chats as Record<string, unknown>[] || []).forEach((chat) => {
          const id = chat.chat_id as string;
          if (!chatMap.has(id)) {
            chatMap.set(id, {
              ...chat,
              status: getChatStatus(chat),
            });
          }
        });
      }
    });

    let chats = Array.from(chatMap.values());

    if (filterMine && userEmail) {
      chats = chats.filter((c) => (c.assigned_to as string | null) === userEmail);
    }

    if (phoneId) {
      chats = chats.map((c) => {
        const ids = ((c.latest_message as Record<string, unknown>)?.mentioned_ids as string[]) || [];
        return { ...c, user_mentioned: ids.includes(phoneId) };
      });
    }

    return NextResponse.json({ ok: true, chats, total_org: chatMap.size });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
