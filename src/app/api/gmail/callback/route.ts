import { NextResponse } from "next/server";
import { saveToken } from "@/lib/token-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state"); // CSM email
  const error = searchParams.get("error");
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL!;

  console.log("[gmail/callback] hit — code:", code ? "present" : "MISSING", "| state:", state, "| error:", error);

  if (error || !code || !state) {
    console.error("[gmail/callback] early exit:", { error, code: !!code, state });
    return NextResponse.redirect(`${APP_URL}/dashboard?gmail_error=true`);
  }

  const redirectUri = `${APP_URL}/api/gmail/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenData = await tokenRes.json();
  console.log("[gmail/callback] token exchange:", tokenData.access_token ? "OK" : "FAILED", tokenData.error ?? "");

  if (!tokenData.access_token) {
    console.error("[gmail/callback] token exchange failed:", tokenData);
    return NextResponse.redirect(`${APP_URL}/dashboard?gmail_error=true`);
  }

  // Store as JSON: { access_token, refresh_token, expiry_date }
  const tokenObj = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
  };

  saveToken(state, "gmail", JSON.stringify(tokenObj));
  console.log("[gmail/callback] Gmail token saved for", state);

  return NextResponse.redirect(`${APP_URL}/dashboard?gmail_connected=true`);
}
