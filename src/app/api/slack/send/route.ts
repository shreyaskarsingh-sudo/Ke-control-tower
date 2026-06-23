import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getToken } from "@/lib/token-store";
import { WebClient } from "@slack/web-api";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userToken = getToken(session.email, "slack");
  if (!userToken) return NextResponse.json({ error: "Slack not connected" }, { status: 400 });

  const { channelId, message, threadTs } = await request.json();

  // Use user token — message appears as the CSM themselves
  const slack = new WebClient(userToken);

  try {
    await slack.chat.postMessage({
      channel: channelId,
      text: message,
      thread_ts: threadTs,
    });
    return NextResponse.json({ status: "sent" });
  } catch (err) {
    console.error("Slack send error:", err);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }
}
