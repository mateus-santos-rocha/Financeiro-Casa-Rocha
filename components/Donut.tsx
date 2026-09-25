"use client";

import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fmtBRL, fmtBRLCompact } from "@/lib/format";

export const PALETTE = ["#0ea5e9", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#14b8a6", "#f97316", "#64748b"];

export type DonutSlice = { name: string; value: number };

const short = (v: unknown) => {
  const s = String(v ?? "");
  return s.length > 22 ? s.slice(0, 22) + "…" : s;
};

/** Donut compacto: cabe no card, total no centro, % nas fatias, R$ no tooltip. */
export function Donut({
  data,
  colors = PALETTE,
  height = 300,
}: {
  data: DonutSlice[];
  colors?: string[];
  height?: number;
}) {
  const total = data.reduce((a, s) => a + Number(s.value ?? 0), 0);
  return (
    <div className="relative w-full" style={{ height }}>
      <ResponsiveContainer>
        <PieChart margin={{ top: 8, bottom: 8 }}>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="88%"
            paddingAngle={2}
            cornerRadius={4}
            stroke="#ffffff"
            strokeWidth={2}
            labelLine={false}
            label={(p: { percent?: number }) => {
              const pct = (p.percent ?? 0) * 100;
              return pct < 5 ? "" : `${pct.toFixed(0)}%`;
            }}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v: number) => fmtBRL(v)}
            contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          />
          <Legend verticalAlign="bottom" height={40} wrapperStyle={{ fontSize: 12 }} formatter={short} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-10">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Total</span>
        <span className="text-lg font-bold tracking-tight">{fmtBRLCompact(total)}</span>
      </div>
    </div>
  );
}
