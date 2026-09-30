import { supabaseServer } from "@/lib/supabase-server";
import { fetchAll } from "@/lib/fetch-all";
import { fmtBRL } from "@/lib/format";
import { AutoForm } from "@/components/AutoForm";
import { HistoryChart } from "@/components/HistoryChart";

export default async function HistoricoPage({ searchParams }: { searchParams: { meses?: string; comTransf?: string } }) {
  const sb = supabaseServer();
  const n = Math.min(Number(searchParams.meses ?? 12) || 12, 36);
  const comTransf = searchParams.comTransf === "1";

  type HTx = {
    date: string; amount: number | null;
    transaction_tags: { tags: { name: string } | null }[];
  };
  // fetchAll: o PostgREST corta em 1000 linhas; sem paginar, os meses novos somem.
  const data = await fetchAll<HTx>(() =>
    sb
      .from("transactions")
      .select("date,amount,transaction_tags(tags(name))")
      .order("date", { ascending: true }),
  );

  const hasTag = (t: HTx, name: string) => t.transaction_tags.some((x) => x.tags?.name === name);
  const own = new Map<string, { rec: number; des: number }>();
  const adv = new Map<string, { rec: number; des: number }>();
  for (const t of (data ?? []) as unknown as HTx[]) {
    if (hasTag(t, "btc")) continue; // BTC vive nos investimentos
    if (!comTransf && hasTag(t, "transferencia-interna")) continue;
    const k = t.date.slice(0, 7);
    const target = hasTag(t, "adiantamento") ? adv : own;
    const cur = target.get(k) ?? { rec: 0, des: 0 };
    const v = Number(t.amount ?? 0);
    if (v >= 0) cur.rec += v;
    else cur.des += Math.abs(v);
    target.set(k, cur);
  }
  const hoje = new Date().toISOString().slice(0, 7);
  // Parcelas futuras do cartão vêm com data à frente — fora do Histórico (tem página própria na Fase 5).
  // Adiantamento salarial: conta no mês seguinte (próprio do mês sai, anterior entra).
  const prevOf = (k: string) => {
    const [yy, mm] = k.split("-").map(Number);
    const d = new Date(yy, mm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const keys = [...new Set([...own.keys(), ...adv.keys()])].sort().filter((k) => k <= hoje).slice(-n);
  const rows = keys.map((k) => {
    const o = own.get(k) ?? { rec: 0, des: 0 };
    const a = adv.get(prevOf(k)) ?? { rec: 0, des: 0 };
    const rec = o.rec + a.rec;
    const des = o.des + a.des;
    return { mes: k, rec, des, saldo: rec - des };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Histórico</h1>
        <AutoForm className="flex flex-wrap items-center gap-2">
          <select name="meses" defaultValue={String(n)} className="input" aria-label="Intervalo">
            <option value="6">6 meses</option>
            <option value="12">12 meses</option>
            <option value="24">24 meses</option>
            <option value="36">Tudo (até 36)</option>
          </select>
          <label className="flex items-center gap-1 text-sm text-slate-600">
            <input type="checkbox" name="comTransf" value="1" defaultChecked={comTransf} />
            incluir transferências
          </label>
        </AutoForm>
      </div>

      {rows.length > 0 && <HistoryChart rows={rows} />}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Mês</th><th className="text-right">Receitas</th><th className="text-right">Despesas</th><th className="text-right">Saldo</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.mes}>
                <td>{r.mes}</td>
                <td className="text-right text-emerald-700">{fmtBRL(r.rec)}</td>
                <td className="text-right text-red-700">{fmtBRL(r.des)}</td>
                <td className="text-right font-medium">{fmtBRL(r.saldo)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-slate-500">Sem dados ainda — rode o sync.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
