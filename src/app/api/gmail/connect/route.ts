import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

// Google OAuth works with http://localhost — no HTTPS required for localhost redirect URIs.
// Requires in .env: GOOGLE_CLIENT_SECRET + GOOGLE_CLIENT_ID
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL));

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error("[gmail/connect] Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in .env");
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard?gmail_error=missing_credentials`
    );
  }

  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose",
      "openid",
      "email",
    ].join(" "),
    access_type: "offline",   // get refresh_token
    prompt: "consent",        // force refresh_token even if already granted
    state: session.email,     // pass CSM email through state
  });

  return NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
