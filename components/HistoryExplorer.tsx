"use client";

import { useMemo, useState } from "react";
import { HistoryChart, type MonthRow } from "@/components/HistoryChart";
import { GroupExplorer, type GroupMonthRow } from "@/components/GroupLines";
import { GROUP_META } from "@/lib/groups";
import { fmtBRL } from "@/lib/format";

type Sel = "3" | "6" | "ytd" | "1y";

/** Histórico todo client-side: filtros recalculam na hora, sem reload. */
export function HistoryExplorer({
  rows,
  grows,
  growsAp,
}: {
  rows: MonthRow[];
  grows: GroupMonthRow[];
  growsAp: GroupMonthRow[];
}) {
  const [sel, setSel] = useState<Sel>("ytd");
  const [hideInvest, setHideInvest] = useState(false);

  const months = useMemo(() => {
    const all = rows.map((r) => r.mes);
    if (sel === "3") return all.slice(-3);
    if (sel === "6") return all.slice(-6);
    if (sel === "ytd" && all.length > 0) return all.filter((k) => k >= `${all[all.length - 1].slice(0, 4)}-01`);
    return all.slice(-12);
  }, [rows, sel]);
  const inScope = useMemo(() => new Set(months), [months]);

  const shown: MonthRow[] = useMemo(
    () =>
      rows
        .filter((r) => inScope.has(r.mes))
        .map((r) => {
          const resgate = hideInvest ? 0 : r.resgate;
          const aporte = hideInvest ? 0 : r.aporte;
          const rec = r.salario + r.transfIn + resgate + r.outrasRec;
          const des = r.despesa + aporte + r.transfOut;
          return { ...r, resgate, aporte, rec, des, saldo: rec - des };
        }),
    [rows, inScope, hideInvest]
  );

  const gshown: GroupMonthRow[] = useMemo(() => {
    const apByMes = new Map(growsAp.map((r) => [r.mes, r]));
    return grows
      .filter((r) => inScope.has(r.mes))
      .map((r) => {
        const ap = apByMes.get(r.mes);
        const out: GroupMonthRow = { mes: r.mes };
        for (const g of GROUP_META) {
          const total = Number(r[g.key] ?? 0);
          out[g.key] = hideInvest && ap ? total - Number(ap[g.key] ?? 0) : total;
        }
        return out;
      });
  }, [grows, growsAp, inScope, hideInvest]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={sel} onChange={(e) => setSel(e.target.value as Sel)} className="input w-auto" aria-label="Intervalo">
          <option value="3">3 meses</option>
          <option value="6">6 meses</option>
          <option value="ytd">YTD</option>
          <option value="1y">1 ano</option>
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input type="checkbox" checked={hideInvest} onChange={(e) => setHideInvest(e.target.checked)} />
          ocultar investimentos
        </label>
      </div>

      {shown.length > 0 && <HistoryChart rows={shown} hideInvest={hideInvest} />}

      <details className="card overflow-x-auto p-0">
        <summary className="cursor-pointer p-4 font-semibold hover:text-slate-900">Receitas e despesas por mês</summary>
        <table className="table">
          <thead><tr><th>Mês</th><th className="text-right">Receitas</th><th className="text-right">Despesas</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.mes}>
                <td>{r.mes}</td>
                <td className="text-right text-emerald-700">{fmtBRL(r.rec)}</td>
                <td className="text-right text-red-700">{fmtBRL(r.des)}</td>
                <td className="text-right font-medium">{fmtBRL(r.saldo)}</td>
              </tr>
            ))}
            {shown.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">Sem dados ainda — rode o sync.</td></tr>}
          </tbody>
        </table>
      </details>

      <GroupExplorer grows={gshown} />

      <details className="card overflow-x-auto p-0">
        <summary className="cursor-pointer p-4 font-semibold hover:text-slate-900">Gasto por grupo por mês</summary>
        <p className="px-4 text-sm text-slate-500">Todos os grupos (não segue a seleção do gráfico, só os filtros acima).</p>
        <table className="table">
          <thead><tr>
            <th>Mês</th>
            {GROUP_META.map((g) => <th key={g.key} className="text-right">{g.label}</th>)}
            <th className="text-right">Total</th>
          </tr></thead>
          <tbody>
            {gshown.map((r) => (
              <tr key={r.mes}>
                <td>{r.mes}</td>
                {GROUP_META.map((g) => (
                  <td key={g.key} className="text-right">{fmtBRL(Number(r[g.key] ?? 0))}</td>
                ))}
                <td className="text-right font-medium">
                  {fmtBRL(GROUP_META.reduce((a, g) => a + Number(r[g.key] ?? 0), 0))}
                </td>
              </tr>
            ))}
            {gshown.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-slate-500">Sem dados ainda — rode o sync.</td></tr>}
          </tbody>
        </table>
      </details>
    </div>
  );
}
