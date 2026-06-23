import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gmailFetch } from "@/lib/gmail-client";
import { hasToken } from "@/lib/token-store";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasToken(session.email, "gmail")) {
    return NextResponse.json({ error: "Gmail not connected" }, { status: 400 });
  }

  const { threadId } = await request.json();
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  try {
    const res = await gmailFetch(session.email, `/threads/${threadId}/modify`, {
      method: "POST",
      body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message ?? `Mark read failed ${res.status}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[gmail/mark-read] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
