import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'
import { differenceInDays } from 'date-fns'

const router = new Hono()

const BASE = process.env.JIRA_BASE_URL!
const EMAIL = process.env.JIRA_EMAIL!
const TOKEN = process.env.JIRA_API_TOKEN!
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

function auth() {
  return 'Basic ' + Buffer.from(`${EMAIL}:${TOKEN}`).toString('base64')
}

async function jiraFetch(path: string, init?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: auth(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })
}

async function jiraFetchAll(jql: string, fields: string): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = []
  let nextPageToken = ''
  let isLast = false
  do {
    const tokenParam = nextPageToken ? `&nextPageToken=${encodeURIComponent(nextPageToken)}` : ''
    const path = `/rest/api/3/search/jql?jql=${encodeURIComponent(jql)}&maxResults=100&fields=${fields}${tokenParam}`
    const res = await jiraFetch(path)
    if (!res.ok) throw new Error(`Jira ${res.status}: ${path}`)
    const data = await res.json()
    all.push(...((data.issues ?? []) as Record<string, unknown>[]))
    isLast = data.isLast ?? true
    nextPageToken = (data.nextPageToken as string) ?? ''
  } while (!isLast && nextPageToken)
  return all
}

function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as Record<string, unknown>
  if (n.type === 'text') return (n.text as string) || ''
  if (n.type === 'hardBreak' || n.type === 'rule') return '\n'
  if (n.type === 'mention') return `@${(n.attrs as Record<string, string>)?.text ?? ''}`
  const children = (n.content as unknown[]) ?? []
  let text = children.map(adfToText).join('')
  if (['paragraph', 'heading', 'blockquote'].includes(n.type as string)) text += '\n'
  if (n.type === 'listItem') text = '• ' + text
  return text
}

const CATEGORY_WORDS = new Set([
  'adonc', 'case', 'cases', 'increase', 'increased', 'error', 'failure', 'issue',
  'priority', 'custom', 'checkout', 'payment', 'refund', 'manual', 'warning',
  'critical', 'infra', 'post', 'order', 'orders', 'request', 'reg', 'on', 'for',
  'failed', 'failing', 'not', 'incorrect', 'auto', 'spike', 'spiked', 'latency',
])

function looksLikeMerchant(segment: string): boolean {
  const s = segment.trim()
  if (!s || s.length < 2 || s.length > 45) return false
  if (/^\d/.test(s)) return false
  if (/^\[/.test(s)) return false
  const words = s.toLowerCase().split(/\s+/)
  const hasCategoryWord = words.some((w) => CATEGORY_WORDS.has(w))
  if (hasCategoryWord && words.length <= 4) return false
  return true
}

function extractMerchant(summary: string, labels: string[]): string {
  const arrowMatch = summary.match(/^(.+?)\s*<>/)
  if (arrowMatch) {
    const c = arrowMatch[1].trim()
    if (looksLikeMerchant(c)) return c
  }
  if (summary.includes('|')) {
    const parts = summary.split('|').map((p) => p.trim())
    const first = parts[0]
    if (looksLikeMerchant(first) && first.split(' ').length <= 3 && first.length < 25) return first
    const candidates = parts.filter(looksLikeMerchant)
    if (candidates.length > 0) return candidates[candidates.length - 1]
  }
  const startDash = summary.match(/^([A-Za-z][a-zA-Z0-9\s.&']{1,28}?)\s+-\s+\S/)
  if (startDash && looksLikeMerchant(startDash[1])) return startDash[1].trim()
  const endDash = summary.match(/\s+-\s+([A-Za-z][a-zA-Z0-9\s.&']{1,28}?)\s*$/)
  if (endDash && looksLikeMerchant(endDash[1])) return endDash[1].trim()
  if (labels.length > 0) return labels[0]
  return 'Unknown Merchant'
}

const FIELDS = 'summary,status,priority,assignee,reporter,updated,created,comment,labels,description,watches'

function mapJiraStatus(jiraStatus: string): 'open' | 'pending_reply' | 'closed' | 'sla_breached' {
  const s = jiraStatus.toLowerCase()
  if (s === 'done' || s === 'closed' || s === 'resolved' || s === "won't fix") return 'closed'
  if (s.includes('sla') || s.includes('breach')) return 'sla_breached'
  if (s.includes('wait') || s.includes('pending') || s === 'new' || s.includes('hold')) return 'pending_reply'
  return 'open'
}

// GET /api/jira/issues
router.get('/api/jira/issues', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const view = c.req.query('view') ?? 'my-queue'

  const jql =
    view === 'team'
      ? `(issuekey in issuesWhereUserCommented() OR watcher = "${email}") AND assignee != "${email}" AND reporter != "${email}" AND statusCategory != Done ORDER BY updated DESC`
      : `(assignee = "${email}" OR reporter = "${email}") AND statusCategory != Done ORDER BY updated ASC`

  try {
    const rawIssues = await jiraFetchAll(jql, FIELDS)

    type RawIssue = { key: string; fields: Record<string, unknown> }
    const issues = (rawIssues as RawIssue[]).map((issue) => {
      const fields = issue.fields
      const reporter = fields.reporter as { emailAddress?: string; displayName?: string } | null
      const assignee = fields.assignee as { emailAddress?: string; displayName?: string } | null
      const reporterEmail = reporter?.emailAddress ?? ''
      const assigneeEmail = assignee?.emailAddress ?? ''
      const isReported = reporterEmail === email && assigneeEmail !== email
      const isTeamItem = view === 'team'

      const updatedAt = fields.updated as string
      const createdAt = fields.created as string
      const daysSinceUpdate = differenceInDays(new Date(), new Date(updatedAt))
      const daysOpen = differenceInDays(new Date(), new Date(createdAt))
      const labels = (fields.labels as string[]) ?? []

      type RawComment = { author: { displayName: string; emailAddress: string }; body: unknown; created: string }
      const rawComments: RawComment[] = (fields.comment as { comments: RawComment[] })?.comments ?? []
      const comments = rawComments.map((cm) => ({
        author: cm.author?.displayName ?? 'Unknown',
        authorEmail: cm.author?.emailAddress ?? '',
        body: adfToText(cm.body).trim(),
        created: cm.created,
      }))

      const lastComment = comments[comments.length - 1]
      const lastCommentByCSM = rawComments[rawComments.length - 1]?.author?.emailAddress?.endsWith('@gokwik.co') ?? false
      const waitingOnCSM = !lastCommentByCSM && rawComments.length > 0
      const slaBreached = waitingOnCSM && daysSinceUpdate >= 2

      const jiraPriority = (fields.priority as { name: string } | null)?.name?.toLowerCase() ?? 'medium'
      let urgency: 'critical' | 'high' | 'medium' | 'low' = 'medium'
      if (slaBreached || jiraPriority === 'highest' || jiraPriority === 'critical') urgency = 'critical'
      else if (jiraPriority === 'high' || (waitingOnCSM && daysSinceUpdate >= 1) || daysSinceUpdate >= 7) urgency = 'high'
      else if (daysSinceUpdate >= 3 || waitingOnCSM) urgency = 'medium'
      else urgency = 'low'

      const summary = fields.summary as string
      const description = adfToText(fields.description).trim()
      const snippet = lastComment
        ? `${lastComment.author}: ${lastComment.body.slice(0, 120)}`
        : description.slice(0, 120) || 'No comments yet'

      const rawStatus = (fields.status as { name: string }).name
      const mappedStatus = slaBreached ? 'sla_breached' : mapJiraStatus(rawStatus)

      return {
        id: issue.key,
        source: 'jira',
        jiraKey: issue.key,
        jiraUrl: `${BASE}/browse/${issue.key}`,
        subject: summary,
        merchantName: extractMerchant(summary, labels),
        description: description.slice(0, 3000),
        comments,
        status: mappedStatus,
        jiraStatus: rawStatus,
        priority: urgency,
        jiraPriority: (fields.priority as { name: string } | null)?.name ?? 'Medium',
        assignee: assignee?.displayName ?? null,
        assigneeEmail,
        reporterName: reporter?.displayName ?? null,
        reporterEmail,
        createdAt,
        updatedAt,
        daysOpen,
        daysSinceUpdate,
        waitingOnCSM,
        lastCommentByCSM,
        messageCount: comments.length,
        labels,
        snippet,
        lastMessageAt: lastComment?.created ?? updatedAt,
        needsAction: waitingOnCSM || daysSinceUpdate >= 3,
        isRead: false,
        isReported,
        isTeamItem,
        waitingSince: createdAt,
      }
    })

    issues.sort((a, b) => {
      if (a.waitingOnCSM && !b.waitingOnCSM) return -1
      if (!a.waitingOnCSM && b.waitingOnCSM) return 1
      return b.daysSinceUpdate - a.daysSinceUpdate
    })

    return c.json({ issues, total: issues.length })
  } catch (err) {
    console.error('Jira fetch error:', err)
    return c.json({ error: 'Jira fetch failed' }, 500)
  }
})

// POST /api/jira/comment
router.post('/api/jira/comment', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const { jiraKey, message } = await c.req.json()
  try {
    const res = await jiraFetch(`/rest/api/3/issue/${jiraKey}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: message }] }] },
      }),
    })
    if (!res.ok) throw new Error(`Jira API ${res.status}`)
    return c.json({ status: 'comment_added' })
  } catch (err) {
    console.error('Jira comment error:', err)
    return c.json({ error: 'Comment failed' }, 500)
  }
})

// POST /api/jira/transition
router.post('/api/jira/transition', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const { jiraKey, assigneeEmail } = await c.req.json()
  if (!jiraKey) return c.json({ error: 'jiraKey required' }, 400)

  if (assigneeEmail && assigneeEmail !== email) {
    return c.json({ error: 'Ticket not assigned to you' }, 403)
  }

  // Find "Done" transition
  const transRes = await jiraFetch(`/rest/api/3/issue/${jiraKey}/transitions`)
  if (!transRes.ok) return c.json({ error: 'No Done transition found' }, 422)
  const transData = await transRes.json()
  const transitions = (transData.transitions as { id: string; name: string; to?: { statusCategory?: { key: string } } }[]) || []
  const done = transitions.find(
    (t) =>
      t.to?.statusCategory?.key === 'done' ||
      t.name.toLowerCase() === 'done' ||
      t.name.toLowerCase() === 'close' ||
      t.name.toLowerCase() === 'closed' ||
      t.name.toLowerCase() === 'resolve' ||
      t.name.toLowerCase() === 'resolved'
  )
  if (!done) return c.json({ error: "No 'Done' transition found for this ticket" }, 422)

  const res = await jiraFetch(`/rest/api/3/issue/${jiraKey}/transitions`, {
    method: 'POST',
    body: JSON.stringify({ transition: { id: done.id } }),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    console.error('Jira transition error:', res.status, text)
    return c.json({ error: `Jira API ${res.status}` }, 500)
  }

  return c.json({ ok: true, jiraKey, transitionId: done.id })
})

// POST /api/jira/ask-update
router.post('/api/jira/ask-update', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const { jiraKey, summary, daysSinceUpdate, daysOpen, lastComment } = await c.req.json()

  const prompt = `You are a GoKwik CSM asking for an update on a merchant ticket.

Ticket: ${jiraKey} — ${summary}
Days open: ${daysOpen}
Days since last update: ${daysSinceUpdate}
Last comment: ${lastComment ?? 'None'}

Write a brief, professional follow-up comment asking for a status update.
Keep it under 3 sentences. Be polite and specific to the ticket context.
Write ONLY the comment text, nothing else.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    })
    const draft = msg.content[0].type === 'text' ? msg.content[0].text : ''

    const res = await jiraFetch(`/rest/api/3/issue/${jiraKey}/comment`, {
      method: 'POST',
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [{ type: 'paragraph', content: [{ type: 'text', text: draft }] }],
        },
      }),
    })

    if (!res.ok) throw new Error(`Jira ${res.status}`)
    return c.json({ status: 'posted', comment: draft })
  } catch (err) {
    console.error('Ask update error:', err)
    return c.json({ error: 'Failed' }, 500)
  }
})

export default router
