import { supabaseServer } from "@/lib/supabase-server";
import { fmtBRL } from "@/lib/format";

export default async function HistoricoPage({ searchParams }: { searchParams: { meses?: string } }) {
  const sb = supabaseServer();
  const n = Math.min(Number(searchParams.meses ?? 12) || 12, 36);

  const { data } = await sb
    .from("transactions")
    .select("date,amount")
    .order("date", { ascending: true })
    .limit(20000);

  const byMonth = new Map<string, { rec: number; des: number }>();
  for (const t of (data ?? []) as { date: string; amount: number | null }[]) {
    const k = t.date.slice(0, 7);
    const cur = byMonth.get(k) ?? { rec: 0, des: 0 };
    const v = Number(t.amount ?? 0);
    if (v >= 0) cur.rec += v;
    else cur.des += Math.abs(v);
    byMonth.set(k, cur);
  }
  const keys = [...byMonth.keys()].sort().slice(-n);
  let acumulado = 0;
  const rows = keys.map((k) => {
    const { rec, des } = byMonth.get(k)!;
    const saldo = rec - des;
    acumulado += saldo;
    return { mes: k, rec, des, saldo, acumulado };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Histórico</h1>
        <form method="get" className="flex gap-2">
          <select name="meses" defaultValue={String(n)} className="input" aria-label="Intervalo">
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
            <option value="24">24 meses</option>
            <option value="36">Tudo (até 36)</option>
          </select>
          <button className="btn-primary" type="submit">Ver</button>
        </form>
      </div>
      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Mês</th><th className="text-right">Receitas</th><th className="text-right">Despesas</th><th className="text-right">Saldo</th><th className="text-right">Acumulado</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mes}>
                <td>{r.mes}</td>
                <td className="text-right text-emerald-700">{fmtBRL(r.rec)}</td>
                <td className="text-right text-red-700">{fmtBRL(r.des)}</td>
                <td className="text-right font-medium">{fmtBRL(r.saldo)}</td>
                <td className="text-right text-slate-500">{fmtBRL(r.acumulado)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">Sem dados ainda — rode o sync.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
