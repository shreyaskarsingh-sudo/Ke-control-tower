"use client";

import { Mail, MessageSquare, Ticket, Clock, ExternalLink, CheckCheck } from "lucide-react";
import type { Escalation } from "@/types";
import { cn, statusColor, statusLabel, priorityColor, timeAgo, hoursSince, agingColor, cleanSlackText } from "@/lib/utils";

const SourceIcon = ({ source }: { source: Escalation["source"] }) => {
  if (source === "gmail") return <Mail size={14} className="text-red-500" />;
  if (source === "slack") return <MessageSquare size={14} className="text-[#E01E5A]" />;
  return <Ticket size={14} className="text-blue-500" />;
};

const sourceLabel: Record<Escalation["source"], string> = {
  gmail: "Gmail",
  slack: "Slack",
  jira: "Jira",
};

interface EscalationCardProps {
  escalation: Escalation;
  onClick: (e: Escalation) => void;
  onDismiss?: (id: string) => void;
  selected?: boolean;
}

export function EscalationCard({ escalation: e, onClick, onDismiss, selected }: EscalationCardProps) {
  const waitingHours = e.waitingSince ? hoursSince(e.waitingSince) : null;

  return (
    <div
      className={cn(
        "group relative w-full border-b border-outline-variant/20 bg-surface-container-lowest transition-colors duration-100",
        selected && "bg-primary-fixed/30 border-l-2 border-l-primary",
      )}
    >
      {/* Main clickable area */}
      <button
        onClick={() => onClick(e)}
        className="w-full text-left px-4 pt-3 pb-3 hover:bg-surface-container/60 transition-colors"
      >
        <div className="flex items-start gap-3">
          {/* Priority dot */}
          <div className={cn("w-2 h-2 rounded-full mt-2 shrink-0", priorityColor(e.priority))} />

          <div className="flex-1 min-w-0">
            {/* Top row: source · merchant · jira link · time */}
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <SourceIcon source={e.source} />
                <span className="text-xs text-on-surface-variant font-label">{sourceLabel[e.source]}</span>
                <span className="text-xs text-on-surface-variant opacity-40">·</span>
                <span className="text-xs font-semibold text-on-surface truncate">{e.merchantName}</span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {e.source === "jira" && e.jiraUrl && (
                  <a
                    href={e.jiraUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                    title={`Open ${e.jiraKey} in Jira`}
                    className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline font-mono font-medium"
                  >
                    {e.jiraKey} <ExternalLink size={9} />
                  </a>
                )}
                {e.source === "slack" && e.slackUrl && (
                  <a
                    href={e.slackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(ev) => ev.stopPropagation()}
                    title="Open in Slack"
                    className="flex items-center gap-0.5 text-xs text-[#E01E5A] hover:underline font-medium"
                  >
                    Open <ExternalLink size={9} />
                  </a>
                )}
                <span className="text-xs text-on-surface-variant">{timeAgo(e.lastMessageAt)}</span>
              </div>
            </div>

            {/* Subject */}
            <p className={cn("text-sm truncate mb-1", !e.isRead ? "font-semibold text-on-surface" : "text-on-surface-variant")}>
              {e.source === "slack" ? cleanSlackText(e.subject) : e.subject}
            </p>

            {/* Snippet */}
            <p className="text-xs text-on-surface-variant truncate mb-2">
              {e.source === "slack" ? cleanSlackText(e.snippet) : e.snippet}
            </p>

            {/* Bottom row: badges + waiting time */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium font-label", statusColor(e.status))}>
                  {statusLabel(e.status)}
                </span>
                {e.source === "jira" && e.isReported && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-label font-medium">Reported</span>
                )}
                {e.source === "jira" && e.isTeamItem && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 font-label font-medium">Team</span>
                )}
                {e.source === "jira" && !e.isReported && !e.isTeamItem && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-label font-medium">Assigned</span>
                )}
                {e.source === "slack" && e.slackType === "dm" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#E01E5A]/10 text-[#E01E5A] font-label font-medium">DM</span>
                )}
                {e.source === "slack" && e.slackType === "mention" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-purple-50 text-purple-600 font-label font-medium">Mention</span>
                )}
                {e.source === "slack" && e.slackType === "raised" && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-label font-medium">Raised</span>
                )}
                {e.category && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label">{e.category}</span>
                )}
                {e.source === "jira" && e.waitingOnCSM && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-label font-medium">Awaiting reply</span>
                )}
              </div>
              {waitingHours !== null && waitingHours > 0 && (
                <div className={cn("flex items-center gap-1 text-xs shrink-0", agingColor(waitingHours))}>
                  <Clock size={11} />
                  <span>{waitingHours}h</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </button>

      {/* Done button — always visible on the right edge */}
      {onDismiss && (
        <button
          onClick={(ev) => { ev.stopPropagation(); onDismiss(e.id); }}
          title="Mark as done — removes from monitoring"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium font-label
            bg-surface-container text-on-surface-variant border border-outline-variant/30
            hover:bg-green-50 hover:text-green-700 hover:border-green-300
            opacity-0 group-hover:opacity-100 transition-all duration-150"
        >
          <CheckCheck size={12} />
          Done
        </button>
      )}
    </div>
  );
}
