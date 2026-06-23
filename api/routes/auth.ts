import { Hono } from 'hono'
import { saveToken } from '../../src/lib/token-store'

const router = new Hono()

function getAppUrl() {
  return (process.env.APP_URL ?? 'https://deployer.dev.gokwik.in').replace(/\/$/, '')
}

// Frontend base — Slack/Google redirect here (clean URL, no _api prefix)
function frontendBase() {
  return `${getAppUrl()}/gokwik/ke-control-tower`
}

// ─── Slack OAuth ────────────────────────────────────────────────────────────

router.get('/api/slack/connect', (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const clientId = process.env.SLACK_CLIENT_ID
  if (!clientId) return c.json({ error: 'SLACK_CLIENT_ID not configured' }, 503)

  const redirectUri = `${frontendBase()}/oauth/slack/callback`

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
    redirect_uri: redirectUri,
    state: email,
  })

  return Response.redirect(`https://slack.com/oauth/v2/authorize?${params.toString()}`)
})

// Called by frontend OAuthCallbackPage after Slack redirects there
router.post('/api/slack/oauth-complete', async (c) => {
  const { code, state } = await c.req.json() as { code: string; state: string }

  if (!code || !state) return c.json({ success: false, error: 'Missing params' }, 400)

  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: `${frontendBase()}/oauth/slack/callback`,
    }),
  })

  const data = await res.json() as Record<string, unknown>

  if (!data.ok || !(data.authed_user as Record<string, unknown>)?.access_token) {
    console.error('[slack/oauth-complete] failed:', data.error)
    return c.json({ success: false, error: String(data.error) })
  }

  await saveToken(state, 'slack', (data.authed_user as Record<string, string>).access_token)
  return c.json({ success: true })
})

// ─── Gmail OAuth ─────────────────────────────────────────────────────────────

router.get('/api/gmail/connect', (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return c.json({ error: 'Google credentials not configured' }, 503)

  const redirectUri = `${frontendBase()}/oauth/gmail/callback`

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
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

// Called by frontend OAuthCallbackPage after Google redirects there
router.post('/api/gmail/oauth-complete', async (c) => {
  const { code, state } = await c.req.json() as { code: string; state: string }

  if (!code || !state) return c.json({ success: false, error: 'Missing params' }, 400)

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${frontendBase()}/oauth/gmail/callback`,
      grant_type: 'authorization_code',
    }),
  })

  const tokenData = await tokenRes.json() as Record<string, unknown>

  if (!tokenData.access_token) {
    console.error('[gmail/oauth-complete] token exchange failed:', tokenData.error)
    return c.json({ success: false, error: String(tokenData.error) })
  }

  const tokenObj = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token,
    expiry_date: Date.now() + ((tokenData.expires_in as number) ?? 3600) * 1000,
  }

  await saveToken(state, 'gmail', JSON.stringify(tokenObj))
  return c.json({ success: true })
})

export default router
