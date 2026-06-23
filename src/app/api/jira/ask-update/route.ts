import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";

const BASE = process.env.JIRA_BASE_URL;
const EMAIL = process.env.JIRA_EMAIL;
const TOKEN = process.env.JIRA_API_TOKEN;
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function auth() {
  return "Basic " + Buffer.from(`${EMAIL}:${TOKEN}`).toString("base64");
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
        Authorization: auth(),
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
