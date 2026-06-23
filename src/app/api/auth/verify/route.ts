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
  const isHttps = process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://") ?? false;
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 hours
    path: "/",
  });

  return response;
}
