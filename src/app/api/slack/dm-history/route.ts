import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getToken } from "@/lib/token-store";
import { WebClient } from "@slack/web-api";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const channelId = searchParams.get("channelId");
  if (!channelId) return NextResponse.json({ error: "Missing channelId" }, { status: 400 });

  const userToken = getToken(session.email, "slack");
  if (!userToken) return NextResponse.json({ messages: [] });

  try {
    const slack = new WebClient(userToken, {
      timeout: 10000,
      retryConfig: { retries: 0 },
      rejectRateLimitedCalls: true,
    });

    const meRes = await slack.auth.test();
    const myUserId = meRes.user_id!;

    const history = await slack.conversations.history({ channel: channelId, limit: 15 });
    const rawMsgs = ((history.messages ?? []) as Record<string, unknown>[]).reverse();

    // Build name cache from inline user_profile fields and search
    const nameCache = new Map<string, string>();
    for (const m of rawMsgs) {
      const uid = m.user as string | undefined;
      const profile = m.user_profile as Record<string, string> | undefined;
      if (uid && profile && !nameCache.has(uid)) {
        const name = (profile.display_name?.trim()) || profile.real_name;
        if (name) nameCache.set(uid, name);
      }
    }

    // For any user IDs still not resolved, try a quick search
    const unknownIds = [...new Set(
      rawMsgs.map((m) => m.user as string | undefined)
        .filter((u): u is string => !!u && u !== myUserId && !nameCache.has(u))
    )].slice(0, 5); // cap at 5 search calls

    await Promise.allSettled(unknownIds.map(async (uid) => {
      try {
        const sr = await slack.search.messages({
          query: `from:<@${uid}>`,
          count: 1,
          sort: "timestamp",
          sort_dir: "desc",
        });
        const match = (sr.messages?.matches ?? [])[0] as Record<string, unknown> | undefined;
        const uname = match?.username as string | undefined;
        if (uname) nameCache.set(uid, uname);
      } catch { /* ignore */ }
    }));

    const messages = rawMsgs
      .filter((m) => m.text)
      .map((m) => {
        const uid = m.user as string | undefined;
        const fromMe = uid === myUserId;
        const sender = fromMe
          ? "You"
          : uid
          ? (nameCache.get(uid) ?? uid)
          : (m.username as string | undefined) ?? "App";
        return { text: (m.text as string), fromMe, sender, ts: (m.ts as string) ?? "0" };
      });

    return NextResponse.json({ messages });
  } catch (err) {
    console.error("dm-history error:", err);
    return NextResponse.json({ messages: [] });
  }
}
