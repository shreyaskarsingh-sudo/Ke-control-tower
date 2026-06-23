import type { Context, Next } from 'hono'

// Platform SDK — injects user context from x-user-email header (Lambda@Edge Google SSO)
// The platform handles authentication; this middleware just extracts the user identity.

export async function platformMiddleware(c: Context, next: Next) {
  const email = c.req.header('x-user-email') ?? ''
  c.set('userEmail', email)
  await next()
}

// Type augmentation for Hono context
declare module 'hono' {
  interface ContextVariableMap {
    userEmail: string
  }
}
