import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gmailFetch } from "@/lib/gmail-client";

function makeRfc2822(
  from: string,
  to: string,
  subject: string,
  body: string,
  threadId?: string,
  inReplyTo?: string
): string {
  const lines = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject.startsWith("Re:") ? subject : `Re: ${subject}`}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: quoted-printable",
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    "",
    body,
  ];
  return lines.join("\r\n");
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { threadId, message, asDraft, to, subject, inReplyTo } = await request.json();

  const rawMessage = makeRfc2822(
    session.email,
    to ?? "",
    subject ?? "(no subject)",
    message,
    threadId,
    inReplyTo
  );

  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  try {
    if (asDraft) {
      const res = await gmailFetch(session.email, "/drafts", {
        method: "POST",
        body: JSON.stringify({ message: { raw: encoded, ...(threadId ? { threadId } : {}) } }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? `Draft failed ${res.status}`);
      }
      return NextResponse.json({ ok: true, type: "draft" });
    } else {
      const res = await gmailFetch(session.email, "/messages/send", {
        method: "POST",
        body: JSON.stringify({ raw: encoded, ...(threadId ? { threadId } : {}) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? `Send failed ${res.status}`);
      }
      return NextResponse.json({ ok: true, type: "sent" });
    }
  } catch (err) {
    console.error("[gmail/send] error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
