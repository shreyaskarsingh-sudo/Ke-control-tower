import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const JIRA_BASE_URL = process.env.JIRA_BASE_URL!;
const JIRA_EMAIL = process.env.JIRA_EMAIL!;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN!;

function jiraAuth() {
  return Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
}

async function jiraFetch(path: string, init?: RequestInit) {
  return fetch(`${JIRA_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Basic ${jiraAuth()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

// Find the "Done" transition ID for a given issue
async function getDoneTransitionId(jiraKey: string): Promise<string | null> {
  const res = await jiraFetch(`/rest/api/3/issue/${jiraKey}/transitions`);
  if (!res.ok) return null;
  const data = await res.json();
  const transitions = (data.transitions as { id: string; name: string; to?: { statusCategory?: { key: string } } }[]) || [];
  // Look for transition that moves to "Done" status category
  const done = transitions.find(
    (t) =>
      t.to?.statusCategory?.key === "done" ||
      t.name.toLowerCase() === "done" ||
      t.name.toLowerCase() === "close" ||
      t.name.toLowerCase() === "closed" ||
      t.name.toLowerCase() === "resolve" ||
      t.name.toLowerCase() === "resolved"
  );
  return done?.id ?? null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jiraKey, assigneeEmail } = await request.json();
  if (!jiraKey) return NextResponse.json({ error: "jiraKey required" }, { status: 400 });

  // Only allow if the ticket is assigned to the requesting user
  if (assigneeEmail && assigneeEmail !== session.email) {
    return NextResponse.json({ error: "Ticket not assigned to you" }, { status: 403 });
  }

  const transitionId = await getDoneTransitionId(jiraKey);
  if (!transitionId) {
    return NextResponse.json({ error: "No 'Done' transition found for this ticket" }, { status: 422 });
  }

  const res = await jiraFetch(`/rest/api/3/issue/${jiraKey}/transitions`, {
    method: "POST",
    body: JSON.stringify({ transition: { id: transitionId } }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("Jira transition error:", res.status, text);
    return NextResponse.json({ error: `Jira API ${res.status}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, jiraKey, transitionId });
}
