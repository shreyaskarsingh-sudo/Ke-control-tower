import { Hono } from 'hono'
import { WebClient } from '@slack/web-api'
import { getToken } from '../../src/lib/token-store'

const router = new Hono()

function slackPriority(waitingHours: number): 'critical' | 'high' | 'medium' | 'low' {
  if (waitingHours >= 8) return 'critical'
  if (waitingHours >= 4) return 'high'
  if (waitingHours >= 1) return 'medium'
  return 'low'
}

function tsToMs(ts: string): number {
  return parseFloat(ts) * 1000
}

function waitingHoursFrom(ts: string): number {
  return Math.floor((Date.now() - tsToMs(ts)) / 3600000)
}

function buildSlackUrl(workspaceUrl: string, channelId: string, ts: string): string {
  const pTs = 'p' + ts.replace('.', '')
  return `${workspaceUrl}archives/${channelId}/${pTs}`
}

async function buildNameCacheFromSearch(slack: WebClient, cache: Map<string, string>) {
  try {
    const res = await slack.search.messages({
      query: 'is:dm',
      count: 100,
      sort: 'timestamp',
      sort_dir: 'desc',
    })
    for (const m of (res.messages?.matches ?? []) as Record<string, unknown>[]) {
      const userId = m.user as string | undefined
      const username = m.username as string | undefined
      if (userId && username && !cache.has(userId)) cache.set(userId, username)
      const profile = m.user_profile as Record<string, string> | undefined
      if (userId && profile && !cache.has(userId)) {
        const name = (profile.display_name?.trim()) || profile.real_name
        if (name) cache.set(userId, name)
      }
    }
  } catch { /* ignore */ }
}

function populateCacheFromMessages(messages: Record<string, unknown>[], cache: Map<string, string>) {
  for (const m of messages) {
    const uid = m.user as string | undefined
    if (!uid || cache.has(uid)) continue
    const profile = m.user_profile as Record<string, string> | undefined
    if (profile) {
      const name = (profile.display_name?.trim()) || profile.real_name
      if (name) { cache.set(uid, name); continue }
    }
    const username = m.username as string | undefined
    if (username) cache.set(uid, username)
  }
}

function buildSlackMessages(
  messages: Record<string, unknown>[],
  myUserId: string,
  cache: Map<string, string>
) {
  populateCacheFromMessages(messages, cache)
  return messages
    .filter((m) => m.text)
    .map((m) => {
      const uid = m.user as string | undefined
      const fromMe = uid === myUserId
      const sender = fromMe
        ? 'You'
        : uid
        ? (cache.get(uid) ?? uid)
        : (m.username as string | undefined) ?? 'App'
      return { text: (m.text as string), fromMe, sender, ts: (m.ts as string) ?? '0' }
    })
}

// GET /api/slack/status
router.get('/api/slack/status', (c) => {
  const email = c.get('userEmail')
  const token = getToken(email, 'slack') ?? process.env.SLACK_TOKEN ?? null
  return c.json({ connected: !!token })
})

// GET /api/slack/threads
router.get('/api/slack/threads', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const userToken = getToken(email, 'slack') ?? process.env.SLACK_TOKEN ?? null
  if (!userToken) return c.json({ connected: false, threads: [] })

  try {
    const slack = new WebClient(userToken, { timeout: 15000, retryConfig: { retries: 0 }, rejectRateLimitedCalls: true })
    const seenIds = new Set<string>()
    const nameCache = new Map<string, string>()

    const meRes = await slack.auth.test()
    const myUserId = meRes.user_id!
    const workspaceUrl = (meRes.url as string) ?? 'https://slack.com/'

    const [imListRes] = await Promise.allSettled([
      slack.conversations.list({ types: 'im', limit: 30, exclude_archived: true }),
      buildNameCacheFromSearch(slack, nameCache),
    ])

    const imChannels = (imListRes.status === 'fulfilled'
      ? (imListRes.value.channels ?? [])
      : []) as Record<string, unknown>[]

    // DMs
    const dmItems: Record<string, unknown>[] = []
    for (const ch of imChannels) {
      const channelId = (ch.id as string | undefined) ?? ''
      const counterpartyId = (ch.user as string | undefined) ?? ''
      if (!channelId) continue
      if (counterpartyId === 'USLACKBOT') continue
      const latest = ch.latest as Record<string, unknown> | undefined
      if (!latest) continue
      const lastSender = latest.user as string | undefined
      if (lastSender === myUserId) continue
      const ts = (latest.ts as string) ?? '0'
      const id = `slack-dm-${channelId}`
      if (seenIds.has(id)) continue
      seenIds.add(id)
      const senderName = nameCache.get(counterpartyId)
        ?? nameCache.get(lastSender ?? '')
        ?? counterpartyId
        ?? 'Unknown'
      const waitingHours = waitingHoursFrom(ts)
      dmItems.push({
        id,
        source: 'slack',
        slackType: 'dm',
        channelId,
        threadTs: ts,
        slackUrl: buildSlackUrl(workspaceUrl, channelId, ts),
        merchantName: senderName,
        subject: `DM from ${senderName}`,
        snippet: (latest.text as string) ?? '',
        threadMessages: [],
        slackMessages: [],
        lastMessageAt: new Date(tsToMs(ts)).toISOString(),
        waitingHours,
        messageCount: (ch.unread_count as number | undefined) ?? 1,
        status: waitingHours >= 8 ? 'sla_breached' : 'pending_reply',
        priority: slackPriority(waitingHours),
        isRead: false,
        createdAt: new Date(tsToMs(ts)).toISOString(),
        updatedAt: new Date(tsToMs(ts)).toISOString(),
        waitingOnCSM: true,
      })
    }

    // Mentions & raised in parallel
    const [mentionsResult, raisedResult] = await Promise.allSettled([
      (async () => {
        const mentions = await slack.search.messages({
          query: `<@${myUserId}> -from:<@${myUserId}>`,
          count: 20,
          sort: 'timestamp',
          sort_dir: 'desc',
        })
        for (const m of (mentions.messages?.matches ?? []) as Record<string, unknown>[]) {
          const uid = m.user as string | undefined
          const uname = m.username as string | undefined
          if (uid && uname && !nameCache.has(uid)) nameCache.set(uid, uname)
        }
        const mentionDedup = new Set<string>()
        const matches = mentions.messages?.matches ?? []
        const results = await Promise.allSettled(
          matches.map(async (match) => {
            if (match.username === 'slackbot' || match.username === 'Slackbot') return null
            const channelId = match.channel?.id ?? ''
            const dedupKey = `${match.username ?? ''}::${channelId}`
            if (mentionDedup.has(dedupKey)) return null
            mentionDedup.add(dedupKey)
            const id = `slack-mention-${match.username ?? 'unknown'}-${channelId}`
            if (seenIds.has(id) || seenIds.has(`slack-dm-${channelId}`)) return null
            seenIds.add(id)
            const matchAny = match as Record<string, unknown>
            const ts = match.ts ?? '0'
            const waitingHours = waitingHoursFrom(ts)
            const rawChannelName = match.channel?.name ?? ''
            const isRawId = /^[UDCGWB][A-Z0-9]{6,}$/i.test(rawChannelName)
            const [channelInfoRes, threadRes] = await Promise.allSettled([
              isRawId
                ? slack.conversations.info({ channel: channelId })
                : Promise.resolve(null),
              slack.conversations.replies({
                channel: channelId,
                ts: (matchAny.thread_ts as string | undefined) ?? ts,
                limit: 15,
              }),
            ])
            let channelDisplayName = isRawId ? '' : rawChannelName
            if (channelInfoRes.status === 'fulfilled' && channelInfoRes.value) {
              const ch = ((channelInfoRes.value as unknown) as Record<string, unknown>).channel as Record<string, unknown> | undefined
              const chName = ch?.name as string | undefined
              if (chName && !/^[UDCGWB][A-Z0-9]{6,}$/i.test(chName)) channelDisplayName = chName
            }
            let rawMsgs: Record<string, unknown>[] = []
            if (threadRes.status === 'fulfilled') {
              rawMsgs = (threadRes.value.messages ?? []) as Record<string, unknown>[]
            }
            if (rawMsgs.length <= 1) {
              try {
                const histRes = await slack.conversations.history({
                  channel: channelId,
                  latest: String(parseFloat(ts) + 1),
                  limit: 15,
                  inclusive: true,
                })
                const histMsgs = ([...(histRes.messages ?? [])].reverse()) as Record<string, unknown>[]
                if (histMsgs.length > rawMsgs.length) rawMsgs = histMsgs
              } catch { /* skip */ }
            }
            const slackMessages = buildSlackMessages(rawMsgs, myUserId, nameCache)
            const threadMessages = slackMessages.map((m) => m.text)
            const threadSnippet = threadMessages.slice(-2).join(' → ') || (match.text ?? '')
            return {
              id,
              source: 'slack',
              slackType: 'mention',
              channelId,
              threadTs: ts,
              slackUrl: buildSlackUrl(workspaceUrl, channelId, ts),
              merchantName: match.username ?? (channelDisplayName || 'Unknown'),
              subject: channelDisplayName ? `Mentioned in #${channelDisplayName}` : `Mentioned by ${match.username ?? 'someone'}`,
              snippet: threadSnippet,
              threadMessages,
              slackMessages,
              lastMessageAt: new Date(tsToMs(ts)).toISOString(),
              waitingHours,
              messageCount: Math.max(1, threadMessages.length),
              status: waitingHours >= 8 ? 'sla_breached' : 'pending_reply',
              priority: slackPriority(waitingHours),
              isRead: false,
              createdAt: new Date(tsToMs(ts)).toISOString(),
              updatedAt: new Date(tsToMs(ts)).toISOString(),
            }
          })
        )
        return results
          .filter((r) => r.status === 'fulfilled' && r.value !== null)
          .map((r) => (r as PromiseFulfilledResult<Record<string, unknown>>).value)
      })(),
      (async () => {
        const raised = await slack.search.messages({
          query: `from:<@${myUserId}> -is:dm`,
          count: 15,
          sort: 'timestamp',
          sort_dir: 'desc',
        })
        const matches = (raised.messages?.matches ?? []).filter(
          (m) => m.channel?.id && m.ts && !seenIds.has(`slack-dm-${m.channel.id}`)
        )
        const results = await Promise.allSettled(
          matches.map(async (match) => {
            const repliesRes = await slack.conversations.replies({
              channel: match.channel!.id!,
              ts: match.ts!,
              limit: 20,
            })
            const thread = (repliesRes.messages ?? []) as Record<string, unknown>[]
            if (thread.length <= 1) return null
            const lastReply = thread[thread.length - 1]
            if ((lastReply.user as string | undefined) === myUserId) return null
            const waitingHours = waitingHoursFrom((lastReply.ts as string) ?? match.ts ?? '0')
            const id = `slack-raised-${match.ts}`
            if (seenIds.has(id)) return null
            seenIds.add(id)
            const slackMessages = buildSlackMessages(thread, myUserId, nameCache)
            const allMessages = slackMessages.map((m) => m.text)
            const replyCount = thread.length - 1
            return {
              id,
              source: 'slack',
              slackType: 'raised',
              channelId: match.channel!.id,
              threadTs: match.ts,
              slackUrl: buildSlackUrl(workspaceUrl, match.channel!.id!, match.ts!),
              merchantName: match.channel?.name ?? 'Unknown Channel',
              subject: `Thread in #${match.channel?.name ?? 'channel'}: ${(match.text ?? '').slice(0, 60)}`,
              snippet: `${replyCount} repl${replyCount === 1 ? 'y' : 'ies'} — latest: ${((lastReply.text as string) ?? '').slice(0, 100)}`,
              threadMessages: allMessages,
              slackMessages,
              lastMessageAt: new Date(tsToMs((lastReply.ts as string) ?? match.ts ?? '0')).toISOString(),
              waitingHours,
              messageCount: thread.length,
              status: waitingHours >= 8 ? 'sla_breached' : 'pending_reply',
              priority: slackPriority(waitingHours),
              isRead: false,
              createdAt: new Date(tsToMs(match.ts ?? '0')).toISOString(),
              updatedAt: new Date(tsToMs((lastReply.ts as string) ?? match.ts ?? '0')).toISOString(),
              originalMessage: match.text ?? '',
            }
          })
        )
        return results
          .filter((r) => r.status === 'fulfilled' && r.value !== null)
          .map((r) => (r as PromiseFulfilledResult<Record<string, unknown>>).value)
      })(),
    ])

    const pending: Record<string, unknown>[] = [
      ...dmItems,
      ...(mentionsResult.status === 'fulfilled' ? mentionsResult.value : []),
      ...(raisedResult.status === 'fulfilled' ? raisedResult.value : []),
    ]
    pending.sort((a, b) => (b.waitingHours as number) - (a.waitingHours as number))
    return c.json({ connected: true, threads: pending })
  } catch (err) {
    console.error('Slack threads error:', err)
    return c.json({ connected: true, threads: [], error: 'Fetch failed' })
  }
})

// POST /api/slack/send
router.post('/api/slack/send', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const userToken = getToken(email, 'slack') ?? process.env.SLACK_TOKEN ?? null
  if (!userToken) return c.json({ error: 'Slack not connected' }, 400)

  const { channelId, message, threadTs } = await c.req.json()
  const slack = new WebClient(userToken)

  try {
    await slack.chat.postMessage({ channel: channelId, text: message, thread_ts: threadTs })
    return c.json({ status: 'sent' })
  } catch (err) {
    console.error('Slack send error:', err)
    return c.json({ error: 'Send failed' }, 500)
  }
})

// GET /api/slack/dm-history
router.get('/api/slack/dm-history', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const channelId = c.req.query('channelId')
  if (!channelId) return c.json({ error: 'Missing channelId' }, 400)

  const userToken = getToken(email, 'slack') ?? process.env.SLACK_TOKEN ?? null
  if (!userToken) return c.json({ messages: [] })

  try {
    const slack = new WebClient(userToken, {
      timeout: 10000,
      retryConfig: { retries: 0 },
      rejectRateLimitedCalls: true,
    })
    const meRes = await slack.auth.test()
    const myUserId = meRes.user_id!
    const history = await slack.conversations.history({ channel: channelId, limit: 15 })
    const rawMsgs = ((history.messages ?? []) as Record<string, unknown>[]).reverse()

    const nameCache = new Map<string, string>()
    for (const m of rawMsgs) {
      const uid = m.user as string | undefined
      const profile = m.user_profile as Record<string, string> | undefined
      if (uid && profile && !nameCache.has(uid)) {
        const name = (profile.display_name?.trim()) || profile.real_name
        if (name) nameCache.set(uid, name)
      }
    }

    const unknownIds = [...new Set(
      rawMsgs.map((m) => m.user as string | undefined)
        .filter((u): u is string => !!u && u !== myUserId && !nameCache.has(u))
    )].slice(0, 5)

    await Promise.allSettled(unknownIds.map(async (uid) => {
      try {
        const sr = await slack.search.messages({ query: `from:<@${uid}>`, count: 1, sort: 'timestamp', sort_dir: 'desc' })
        const match = (sr.messages?.matches ?? [])[0] as Record<string, unknown> | undefined
        const uname = match?.username as string | undefined
        if (uname) nameCache.set(uid, uname)
      } catch { /* ignore */ }
    }))

    const messages = rawMsgs
      .filter((m) => m.text)
      .map((m) => {
        const uid = m.user as string | undefined
        const fromMe = uid === myUserId
        const sender = fromMe
          ? 'You'
          : uid
          ? (nameCache.get(uid) ?? uid)
          : (m.username as string | undefined) ?? 'App'
        return { text: (m.text as string), fromMe, sender, ts: (m.ts as string) ?? '0' }
      })

    return c.json({ messages })
  } catch (err) {
    console.error('dm-history error:', err)
    return c.json({ messages: [] })
  }
})

export default router
