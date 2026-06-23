import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { slackThreads = [], jiraIssues = [], gmailThreads = [] } = await request.json();

  const slackSummary = slackThreads.length
    ? slackThreads.map((t: Record<string, unknown>) => {
        const type = t.slackType === "raised"
          ? "RAISED by CSM"
          : t.slackType === "mention"
          ? "MENTIONED"
          : "DM";
        return `- [SLACK/${type}] ${t.merchantName}: "${String(t.snippet).slice(0, 120)}" — waiting ${t.waitingHours}h`;
      }).join("\n")
    : "No pending Slack threads.";

  const jiraSummary = jiraIssues.length
    ? jiraIssues.map((i: Record<string, unknown>) =>
        `- [JIRA ${i.jiraKey}] ${i.subject} — ${i.daysOpen} days open, ${i.daysSinceUpdate} days no update, waiting on CSM: ${i.waitingOnCSM}`
      ).join("\n")
    : "No pending Jira tickets.";

  const gmailSummary = gmailThreads.length
    ? gmailThreads.map((g: Record<string, unknown>) =>
        `- [EMAIL] ${g.subject} from ${g.from} — ${g.snippet?.toString().slice(0, 100)}`
      ).join("\n")
    : "No pending Gmail threads.";

  const prompt = `You are an expert Customer Success Manager analyst for GoKwik, an Indian e-commerce technology company.

A CSM named ${session.name} (${session.email}) has the following pending items requiring their attention:

SLACK PENDING:
${slackSummary}

JIRA OPEN TICKETS:
${jiraSummary}

EMAIL PENDING:
${gmailSummary}

Analyze these from a CSM perspective and return a JSON response with this exact structure:
{
  "summary": "2-3 sentence overall summary of the CSM's workload and top priorities",
  "criticalCount": <number>,
  "highCount": <number>,
  "items": [
    {
      "id": "<original item id>",
      "source": "slack|jira|gmail",
      "urgency": "critical|high|medium|low",
      "merchantName": "<name>",
      "title": "<title>",
      "reason": "<why this needs attention now — be specific>",
      "suggestedAction": "<exact next step for the CSM>",
      "waitingDays": <number>
    }
  ]
}

Rules:
- Treat ALL items as escalations/issues regardless of source — DMs, channel threads, Jira tickets, emails
- SLACK/DM: merchant or internal person waiting for CSM response
- SLACK/MENTIONED: someone tagged the CSM needing action or input
- SLACK/RAISED: CSM raised an issue in a channel (e.g. to engineering/ops/product) and received replies — CSM needs to follow up or close the loop
- JIRA: open ticket assigned to or reported by the CSM that needs action
- critical: SLA breach risk, payment/checkout issues, or waiting 8+ hours
- high: waiting 4-8 hours, important merchant, or raised issue with pending resolution
- Rank items by urgency descending
- Be specific in reason and suggestedAction — mention actual content and names
- Return ONLY valid JSON, no markdown`;

  try {
    const msg = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: prompt }],
    });

    const text = msg.content[0].type === "text" ? msg.content[0].text : "{}";

    // Parse JSON from Claude response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: "Analysis failed", items: [] };

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error("AI analyze error:", err);
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }
}
