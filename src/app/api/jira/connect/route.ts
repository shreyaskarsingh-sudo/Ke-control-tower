import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { saveToken, hasToken, removeToken } from "@/lib/token-store";

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ connected: hasToken(session.email, "jira") });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { apiToken } = await request.json();
  if (!apiToken?.trim()) {
    return NextResponse.json({ error: "API token is required" }, { status: 400 });
  }

  const auth = Buffer.from(`${session.email}:${apiToken.trim()}`).toString("base64");
  const verifyRes = await fetch(`${JIRA_BASE_URL}/rest/api/3/myself`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
  });

  if (!verifyRes.ok) {
    return NextResponse.json(
      { error: "Token verification failed. Make sure your Atlassian account email matches your login email and the API token is valid." },
      { status: 400 }
    );
  }

  const me = await verifyRes.json();
  saveToken(session.email, "jira", apiToken.trim());
  return NextResponse.json({ connected: true, displayName: me.displayName });
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  removeToken(session.email, "jira");
  return NextResponse.json({ disconnected: true });
}
