"use client";

import { X, RotateCcw, Mail, MessageSquare, ExternalLink, Clock, ChevronRight, CheckCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Escalation } from "@/types";
import type { DismissedEntry } from "@/hooks/useDismissedItems";

interface HeadlineCard {
  label: string;
  icon: React.ElementType;
  color: string;
  bg: string;
  description: string;
  filter: (e: Escalation) => boolean;
}

interface Props {
  card: HeadlineCard;
  escalations: Escalation[];
  dismissedIds: Set<string>;
  dismissedEntries: DismissedEntry[];
  onSelectEscalation: (e: Escalation) => void;
  onUndismiss: (id: string) => void;
  onDismiss: (id: string, meta?: { source?: string; subject?: string }) => void;
  onClose: () => void;
}

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function sourceIcon(source: string) {
  if (source === "gmail") return <Mail size={13} className="text-blue-500" />;
  if (source === "slack") return <MessageSquare size={13} className="text-[#4A154B]" />;
  return <ExternalLink size={13} className="text-amber-500" />;
}

function ThreadRow({
  e,
  dismissed,
  onOpen,
  onUndismiss,
  onDismiss,
}: {
  e: Escalation;
  dismissed: boolean;
  onOpen?: () => void;
  onUndismiss?: () => void;
  onDismiss?: () => void;
}) {
  const slackTypeLabel =
    e.slackType === "dm" ? "DM" : e.slackType === "mention" ? "@mention" : e.slackType === "raised" ? "Raised" : null;

  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 transition-colors",
        dismissed
          ? "bg-surface-container/40 border-outline-variant/20 opacity-70"
          : "bg-surface-container-lowest border-outline-variant/20 hover:border-primary/20 hover:shadow-sm cursor-pointer"
      )}
      onClick={!dismissed ? onOpen : undefined}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">{sourceIcon(e.source)}</div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-0.5">
            <span className="text-sm font-medium text-on-surface font-headline truncate">{e.subject || e.merchantName}</span>
            {slackTypeLabel && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-container border border-outline-variant/30 text-on-surface-variant font-label">
                {slackTypeLabel}
              </span>
            )}
            {dismissed && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface-container border border-outline-variant/30 text-on-surface-variant font-label">
                Closed
              </span>
            )}
          </div>

          <p className="text-xs text-on-surface-variant truncate font-label">{e.merchantName}</p>
          <p className="text-xs text-on-surface-variant/70 truncate mt-0.5 font-label">{e.snippet}</p>

          <div className="flex items-center gap-3 mt-2">
            <span className="text-[11px] text-on-surface-variant font-label flex items-center gap-1">
              <Clock size={10} />
              {timeAgo(e.lastMessageAt || e.updatedAt)}
            </span>
            {e.messageCount > 0 && (
              <span className="text-[11px] text-on-surface-variant font-label">{e.messageCount} msg{e.messageCount !== 1 ? "s" : ""}</span>
            )}
          </div>
        </div>

        <div className="flex-shrink-0 flex items-center gap-1.5">
          {dismissed ? (
            <button
              onClick={(ev) => { ev.stopPropagation(); onUndismiss?.(); }}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition-colors font-label font-medium"
            >
              <RotateCcw size={12} />
              Revert
            </button>
          ) : (
            <>
              <button
                onClick={(ev) => { ev.stopPropagation(); onDismiss?.(); }}
                title="Mark as done"
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors font-label font-medium"
              >
                <CheckCheck size={12} />
                Done
              </button>
              <ChevronRight size={15} className="text-on-surface-variant" />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function ThreadListDrawer({
  card,
  escalations,
  dismissedIds,
  onSelectEscalation,
  onUndismiss,
  onDismiss,
  onClose,
}: Props) {
  const CardIcon = card.icon;

  // Split into active (not dismissed) and closed (dismissed)
  const matchingAll = escalations.filter(card.filter);
  const active = matchingAll.filter((e) => !dismissedIds.has(e.id));
  const closed = matchingAll.filter((e) => dismissedIds.has(e.id));

  return (
    <div className="fixed inset-0 z-40 flex justify-end pointer-events-none">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 pointer-events-auto"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative w-[420px] h-full bg-surface-container-lowest shadow-2xl flex flex-col pointer-events-auto animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", card.bg)}>
              <CardIcon size={15} className={card.color} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-on-surface font-headline">{card.label}</h2>
              <p className="text-[11px] text-on-surface-variant font-label">{card.description}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-on-surface-variant hover:text-on-surface transition-colors p-1 rounded-lg hover:bg-surface-container">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-6">
          {/* Active threads */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-semibold text-on-surface font-label uppercase tracking-wide">
                Open
              </span>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-label min-w-[18px] text-center">
                {active.length}
              </span>
            </div>
            {active.length === 0 ? (
              <p className="text-xs text-on-surface-variant text-center py-6">
                All caught up! No open threads here.
              </p>
            ) : (
              <div className="space-y-2">
                {active.map((e) => (
                  <ThreadRow
                    key={e.id}
                    e={e}
                    dismissed={false}
                    onOpen={() => { onSelectEscalation(e); onClose(); }}
                    onDismiss={() => onDismiss(e.id, { source: e.source, subject: e.subject })}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Closed threads */}
          {closed.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold text-on-surface-variant font-label uppercase tracking-wide">
                  Closed
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label min-w-[18px] text-center">
                  {closed.length}
                </span>
              </div>
              <div className="space-y-2">
                {closed.map((e) => (
                  <ThreadRow
                    key={e.id}
                    e={e}
                    dismissed={true}
                    onUndismiss={() => onUndismiss(e.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
