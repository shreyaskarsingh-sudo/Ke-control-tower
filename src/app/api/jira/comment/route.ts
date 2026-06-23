import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

const JIRA_BASE_URL = process.env.JIRA_BASE_URL;
const JIRA_EMAIL = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

function jiraAuth() {
  return Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString("base64");
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jiraKey, message } = await request.json();

  try {
    const res = await fetch(`${JIRA_BASE_URL}/rest/api/3/issue/${jiraKey}/comment`, {
      method: "POST",
      headers: { Authorization: `Basic ${jiraAuth()}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: message }] }] },
      }),
    });
    if (!res.ok) throw new Error(`Jira API ${res.status}`);
    return NextResponse.json({ status: "comment_added" });
  } catch (err) {
    console.error("Jira comment error:", err);
    return NextResponse.json({ error: "Comment failed" }, { status: 500 });
  }
}
