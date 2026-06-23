import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { hasToken } from "@/lib/token-store";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ connected: false }, { status: 401 });
  return NextResponse.json({ connected: hasToken(session.email, "slack") });
}
