import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { platformMiddleware } from './platform-sdk'
import periskopeRoutes from './routes/periskope'
import jiraRoutes from './routes/jira'
import slackRoutes from './routes/slack'
import gmailRoutes from './routes/gmail'
import aiRoutes from './routes/ai'
import keRoutes from './routes/ke'
import authRoutes from './routes/auth'

const app = new Hono()

app.use('*', cors())
app.use('*', platformMiddleware)

app.get('/api/health', (c) => c.json({ ok: true }))

app.get('/api/me', (c) => {
  const email = c.get('userEmail')
  const name = email
    ? email.split('@')[0].split('.').map((s: string) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
    : 'CSM'
  return c.json({ email, name })
})

app.route('/', authRoutes)
app.route('/', periskopeRoutes)
app.route('/', jiraRoutes)
app.route('/', slackRoutes)
app.route('/', gmailRoutes)
app.route('/', aiRoutes)
app.route('/', keRoutes)

export default app
