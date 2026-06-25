"use client";

import { useState, useEffect } from "react";
import { X, Send, Sparkles, Edit3, Mail, MessageSquare, Ticket, RotateCcw, ExternalLink, ChevronDown, ChevronUp, RefreshCw, CheckCheck } from "lucide-react";
import type { Escalation, SlackMessage } from "@/types";
import { cn, timeAgo, cleanSlackText } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";

interface GmailMessage {
  id: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  body: string;
  timestamp: string;
}

interface ReplyDrawerProps {
  escalation: Escalation | null;
  onClose: () => void;
  onDismiss?: (id: string, meta?: { source?: string; subject?: string }) => void;
}

type Tone = "formal" | "empathetic" | "technical";

export function ReplyDrawer({ escalation, onClose, onDismiss }: ReplyDrawerProps) {
  const { user } = useSession();
  const [reply, setReply] = useState("");
  const [tone, setTone] = useState<Tone>("empathetic");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [closingJira, setClosingJira] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showAllComments, setShowAllComments] = useState(false);
  const [gmailMessages, setGmailMessages] = useState<GmailMessage[]>([]);
  const [gmailLoading, setGmailLoading] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(new Set());
  const [dmMessages, setDmMessages] = useState<SlackMessage[]>([]);
  const [dmLoading, setDmLoading] = useState(false);

  useEffect(() => {
    if (escalation?.source === "gmail" && escalation.threadId) {
      setGmailMessages([]);
      setGmailLoading(true);
      fetch(`/api/gmail/thread?threadId=${escalation.threadId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.messages) {
            setGmailMessages(d.messages);
            const last = d.messages[d.messages.length - 1];
            if (last) setExpandedMessages(new Set([last.id]));
          }
        })
        .catch(() => {})
        .finally(() => setGmailLoading(false));
    }
    if (escalation?.source === "slack" && escalation.slackType === "dm" && escalation.channelId) {
      setDmMessages([]);
      setDmLoading(true);
      fetch(`/api/slack/dm-history?channelId=${escalation.channelId}`)
        .then((r) => r.json())
        .then((d) => { if (d.messages) setDmMessages(d.messages); })
        .catch(() => {})
        .finally(() => setDmLoading(false));
    }
  }, [escalation?.id]);

  if (!escalation) return null;

  // Derived — placed after null guard so TypeScript knows escalation is non-null
  const isJira = escalation.source === "jira";
  const isAssignedJira = isJira && !!escalation.jiraKey && escalation.assigneeEmail === user?.email;

  async function closeJiraAndDismiss() {
    if (!escalation || !escalation.jiraKey || !onDismiss) return;
    setClosingJira(true);
    try {
      const res = await fetch("/api/jira/transition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jiraKey: escalation.jiraKey, assigneeEmail: escalation.assigneeEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("Jira close failed:", data.error);
      }
    } finally {
      setClosingJira(false);
      onDismiss(escalation.id, { source: escalation.source, subject: escalation.subject });
      onClose();
    }
  }

  const tones: { value: Tone; label: string }[] = [
    { value: "formal", label: "Formal" },
    { value: "empathetic", label: "Empathetic" },
    { value: "technical", label: "Technical" },
  ];

  async function generateDraft() {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escalationId: escalation!.id,
          merchantName: escalation!.merchantName,
          subject: escalation!.subject,
          snippet: escalation!.snippet,
          description: escalation!.description,
          source: escalation!.source,
          tone,
          instruction: aiInstruction,
          gmailThread: gmailMessages.length > 0
            ? gmailMessages.map((m) => `From: ${m.from}\n${m.body}`).join("\n\n---\n\n")
            : undefined,
        }),
      });
      const data = await res.json();
      if (data.draft) setReply(data.draft);
    } finally {
      setLoading(false);
    }
  }

  async function sendReply(asDraft = false) {
    setSending(true);
    try {
      const endpoint =
        escalation!.source === "gmail"
          ? `/api/gmail/send`
          : escalation!.source === "slack"
          ? `/api/slack/send`
          : `/api/jira/comment`;

      await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          escalationId: escalation!.id,
          threadId: escalation!.threadId,
          channelId: escalation!.channelId,
          jiraKey: escalation!.jiraKey,
          message: reply,
          asDraft,
        }),
      });
      setSent(true);
      setTimeout(() => {
        setSent(false);
        setReply("");
        onClose();
      }, 1500);
    } finally {
      setSending(false);
    }
  }

  const SourceIcon =
    escalation.source === "gmail" ? Mail : escalation.source === "slack" ? MessageSquare : Ticket;
  const comments = escalation.comments ?? [];
  const visibleComments = showAllComments ? comments : comments.slice(-3);

  return (
    <div className="w-[500px] h-full flex flex-col bg-surface-container-lowest border-l border-outline-variant/30 shrink-0">
      {/* Header */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-outline-variant/20">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <SourceIcon size={14} className="text-on-surface-variant shrink-0" />
            <span className="text-xs font-semibold text-on-surface">{escalation.merchantName}</span>
            <span className="text-xs text-on-surface-variant opacity-40">·</span>
            <span className="text-xs text-on-surface-variant">{timeAgo(escalation.lastMessageAt)}</span>
            {isJira && escalation.jiraKey && (
              <>
                <span className="text-xs text-on-surface-variant opacity-40">·</span>
                <span className="text-xs font-mono text-blue-600">{escalation.jiraKey}</span>
              </>
            )}
            {escalation.source === "slack" && escalation.slackUrl && (
              <>
                <span className="text-xs text-on-surface-variant opacity-40">·</span>
                <a
                  href={escalation.slackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-0.5 text-xs text-[#E01E5A] hover:underline font-medium"
                >
                  Open in Slack <ExternalLink size={10} />
                </a>
              </>
            )}
          </div>
          <h3 className="text-sm font-semibold text-on-surface font-headline leading-snug">
            {escalation.subject}
          </h3>
          {/* Jira metadata row */}
          {isJira && (
            <div className="flex flex-col gap-1.5 mt-1.5">
              {/* People row */}
              <div className="flex items-center gap-3 flex-wrap">
                {escalation.reporterName && (
                  <span className="text-xs text-on-surface-variant">
                    Reporter: <span className="font-medium text-on-surface">{escalation.reporterName}</span>
                  </span>
                )}
                {escalation.assignee && (
                  <span className="text-xs text-on-surface-variant">
                    Assignee: <span className="font-medium text-on-surface">{escalation.assignee}</span>
                  </span>
                )}
              </div>
              {/* Status/timing row */}
              <div className="flex items-center gap-3 flex-wrap">
                {escalation.jiraPriority && (
                  <span className="text-xs text-on-surface-variant">
                    Priority: <span className="font-medium text-on-surface">{escalation.jiraPriority}</span>
                  </span>
                )}
                {(escalation.jiraStatus || escalation.status) && (
                  <span className="text-xs text-on-surface-variant">
                    Status: <span className="font-medium text-on-surface">{escalation.jiraStatus ?? escalation.status}</span>
                  </span>
                )}
                {escalation.daysOpen !== undefined && (
                  <span className="text-xs text-on-surface-variant">
                    Open: <span className="font-medium text-on-surface">{escalation.daysOpen}d</span>
                  </span>
                )}
                {escalation.daysSinceUpdate !== undefined && (
                  <span className={cn("text-xs font-medium", escalation.daysSinceUpdate >= 7 ? "text-red-500" : "text-amber-600")}>
                    Last update: {escalation.daysSinceUpdate}d ago
                  </span>
                )}
                {escalation.waitingOnCSM && (
                  <span className="text-xs font-semibold text-red-500">⚠ Awaiting your reply</span>
                )}
              </div>
              {/* Labels row */}
              {escalation.labels && escalation.labels.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {escalation.labels.map((l) => (
                    <span key={l} className="text-xs px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant font-label">
                      {l}
                    </span>
                  ))}
                </div>
              )}
              {/* Link row */}
              {escalation.jiraUrl && (
                <a
                  href={escalation.jiraUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium w-fit"
                >
                  Open {escalation.jiraKey} in Jira <ExternalLink size={10} />
                </a>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant hover:text-on-surface transition-colors ml-3 shrink-0"
        >
          <X size={16} />
        </button>
      </div>

      {/* Scrollable context + reply area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">

        {/* Description (Jira) */}
        {isJira && escalation.description && (
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
              Problem Statement
            </p>
            <div className="bg-surface-container rounded-xl p-3.5">
              <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">
                {showFullDesc
                  ? escalation.description
                  : escalation.description.slice(0, 300) + (escalation.description.length > 300 ? "..." : "")}
              </p>
              {escalation.description.length > 300 && (
                <button
                  onClick={() => setShowFullDesc(!showFullDesc)}
                  className="flex items-center gap-1 text-xs text-primary mt-2 hover:underline"
                >
                  {showFullDesc ? <><ChevronUp size={11} /> Show less</> : <><ChevronDown size={11} /> Show full description</>}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Comments thread (Jira) */}
        {isJira && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
                Comments ({comments.length})
              </p>
              {comments.length > 3 && (
                <button
                  onClick={() => setShowAllComments(!showAllComments)}
                  className="text-xs text-primary hover:underline"
                >
                  {showAllComments ? "Show less" : `Show all ${comments.length}`}
                </button>
              )}
            </div>
            {comments.length === 0 ? (
              <div className="bg-surface-container rounded-xl p-3.5">
                <p className="text-sm text-on-surface-variant">No comments yet</p>
              </div>
            ) : (
              <div className="space-y-2">
                {comments.length > 3 && !showAllComments && (
                  <p className="text-xs text-on-surface-variant text-center">
                    Showing last 3 of {comments.length} comments
                  </p>
                )}
                {visibleComments.map((c, i) => {
                  const isGokwik = c.authorEmail?.endsWith("@gokwik.co");
                  return (
                    <div
                      key={i}
                      className={cn(
                        "rounded-xl p-3 text-sm",
                        isGokwik ? "bg-primary/5 border border-primary/10" : "bg-surface-container"
                      )}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={cn("text-xs font-semibold", isGokwik ? "text-primary" : "text-on-surface")}>
                          {c.author} {isGokwik && "(you/team)"}
                        </span>
                        <span className="text-xs text-on-surface-variant">{timeAgo(c.created)}</span>
                      </div>
                      <p className="text-on-surface leading-relaxed whitespace-pre-wrap">{c.body}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Gmail thread */}
        {escalation.source === "gmail" && (
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
              Email thread ({gmailMessages.length || "..."} messages)
            </p>
            {gmailLoading ? (
              <div className="flex items-center gap-2 text-on-surface-variant text-sm py-4 justify-center">
                <RefreshCw size={14} className="animate-spin" /> Loading thread...
              </div>
            ) : gmailMessages.length === 0 ? (
              <div className="bg-surface-container rounded-xl p-3.5">
                <p className="text-sm text-on-surface-variant">{escalation.snippet || "No content"}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {gmailMessages.map((msg, i) => {
                  const isExpanded = expandedMessages.has(msg.id);
                  const isLast = i === gmailMessages.length - 1;
                  const fromName = msg.from.match(/^(.*?)\s*</)?.[1]?.replace(/"/g, "").trim() || msg.from;
                  const isMe = msg.from.toLowerCase().includes("shreyaskar") || msg.from.toLowerCase().includes("gokwik.co");
                  return (
                    <div key={msg.id} className={cn("rounded-xl border overflow-hidden", isMe ? "border-primary/20 bg-primary/5" : "border-outline-variant/30 bg-surface-container")}>
                      <button
                        onClick={() => setExpandedMessages((prev) => {
                          const next = new Set(prev);
                          next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id);
                          return next;
                        })}
                        className="w-full flex items-center justify-between px-3 py-2 text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={cn("text-xs font-semibold truncate", isMe ? "text-primary" : "text-on-surface")}>
                            {fromName} {isMe && "(you)"}
                          </span>
                          {!isExpanded && (
                            <span className="text-xs text-on-surface-variant truncate opacity-60">
                              {msg.body.slice(0, 60)}...
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0 ml-2">
                          <span className="text-xs text-on-surface-variant">{timeAgo(msg.timestamp)}</span>
                          {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-3 pb-3 border-t border-outline-variant/20 pt-2">
                          <p className="text-xs text-on-surface-variant mb-1.5">To: {msg.to}</p>
                          <p className="text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{msg.body}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Slack context */}
        {escalation.source === "slack" && (
          <div className="space-y-3">
            {(() => {
              // For DMs: use lazily-loaded dmMessages; for others: use slackMessages from initial load
              const rawMsgs = escalation.slackType === "dm"
                ? dmMessages
                : (escalation.slackMessages ?? []);
              const loading = escalation.slackType === "dm" && dmLoading;
              const display = rawMsgs.slice(-10);

              if (loading) {
                return (
                  <div className="flex items-center gap-2 text-on-surface-variant text-sm py-4 justify-center">
                    <RefreshCw size={14} className="animate-spin" /> Loading conversation...
                  </div>
                );
              }

              if (display.length === 0) {
                return (
                  <div>
                    <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
                      Last message
                    </p>
                    <div className="bg-surface-container rounded-xl p-3.5">
                      <p className="text-sm text-on-surface leading-relaxed">{cleanSlackText(escalation.snippet)}</p>
                    </div>
                  </div>
                );
              }

              return (
                <div>
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
                    Conversation ({rawMsgs.length} message{rawMsgs.length !== 1 ? "s" : ""}{rawMsgs.length > 10 ? `, showing last 10` : ""})
                  </p>
                  <div className="space-y-2">
                    {display.map((msg, i) => (
                      <div
                        key={i}
                        className={cn(
                          "rounded-xl p-3 text-sm",
                          msg.fromMe
                            ? "bg-primary/10 border border-primary/20"
                            : "bg-surface-container"
                        )}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-semibold text-on-surface-variant">
                            {rawMsgs.length > 10 ? rawMsgs.length - 10 + i + 1 : i + 1}.
                          </span>
                          <span className={cn("text-xs font-semibold", msg.fromMe ? "text-primary" : "text-on-surface")}>
                            {msg.fromMe ? "You (me)" : msg.sender}
                          </span>
                        </div>
                        <p className="text-on-surface leading-relaxed pl-5">{cleanSlackText(msg.text)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Tone selector */}
        <div>
          <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-2">
            Reply tone
          </p>
          <div className="flex gap-2">
            {tones.map((t) => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-medium font-label transition-colors",
                  tone === t.value
                    ? "bg-primary text-on-primary"
                    : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* AI instruction */}
        <input
          type="text"
          placeholder="Tell AI what to include (optional)..."
          value={aiInstruction}
          onChange={(e) => setAiInstruction(e.target.value)}
          className="w-full px-3 py-2 rounded-xl bg-surface-container text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:bg-surface-container-high transition-colors"
        />

        {/* Draft button */}
        <button
          onClick={generateDraft}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary-fixed text-on-primary-fixed-variant hover:bg-primary-fixed-dim transition-colors text-sm font-medium"
        >
          {loading ? <RotateCcw size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? "Generating draft..." : "Draft with AI"}
        </button>

        {/* Reply textarea */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">
              Your reply
            </p>
            {reply && (
              <button
                onClick={() => setReply("")}
                className="text-xs text-on-surface-variant hover:text-on-surface flex items-center gap-1"
              >
                <RotateCcw size={10} /> Clear
              </button>
            )}
          </div>
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Type your reply or use AI to draft one..."
            rows={6}
            className="w-full px-4 py-3 rounded-xl bg-surface-container text-sm text-on-surface placeholder-on-surface-variant/50 outline-none focus:bg-surface-container-high transition-colors resize-none leading-relaxed"
          />
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-outline-variant/20 space-y-2">
        {/* Done actions */}
        {onDismiss && (
          <div className={cn("flex gap-2", isAssignedJira ? "flex-col" : "")}>
            <button
              onClick={() => { onDismiss(escalation.id, { source: escalation.source, subject: escalation.subject }); onClose(); }}
              className={cn(
                "flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition-colors text-sm font-medium",
                isAssignedJira ? "w-full" : "flex-1"
              )}
            >
              <CheckCheck size={14} />
              {isAssignedJira ? "Done (dismiss only)" : "Mark as Done"}
            </button>

            {isAssignedJira && (
              <button
                onClick={closeJiraAndDismiss}
                disabled={closingJira}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-primary/30 bg-primary/8 text-primary hover:bg-primary/15 transition-colors text-sm font-medium disabled:opacity-50"
              >
                {closingJira
                  ? <><RotateCcw size={14} className="animate-spin" /> Closing ticket…</>
                  : <><CheckCheck size={14} /> Done & Close Jira Ticket</>
                }
              </button>
            )}
          </div>
        )}

        {sent ? (
          <div className="flex items-center justify-center gap-2 py-2 text-green-600 text-sm font-medium">
            ✓ {escalation.source === "gmail" ? "Email sent!" : escalation.source === "slack" ? "Message sent!" : "Comment added!"}
          </div>
        ) : (
          <div className="flex gap-2">
            {escalation.source === "gmail" && (
              <button
                onClick={() => sendReply(true)}
                disabled={!reply.trim() || sending}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-outline-variant text-sm font-medium text-on-surface-variant hover:bg-surface-container disabled:opacity-40 transition-colors"
              >
                <Edit3 size={14} />
                Save Draft
              </button>
            )}
            <button
              onClick={() => sendReply(false)}
              disabled={!reply.trim() || sending}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm font-medium disabled:opacity-40 hover:bg-primary-container transition-colors"
            >
              {sending ? <RotateCcw size={14} className="animate-spin" /> : <Send size={14} />}
              {escalation.source === "gmail" ? "Send Email" : escalation.source === "slack" ? "Send Message" : "Add Comment"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
