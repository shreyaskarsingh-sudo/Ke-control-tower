import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'

const router = new Hono()

function getPeriskopeKey() { return process.env.PERISKOPE_API_KEY ?? '' }
function getPhones() { return [process.env.PERISKOPE_PHONE_1, process.env.PERISKOPE_PHONE_2].filter(Boolean) as string[] }
function getAnthropic() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }) }

async function periRequest(path: string, phone: string, params: Record<string, string> = {}) {
  const url = new URL(`https://api.periskope.app/v1${path}`)
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${getPeriskopeKey()}`,
      'x-phone': phone,
      'Content-Type': 'application/json',
    },
  })
  if (!res.ok) throw new Error(`Periskope ${res.status} on ${path}`)
  return res.json()
}

function getChatStatus(chat: Record<string, unknown>): string {
  const msg = chat.latest_message as Record<string, unknown> | null
  if (!msg) return 'empty'
  const msgUnread = (chat.message_unread_count as number) || 0
  if (msg.from_me || msg.fromMe) return 'responded'
  if (msgUnread > 0) return 'pending'
  return 'closed'
}

function tsToMs(ts?: number | string): number {
  if (!ts) return 0
  if (typeof ts === 'string') {
    const ms = new Date(ts).getTime()
    return isNaN(ms) ? 0 : ms
  }
  return ts > 1e10 ? ts : ts * 1000
}

// GET /api/periskope/chats
router.get('/api/periskope/chats', async (c) => {
  const userEmail = c.get('userEmail')

  if (!getPeriskopeKey()) {
    return c.json({ error: 'PERISKOPE_API_KEY not configured' }, 503)
  }

  const filterMine = c.req.query('filter_mine') === 'true'
  const userPhone = c.req.query('user_phone')
  const phoneId = userPhone ? userPhone.replace(/[^0-9]/g, '') + '@c.us' : null

  try {
    const results = await Promise.allSettled(
      PHONES.map((phone) =>
        periRequest('/chats', phone, {
          chat_type: 'group',
          limit: '2000',
          sort_by: 'latest_message_timestamp',
          sort_order: 'desc',
        })
      )
    )

    const chatMap = new Map<string, Record<string, unknown>>()
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        ((r.value as Record<string, unknown>).chats as Record<string, unknown>[] || []).forEach((chat) => {
          const id = chat.chat_id as string
          if (!chatMap.has(id)) {
            chatMap.set(id, {
              ...chat,
              status: getChatStatus(chat),
            })
          }
        })
      }
    })

    let chats = Array.from(chatMap.values())

    if (filterMine && userEmail) {
      chats = chats.filter((c) => (c.assigned_to as string | null) === userEmail)
    }

    if (phoneId) {
      chats = chats.map((c) => {
        const ids = ((c.latest_message as Record<string, unknown>)?.mentioned_ids as string[]) || []
        return { ...c, user_mentioned: ids.includes(phoneId) }
      })
    }

    return c.json({ ok: true, chats, total_org: chatMap.size })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

// GET /api/periskope/chats/:id/messages
router.get('/api/periskope/chats/:id/messages', async (c) => {
  const id = c.req.param('id')
  const chatId = decodeURIComponent(id)

  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000

  for (const phone of PHONES) {
    try {
      const url = new URL(`https://api.periskope.app/v1/chats/${encodeURIComponent(chatId)}/messages`)
      url.searchParams.set('limit', '100')
      url.searchParams.set('sort_order', 'desc')
      const res = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${getPeriskopeKey()}`,
          'x-phone': phone,
        },
      })
      if (!res.ok) continue
      const data = await res.json()
      const allMsgs = ((data as Record<string, unknown>).messages as Record<string, unknown>[]) || []
      const filtered = allMsgs
        .filter((m) => {
          const ts = m.timestamp as number | string | undefined
          if (!ts) return true
          const ms = typeof ts === 'string' ? new Date(ts).getTime() : ts > 1e10 ? ts : ts * 1000
          return isNaN(ms) || ms >= cutoff
        })
        .map((m) => {
          const raw = m as Record<string, unknown>

          // Periskope uses from_me (snake_case) — normalize to fromMe for the UI
          const fromMe = !!(raw.from_me ?? raw.fromMe)

          // Periskope puts the sender's phone in sender_phone (e.g. "917703871917@c.us")
          const senderPhoneRaw = raw.sender_phone as string | undefined
          const senderPhone = senderPhoneRaw ? senderPhoneRaw.replace(/@.*$/, '') : null
          // Format as +91 XXXXX XXXXX for Indian numbers
          const formattedPhone = senderPhone
            ? senderPhone.startsWith('91') && senderPhone.length === 12
              ? `+91 ${senderPhone.slice(2, 7)} ${senderPhone.slice(7)}`
              : `+${senderPhone}`
            : null

          const displayName = formattedPhone || null

          return { ...raw, sender_name: displayName, fromMe }
        })
      return c.json({ ...(data as object), messages: filtered, total_fetched: allMsgs.length })
    } catch { /* try next phone */ }
  }

  return c.json({ error: 'Chat not found on any phone' }, 404)
})

// POST /api/periskope/analyze
router.post('/api/periskope/analyze', async (c) => {
  const { chatId, chatName } = await c.req.json()
  if (!chatId) return c.json({ error: 'chatId required' }, 400)

  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000
  const cutoff = Date.now() - thirtyDaysMs

  async function fetchMessages(id: string): Promise<Record<string, unknown>[]> {
    for (const phone of PHONES) {
      try {
        const url = new URL(`https://api.periskope.app/v1/chats/${encodeURIComponent(id)}/messages`)
        url.searchParams.set('limit', '100')
        url.searchParams.set('sort_order', 'desc')
        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${getPeriskopeKey()}`, 'x-phone': phone },
        })
        if (!res.ok) continue
        const data = await res.json()
        return (data.messages as Record<string, unknown>[]) || []
      } catch { /* try next */ }
    }
    return []
  }

  const rawMessages = await fetchMessages(chatId)
  const recent = rawMessages
    .filter((m) => tsToMs(m.timestamp as number | string) >= cutoff)
    .slice(0, 80)

  if (!recent.length) {
    return c.json({ analysis: 'No messages found in the last 30 days for this group.' })
  }

  const transcript = recent
    .slice()
    .reverse()
    .map((m) => {
      const sender = (m.fromMe ? 'Agent' : (m.sender_name as string) || 'Customer') as string
      const body = ((m.body as string) || '').replace(/\n+/g, ' ').substring(0, 300)
      return `[${sender}]: ${body}`
    })
    .join('\n')

  const prompt = `You are analyzing a WhatsApp business group chat for a Customer Success Manager at GoKwik.

Group name: ${chatName || chatId}
Messages (last 30 days, oldest first):

${transcript}

Provide a concise analysis in the following structure:

**Current Status**
One sentence on what is happening right now in this group.

**Key Issues / Requests**
Bullet points of the main issues, questions, or requests raised (max 5 bullets).

**Action Items**
What the CSM needs to do or follow up on (max 4 bullets).

**Sentiment**
Overall sentiment: Positive / Neutral / Needs Attention — with a one-line reason.

Keep the analysis factual, brief, and actionable. Do not speculate beyond what the messages say.`

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    })
    const text = (response.content[0] as { type: string; text: string }).text || ''
    return c.json({ analysis: text, message_count: recent.length })
  } catch (err) {
    console.error('Anthropic error:', err)
    return c.json({ error: 'Analysis failed' }, 500)
  }
})

// POST /api/periskope/digest
router.post('/api/periskope/digest', async (c) => {
  const userEmail = c.get('userEmail')

  const body = await c.req.json().catch(() => ({}))
  const userPhone = (body.user_phone as string | undefined)?.replace(/[^0-9]/g, '') || null
  const phoneId = userPhone ? `${userPhone}@c.us` : null

  const results = await Promise.allSettled(
    PHONES.map((phone) =>
      periRequest('/chats', phone, {
        chat_type: 'group',
        limit: '500',
        sort_by: 'latest_message_timestamp',
        sort_order: 'desc',
      })
    )
  )

  const chatMap = new Map<string, Record<string, unknown>>()
  results.forEach((r) => {
    if (r.status === 'fulfilled') {
      ((r.value as Record<string, unknown>).chats as Record<string, unknown>[] || []).forEach((ch) => {
        const id = ch.chat_id as string
        if (!chatMap.has(id)) chatMap.set(id, { ...ch, status: getChatStatus(ch) })
      })
    }
  })

  const allChats = Array.from(chatMap.values())

  // 1. Assigned groups (strict — email match only)
  const assigned = allChats.filter((ch) => (ch.assigned_to as string | null) === userEmail)

  // 2. Mention groups (phone-based, exclude already-assigned)
  const assignedIds = new Set(assigned.map((ch) => ch.chat_id as string))
  const mentionGroups = phoneId
    ? allChats.filter((ch) => {
        if (assignedIds.has(ch.chat_id as string)) return false
        const ids = ((ch.latest_message as Record<string, unknown>)?.mentioned_ids as string[]) || []
        return ids.includes(phoneId)
      })
    : []

  const pendingAssigned = assigned.filter((ch) => ch.status === 'pending')
  const pendingMentions = mentionGroups.filter((ch) => ch.status === 'pending' || (ch.message_unread_count as number) > 0)

  async function fetchGroupMessages(chatId: string): Promise<Record<string, unknown>[]> {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
    for (const phone of PHONES) {
      try {
        const url = new URL(`https://api.periskope.app/v1/chats/${encodeURIComponent(chatId)}/messages`)
        url.searchParams.set('limit', '30')
        url.searchParams.set('sort_order', 'desc')
        const res = await fetch(url.toString(), {
          headers: { 'Authorization': `Bearer ${getPeriskopeKey()}`, 'x-phone': phone },
        })
        if (!res.ok) continue
        const data = await res.json()
        const msgs = (data.messages as Record<string, unknown>[]) || []
        return msgs.filter((m) => tsToMs(m.timestamp as number | string) >= cutoff)
      } catch { /* try next */ }
    }
    return []
  }

  const toFetch = [
    ...pendingAssigned.slice(0, 4).map((ch) => ({ chat: ch, source: 'assigned' as const })),
    ...pendingMentions.slice(0, 2).map((ch) => ({ chat: ch, source: 'mention' as const })),
  ]

  const groupData = await Promise.allSettled(
    toFetch.map(async ({ chat, source }) => {
      const msgs = await fetchGroupMessages(chat.chat_id as string)
      return { name: chat.chat_name as string, msgs, source }
    })
  )

  const transcripts: string[] = []
  groupData.forEach((r) => {
    if (r.status !== 'fulfilled' || !r.value.msgs.length) return
    const { name, msgs, source } = r.value
    const tag = source === 'mention' ? ' [you were @mentioned]' : ''
    const lines = msgs
      .slice()
      .reverse()
      .map((m) => {
        const sender = !!(m.from_me ?? m.fromMe) ? 'You (KwikEngage)' : ((m.sender_name as string) || 'Customer')
        const body = ((m.body as string) || '').replace(/\n+/g, ' ').substring(0, 200)
        return `  [${sender}]: ${body}`
      })
      .join('\n')
    transcripts.push(`### Group: ${name}${tag}\n${lines}`)
  })

  const summary = {
    total_assigned: assigned.length,
    pending_count: pendingAssigned.length,
    mention_count: mentionGroups.length,
    groups_analyzed: transcripts.length,
  }

  if (!transcripts.length) {
    return c.json({ digest: null, ...summary })
  }

  const mentionNote = mentionGroups.length
    ? ` and ${mentionGroups.length} group${mentionGroups.length > 1 ? 's' : ''} where you were @mentioned`
    : ''

  const prompt = `You are a WhatsApp group assistant for a Customer Success Manager at GoKwik (KwikEngage).

The CSM has ${assigned.length} assigned WhatsApp groups${mentionNote}. Below are the last 7 days of messages from groups needing attention (oldest first within each group). Groups marked [you were @mentioned] are not directly assigned but require your attention.

${transcripts.join('\n\n')}

Provide a concise action-focused digest:

**Immediate Actions** (groups needing a reply NOW)
List each group that needs an immediate response with one line explaining why. Prioritise @mentioned groups. Max 5 items.

**Follow-Up Items**
Anything the CSM promised, needs to check, or should circle back on. Max 4 items.

**Insights**
Any patterns or things worth noting across these groups. 1-2 sentences max.

Be specific, direct, and actionable. Skip anything already resolved.`

  try {
    const response = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      messages: [{ role: 'user', content: prompt }],
    })
    const digest = (response.content[0] as { type: string; text: string }).text || ''
    return c.json({ digest, ...summary })
  } catch (err) {
    console.error('Anthropic digest error:', err)
    return c.json({ error: 'Analysis failed' }, 500)
  }
})

// GET /api/periskope/mentions
router.get('/api/periskope/mentions', async (c) => {
  const userEmail = c.get('userEmail')
  const userPhone = c.req.query('user_phone')
  const queryEmail = c.req.query('user_email') || userEmail

  if (!userPhone) {
    return c.json({ error: 'user_phone is required' }, 400)
  }

  const phoneId = userPhone.replace(/[^0-9]/g, '') + '@c.us'

  try {
    const results = await Promise.allSettled(
      PHONES.map((phone) =>
        periRequest('/chats', phone, {
          chat_type: 'group',
          limit: '2000',
          sort_by: 'latest_message_timestamp',
          sort_order: 'desc',
        })
      )
    )

    const chatMap = new Map<string, Record<string, unknown>>()
    results.forEach((r) => {
      if (r.status === 'fulfilled') {
        ((r.value as Record<string, unknown>).chats as Record<string, unknown>[] || []).forEach((ch) => {
          const id = ch.chat_id as string
          if (!chatMap.has(id)) chatMap.set(id, { ...ch, status: getChatStatus(ch) })
        })
      }
    })

    let chats = Array.from(chatMap.values())
    if (queryEmail) {
      chats = chats.filter((ch) => ((ch.chat_access as Record<string, boolean>) || {})[queryEmail] === true)
    }

    const mentioned: (Record<string, unknown> & { mention_messages: unknown[] })[] = []

    // Quick pass: latest_message.mentioned_ids
    chats.forEach((ch) => {
      const ids = ((ch.latest_message as Record<string, unknown>)?.mentioned_ids as string[]) || []
      if (ids.includes(phoneId)) {
        mentioned.push({ ...ch, mention_messages: [ch.latest_message] })
      }
    })

    // Deep pass: fetch messages for unread groups (cap at 30)
    const alreadyFound = new Set(mentioned.map((ch) => ch.chat_id as string))
    const toScan = chats
      .filter((ch) => (ch.message_unread_count as number) > 0 && !alreadyFound.has(ch.chat_id as string))
      .slice(0, 30)

    await Promise.allSettled(
      toScan.map(async (chat) => {
        for (const phone of PHONES) {
          try {
            const data = await periRequest(
              `/chats/${encodeURIComponent(chat.chat_id as string)}/messages`,
              phone,
              { limit: '20', sort_order: 'desc' }
            )
            const msgs = ((data as Record<string, unknown>).messages as Record<string, unknown>[] || [])
              .filter((m) => ((m.mentioned_ids as string[]) || []).includes(phoneId))
            if (msgs.length > 0) mentioned.push({ ...chat, mention_messages: msgs.slice(0, 3) })
            break
          } catch { /* try next phone */ }
        }
      })
    )

    mentioned.sort((a, b) => {
      const ta = (a.latest_message as Record<string, unknown>)?.timestamp as number
      const tb = (b.latest_message as Record<string, unknown>)?.timestamp as number
      if (!ta && !tb) return 0
      if (!ta) return 1; if (!tb) return -1
      const na = ta > 1e10 ? ta : ta * 1000
      const nb = tb > 1e10 ? tb : tb * 1000
      return nb - na
    })

    return c.json({ ok: true, mentions: mentioned, scanned: toScan.length })
  } catch (err) {
    return c.json({ error: (err as Error).message }, 500)
  }
})

export default router
