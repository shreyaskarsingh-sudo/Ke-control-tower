import { isThisWeek, getDay, differenceInDays } from "date-fns";
import type { Escalation, DashboardStats } from "@/types";
import type { DismissedEntry } from "@/hooks/useDismissedItems";

export function loadDismissedIds(email: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`csm_dismissed_v1_${email}`);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === "string") {
      return new Set(parsed as string[]);
    }
    return new Set((parsed as DismissedEntry[]).map((e) => e.id));
  } catch {
    return new Set();
  }
}

export function deriveCategory(jiraKey: string, summary: string): string {
  const s = summary.toLowerCase();
  if (s.includes("adonc") || s.includes("checkout") || s.includes("cart")) return "Checkout/ADONC";
  if (s.includes("refund") || s.includes("payment") || s.includes("pay")) return "Payment/Refund";
  if (s.includes("rto") || s.includes("return")) return "RTO";
  if (s.includes("sms") || s.includes("cod") || s.includes("whatsapp")) return "Comms";
  if (s.includes("kyc") || s.includes("onboard")) return "KYC/Onboarding";
  if (jiraKey.startsWith("CHECKOUT")) return "Checkout/ADONC";
  if (jiraKey.startsWith("GKP")) return "GKP";
  if (jiraKey.startsWith("GQ")) return "General Query";
  return "Other";
}

/**
 * Compute stats from the live escalations array + dismissed entries.
 *
 * Key rules:
 *  - open   = fetched items NOT in dismissedIds  (real-time; updates instantly on Done click)
 *  - closed = total entries ever marked Done (dismissedEntries.length)
 *             → persists across refreshes even if Jira/Slack re-fetches different items
 *  - pendingReply / slaBreached are scoped to active (open) items only
 */
export function computeStats(
  escalations: Escalation[],
  dismissedIds: Set<string>,
  dismissedEntries: DismissedEntry[]
): DashboardStats {
  const active = escalations.filter((e) => !dismissedIds.has(e.id));

  const totalOpen = active.length;

  const pendingReply = active.filter(
    (e) => e.waitingOnCSM || e.status === "pending_reply" || e.status === "sla_breached"
  ).length;

  const slaBreached = active.filter(
    (e) => e.status === "sla_breached" || e.priority === "critical"
  ).length;

  // Closed = total items ever marked Done (authoritative source: localStorage entries)
  const closedToday = dismissedEntries.length;

  const avgResponseTimeHours =
    active.length > 0
      ? Math.round(
          (active.reduce((sum, e) => sum + (e.daysSinceUpdate ?? 0) * 24, 0) / active.length) * 10
        ) / 10
      : 0;

  const totalThisWeek = escalations.filter((e) =>
    isThisWeek(new Date(e.createdAt), { weekStartsOn: 1 })
  ).length;

  return { totalOpen, pendingReply, closedToday, slaBreached, avgResponseTimeHours, totalThisWeek };
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Weekly bar chart:
 *  - open bar    = items created in that day bucket (regardless of dismissed state)
 *  - closed bar  = items DISMISSED on that day (from dismissedEntries timestamps)
 *  - breached    = active items with sla_breached/critical created that day
 */
export function computeWeeklyData(
  escalations: Escalation[],
  dismissedIds: Set<string>,
  dismissedEntries: DismissedEntry[]
) {
  const today = new Date();

  // Build ordered day labels for the last 7 days (oldest → newest)
  const dayOrder: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    dayOrder.push(DAY_LABELS[getDay(d)]);
  }

  const buckets: Record<string, { day: string; open: number; closed: number; breached: number }> = {};
  dayOrder.forEach((label) => { buckets[label] = { day: label, open: 0, closed: 0, breached: 0 }; });

  // "Opened" = created in the last 7 days
  escalations.forEach((e) => {
    const daysAgo = differenceInDays(today, new Date(e.createdAt));
    if (daysAgo > 6) return;
    const label = DAY_LABELS[getDay(new Date(e.createdAt))];
    if (!buckets[label]) return;
    buckets[label].open += 1;
    if ((e.status === "sla_breached" || e.priority === "critical") && !dismissedIds.has(e.id)) {
      buckets[label].breached += 1;
    }
  });

  // "Closed" = dismissed on that day (use dismissedAt timestamp)
  dismissedEntries.forEach((entry) => {
    const daysAgo = differenceInDays(today, new Date(entry.dismissedAt));
    if (daysAgo > 6) return;
    const label = DAY_LABELS[getDay(new Date(entry.dismissedAt))];
    if (!buckets[label]) return;
    buckets[label].closed += 1;
  });

  return dayOrder.map((label) => buckets[label]);
}

export function computeCategoryData(escalations: Escalation[]) {
  const counts: Record<string, number> = {};
  escalations.forEach((e) => {
    const cat = e.category ?? (e.jiraKey ? deriveCategory(e.jiraKey, e.subject) : "Other");
    counts[cat] = (counts[cat] ?? 0) + 1;
  });

  const COLORS: Record<string, string> = {
    "Checkout/ADONC": "#001b44",
    "Payment/Refund": "#006d43",
    "RTO": "#fbbc00",
    "Comms": "#3c5d9c",
    "KYC/Onboarding": "#ba1a1a",
    "GKP": "#5c6bc0",
    "General Query": "#8d6e63",
    "Other": "#747781",
  };

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, value]) => ({ name, value, color: COLORS[name] ?? "#747781" }));
}
