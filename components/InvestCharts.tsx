"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Donut } from "@/components/Donut";
import { fmtBRL, PALETTE } from "@/lib/format";

export type Slice = { name: string; value: number };
export type EvoPoint = { date: string; total: number; invested: number };
export type EvoDim = { keys: string[]; rows: Record<string, number | string>[] };

const DIMS = [
  { id: "total", label: "Patrimônio" },
  { id: "tipo", label: "Por tipo" },
  { id: "titulo", label: "Por título" },
  { id: "indexador", label: "Por indexador" },
  { id: "emissor", label: "Por emissor" },
] as const;
type DimId = (typeof DIMS)[number]["id"];

export function InvestCharts({
  evolution,
  evolutionBy,
  byType,
  byTitle,
  byIndexer,
  byIssuer,
}: {
  evolution: EvoPoint[];
  evolutionBy: Record<Exclude<DimId, "total">, EvoDim>;
  byType: Slice[];
  byTitle: Slice[];
  byIndexer: Slice[];
  byIssuer: Slice[];
}) {
  const [dim, setDim] = useState<DimId>("total");
  const [sel, setSel] = useState<{ a: string; b: string } | null>(null);

  const chartData = dim === "total" ? evolution : evolutionBy[dim].rows;
  const keys = dim === "total" ? ["total"] : evolutionBy[dim].keys;

  // Período arrastado: variação (com aportes) x rendimento (só valorização).
  // Rendimento = Δpatrimônio − Δaplicado, % sobre o patrimônio inicial.
  const stats = useMemo(() => {
    if (!sel) return null;
    const [d0, d1] = [sel.a, sel.b].sort();
    if (d0 === d1) return null;
    const p0 = evolution.find((p) => p.date === d0);
    const p1 = evolution.find((p) => p.date === d1);
    if (!p0 || !p1 || p0.total <= 0) return null;
    const variacao = p1.total - p0.total;
    const aportes = p1.invested - p0.invested;
    const rendimento = variacao - aportes;
    return {
      d0,
      d1,
      variacao,
      variacaoPct: (variacao / p0.total) * 100,
      aportes,
      rendimento,
      rendimentoPct: (rendimento / p0.total) * 100,
    };
  }, [sel, evolution]);

  const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold">Evolução patrimonial</h2>
          <div className="ml-auto flex flex-wrap gap-1" role="tablist" aria-label="Fatiar evolução">
            {DIMS.map((d) => (
              <button
                key={d.id}
                role="tab"
                aria-selected={dim === d.id}
                onClick={() => setDim(d.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  dim === d.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-1 text-xs text-slate-500">Arraste sobre o gráfico para medir a variação e o rendimento de um período.</p>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
              onMouseDown={(e) => {
                const label = (e as { activeLabel?: string } | null)?.activeLabel;
                if (label) setSel({ a: label, b: label });
              }}
              onMouseMove={(e) => {
                const label = (e as { activeLabel?: string } | null)?.activeLabel;
                if (sel && label) setSel({ ...sel, b: label });
              }}
              onMouseUp={() => {
                if (sel && sel.a === sel.b) setSel(null);
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
              <YAxis tickFormatter={(v: number) => `R$ ${Math.round(v / 1000)}k`} width={64} tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(v: number | string) => fmtBRL(Number(v))}
                labelFormatter={(d) => `Dia ${d}`}
                contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {keys.map((k, i) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  name={k === "total" ? "Patrimônio" : k}
                  stroke={dim === "total" ? "#0ea5e9" : PALETTE[i % PALETTE.length]}
                  strokeWidth={2.5}
                  dot={false}
                />
              ))}
              {sel && sel.a !== sel.b ? (
                <ReferenceArea
                  x1={[sel.a, sel.b].sort()[0]}
                  x2={[sel.a, sel.b].sort()[1]}
                  strokeOpacity={0.3}
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
        {stats && (
          <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm" role="status">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {stats.d0} → {stats.d1}
              </span>
              <button className="ml-auto text-xs text-slate-500 hover:text-slate-900" onClick={() => setSel(null)}>
                limpar seleção
              </button>
            </div>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div>
                <p className="text-xs uppercase text-slate-500">Variação patrimonial</p>
                <p className={`font-bold ${stats.variacao >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {fmtBRL(stats.variacao)} ({pct(stats.variacaoPct)})
                </p>
                <p className="text-xs text-slate-500">tudo incluído (valorização + aportes − resgates)</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Rendimento</p>
                <p className={`font-bold ${stats.rendimento >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {fmtBRL(stats.rendimento)} ({pct(stats.rendimentoPct)})
                </p>
                <p className="text-xs text-slate-500">só valorização, sem aportes · % sobre o início</p>
              </div>
              <div>
                <p className="text-xs uppercase text-slate-500">Aportes líquidos</p>
                <p className="font-bold">{fmtBRL(stats.aportes)}</p>
                <p className="text-xs text-slate-500">entradas menos saídas no período</p>
              </div>
            </div>
          </div>
        )}
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
