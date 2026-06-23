import { Hono } from 'hono'
import Anthropic from '@anthropic-ai/sdk'
import { initMcpSession, callMcpTool, extractText } from '../../src/lib/ke-mcp'

const router = new Hono()
function getAnthropic() { return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! }) }

// POST /api/ke/analyze
router.post('/api/ke/analyze', async (c) => {
  const email = c.get('userEmail')
  if (!email) return c.json({ error: 'Unauthorized' }, 401)

  const { merchantId, chatName } = await c.req.json()
  if (!merchantId?.trim()) {
    return c.json({ error: 'merchantId is required' }, 400)
  }

  try {
    const mcpSession = await initMcpSession()

    const authResult = await callMcpTool(mcpSession, 'kwikos_auth_merchant', {
      gokwik_merchant_id: merchantId.trim(),
    })
    const authText = extractText(authResult)

    if (authResult.isError || authText.toLowerCase().includes('not found') || authText.toLowerCase().includes('error')) {
      return c.json(
        { error: `Merchant ID "${merchantId}" not found. Please check and try again.` },
        404
      )
    }

    const clientInfoResult = await callMcpTool(mcpSession, 'kwikos_get_client_info', {})
    const clientInfo = extractText(clientInfoResult)

    const [campaignsResult, automationsResult, segmentsResult] = await Promise.allSettled([
      callMcpTool(mcpSession, 'kwikos_list_campaigns', { limit: 10 }),
      callMcpTool(mcpSession, 'kwikos_list_automations', { limit: 10 }),
      callMcpTool(mcpSession, 'kwikos_list_segments', { limit: 10 }),
    ])

    const campaigns = campaignsResult.status === 'fulfilled' ? extractText(campaignsResult.value) : 'Could not fetch.'
    const automations = automationsResult.status === 'fulfilled' ? extractText(automationsResult.value) : 'Could not fetch.'
    const segments = segmentsResult.status === 'fulfilled' ? extractText(segmentsResult.value) : 'Could not fetch.'

    const prompt = `You are a KwikEngage (KE) CSM assistant. A CSM is reviewing the KE account for merchant "${merchantId}"${chatName ? ` from WhatsApp group "${chatName}"` : ''}.

## Client Info
${clientInfo}

## Recent Campaigns (last 10)
${campaigns}

## Automations
${automations}

## Audience Segments
${segments}

Give a structured, bullet-point summary with:
1. **Active KE Products/Channels** — which channels are live: WhatsApp, Email, SMS, Push, RCS? State clearly which are active vs not.
2. **Current Activity** — recent campaigns sent, automations running, segments in use
3. **Engagement Health** — is this merchant actively using KE or going cold? Any red flags?
4. **CSM Talking Points** — 2-3 specific things to discuss on the next call (upsell opportunities, issues, features not adopted)

Be direct and specific. Avoid generic statements.`

    const aiResponse = await getAnthropic().messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const analysis = aiResponse.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { type: 'text'; text: string }).text)
      .join('\n')

    return c.json({ analysis, merchantId, chatName })
  } catch (err) {
    console.error('KE analyze error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return c.json({ error: msg }, 500)
  }
})

export default router
