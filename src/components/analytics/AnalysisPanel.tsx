import { useState } from "react";
import { Sparkles, AlertTriangle, AlertCircle, Info, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

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

const urgencyConfig = {
  critical: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", icon: AlertTriangle, label: "Critical" },
  high: { color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", icon: AlertCircle, label: "High" },
  medium: { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", icon: Info, label: "Medium" },
  low: { color: "text-green-600", bg: "bg-green-50", border: "border-green-100", icon: Info, label: "Low" },
};

const sourceLabel = { slack: "Slack", jira: "Jira", gmail: "Email" };
const sourceBadge = {
  slack: "bg-[#E01E5A]/10 text-[#E01E5A]",
  jira: "bg-blue-100 text-blue-700",
  gmail: "bg-red-100 text-red-600",
};

function AnalysisItem({ item }: { item: AnalysisItem }) {
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
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">
                Suggested action
              </p>
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

export function AnalysisPanel() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  async function runAnalysis() {
    setLoading(true);
    try {
      // Fetch all sources in parallel
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

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20">
        <div>
          <h3 className="text-sm font-bold font-headline text-on-surface flex items-center gap-2">
            <Sparkles size={15} className="text-amber" />
            AI Analysis
          </h3>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Claude analyses all your pending items across Slack, Jira & Gmail
          </p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container disabled:opacity-50 transition-colors"
        >
          {loading ? <RotateCcw size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {loading ? "Analysing..." : ran ? "Re-analyse" : "Run Analysis"}
        </button>
      </div>

      <div className="px-5 py-4">
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
            {/* Summary */}
            <div className="bg-primary/5 rounded-xl p-4 mb-4">
              <p className="text-sm text-on-surface leading-relaxed">{analysis.summary}</p>
              <div className="flex gap-3 mt-3">
                {analysis.criticalCount > 0 && (
                  <span className="text-xs font-semibold text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
                    {analysis.criticalCount} Critical
                  </span>
                )}
                {analysis.highCount > 0 && (
                  <span className="text-xs font-semibold text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">
                    {analysis.highCount} High
                  </span>
                )}
                <span className="text-xs text-on-surface-variant ml-auto">
                  {analysis.items?.length ?? 0} total items
                </span>
              </div>
            </div>

            {/* Items */}
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {(analysis.items ?? []).map((item) => (
                <AnalysisItem key={item.id} item={item} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
