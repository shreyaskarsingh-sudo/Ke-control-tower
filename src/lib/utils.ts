import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { formatDistanceToNow, differenceInHours } from "date-fns";
import type { EscalationStatus, EscalationPriority } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function timeAgo(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

export function hoursSince(dateString: string): number {
  return differenceInHours(new Date(), new Date(dateString));
}

export function statusColor(status: EscalationStatus): string {
  const map: Record<EscalationStatus, string> = {
    open: "bg-blue-100 text-blue-800",
    pending_reply: "bg-amber-100 text-amber-800",
    closed: "bg-green-100 text-green-700",
    sla_breached: "bg-red-100 text-red-800",
  };
  return map[status];
}

export function statusLabel(status: EscalationStatus): string {
  const map: Record<EscalationStatus, string> = {
    open: "Open",
    pending_reply: "Pending Reply",
    closed: "Closed",
    sla_breached: "SLA Breached",
  };
  return map[status];
}

export function priorityColor(priority: EscalationPriority): string {
  const map: Record<EscalationPriority, string> = {
    critical: "bg-red-500",
    high: "bg-orange-400",
    medium: "bg-amber-400",
    low: "bg-green-400",
  };
  return map[priority];
}

export function agingColor(hoursSince: number): string {
  if (hoursSince >= 8) return "text-red-600";
  if (hoursSince >= 4) return "text-amber-600";
  return "text-on-surface-variant";
}

export function healthScoreColor(score: number): string {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

// Strip raw Slack IDs (U0ABC123, C0ABC123, etc.) from display strings
export function cleanSlackText(text: string): string {
  return text
    .replace(/#[UDCGWB][A-Z0-9]{6,}/gi, "")
    .replace(/<@[UW][A-Z0-9]+\|([^>]+)>/g, "@$1")
    .replace(/<@[UW][A-Z0-9]+>/g, "")
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .trim();
}
