"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Donut } from "@/components/Donut";
import { fmtBRL } from "@/lib/format";

export type Slice = { name: string; value: number };
export type EvoPoint = { date: string; total: number };

export function InvestCharts({
  evolution,
  byType,
  byTitle,
  byIndexer,
  byIssuer,
}: {
  evolution: EvoPoint[];
  byType: Slice[];
  byTitle: Slice[];
  byIndexer: Slice[];
  byIssuer: Slice[];
}) {
  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-semibold">Evolução patrimonial</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={evolution} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tickFormatter={(v: number) => `R$ ${Math.round(v / 1000)}k`} width={64} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <Line type="monotone" dataKey="total" name="Patrimônio" stroke="#0ea5e9" strokeWidth={2.5} dot={false} />
              <Tooltip formatter={(v: number) => fmtBRL(v)} labelFormatter={(d) => `Dia ${d}`} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">Por tipo</h2>
          <Donut data={byType} height={300} />
        </div>
        <div className="card">
          <h2 className="font-semibold">Por título</h2>
          <Donut data={byTitle} height={300} />
        </div>
        <div className="card">
          <h2 className="font-semibold">Por indexador</h2>
          <Donut data={byIndexer} height={300} />
        </div>
        <div className="card">
          <h2 className="font-semibold">Por emissor</h2>
          <Donut data={byIssuer} height={300} />
        </div>
      </div>
    </div>
  );
}
