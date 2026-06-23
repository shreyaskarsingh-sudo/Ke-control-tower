import { Clock, CheckCircle, TrendingUp, Inbox, Info } from "lucide-react";
import { useState } from "react";
import type { DashboardStats } from "@/types";

interface StatsBarProps {
  stats: DashboardStats;
  onCardClick?: (label: string) => void;
}

const TOOLTIP_DEFINITIONS: Record<string, { what: string; good: string }> = {
  Open: {
    what: "Total active queries not yet dismissed or resolved, across all sources (Email, Slack, Jira).",
    good: "Lower is better. Aim to keep this under 20 at any given time.",
  },
  "Pending Reply": {
    what: "Items where an external party (merchant or team) is actively waiting on your response.",
    good: "Should be as close to 0 as possible — every hour of delay increases churn risk.",
  },
  Closed: {
    what: "Total items you have marked as Done in this session. Persists across page refreshes.",
    good: "Higher is better — reflects your throughput for the day.",
  },
  "This Week": {
    what: "New queries created or raised in the current calendar week (Monday–Sunday).",
    good: "Use this to track inbound volume trends. A sharp spike may indicate a product incident.",
  },
};

function InfoTooltip({ label }: { label: string }) {
  const [open, setOpen] = useState(false);
  const def = TOOLTIP_DEFINITIONS[label];
  if (!def) return null;
  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="text-on-surface-variant/40 hover:text-on-surface-variant transition-colors"
        aria-label={`Info about ${label}`}
      >
        <Info size={11} />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-on-surface text-surface text-xs rounded-lg p-3 shadow-lg z-50 pointer-events-none">
          <p className="font-semibold mb-1">{label}</p>
          <p className="opacity-80 mb-1.5">{def.what}</p>
          <p className="opacity-60 italic">{def.good}</p>
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-on-surface" />
        </div>
      )}
    </div>
  );
}

export function StatsBar({ stats, onCardClick }: StatsBarProps) {
  const cards = [
    {
      label: "Open",
      value: stats.totalOpen,
      icon: Inbox,
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "Pending Reply",
      value: stats.pendingReply,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Closed",
      value: stats.closedToday,
      icon: CheckCircle,
      color: "text-green-600",
      bg: "bg-green-50",
    },
    {
      label: "This Week",
      value: stats.totalThisWeek,
      icon: TrendingUp,
      color: "text-on-surface-variant",
      bg: "bg-surface-container",
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.label}
            onClick={() => onCardClick?.(card.label)}
            className="bg-surface-container-lowest rounded-xl p-4 shadow-card text-left hover:shadow-md transition-shadow disabled:cursor-default"
            disabled={!onCardClick}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-1">
                <p className="text-xs text-on-surface-variant font-label font-medium uppercase tracking-wide">
                  {card.label}
                </p>
                <InfoTooltip label={card.label} />
              </div>
              <div className={`w-7 h-7 rounded-lg ${card.bg} flex items-center justify-center`}>
                <Icon size={14} className={card.color} strokeWidth={2} />
              </div>
            </div>
            <p className="text-2xl font-bold font-headline text-on-surface">
              {card.value}
            </p>
          </button>
        );
      })}
    </div>
  );
}
