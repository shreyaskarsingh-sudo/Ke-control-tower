import { useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { apiFetch } from '@/lib/api'

export default function OAuthCallbackPage() {
  const { service } = useParams<{ service: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error || !code || !state) {
      navigate(`/dashboard?${service}_error=true`, { replace: true })
      return
    }

    apiFetch(`/api/${service}/oauth-complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, state }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          navigate(`/dashboard?${service}_connected=true`, { replace: true })
        } else {
          navigate(`/dashboard?${service}_error=true`, { replace: true })
        }
      })
      .catch(() => navigate(`/dashboard?${service}_error=true`, { replace: true }))
  }, [])

  return (
    <div className="flex h-full items-center justify-center bg-background">
      <div className="text-center space-y-3">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-on-surface-variant">Connecting {service}…</p>
      </div>
    </div>
  )
}
