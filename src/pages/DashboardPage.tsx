import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Header } from "@/components/layout/Header";
import { StatsBar } from "@/components/analytics/StatsBar";
import { ReplyDrawer } from "@/components/escalations/ReplyDrawer";
import { ThreadListDrawer } from "@/components/escalations/ThreadListDrawer";
import { ConnectBanner } from "@/components/escalations/ConnectBanner";
import { AnalysisPanel } from "@/components/analytics/AnalysisPanel";
import { WeeklyChart, CategoryChart } from "@/components/analytics/EscalationChart";
import type { Escalation } from "@/types";
import { computeStats, computeWeeklyData, computeCategoryData } from "@/lib/stats";
import { useSession } from "@/hooks/useSession";
import { useDismissedItems } from "@/hooks/useDismissedItems";
import { Mail, MessageSquare, Clock, RefreshCw, CheckCircle, TrendingUp } from "lucide-react";
import { WhatsAppSection } from "@/components/dashboard/WhatsAppSection";
import { cn } from "@/lib/utils";

type View = "my-queue" | "team";

interface HeadlineCard {
  label: string;
  count: number;
  icon: React.ElementType;
  color: string;
  bg: string;
  description: string;
  filter: (e: Escalation) => boolean;
}

function DashboardContent() {
  const { user } = useSession();
  const [searchParams] = useSearchParams();
  const { dismissedIds, entries: dismissedEntries, dismissItem, undismissItem } = useDismissedItems(user?.email);

  const [selectedEscalation, setSelectedEscalation] = useState<Escalation | null>(null);
  const [activeCard, setActiveCard] = useState<HeadlineCard | null>(null);
  const [view, setView] = useState<View>("my-queue");
  const [slackConnected, setSlackConnected] = useState(false);
  const [gmailConnected, setGmailConnected] = useState(false);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const firstName = user?.name?.split(" ")[0] ?? "there";

  useEffect(() => {
    if (searchParams.get("slack_connected") === "true") setToast("✅ Slack connected! Your DMs and mentions will now appear here.");
    if (searchParams.get("slack_error") === "true") setToast("❌ Slack connection failed. Please try again.");
    if (searchParams.get("gmail_connected") === "true") setToast("✅ Gmail connected! Your unread threads will now appear here.");
    if (searchParams.get("gmail_error") === "true") setToast("❌ Gmail connection failed. Check GOOGLE_CLIENT_SECRET in .env.");
    if (searchParams.get("gmail_error") === "missing_credentials") setToast("❌ Gmail not configured — add GOOGLE_CLIENT_SECRET to .env");
  }, [searchParams]);

  useEffect(() => {
    if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }
  }, [toast]);

  useEffect(() => {
    fetch("/api/slack/status").then((r) => r.json()).then((d) => setSlackConnected(d.connected)).catch(() => {});
    fetch("/api/gmail/status").then((r) => r.json()).then((d) => setGmailConnected(d.connected)).catch(() => {});
  }, []);

  async function fetchEscalations(currentView: View = view) {
    // Cancel any in-flight request
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    if (escalations.length === 0) setIsInitialLoad(true);
    else setIsRefreshing(true);

    try {
      const all: Escalation[] = [];
      const signal = ctrl.signal;
      const jiraUrl = `/api/jira/issues?view=${currentView}`;

      // Wrap each source fetch with a 15 s timeout so a slow Slack token never blocks the dashboard
      function timedFetch(url: string, ms = 15000): Promise<Response> {
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => reject(new Error("fetch timeout")), ms);
          fetch(url, { signal }).then((r) => { clearTimeout(timer); resolve(r); }).catch((e) => { clearTimeout(timer); reject(e); });
        });
      }

      if (currentView === "my-queue") {
        const [slackRes, jiraRes, gmailRes] = await Promise.allSettled([
          timedFetch("/api/slack/threads").then((r) => r.json()),
          timedFetch(jiraUrl).then((r) => r.json()),
          timedFetch("/api/gmail/threads").then((r) => r.json()),
        ]);
        if (slackRes.status === "fulfilled" && slackRes.value.threads) all.push(...slackRes.value.threads);
        if (jiraRes.status === "fulfilled" && jiraRes.value.issues) all.push(...jiraRes.value.issues);
        if (gmailRes.status === "fulfilled" && gmailRes.value.threads) all.push(...gmailRes.value.threads);
      } else {
        const jiraRes = await fetch(jiraUrl, { signal }).then((r) => r.json()).catch(() => ({}));
        if (jiraRes.issues) all.push(...jiraRes.issues);
      }

      if (ctrl.signal.aborted) return;

      const urgencyOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      all.sort((a, b) => (urgencyOrder[a.priority] ?? 2) - (urgencyOrder[b.priority] ?? 2));
      setEscalations(all);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") console.error("Fetch failed:", err);
    } finally {
      if (!ctrl.signal.aborted) {
        setIsInitialLoad(false);
        setIsRefreshing(false);
      }
    }
  }

  useEffect(() => {
    fetchEscalations("my-queue");
    return () => abortRef.current?.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      fetch("/api/gmail/mark-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: esc.threadId }) }).catch(() => {});
    }
    if (esc?.source === "slack" && esc.channelId && esc.threadTs) {
      fetch("/api/slack/mark-read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelId: esc.channelId, threadTs: esc.threadTs }) }).catch(() => {});
    }
  }

  const realStats = computeStats(escalations, dismissedIds, dismissedEntries);
  const weeklyData = computeWeeklyData(escalations, dismissedIds, dismissedEntries);
  const categoryData = computeCategoryData(escalations);

  // ── Email headline cards (1.2) ────────────────────────────────────────────
  const emailCards: HeadlineCard[] = [
    {
      label: "Reply Waiting on Me",
      count: escalations.filter((e) => e.source === "gmail" && e.waitingOnCSM && !dismissedIds.has(e.id)).length,
      icon: Mail,
      color: "text-blue-600",
      bg: "bg-blue-50",
      description: "Unread emails awaiting your reply",
      filter: (e) => e.source === "gmail" && !!e.waitingOnCSM,
    },
    {
      label: "Follow-Up Required",
      count: escalations.filter((e) => e.source === "gmail" && !e.waitingOnCSM && (e.messageCount ?? 0) > 1 && !dismissedIds.has(e.id)).length,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      description: "You replied — waiting on merchant or team",
      filter: (e) => e.source === "gmail" && !e.waitingOnCSM && (e.messageCount ?? 0) > 1,
    },
  ];

  // ── Slack headline cards (1.3) ────────────────────────────────────────────
  const slackCards: HeadlineCard[] = [
    {
      label: "Reply Waiting on Me",
      count: escalations.filter((e) => e.source === "slack" && (e.slackType === "dm" || e.slackType === "mention") && !dismissedIds.has(e.id)).length,
      icon: MessageSquare,
      color: "text-blue-600",
      bg: "bg-blue-50",
      description: "DMs and @mentions awaiting your response",
      filter: (e) => e.source === "slack" && (e.slackType === "dm" || e.slackType === "mention"),
    },
    {
      label: "Follow-Up Required",
      count: escalations.filter((e) => e.source === "slack" && e.slackType === "raised" && !dismissedIds.has(e.id)).length,
      icon: Clock,
      color: "text-amber-600",
      bg: "bg-amber-50",
      description: "Threads you raised — waiting on others",
      filter: (e) => e.source === "slack" && e.slackType === "raised",
    },
  ];

  function handleCardClick(card: HeadlineCard) {
    setActiveCard(card);
  }

  // ── StatsBar card → filter mapping ───────────────────────────────────────
  function handleStatClick(label: string) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)); // Monday
    weekStart.setHours(0, 0, 0, 0);

    const statCards: Record<string, HeadlineCard> = {
      "Open": {
        label: "Open",
        count: 0,
        icon: Mail,
        color: "text-blue-600",
        bg: "bg-blue-50",
        description: "All active queries across Email, Slack & Jira",
        filter: () => true,
      },
      "Pending Reply": {
        label: "Pending Reply",
        count: 0,
        icon: Clock,
        color: "text-amber-600",
        bg: "bg-amber-50",
        description: "Items waiting on your response",
        filter: (e) =>
          !!e.waitingOnCSM ||
          (e.source === "slack" && (e.slackType === "dm" || e.slackType === "mention")),
      },
      "Closed": {
        label: "Closed",
        count: 0,
        icon: CheckCircle,
        color: "text-green-600",
        bg: "bg-green-50",
        description: "Items you marked as done — click Revert to reopen",
        filter: (e) => dismissedIds.has(e.id),
      },
      "This Week": {
        label: "This Week",
        count: 0,
        icon: TrendingUp,
        color: "text-on-surface-variant",
        bg: "bg-surface-container",
        description: "Queries created this week (Mon–Sun)",
        filter: (e) => new Date(e.createdAt) >= weekStart,
      },
    };

    const card = statCards[label];
    if (card) setActiveCard(card);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title={`Good morning, ${firstName} 👋`}
        subtitle="Your pending queries across Slack, Jira & Gmail"
        onRefresh={() => fetchEscalations(view)}
        searchData={escalations}
        onSelectResult={setSelectedEscalation}
      />

      {toast && (
        <div className="mx-6 mt-3 px-4 py-2.5 rounded-xl bg-primary text-on-primary text-sm text-center">
          {toast}
        </div>
      )}

      {isRefreshing && (
        <div className="flex items-center gap-2 px-8 py-1.5 bg-surface-container/50 border-b border-outline-variant/10 text-xs text-on-surface-variant">
          <RefreshCw size={11} className="animate-spin" />
          Refreshing data...
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="px-8 py-5 space-y-6">
          {isInitialLoad && escalations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-on-surface-variant gap-3">
              <RefreshCw size={22} className="animate-spin text-primary" />
              <p className="text-sm">Loading your dashboard...</p>
            </div>
          ) : (
            <>
              <StatsBar stats={realStats} onCardClick={handleStatClick} />
              <ConnectBanner slackConnected={slackConnected} gmailConnected={gmailConnected} />
              <AnalysisPanel />

              {/* Email Headline Cards — Section 1.2 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Mail size={15} className="text-on-surface-variant" />
                  <h2 className="text-sm font-bold font-headline text-on-surface">Email</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {emailCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.label}
                        onClick={() => handleCardClick(card)}
                        className="bg-surface-container-lowest rounded-xl p-4 shadow-card text-left hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-label font-medium text-on-surface-variant uppercase tracking-wide">{card.label}</p>
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", card.bg)}>
                            <Icon size={14} className={card.color} />
                          </div>
                        </div>
                        <p className="text-2xl font-bold font-headline text-on-surface">{card.count}</p>
                        <p className="text-xs text-on-surface-variant mt-1">{card.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Slack Headline Cards — Section 1.3 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <MessageSquare size={15} className="text-on-surface-variant" />
                  <h2 className="text-sm font-bold font-headline text-on-surface">Slack</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {slackCards.map((card) => {
                    const Icon = card.icon;
                    return (
                      <button
                        key={card.label}
                        onClick={() => handleCardClick(card)}
                        className="bg-surface-container-lowest rounded-xl p-4 shadow-card text-left hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs font-label font-medium text-on-surface-variant uppercase tracking-wide">{card.label}</p>
                          <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", card.bg)}>
                            <Icon size={14} className={card.color} />
                          </div>
                        </div>
                        <p className="text-2xl font-bold font-headline text-on-surface">{card.count}</p>
                        <p className="text-xs text-on-surface-variant mt-1">{card.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* WhatsApp Groups */}
              <WhatsAppSection />

              {/* Charts */}
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2"><WeeklyChart data={weeklyData} /></div>
                <div><CategoryChart data={categoryData} /></div>
              </div>
            </>
          )}
        </div>
      </div>

      {activeCard && !selectedEscalation && (
        <ThreadListDrawer
          card={activeCard}
          escalations={escalations}
          dismissedIds={dismissedIds}
          dismissedEntries={dismissedEntries}
          onSelectEscalation={(e) => { setSelectedEscalation(e); }}
          onUndismiss={(id) => undismissItem(id)}
          onDismiss={(id, meta) => handleDismiss(id)}
          onClose={() => setActiveCard(null)}
        />
      )}

      {selectedEscalation && (
        <ReplyDrawer
          escalation={selectedEscalation}
          onClose={() => setSelectedEscalation(null)}
          onDismiss={(id, meta) => { handleDismiss(id); setSelectedEscalation(null); }}
        />
      )}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  );
}
