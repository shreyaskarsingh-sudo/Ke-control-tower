"use client";

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

interface WeeklyDataPoint {
  day: string;
  open: number;
  closed: number;
  breached: number;
}

interface CategoryDataPoint {
  name: string;
  value: number;
  color: string;
}

export function WeeklyChart({ data }: { data?: WeeklyDataPoint[] }) {
  const chartData = data ?? [];

  return (
    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card">
      <h3 className="text-sm font-bold font-headline text-on-surface mb-4">
        Weekly Escalation Volume
      </h3>
      {chartData.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-xs text-on-surface-variant">
          No data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={chartData} barGap={4} barCategoryGap="30%">
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#434750" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#434750" }} axisLine={false} tickLine={false} width={24} />
            <Tooltip
              contentStyle={{ background: "#ffffff", border: "1px solid #c4c6d2", borderRadius: "8px", fontSize: 12, boxShadow: "0 8px 24px rgba(0,27,68,0.08)" }}
              cursor={{ fill: "#efeded" }}
            />
            <Bar dataKey="open" name="Opened" fill="#aec6ff" radius={[4, 4, 0, 0]} />
            <Bar dataKey="closed" name="Closed" fill="#006d43" radius={[4, 4, 0, 0]} />
            <Bar dataKey="breached" name="SLA Breached" fill="#ba1a1a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
      <div className="flex items-center gap-4 mt-3 justify-center">
        {[
          { color: "#aec6ff", label: "Opened" },
          { color: "#006d43", label: "Closed" },
          { color: "#ba1a1a", label: "SLA Breached" },
        ].map((l) => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: l.color }} />
            <span className="text-xs text-on-surface-variant font-label">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryChart({ data }: { data?: CategoryDataPoint[] }) {
  const chartData = data ?? [];

  return (
    <div className="bg-surface-container-lowest rounded-xl p-5 shadow-card">
      <h3 className="text-sm font-bold font-headline text-on-surface mb-4">
        By Category
      </h3>
      {chartData.length === 0 ? (
        <div className="h-[200px] flex items-center justify-center text-xs text-on-surface-variant">
          No data yet
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={180}>
          <PieChart>
            <Pie data={chartData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={3} dataKey="value">
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{ background: "#ffffff", border: "1px solid #c4c6d2", borderRadius: "8px", fontSize: 12 }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        {chartData.slice(0, 8).map((d) => (
          <div key={d.name} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: d.color }} />
            <span className="text-xs text-on-surface-variant font-label truncate">{d.name}</span>
            <span className="text-xs font-semibold text-on-surface ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
