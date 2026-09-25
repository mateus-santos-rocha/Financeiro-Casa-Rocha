"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBRL } from "@/lib/format";

export type MonthRow = { mes: string; rec: number; des: number; saldo: number };

export function HistoryChart({ rows }: { rows: MonthRow[] }) {
  return (
    <div className="card">
      <h2 className="font-semibold">Receitas x Despesas x Saldo</h2>
      <div className="h-72">
        <ResponsiveContainer>
          <ComposedChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v: number) => fmtBRL(v)} />
            <Legend />
            <Bar dataKey="rec" name="Receitas" fill="#10b981" />
            <Bar dataKey="des" name="Despesas" fill="#ef4444" />
            <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#0f172a" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
