import { useState, useEffect } from 'react'

interface User {
  email: string
  name: string
  picture?: string
}

export function useSession() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/me')
      .then((r) => r.json())
      .then((d) => {
        if (d.email) setUser({ email: d.email, name: d.name || d.email, picture: d.picture })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return { user, loading }
}
