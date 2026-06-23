"use client";

import { TrendingUp, TrendingDown, Minus, AlertCircle } from "lucide-react";
import type { MerchantStats } from "@/types";
import { cn, healthScoreColor } from "@/lib/utils";

interface MerchantTableProps {
  merchants: MerchantStats[];
}

const TrendIcon = ({ trend }: { trend: MerchantStats["trend"] }) => {
  if (trend === "improving") return <TrendingUp size={13} className="text-green-600" />;
  if (trend === "degrading") return <TrendingDown size={13} className="text-red-500" />;
  return <Minus size={13} className="text-on-surface-variant" />;
};

function HealthBar({ score }: { score: number }) {
  const color = score >= 70 ? "#006d43" : score >= 40 ? "#fbbc00" : "#ba1a1a";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-surface-container-high overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
      <span className={cn("text-xs font-semibold font-label w-6 text-right", healthScoreColor(score))}>
        {score}
      </span>
    </div>
  );
}

export function MerchantTable({ merchants }: MerchantTableProps) {
  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-card overflow-hidden">
      <div className="px-5 py-4 border-b border-outline-variant/20">
        <h3 className="text-sm font-bold font-headline text-on-surface">Merchant Health</h3>
        <p className="text-xs text-on-surface-variant mt-0.5">Based on open escalations, SLA breaches & response time</p>
      </div>
      <div className="divide-y divide-outline-variant/10">
        {merchants.map((m) => (
          <div key={m.merchantId} className="px-5 py-3.5 hover:bg-surface-container transition-colors">
            <div className="flex items-center gap-4">
              {/* Name + trend */}
              <div className="w-36 shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-on-surface truncate">{m.merchantName}</span>
                  <TrendIcon trend={m.trend} />
                </div>
                <span className="text-xs text-on-surface-variant font-label">{m.merchantId}</span>
              </div>

              {/* Stats */}
              <div className="flex items-center gap-6 flex-1">
                <div className="text-center">
                  <p className="text-sm font-bold text-on-surface">{m.totalEscalations}</p>
                  <p className="text-xs text-on-surface-variant font-label">Total</p>
                </div>
                <div className="text-center">
                  <p className={cn("text-sm font-bold", m.openEscalations > 0 ? "text-amber-600" : "text-green-600")}>
                    {m.openEscalations}
                  </p>
                  <p className="text-xs text-on-surface-variant font-label">Open</p>
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-on-surface">{m.avgResolutionHours}h</p>
                  <p className="text-xs text-on-surface-variant font-label">Avg Res.</p>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-1">
                    {m.slaBreaches > 0 && <AlertCircle size={12} className="text-red-500" />}
                    <p className={cn("text-sm font-bold", m.slaBreaches > 0 ? "text-red-600" : "text-green-600")}>
                      {m.slaBreaches}
                    </p>
                  </div>
                  <p className="text-xs text-on-surface-variant font-label">Breaches</p>
                </div>
              </div>

              {/* Health bar */}
              <div className="w-28 shrink-0">
                <p className="text-xs text-on-surface-variant font-label mb-1">Health</p>
                <HealthBar score={m.healthScore} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
