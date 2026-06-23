import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));

  const params = new URLSearchParams({
    client_id: process.env.SLACK_CLIENT_ID!,
    user_scope: [
      "chat:write",
      "im:read",
      "im:history",
      "mpim:read",
      "mpim:history",
      "search:read",
      "channels:history",
      "groups:history",
    ].join(","),
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/slack/callback`,
    state: session.email,
  });

  return NextResponse.redirect(
    `https://slack.com/oauth/v2/authorize?${params.toString()}`
  );
}
