import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'

const router = new Hono()
function getClient() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }) }

// POST /api/ai/analyze
router.post('/api/ai/analyze', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const name = email
    ? email.split('@')[0].split('.').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
    : 'CSM'

  const { slackThreads = [], jiraIssues = [], gmailThreads = [] } = await c.req.json()

  const slackSummary = slackThreads.length
    ? slackThreads.map((t: Record<string, unknown>) => {
        const type = t.slackType === 'raised'
          ? 'RAISED by CSM'
          : t.slackType === 'mention'
          ? 'MENTIONED'
          : 'DM'
        return `- [SLACK/${type}] ${t.merchantName}: "${String(t.snippet).slice(0, 120)}" — waiting ${t.waitingHours}h`
      }).join('\n')
    : 'No pending Slack threads.'

  const jiraSummary = jiraIssues.length
    ? jiraIssues.map((i: Record<string, unknown>) =>
        `- [JIRA ${i.jiraKey}] ${i.subject} — ${i.daysOpen} days open, ${i.daysSinceUpdate} days no update, waiting on CSM: ${i.waitingOnCSM}`
      ).join('\n')
    : 'No pending Jira tickets.'

  const gmailSummary = gmailThreads.length
    ? gmailThreads.map((g: Record<string, unknown>) =>
        `- [EMAIL] ${g.subject} from ${g.from} — ${g.snippet?.toString().slice(0, 100)}`
      ).join('\n')
    : 'No pending Gmail threads.'

  const prompt = `You are an expert Customer Success Manager analyst for GoKwik, an Indian e-commerce technology company.

A CSM named ${name} (${email}) has the following pending items requiring their attention:

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
- Return ONLY valid JSON, no markdown`

  try {
    const msg = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: 'Analysis failed', items: [] }
    return c.json({ analysis })
  } catch (err) {
    console.error('AI analyze error:', err)
    return c.json({ error: 'Analysis failed' }, 500)
  }
})

// POST /api/ai/draft
router.post('/api/ai/draft', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const { merchantName, subject, snippet, source, tone, instruction, gmailThread } = await c.req.json()

  const toneInstructions: Record<string, string> = {
    formal: 'Use formal, professional language. Address them respectfully. Be concise and precise.',
    empathetic: 'Be warm and empathetic. Acknowledge their frustration or concern. Show you understand the impact.',
    technical: 'Be technical and precise. Use industry terms where appropriate. Focus on diagnosis and resolution steps.',
  }

  const sourceContext: Record<string, string> = {
    gmail: 'This is an email reply.',
    slack: 'This is a Slack message — keep it conversational and relatively brief.',
    jira: 'This is a Jira comment — be factual and include any action items clearly.',
  }

  const systemPrompt = `You are a GoKwik Customer Success Manager writing a reply to a merchant escalation.
GoKwik is an Indian e-commerce technology company that helps merchants improve checkout conversion, reduce RTO (Return-to-Origin), and optimize COD (Cash on Delivery) performance.
${toneInstructions[tone] ?? toneInstructions.empathetic}
${sourceContext[source] ?? ''}
${instruction ? `Additional instruction: ${instruction}` : ''}
Write ONLY the reply message body. No subject line, no metadata. Start directly.`

  try {
    const message = await getClient().messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: systemPrompt,
      messages: [{ role: 'user', content: gmailThread
        ? `Merchant: ${merchantName}\nSubject: ${subject}\n\nFull email thread:\n${gmailThread}\n\nWrite a reply to the latest message.`
        : `Merchant: ${merchantName}\nSubject: ${subject}\nLast message: ${snippet}\n\nWrite a reply.`
      }],
    })
    const draft = message.content[0].type === 'text' ? message.content[0].text : ''
    return c.json({ draft })
  } catch (err) {
    console.error('Anthropic error:', err)
    return c.json({ error: 'AI draft failed' }, 500)
  }
})

export default router
