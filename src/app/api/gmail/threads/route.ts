import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { gmailFetch } from "@/lib/gmail-client";
import { hasToken } from "@/lib/token-store";
import { differenceInDays, differenceInHours } from "date-fns";

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function mapThread(thread: Record<string, unknown>, session: { email: string }) {
  const messages = (thread.messages as Record<string, unknown>[]) ?? [];
  if (messages.length === 0) return null;

  const firstMsg = messages[0];
  const lastMsg = messages[messages.length - 1];
  const headers = (firstMsg.payload as Record<string, unknown>)?.headers as { name: string; value: string }[] ?? [];
  const lastHeaders = (lastMsg.payload as Record<string, unknown>)?.headers as { name: string; value: string }[] ?? [];

  const subject = getHeader(headers, "Subject") || "(no subject)";
  const from = getHeader(headers, "From");
  const lastFrom = getHeader(lastHeaders, "From");
  const dateStr = getHeader(lastHeaders, "Date");

  const lastMessageAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();
  const createdAt = getHeader(headers, "Date") ? new Date(getHeader(headers, "Date")).toISOString() : lastMessageAt;

  const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) ?? [null, from, from];
  const fromName = fromMatch[1]?.replace(/"/g, "").trim() || from;
  const fromEmail = fromMatch[2]?.trim() || from;

  const domain = fromEmail.includes("@") ? fromEmail.split("@")[1].split(".")[0] : fromName;
  const merchantName = fromName !== fromEmail ? fromName : domain;

  const lastFromExternal = !lastFrom.includes("@gokwik.co") && !lastFrom.includes(session.email);
  const daysSinceUpdate = differenceInDays(new Date(), new Date(lastMessageAt));
  const hoursSinceUpdate = differenceInHours(new Date(), new Date(lastMessageAt));

  const slaBreached = lastFromExternal && daysSinceUpdate >= 2;
  let priority: "critical" | "high" | "medium" | "low" = "medium";
  if (slaBreached) priority = "critical";
  else if (hoursSinceUpdate >= 8) priority = "high";
  else if (hoursSinceUpdate >= 4) priority = "medium";
  else priority = "low";

  const snippet = (thread.snippet as string ?? "").slice(0, 150);

  return {
    id: `gmail_${thread.id}`,
    source: "gmail" as const,
    threadId: thread.id as string,
    subject,
    merchantName,
    from: fromName,
    fromEmail,
    snippet,
    status: (slaBreached ? "sla_breached" : lastFromExternal ? "pending_reply" : "open") as "open" | "pending_reply" | "sla_breached",
    priority,
    createdAt,
    updatedAt: lastMessageAt,
    lastMessageAt,
    messageCount: messages.length,
    waitingSince: lastFromExternal ? lastMessageAt : undefined,
    daysSinceUpdate,
    waitingOnCSM: lastFromExternal,
    isRead: false,
    needsAction: lastFromExternal,
  };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!hasToken(session.email, "gmail")) {
    return NextResponse.json({ threads: [], connected: false });
  }

  const { searchParams } = new URL(request.url);
  const inbox = searchParams.get("inbox") === "true";
  const pageToken = searchParams.get("pageToken") ?? "";

  try {
    if (inbox) {
      // All inbox: exclude promotions/updates/social/forums (analytics), 50 per page
      const q = "in:inbox -category:promotions -category:updates -category:social -category:forums";
      const qs = new URLSearchParams({ q, maxResults: "50", ...(pageToken ? { pageToken } : {}) });
      const listRes = await gmailFetch(session.email, `/threads?${qs}`);
      if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}`);
      const list = await listRes.json();

      const rawThreads: { id: string }[] = list.threads ?? [];
      const nextPageToken: string = list.nextPageToken ?? "";

      if (rawThreads.length === 0) return NextResponse.json({ threads: [], connected: true, nextPageToken: "" });

      const threadDetails = await Promise.allSettled(
        rawThreads.map((t) =>
          gmailFetch(
            session.email,
            `/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
          ).then((r) => r.json())
        )
      );

      const threads = threadDetails
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<Record<string, unknown>>).value)
        .map((thread) => mapThread(thread, session))
        .filter(Boolean);

      return NextResponse.json({ threads, connected: true, nextPageToken });
    }

    // Default (my-queue): unread, awaiting reply, last 14 days
    const listRes = await gmailFetch(
      session.email,
      `/threads?q=in:inbox is:unread -from:me newer_than:14d&maxResults=30`
    );
    if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}`);
    const list = await listRes.json();

    const rawThreads: { id: string }[] = list.threads ?? [];
    if (rawThreads.length === 0) return NextResponse.json({ threads: [], connected: true });

    const threadDetails = await Promise.allSettled(
      rawThreads.map((t) =>
        gmailFetch(
          session.email,
          `/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
        ).then((r) => r.json())
      )
    );

    const threads = threadDetails
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<Record<string, unknown>>).value)
      .map((thread) => mapThread(thread, session))
      .filter(Boolean);

    return NextResponse.json({ threads, connected: true });
  } catch (err) {
    console.error("[gmail/threads] error:", err);
    return NextResponse.json({ threads: [], error: String(err), connected: true });
  }
}
