import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { EscalationCard } from "@/components/escalations/EscalationCard";
import { ReplyDrawer } from "@/components/escalations/ReplyDrawer";
import type { Escalation, EscalationSource } from "@/types";
import { cn } from "@/lib/utils";
import {
  Mail, MessageSquare, Ticket, Filter, RefreshCw, User, Users, RotateCcw,
  ArrowUpDown, ArrowUp, ArrowDown,
} from "lucide-react";
import { useSession } from "@/hooks/useSession";
import { useDismissedItems } from "@/hooks/useDismissedItems";

type View = "my-queue" | "team";
type SortField = "date" | "priority" | "sla";
type SortDir = "desc" | "asc";

const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function EscalationsContent() {
  const { user } = useSession();
  const [searchParams] = useSearchParams();
  const { dismissedIds, entries: dismissedEntries, dismissItem, restoreAll } = useDismissedItems(user?.email);
  const sourceParam = searchParams.get("source") as EscalationSource | null;

  const [selectedEscalation, setSelectedEscalation] = useState<Escalation | null>(null);
  const [activeSource, setActiveSource] = useState<EscalationSource | "all">(sourceParam ?? "all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [view, setView] = useState<View>("my-queue");
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const [total, setTotal] = useState(0);
  const [sortField, setSortField] = useState<SortField>("priority");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // Sync activeSource when URL param changes (e.g. sidebar source links — fix 5.1)
  useEffect(() => {
    if (sourceParam) setActiveSource(sourceParam);
  }, [sourceParam]);

  // Reset status filter when switching source to avoid empty-state surprise (fix 2.1)
  function handleSourceChange(src: EscalationSource | "all") {
    setActiveSource(src);
    setStatusFilter("all");
  }

  async function fetchAll(currentView: View = view) {
    setLoading(true);
    try {
      const all: Escalation[] = [];
      const jiraUrl = `/api/jira/issues?view=${currentView}`;

      function timedFetch(url: string, ms = 15000): Promise<Response> {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("fetch timeout")), ms);
          fetch(url).then((r) => { clearTimeout(timer); resolve(r); }).catch((e) => { clearTimeout(timer); reject(e); });
        });
      }

      if (currentView === "my-queue") {
        const [slackRes, jiraRes, gmailRes] = await Promise.allSettled([
          timedFetch("/api/slack/threads").then((r) => r.json()),
          timedFetch(jiraUrl).then((r) => r.json()),
          timedFetch("/api/gmail/threads").then((r) => r.json()),
        ]);
        if (slackRes.status === "fulfilled" && slackRes.value.threads) all.push(...slackRes.value.threads);
        if (jiraRes.status === "fulfilled" && jiraRes.value.issues) {
          all.push(...jiraRes.value.issues);
          setTotal(jiraRes.value.total ?? jiraRes.value.issues.length);
        }
        if (gmailRes.status === "fulfilled" && gmailRes.value.threads) all.push(...gmailRes.value.threads);
      } else {
        const jiraRes = await fetch(jiraUrl).then((r) => r.json()).catch(() => ({}));
        if (jiraRes.issues) {
          all.push(...jiraRes.issues);
          setTotal(jiraRes.total ?? jiraRes.issues.length);
        }
      }

      setEscalations(all);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll("my-queue"); }, []);

  // Keep sidebar badge in sync
  useEffect(() => {
    const count = escalations.filter((e) => !dismissedIds.has(e.id)).length;
    localStorage.setItem("pendingCount", String(count));
    window.dispatchEvent(new Event("pendingCountUpdate"));
  }, [escalations, dismissedIds]);

  function handleDismiss(id: string) {
    const esc = escalations.find((e) => e.id === id);
    dismissItem(id, { source: esc?.source, subject: esc?.subject });
    if (selectedEscalation?.id === id) setSelectedEscalation(null);
    if (esc?.source === "gmail" && esc.threadId) {
      fetch("/api/gmail/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId: esc.threadId }),
      }).catch(() => {});
    }
    if (esc?.source === "slack" && esc.channelId && esc.threadTs) {
      fetch("/api/slack/mark-read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: esc.channelId, threadTs: esc.threadTs }),
      }).catch(() => {});
    }
  }

  const sources: { value: EscalationSource | "all"; label: string; icon: React.ElementType }[] = [
    { value: "all", label: "All Sources", icon: Filter },
    { value: "gmail", label: "Gmail", icon: Mail },
    { value: "slack", label: "Slack", icon: MessageSquare },
    { value: "jira", label: "Jira", icon: Ticket },
  ];

  const statuses = ["all", "open", "pending_reply"] as const;
  const statusLabels: Record<string, string> = {
    all: "All", open: "Open", pending_reply: "Pending Reply",
  };

  function sortEscalations(list: Escalation[]): Escalation[] {
    return [...list].sort((a, b) => {
      let cmp = 0;
      if (sortField === "priority") {
        cmp = (PRIORITY_ORDER[a.priority] ?? 2) - (PRIORITY_ORDER[b.priority] ?? 2);
      } else if (sortField === "date") {
        cmp = new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      } else if (sortField === "sla") {
        const slaScore = (e: Escalation) =>
          e.status === "sla_breached" ? 0 : e.status === "pending_reply" ? 1 : 2;
        cmp = slaScore(a) - slaScore(b);
      }
      return sortDir === "asc" ? -cmp : cmp;
    });
  }

  // "Pending Reply" filter: include both pending_reply AND sla_breached (fix 2.4)
  function matchesStatus(e: Escalation, filter: string): boolean {
    if (filter === "all") return true;
    if (filter === "pending_reply") return e.status === "pending_reply" || e.status === "sla_breached";
    return e.status === filter;
  }

  const filtered = sortEscalations(
    escalations.filter((e) => {
      if (!showDismissed && dismissedIds.has(e.id)) return false;
      if (activeSource !== "all" && e.source !== activeSource) return false;
      if (!matchesStatus(e, statusFilter)) return false;
      return true;
    })
  );

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortField(field); setSortDir("desc"); }
  }

  function SortButton({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    const Icon = active ? (sortDir === "desc" ? ArrowDown : ArrowUp) : ArrowUpDown;
    return (
      <button
        onClick={() => toggleSort(field)}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-label transition-colors",
          active ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
        )}
      >
        <Icon size={11} />
        {label}
      </button>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Queries"
        subtitle={`${filtered.filter((e) => !dismissedIds.has(e.id)).length} quer${filtered.filter((e) => !dismissedIds.has(e.id)).length !== 1 ? "ies" : "y"} · ${total > 0 ? `${total} Jira tickets total` : "All sources"}`}
        onRefresh={() => fetchAll(view)}
        searchData={escalations}
        onSelectResult={setSelectedEscalation}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* List panel */}
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Filters bar */}
          <div className="flex items-center gap-3 px-6 py-3 border-b border-outline-variant/20 bg-surface-container-lowest flex-wrap">
            {/* View toggle */}
            <div className="flex gap-1 bg-surface-container rounded-xl p-1">
              {(["my-queue", "team"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => { setView(v); fetchAll(v); }}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium font-label transition-colors",
                    view === v ? "bg-surface-container-lowest text-on-surface shadow-sm" : "text-on-surface-variant"
                  )}
                >
                  {v === "my-queue" ? <><User size={12} /> My Queue</> : <><Users size={12} /> Team</>}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-outline-variant/40" />

            {/* Source tabs */}
            <div className="flex gap-1">
              {sources.map((s) => {
                const Icon = s.icon;
                const active = activeSource === s.value;
                return (
                  <button
                    key={s.value}
                    onClick={() => handleSourceChange(s.value)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium font-label transition-colors",
                      active ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                    )}
                  >
                    <Icon size={13} />
                    {s.label}
                  </button>
                );
              })}
            </div>

            <div className="h-4 w-px bg-outline-variant/40" />

            {/* Status filters */}
            <div className="flex gap-1.5">
              {statuses.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-xs font-label transition-colors",
                    statusFilter === s ? "bg-primary-fixed text-on-primary-fixed-variant font-semibold" : "text-on-surface-variant hover:bg-surface-container"
                  )}
                >
                  {statusLabels[s]}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-outline-variant/40" />

            {/* Sort controls */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-on-surface-variant font-label mr-1">Sort:</span>
              <SortButton field="priority" label="Priority" />
              <SortButton field="date" label="Date" />
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <span className="text-xs text-on-surface-variant font-label">
                {filtered.filter((e) => !dismissedIds.has(e.id)).length} results
              </span>
              {dismissedIds.size > 0 && (
                <>
                  <button
                    onClick={() => setShowDismissed((v) => !v)}
                    className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-surface-container text-on-surface-variant hover:bg-surface-container-high transition-colors"
                  >
                    <RotateCcw size={10} />
                    {dismissedIds.size} done
                  </button>
                  {showDismissed && (
                    <button onClick={() => { restoreAll(); setShowDismissed(false); }} className="text-xs text-primary hover:underline whitespace-nowrap">
                      Restore all
                    </button>
                  )}
                </>
              )}
              <button
                onClick={() => fetchAll(view)}
                className="p-1.5 rounded-lg hover:bg-surface-container text-on-surface-variant transition-colors"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </div>

          {/* Escalation list */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-40 text-on-surface-variant">
                <RefreshCw size={20} className="animate-spin mb-2 text-primary" />
                <p className="text-sm">Loading your queries...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-on-surface-variant px-6 text-center">
                <p className="text-sm">No queries match your filters</p>
                {view === "team" && (
                  <p className="text-xs mt-1 opacity-60">Team view shows tickets you commented on or are watching. Try My Queue for your assigned/reported tickets.</p>
                )}
              </div>
            ) : (
              filtered.map((e) => (
                <div key={e.id} className={cn(showDismissed && dismissedIds.has(e.id) ? "opacity-40" : "")}>
                  <EscalationCard
                    escalation={e}
                    onClick={setSelectedEscalation}
                    onDismiss={dismissedIds.has(e.id) ? undefined : handleDismiss}
                    selected={selectedEscalation?.id === e.id}
                  />
                </div>
              ))
            )}
          </div>
        </div>

        {/* Reply drawer */}
        {selectedEscalation && (
          <ReplyDrawer
            escalation={selectedEscalation}
            onClose={() => setSelectedEscalation(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function EscalationsPage() {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
      <EscalationsContent />
    </Suspense>
  );
}
