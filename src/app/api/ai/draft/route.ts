import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSession } from "@/lib/session";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { merchantName, subject, snippet, source, tone, instruction, gmailThread } = await request.json();

  const toneInstructions: Record<string, string> = {
    formal: "Use formal, professional language. Address them respectfully. Be concise and precise.",
    empathetic: "Be warm and empathetic. Acknowledge their frustration or concern. Show you understand the impact.",
    technical: "Be technical and precise. Use industry terms where appropriate. Focus on diagnosis and resolution steps.",
  };

  const sourceContext: Record<string, string> = {
    gmail: "This is an email reply.",
    slack: "This is a Slack message — keep it conversational and relatively brief.",
    jira: "This is a Jira comment — be factual and include any action items clearly.",
  };

  const systemPrompt = `You are a GoKwik Customer Success Manager writing a reply to a merchant escalation.
GoKwik is an Indian e-commerce technology company that helps merchants improve checkout conversion, reduce RTO (Return-to-Origin), and optimize COD (Cash on Delivery) performance.
${toneInstructions[tone] ?? toneInstructions.empathetic}
${sourceContext[source] ?? ""}
${instruction ? `Additional instruction: ${instruction}` : ""}
Write ONLY the reply message body. No subject line, no metadata. Start directly.`;

  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: "user", content: gmailThread
        ? `Merchant: ${merchantName}\nSubject: ${subject}\n\nFull email thread:\n${gmailThread}\n\nWrite a reply to the latest message.`
        : `Merchant: ${merchantName}\nSubject: ${subject}\nLast message: ${snippet}\n\nWrite a reply.`
      }],
    });

    const draft = message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ draft });
  } catch (err) {
    console.error("Anthropic error:", err);
    return NextResponse.json({ error: "AI draft failed" }, { status: 500 });
  }
}
