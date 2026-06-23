"use client";

import { useState, useEffect, useCallback } from "react";
import type { SessionUser } from "@/lib/session";

interface SessionState {
  user: SessionUser | null;
  status: "loading" | "authenticated" | "unauthenticated";
}

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>({ user: null, status: "loading" });

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (res.ok) {
        const { user } = await res.json();
        setState({ user, status: "authenticated" });
      } else {
        setState({ user: null, status: "unauthenticated" });
      }
    } catch {
      setState({ user: null, status: "unauthenticated" });
    }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  return state;
}
