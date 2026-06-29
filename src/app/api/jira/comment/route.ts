import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getToken } from "@/lib/token-store";

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userToken = getToken(session.email, "jira");
  if (!userToken) {
    return NextResponse.json(
      { error: "jira_not_connected", message: "Please connect your personal Jira account before posting comments." },
      { status: 403 }
    );
  }

  const { jiraKey, message } = await request.json();
  const auth = "Basic " + Buffer.from(`${session.email}:${userToken}`).toString("base64");

  try {
    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${jiraKey}/comment`, {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: message }] }],
        },
      }),
    });

    if (!res.ok) {
      if (res.status === 401) {
        return NextResponse.json(
          { error: "jira_auth_failed", message: "Your Jira token is invalid or expired. Please reconnect your Jira account." },
          { status: 401 }
        );
      }
      throw new Error(`Jira API ${res.status}`);
    }

    return NextResponse.json({ status: "comment_added", postedAs: session.email });
  } catch (err) {
    console.error("Jira comment error:", err);
    return NextResponse.json({ error: "Comment failed" }, { status: 500 });
  }
}
