import { Hono } from 'hono'
import { saveToken } from '../../src/lib/token-store'

const router = new Hono()

function getAppUrl() {
  return (process.env.APP_URL ?? 'https://deployer.dev.gokwik.in').replace(/\/$/, '')
}

function apiBase() {
  return `${getAppUrl()}/_api/app/ke-control-tower`
}

function frontendBase() {
  return `${getAppUrl()}/gokwik/ke-control-tower`
}

// ─── Slack OAuth ────────────────────────────────────────────────────────────

router.get('/api/slack/connect', (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) return c.json({ error: 'SLACK_CLIENT_ID not configured' }, 503)

  const params = new URLSearchParams({
    client_id: clientId,
    user_scope: [
      'chat:write',
      'im:read',
      'im:history',
      'mpim:read',
      'mpim:history',
      'search:read',
      'channels:history',
      'groups:history',
    ].join(','),
    redirect_uri: `${apiBase()}/api/slack/callback`,
    state: email,
  })

  return Response.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`)
})

router.get('/api/slack/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')
  const frontend = frontendBase()

  if (error || !code || !state) {
    return Response.redirect(`${frontend}/dashboard?slack_error=true`)
  }

  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: `${apiBase()}/api/slack/callback`,
    }),
  })

  const data = await res.json() as Record<string, unknown>

  if (!data.ok || !(data.authed_user as Record<string, unknown>)?.access_token) {
    console.error('[slack/callback] OAuth failed:', data.error)
    return Response.redirect(`${frontend}/dashboard?slack_error=true`)
  }

  await saveToken(state, 'slack', (data.authed_user as Record<string, string>).access_token)
  return Response.redirect(`${frontend}/dashboard?slack_connected=true`)
})

// ─── Gmail OAuth ─────────────────────────────────────────────────────────────

router.get('/api/gmail/connect', (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return c.json({ error: 'Google credentials not configured' }, 503)

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${apiBase()}/api/gmail/callback`,
    response_type: 'code',
    scope: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.compose',
      'openid',
      'email',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: email,
  })

  return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`)
})

router.get('/api/gmail/callback', async (c) => {
  const code = c.req.query('code')
  const state = c.req.query('state')
  const error = c.req.query('error')
  const frontend = frontendBase()

  if (error || !code || !state) {
    return Response.redirect(`${frontend}/dashboard?gmail_error=true`)
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${apiBase()}/api/gmail/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const tokenData = await tokenRes.json() as Record<string, unknown>

  if (!tokenData.access_token) {
    console.error('[gmail/callback] token exchange failed:', tokenData.error)
    return Response.redirect(`${frontend}/dashboard?gmail_error=true`)
  }

  const tokenObj = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: Date.now() + ((tokenData.expires_in as number) ?? 3600) * 1000,
  }

  await saveToken(state, 'gmail', JSON.stringify(tokenObj))
  return Response.redirect(`${frontend}/dashboard?gmail_connected=true`)
})

export default router
