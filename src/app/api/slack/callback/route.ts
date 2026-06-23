import { NextResponse } from "next/server";
import { saveToken } from "@/lib/token-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // CSM email
  const error = searchParams.get("error");
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

  console.log("[slack/callback] hit — code:", code ? "present" : "MISSING", "| state:", state, "| error:", error);

  if (error || !code || !state) {
    console.error("[slack/callback] early exit — error:", error, "code:", code, "state:", state);
    return NextResponse.redirect(`${APP_URL}/dashboard?slack_error=true`);
  }

  const res = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: `${APP_URL}/api/slack/callback`,
    }),
  });

  const data = await res.json();

  console.log("[slack/callback] oauth.v2.access response:", JSON.stringify(data).slice(0, 200));

  if (!data.ok || !data.authed_user?.access_token) {
    console.error("[slack/callback] OAuth failed:", data.error, "| full:", JSON.stringify(data));
    return NextResponse.redirect(`${APP_URL}/dashboard?slack_error=true`);
  }

  saveToken(state, "slack", data.authed_user.access_token);
  console.log("[slack/callback] token saved for", state);
  return NextResponse.redirect(`${APP_URL}/dashboard?slack_connected=true`);
}
