import { NextResponse } from "next/server";
import { createSession, COOKIE } from "@/lib/session";

export async function POST(request: Request) {
  const { credential } = await request.json();
  if (!credential) {
    return NextResponse.json({ error: "No credential" }, { status: 400 });
  }

  // Verify the Google JWT via Google's tokeninfo endpoint
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`
  );

  if (!res.ok) {
    return NextResponse.json({ error: "Invalid credential" }, { status: 401 });
  }

  const data = await res.json();

  // Domain restriction — @gokwik.co only
  if (!data.email?.endsWith("@gokwik.co")) {
    return NextResponse.json({ error: "unauthorized_domain" }, { status: 403 });
  }

  const user = {
    name: data.name ?? data.email,
    email: data.email,
    picture: data.picture ?? "",
  };

  const token = await createSession(user);

  const response = NextResponse.json({ ok: true, user });
  // Check real protocol from proxy header; fall back to request URL.
  // Never use NEXT_PUBLIC_APP_URL here — it may say https:// while nginx still
  // proxies over HTTP, causing browsers to drop the Secure cookie silently.
  const forwardedProto = (request as Request & { headers: Headers }).headers.get("x-forwarded-proto");
  const isHttps = forwardedProto === "https" || request.url.startsWith("https://");
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/",
  });

  return response;
}
