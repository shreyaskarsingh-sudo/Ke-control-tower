"use client";

import { useState } from "react";
import { Sparkles, AlertTriangle, AlertCircle, Info, RotateCcw, ChevronDown, ChevronUp, Search, MessageCircle, Mail, MessageSquare, Ticket, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Escalation } from "@/types";

interface AnalysisItem {
  id: string;
  source: "slack" | "jira" | "gmail";
  urgency: "critical" | "high" | "medium" | "low";
  merchantName: string;
  title: string;
  reason: string;
  suggestedAction: string;
  waitingDays: number;
}

interface Analysis {
  summary: string;
  criticalCount: number;
  highCount: number;
  items: AnalysisItem[];
}

interface WaChat {
  chat_id: string;
  chat_name: string;
  status: string;
  latest_message?: { body?: string; timestamp?: number | string };
}

interface AnalysisPanelProps {
  escalations?: Escalation[];
  whatsappChats?: WaChat[];
  onSelectEscalation?: (e: Escalation) => void;
}

const urgencyConfig = {
  critical: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", icon: AlertTriangle, label: "Critical" },
  high: { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: AlertCircle, label: "High" },
  medium: { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", icon: Info, label: "Medium" },
  low: { color: "text-green-600", bg: "bg-green-50", border: "border-green-100", icon: Info, label: "Low" },
};

const sourceLabel: Record<string, string> = { slack: "Slack", jira: "Jira", gmail: "Email", whatsapp: "WhatsApp" };
const sourceBadge: Record<string, string> = {
  slack: "bg-[#E01E5A]/10 text-[#E01E5A]",
  jira: "bg-blue-100 text-blue-700",
  gmail: "bg-red-100 text-red-600",
  whatsapp: "bg-green-100 text-green-700",
};
const sourceIcon: Record<string, React.ElementType> = {
  slack: MessageSquare,
  jira: Ticket,
  gmail: Mail,
  whatsapp: MessageCircle,
};

function statusBadge(status: string, waitingOnCSM?: boolean) {
  if (status === "sla_breached") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">SLA Breached</span>;
  if (status === "pending_reply" || waitingOnCSM) return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Pending</span>;
  if (status === "closed") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Resolved</span>;
  if (status === "open") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Open</span>;
  // WhatsApp statuses
  if (status === "pending") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Pending</span>;
  if (status === "responded") return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Responded</span>;
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant border border-outline-variant/40">{status}</span>;
}

function AiAnalysisItem({ item }: { item: AnalysisItem }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = urgencyConfig[item.urgency];
  const Icon = cfg.icon;

  return (
    <div className={cn("rounded-xl border p-4 mb-2", cfg.bg, cfg.border)}>
      <div className="flex items-start gap-3">
        <Icon size={16} className={cn("mt-0.5 shrink-0", cfg.color)} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold", sourceBadge[item.source])}>
              {sourceLabel[item.source]}
            </span>
            <span className="text-xs font-semibold text-on-surface">{item.merchantName}</span>
            <span className={cn("text-xs font-bold ml-auto", cfg.color)}>{cfg.label}</span>
          </div>
          <p className="text-sm font-medium text-on-surface truncate">{item.title}</p>
          <p className="text-xs text-on-surface-variant mt-1">{item.reason}</p>
          {expanded && (
            <div className="mt-2 pt-2 border-t border-black/10">
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Suggested action</p>
              <p className="text-sm text-on-surface">{item.suggestedAction}</p>
            </div>
          )}
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 text-xs text-on-surface-variant mt-2 hover:text-on-surface"
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? "Less" : "Suggested action"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function AnalysisPanel({ escalations = [], whatsappChats = [], onSelectEscalation }: AnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<"ai" | "merchant">("ai");

  // AI analysis state
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  // Merchant lookup state
  const [merchantQuery, setMerchantQuery] = useState("");
  const [merchantResults, setMerchantResults] = useState<{
    escalations: Escalation[];
    chats: WaChat[];
  } | null>(null);
  const [searched, setSearched] = useState(false);

  async function runAnalysis() {
    setLoading(true);
    try {
      const [slackRes, jiraRes] = await Promise.allSettled([
        fetch("/api/slack/threads").then((r) => r.json()),
        fetch("/api/jira/issues").then((r) => r.json()),
      ]);
      const slackThreads = slackRes.status === "fulfilled" ? slackRes.value.threads ?? [] : [];
      const jiraIssues = jiraRes.status === "fulfilled" ? jiraRes.value.issues ?? [] : [];
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slackThreads, jiraIssues, gmailThreads: [] }),
      });
      const data = await res.json();
      setAnalysis(data.analysis);
      setRan(true);
    } finally {
      setLoading(false);
    }
  }

  function searchMerchant() {
    const q = merchantQuery.trim().toLowerCase();
    if (!q) return;
    const matchedEscalations = escalations.filter((e) =>
      e.merchantName?.toLowerCase().includes(q) ||
      (e.merchantId ?? "").toLowerCase().includes(q) ||
      e.subject?.toLowerCase().includes(q) ||
      e.snippet?.toLowerCase().includes(q)
    );
    const matchedChats = whatsappChats.filter((c) =>
      c.chat_name?.toLowerCase().includes(q)
    );
    setMerchantResults({ escalations: matchedEscalations, chats: matchedChats });
    setSearched(true);
  }

  const totalMerchantResults = (merchantResults?.escalations.length ?? 0) + (merchantResults?.chats.length ?? 0);

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card overflow-hidden">
      {/* Tabs */}
      <div className="flex items-center border-b border-outline-variant/20 px-5 pt-4">
        <div className="flex gap-1 flex-1">
          <button
            onClick={() => setActiveTab("ai")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium font-label rounded-t-lg border-b-2 -mb-px transition-colors",
              activeTab === "ai" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Sparkles size={13} />
            AI Analysis
          </button>
          <button
            onClick={() => setActiveTab("merchant")}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 text-xs font-medium font-label rounded-t-lg border-b-2 -mb-px transition-colors",
              activeTab === "merchant" ? "border-primary text-primary" : "border-transparent text-on-surface-variant hover:text-on-surface"
            )}
          >
            <Search size={13} />
            Merchant Lookup
          </button>
        </div>
        {activeTab === "ai" && (
          <button
            onClick={runAnalysis}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 mb-1 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? <RotateCcw size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {loading ? "Analysing..." : ran ? "Re-analyse" : "Run Analysis"}
          </button>
        )}
      </div>

      <div className="px-5 py-4">
        {/* ── AI Analysis tab ── */}
        {activeTab === "ai" && (
          <>
            {!ran && !loading && (
              <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant">
                <Sparkles size={28} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">Click Run Analysis</p>
                <p className="text-xs mt-1 opacity-60 text-center max-w-xs">
                  Claude will scan all your pending Slack DMs, Jira tickets and emails and rank them by urgency
                </p>
              </div>
            )}
            {loading && (
              <div className="flex flex-col items-center justify-center py-8 text-on-surface-variant">
                <RotateCcw size={24} className="animate-spin mb-3 text-primary" />
                <p className="text-sm">Analysing your pending items...</p>
              </div>
            )}
            {analysis && !loading && (
              <>
                <div className="bg-primary/5 rounded-xl p-4 mb-4">
                  <p className="text-sm text-on-surface leading-relaxed">{analysis.summary}</p>
                  <div className="flex gap-3 mt-3">
                    {analysis.criticalCount > 0 && (
                      <span className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">{analysis.criticalCount} Critical</span>
                    )}
                    {analysis.highCount > 0 && (
                      <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">{analysis.highCount} High</span>
                    )}
                    <span className="text-xs text-on-surface-variant ml-auto">{analysis.items?.length ?? 0} total items</span>
                  </div>
                </div>
                <div className="max-h-80 overflow-y-auto custom-scrollbar">
                  {(analysis.items ?? []).map((item) => <AiAnalysisItem key={item.id} item={item} />)}
                </div>
              </>
            )}
          </>
        )}

        {/* ── Merchant Lookup tab ── */}
        {activeTab === "merchant" && (
          <div className="space-y-4">
            <div>
              <p className="text-xs text-on-surface-variant mb-2">
                Enter a merchant name or MID to see all related threads across Slack, Jira, Email and WhatsApp.
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
                  <input
                    type="text"
                    value={merchantQuery}
                    onChange={(e) => setMerchantQuery(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && searchMerchant()}
                    placeholder="e.g. Nykaa, GKP-1234, merchant domain..."
                    className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-outline-variant/40 bg-surface-container text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                    autoFocus={activeTab === "merchant"}
                  />
                  {merchantQuery && (
                    <button onClick={() => { setMerchantQuery(""); setMerchantResults(null); setSearched(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
                      <X size={13} />
                    </button>
                  )}
                </div>
                <button
                  onClick={searchMerchant}
                  disabled={!merchantQuery.trim()}
                  className="px-4 py-2 text-xs rounded-xl bg-primary text-on-primary font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  Search
                </button>
              </div>
            </div>

            {searched && merchantResults && (
              <div>
                <p className="text-xs text-on-surface-variant mb-3 font-label">
                  {totalMerchantResults === 0
                    ? `No results for "${merchantQuery}"`
                    : `${totalMerchantResults} result${totalMerchantResults !== 1 ? "s" : ""} for "${merchantQuery}"`}
                </p>

                {totalMerchantResults === 0 && (
                  <div className="flex flex-col items-center py-8 text-on-surface-variant">
                    <Search size={24} className="mb-2 opacity-30" />
                    <p className="text-sm">No threads found for this merchant</p>
                  </div>
                )}

                <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
                  {/* Escalations (Slack, Jira, Gmail) */}
                  {merchantResults.escalations.map((e) => {
                    const Icon = sourceIcon[e.source] ?? Mail;
                    return (
                      <button
                        key={e.id}
                        onClick={() => onSelectEscalation?.(e)}
                        disabled={!onSelectEscalation}
                        className="w-full flex items-start gap-3 px-3 py-3 rounded-xl border border-outline-variant/20 bg-surface-container hover:bg-surface-container-high text-left transition-colors disabled:cursor-default"
                      >
                        <Icon size={14} className="text-on-surface-variant mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full font-semibold", sourceBadge[e.source])}>
                              {sourceLabel[e.source]}
                            </span>
                            <span className="text-xs font-semibold text-on-surface truncate">{e.merchantName}</span>
                          </div>
                          <p className="text-xs text-on-surface truncate">{e.subject}</p>
                          <p className="text-[10px] text-on-surface-variant truncate mt-0.5">{e.snippet}</p>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1">
                          {statusBadge(e.status, e.waitingOnCSM)}
                        </div>
                      </button>
                    );
                  })}

                  {/* WhatsApp chats */}
                  {merchantResults.chats.map((c) => (
                    <a
                      key={c.chat_id}
                      href={`/periskope?chat=${encodeURIComponent(c.chat_id)}`}
                      className="flex items-start gap-3 px-3 py-3 rounded-xl border border-outline-variant/20 bg-surface-container hover:bg-surface-container-high transition-colors"
                    >
                      <MessageCircle size={14} className="text-on-surface-variant mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold bg-green-100 text-green-700">WhatsApp</span>
                          <span className="text-xs font-semibold text-on-surface truncate">{c.chat_name}</span>
                        </div>
                        <p className="text-[10px] text-on-surface-variant truncate">{c.latest_message?.body?.slice(0, 80) ?? "No messages"}</p>
                      </div>
                      <div className="shrink-0">
                        {statusBadge(c.status)}
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {!searched && (
              <div className="flex flex-col items-center py-8 text-on-surface-variant">
                <Search size={28} className="mb-3 opacity-20" />
                <p className="text-sm font-medium">Search by merchant name or MID</p>
                <p className="text-xs mt-1 opacity-60 text-center max-w-xs">
                  See all open and resolved threads for that merchant across every source
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
