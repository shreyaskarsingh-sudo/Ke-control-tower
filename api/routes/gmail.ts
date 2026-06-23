import { Hono } from 'hono'
import { differenceInDays, differenceInHours } from 'date-fns'
import { gmailFetch } from '../../src/lib/gmail-client'
import { hasToken } from '../../src/lib/token-store'

const router = new Hono()

function getHeader(headers: { name: string; value: string }[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return ''
  }
}

function extractText(payload: Record<string, unknown>): string {
  const mimeType = (payload.mimeType as string) ?? ''
  const body = payload.body as { data?: string; size?: number }
  if (mimeType === 'text/plain' && body?.data) return decodeBase64(body.data)
  if (mimeType === 'text/html' && body?.data) {
    return decodeBase64(body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  }
  const parts = (payload.parts as Record<string, unknown>[]) ?? []
  for (const part of parts) {
    if ((part.mimeType as string) === 'text/plain') {
      const text = extractText(part)
      if (text) return text
    }
  }
  for (const part of parts) {
    const text = extractText(part)
    if (text) return text
  }
  return ''
}

// GET /api/gmail/status
router.get('/api/gmail/status', (c) => {
  const email = c.get('userEmail')
  const connected = hasToken(email, 'gmail') ||
    !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET)
  return c.json({ connected })
})

// GET /api/gmail/threads
router.get('/api/gmail/threads', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  if (!hasToken(email, 'gmail')) {
    return c.json({ threads: [], connected: false })
  }

  try {
    const listRes = await gmailFetch(email, '/threads?q=in:inbox is:unread -from:me newer_than:14d&maxResults=30')
    if (!listRes.ok) throw new Error(`Gmail list ${listRes.status}`)
    const list = await listRes.json()

    const rawThreads: { id: string }[] = list.threads ?? []
    if (rawThreads.length === 0) return c.json({ threads: [], connected: true })

    const threadDetails = await Promise.allSettled(
      rawThreads.map((t) =>
        gmailFetch(
          email,
          `/threads/${t.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`
        ).then((r) => r.json())
      )
    )

    const threads = threadDetails
      .filter((r) => r.status === 'fulfilled')
      .map((r) => (r as PromiseFulfilledResult<Record<string, unknown>>).value)
      .map((thread) => {
        const messages = (thread.messages as Record<string, unknown>[]) ?? []
        if (messages.length === 0) return null
        const firstMsg = messages[0]
        const lastMsg = messages[messages.length - 1]
        const headers = (firstMsg.payload as Record<string, unknown>)?.headers as { name: string; value: string }[] ?? []
        const lastHeaders = (lastMsg.payload as Record<string, unknown>)?.headers as { name: string; value: string }[] ?? []
        const subject = getHeader(headers, 'Subject') || '(no subject)'
        const from = getHeader(headers, 'From')
        const lastFrom = getHeader(lastHeaders, 'From')
        const dateStr = getHeader(lastHeaders, 'Date')
        const lastMessageAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString()
        const createdAt = getHeader(headers, 'Date') ? new Date(getHeader(headers, 'Date')).toISOString() : lastMessageAt
        const fromMatch = from.match(/^(.*?)\s*<(.+?)>$/) ?? [null, from, from]
        const fromName = fromMatch[1]?.replace(/"/g, '').trim() || from
        const fromEmail = fromMatch[2]?.trim() || from
        const domain = fromEmail.includes('@') ? fromEmail.split('@')[1].split('.')[0] : fromName
        const merchantName = fromName !== fromEmail ? fromName : domain
        const lastFromExternal = !lastFrom.includes('@gokwik.co') && !lastFrom.includes(email)
        const daysSinceUpdate = differenceInDays(new Date(), new Date(lastMessageAt))
        const hoursSinceUpdate = differenceInHours(new Date(), new Date(lastMessageAt))
        const slaBreached = lastFromExternal && daysSinceUpdate >= 2
        let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium'
        if (slaBreached) priority = 'critical'
        else if (hoursSinceUpdate >= 8) priority = 'high'
        else if (hoursSinceUpdate >= 4) priority = 'medium'
        else priority = 'low'
        const snippet = (thread.snippet as string ?? '').slice(0, 150)
        return {
          id: `gmail_${thread.id}`,
          source: 'gmail',
          threadId: thread.id as string,
          subject,
          merchantName,
          from: fromName,
          fromEmail,
          snippet,
          status: slaBreached ? 'sla_breached' : lastFromExternal ? 'pending_reply' : 'open',
          priority,
          createdAt,
          updatedAt: lastMessageAt,
          lastMessageAt,
          messageCount: messages.length,
          waitingSince: lastFromExternal ? lastMessageAt : undefined,
          daysSinceUpdate,
          waitingOnCSM: lastFromExternal,
          isRead: false,
          needsAction: lastFromExternal,
        }
      })
      .filter(Boolean)

    return c.json({ threads, connected: true })
  } catch (err) {
    console.error('[gmail/threads] error:', err)
    return c.json({ threads: [], error: String(err), connected: true })
  }
})

// GET /api/gmail/thread
router.get('/api/gmail/thread', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  if (!hasToken(email, 'gmail')) {
    return c.json({ error: 'Gmail not connected' }, 400)
  }

  const threadId = c.req.query('threadId')
  if (!threadId) return c.json({ error: 'threadId required' }, 400)

  try {
    const res = await gmailFetch(email, `/threads/${threadId}?format=full`)
    if (!res.ok) throw new Error(`Gmail thread fetch ${res.status}`)
    const thread = await res.json()
    const messages = (thread.messages as Record<string, unknown>[]) ?? []
    const parsed = messages.map((msg) => {
      const payload = msg.payload as Record<string, unknown>
      const headers = (payload?.headers as { name: string; value: string }[]) ?? []
      const from = getHeader(headers, 'From')
      const to = getHeader(headers, 'To')
      const date = getHeader(headers, 'Date')
      const subject = getHeader(headers, 'Subject')
      const body = extractText(payload)
      const internalDate = (msg.internalDate as string) ?? ''
      return {
        id: msg.id as string,
        from,
        to,
        date,
        subject,
        body: body.slice(0, 3000),
        timestamp: internalDate ? new Date(parseInt(internalDate)).toISOString() : date,
      }
    })
    return c.json({ messages: parsed })
  } catch (err) {
    console.error('[gmail/thread] error:', err)
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/gmail/send
router.post('/api/gmail/send', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const { threadId, message, asDraft, to, subject, inReplyTo } = await c.req.json()

  function makeRfc2822(from: string, toAddr: string, subj: string, body: string, tId?: string, replyTo?: string): string {
    const lines = [
      `From: ${from}`,
      `To: ${toAddr}`,
      `Subject: ${subj.startsWith('Re:') ? subj : `Re: ${subj}`}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=utf-8',
      'Content-Transfer-Encoding: quoted-printable',
      ...(replyTo ? [`In-Reply-To: ${replyTo}`, `References: ${replyTo}`] : []),
      '',
      body,
    ]
    return lines.join('\r\n')
  }

  const rawMessage = makeRfc2822(email, to ?? '', subject ?? '(no subject)', message, threadId, inReplyTo)
  const encoded = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  try {
    if (asDraft) {
      const res = await gmailFetch(email, '/drafts', {
        method: 'POST',
        body: JSON.stringify({ message: { raw: encoded, ...(threadId ? { threadId } : {}) } }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message ?? `Draft failed ${res.status}`)
      }
      return c.json({ ok: true, type: 'draft' })
    } else {
      const res = await gmailFetch(email, '/messages/send', {
        method: 'POST',
        body: JSON.stringify({ raw: encoded, ...(threadId ? { threadId } : {}) }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message ?? `Send failed ${res.status}`)
      }
      return c.json({ ok: true, type: 'sent' })
    }
  } catch (err) {
    console.error('[gmail/send] error:', err)
    return c.json({ error: String(err) }, 500)
  }
})

// POST /api/gmail/mark-read
router.post('/api/gmail/mark-read', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  if (!hasToken(email, 'gmail')) {
    return c.json({ error: 'Gmail not connected' }, 400)
  }

  const { threadId } = await c.req.json()
  if (!threadId) return c.json({ error: 'threadId required' }, 400)

  try {
    const res = await gmailFetch(email, `/threads/${threadId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    })
    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error?.message ?? `Mark read failed ${res.status}`)
    }
    return c.json({ ok: true })
  } catch (err) {
    console.error('[gmail/mark-read] error:', err)
    return c.json({ error: String(err) }, 500)
  }
})

export default router
