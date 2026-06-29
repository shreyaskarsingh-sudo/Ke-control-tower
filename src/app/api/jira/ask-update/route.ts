import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";
import { getToken } from "@/lib/token-store";

const BASE = process.env.JIRA_BASE_URL;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const userToken = getToken(session.email, "jira");
  if (!userToken) {
    return NextResponse.json(
      { error: "jira_not_connected", message: "Connect your personal Jira account from the dashboard to post comments." },
      { status: 403 }
    );
  }
  const authHeader = "Basic " + Buffer.from(`${session.email}:${userToken}`).toString("base64");

  const { jiraKey, summary, daysSinceUpdate, daysOpen, lastComment } = await request.json();

  // Draft follow-up comment using Claude
  const prompt = `You are a GoKwik CSM asking for an update on a merchant ticket.

Ticket: ${jiraKey} — ${summary}
Days open: ${daysOpen}
Days since last update: ${daysSinceUpdate}
Last comment: ${lastComment ?? "None"}

Write a brief, professional follow-up comment asking for a status update.
Keep it under 3 sentences. Be polite and specific to the ticket context.
Write ONLY the comment text, nothing else.`;

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    });

    const draft = msg.content[0].type === "text" ? msg.content[0].text : "";

    // Post comment to Jira
    const res = await fetch(`${BASE}/rest/api/3/issue/${jiraKey}/comment`, {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        body: {
          type: "doc",
          version: 1,
          content: [{ type: "paragraph", content: [{ type: "text", text: draft }] }],
        },
      }),
    });

    if (!res.ok) throw new Error(`Jira ${res.status}`);

    return NextResponse.json({ status: "posted", comment: draft });
  } catch (err) {
    console.error("Ask update error:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
