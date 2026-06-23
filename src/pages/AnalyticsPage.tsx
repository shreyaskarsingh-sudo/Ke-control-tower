import { useState, useEffect, useMemo } from "react";
import { Header } from "@/components/layout/Header";
import { StatsBar } from "@/components/analytics/StatsBar";
import { WeeklyChart, CategoryChart } from "@/components/analytics/EscalationChart";
import { MerchantTable } from "@/components/analytics/MerchantTable";
import { mockMerchantStats } from "@/lib/mock-data";
import type { Escalation, MerchantStats } from "@/types";
import { computeStats, computeWeeklyData, computeCategoryData } from "@/lib/stats";
import { useDismissedItems } from "@/hooks/useDismissedItems";
import { useSession } from "@/hooks/useSession";
import { RefreshCw, Calendar, Filter } from "lucide-react";
import { WhatsAppSection } from "@/components/dashboard/WhatsAppSection";
import { cn } from "@/lib/utils";
import { subDays, startOfQuarter } from "date-fns";

type DateRange = "7d" | "30d" | "quarter" | "all";
type ChannelFilter = "all" | "gmail" | "slack" | "jira";

const DATE_RANGE_LABELS: Record<DateRange, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "quarter": "This quarter",
  "all": "All time",
};

const CHANNEL_LABELS: Record<ChannelFilter, string> = {
  all: "All Channels",
  gmail: "Email",
  slack: "Slack",
  jira: "Jira",
};

export default function AnalyticsPage() {
  const { user } = useSession();
  const { dismissedIds, entries: dismissedEntries } = useDismissedItems(user?.email);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");

  async function fetchAll() {
    setLoading(true);
    try {
      const [slackRes, jiraRes, gmailRes] = await Promise.allSettled([
        fetch("/api/slack/threads").then((r) => r.json()),
        fetch("/api/jira/issues?view=my-queue").then((r) => r.json()),
        fetch("/api/gmail/threads").then((r) => r.json()),
      ]);
      const all: Escalation[] = [];
      if (slackRes.status === "fulfilled" && slackRes.value.threads) all.push(...slackRes.value.threads);
      if (jiraRes.status === "fulfilled" && jiraRes.value.issues) all.push(...jiraRes.value.issues);
      if (gmailRes.status === "fulfilled" && gmailRes.value.threads) all.push(...gmailRes.value.threads);
      setEscalations(all);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchAll(); }, []);

  // Apply date + channel filters
  const filtered = useMemo(() => {
    let list = escalations;

    if (channelFilter !== "all") {
      list = list.filter((e) => e.source === channelFilter);
    }

    if (dateRange !== "all") {
      let cutoff: Date;
      const now = new Date();
      if (dateRange === "7d") cutoff = subDays(now, 7);
      else if (dateRange === "30d") cutoff = subDays(now, 30);
      else cutoff = startOfQuarter(now);
      list = list.filter((e) => new Date(e.createdAt) >= cutoff);
    }

    return list;
  }, [escalations, dateRange, channelFilter]);

  const stats = computeStats(filtered, dismissedIds, dismissedEntries);
  const weeklyData = computeWeeklyData(filtered, dismissedIds, dismissedEntries);
  const categoryData = computeCategoryData(filtered);

  const merchantMap: Record<string, { name: string; open: number; total: number; sla: number; totalHours: number }> = {};
  filtered.forEach((e) => {
    const key = e.merchantName;
    if (!merchantMap[key]) merchantMap[key] = { name: key, open: 0, total: 0, sla: 0, totalHours: 0 };
    merchantMap[key].total += 1;
    if (!dismissedIds.has(e.id)) merchantMap[key].open += 1;
    if (e.status === "sla_breached") merchantMap[key].sla += 1;
    merchantMap[key].totalHours += (e.daysSinceUpdate ?? 0) * 24;
  });

  const realMerchantStats: MerchantStats[] = Object.values(merchantMap)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((m, i) => ({
      merchantId: `mid-${i}`,
      merchantName: m.name,
      totalEscalations: m.total,
      openEscalations: m.open,
      avgResolutionHours: m.total > 0 ? Math.round(m.totalHours / m.total) : 0,
      slaBreaches: m.sla,
      healthScore: Math.max(0, 100 - m.sla * 20 - m.open * 5),
      trend: m.sla > 0 ? "degrading" : m.open > 2 ? "stable" : "improving",
      categories: {},
    }));

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Header
        title="Analytics"
        subtitle="Escalation trends, merchant health & performance metrics"
        onRefresh={fetchAll}
      />
      <div className="flex-1 overflow-y-auto custom-scrollbar px-8 py-6 space-y-6">
        {/* Filter controls — Section 3.2 */}
        <div className="flex items-center gap-3 p-3 bg-surface-container-lowest rounded-xl shadow-card flex-wrap">
          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-label">
            <Calendar size={13} />
            <span>Date range:</span>
          </div>
          <div className="flex gap-1">
            {(["7d", "30d", "quarter", "all"] as DateRange[]).map((d) => (
              <button
                key={d}
                onClick={() => setDateRange(d)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-label transition-colors",
                  dateRange === d ? "bg-primary text-on-primary font-semibold" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                {DATE_RANGE_LABELS[d]}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-outline-variant/40" />

          <div className="flex items-center gap-1.5 text-xs text-on-surface-variant font-label">
            <Filter size={13} />
            <span>Channel:</span>
          </div>
          <div className="flex gap-1">
            {(["all", "gmail", "slack", "jira"] as ChannelFilter[]).map((c) => (
              <button
                key={c}
                onClick={() => setChannelFilter(c)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-label transition-colors capitalize",
                  channelFilter === c ? "bg-primary text-on-primary font-semibold" : "bg-surface-container text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                {CHANNEL_LABELS[c]}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-on-surface-variant font-label">
            {filtered.length} escalations shown
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40 text-on-surface-variant gap-2">
            <RefreshCw size={18} className="animate-spin text-primary" />
            <span className="text-sm">Loading real data...</span>
          </div>
        ) : (
          <>
            <StatsBar stats={stats} />

            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <WeeklyChart data={weeklyData} />
              </div>
              <div>
                <CategoryChart data={categoryData} />
              </div>
            </div>

            {/* WhatsApp Groups Analysis */}
            <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card">
              <WhatsAppSection />
            </div>

            <MerchantTable merchants={realMerchantStats.length > 0 ? realMerchantStats : mockMerchantStats} />

            {realMerchantStats.length > 0 && (
              <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card">
                <h3 className="text-sm font-bold font-headline text-on-surface mb-4">
                  Avg Days Since Last Update — by Merchant
                </h3>
                <div className="space-y-3">
                  {realMerchantStats
                    .filter((m) => m.avgResolutionHours > 0)
                    .sort((a, b) => b.avgResolutionHours - a.avgResolutionHours)
                    .slice(0, 8)
                    .map((m) => (
                      <div key={m.merchantId} className="flex items-center gap-3">
                        <span className="text-sm text-on-surface w-32 shrink-0 truncate">{m.merchantName}</span>
                        <div className="flex-1 h-2 rounded-full bg-surface-container-high overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min((m.avgResolutionHours / (24 * 14)) * 100, 100)}%`,
                              background: m.avgResolutionHours <= 24 ? "#006d43" : m.avgResolutionHours <= 72 ? "#fbbc00" : "#ba1a1a",
                            }}
                          />
                        </div>
                        <span className="text-xs text-on-surface-variant font-label w-16 text-right">
                          {m.avgResolutionHours >= 24 ? `${Math.round(m.avgResolutionHours / 24)}d avg` : `${m.avgResolutionHours}h avg`}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
