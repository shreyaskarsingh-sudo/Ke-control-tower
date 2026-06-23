"use client";

import { useState, useEffect } from "react";

export interface DismissedEntry {
  id: string;
  dismissedAt: string; // ISO timestamp of when Done was clicked
  source?: string;
  subject?: string;
}

const STORAGE_KEY = (email: string) => `csm_dismissed_v1_${email}`;

function load(email: string): DismissedEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY(email));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Handle old format (plain string[]) → migrate to new format
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
      return (parsed as string[]).map((id) => ({ id, dismissedAt: new Date().toISOString() }));
    }
    return parsed as DismissedEntry[];
  } catch {
    return [];
  }
}

function save(email: string, entries: DismissedEntry[]) {
  localStorage.setItem(STORAGE_KEY(email), JSON.stringify(entries));
}

export function useDismissedItems(email: string | undefined) {
  const [entries, setEntries] = useState<DismissedEntry[]>([]);

  useEffect(() => {
    if (!email) return;
    setEntries(load(email));
  }, [email]);

  // Set of IDs for fast lookup
  const dismissedIds = new Set(entries.map((e) => e.id));

  function dismissItem(id: string, meta?: { source?: string; subject?: string }) {
    if (!email) return;
    setEntries((prev) => {
      if (prev.some((e) => e.id === id)) return prev; // already dismissed
      const next = [...prev, { id, dismissedAt: new Date().toISOString(), ...meta }];
      save(email, next);
      return next;
    });
  }

  function undismissItem(id: string) {
    if (!email) return;
    setEntries((prev) => {
      const next = prev.filter((e) => e.id !== id);
      save(email, next);
      return next;
    });
  }

  function restoreAll() {
    if (!email) return;
    setEntries([]);
    localStorage.removeItem(STORAGE_KEY(email));
  }

  return { dismissedIds, entries, dismissItem, undismissItem, restoreAll };
}
