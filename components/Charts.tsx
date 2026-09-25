"use client";

import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis } from "recharts";
import { fmtBRL } from "@/lib/format";

export type CatRow = { categoria: string; total: number };

const COLORS = ["#0f172a", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#64748b"];

export function Charts({ porCategoria, receitas, despesas }: { porCategoria: CatRow[]; receitas: number; despesas: number }) {
  const pizza = useMemo(
    () => [
      { name: "Receitas", value: Math.abs(receitas) },
      { name: "Despesas", value: Math.abs(despesas) },
    ],
    [receitas, despesas]
  );
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card">
        <h2 className="font-semibold">Receitas x Despesas</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={pizza} dataKey="value" nameKey="name" outerRadius={90} label>
                {pizza.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="card">
        <h2 className="font-semibold">Despesas por categoria (top 8)</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={porCategoria.slice(0, 8)} layout="vertical" margin={{ left: 90 }}>
              <XAxis type="number" tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
              <YAxis type="category" dataKey="categoria" width={90} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} />
              <Bar dataKey="total" fill="#0f172a" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
