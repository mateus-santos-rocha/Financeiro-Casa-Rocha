"use client";

import { useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBRL } from "@/lib/format";
import { GROUP_META } from "@/lib/groups";

export type GroupMonthRow = { mes: string; [g: string]: number | string };

/** Linhas mensais por grupo do orçamento (só grupos ativos). */
export function GroupLines({ rows, active }: { rows: GroupMonthRow[]; active: string[] }) {
  const shown = GROUP_META.filter((g) => active.includes(g.key));
  return (
    <div className="card">
      <h2 className="font-semibold">Gasto mensal por grupo</h2>
      <div className="h-72">
        <ResponsiveContainer>
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v: number) => fmtBRL(v)} />
            <Legend />
            {shown.map((g) => (
              <Line
                key={g.key}
                type="monotone"
                dataKey={g.key}
                name={g.label}
                stroke={g.color}
                strokeWidth={2}
                dot={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Seletor + gráfico sem reload: filtra localmente (dados já vêm completos). */
export function GroupExplorer({ grows }: { grows: GroupMonthRow[] }) {
  const [active, setActive] = useState<string[]>(() => GROUP_META.map((g) => g.key));
  const toggle = (key: string) =>
    setActive((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  return (
    <>
      <div className="card">
        <h2 className="font-semibold">Grupos no gráfico</h2>
        <div className="mt-2 flex flex-wrap gap-3">
          {GROUP_META.map((g) => (
            <label key={g.key} className="flex items-center gap-1 text-sm text-slate-600">
              <input type="checkbox" checked={active.includes(g.key)} onChange={() => toggle(g.key)} />
              {g.label}
            </label>
          ))}
        </div>
      </div>
      {grows.length > 0 && <GroupLines rows={grows} active={active} />}
    </>
  );
}
