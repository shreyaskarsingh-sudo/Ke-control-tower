import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getToken } from "@/lib/token-store";
import { WebClient } from "@slack/web-api";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userToken = getToken(session.email, "slack");
  if (!userToken) return NextResponse.json({ error: "Slack not connected" }, { status: 400 });

  const { channelId, threadTs } = await request.json();
  if (!channelId || !threadTs) return NextResponse.json({ error: "channelId and threadTs required" }, { status: 400 });

  try {
    const slack = new WebClient(userToken);
    await slack.conversations.mark({ channel: channelId, ts: threadTs });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[slack/mark-read] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
