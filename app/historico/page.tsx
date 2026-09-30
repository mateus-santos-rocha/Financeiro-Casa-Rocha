import { supabaseServer } from "@/lib/supabase-server";
import { fetchAll } from "@/lib/fetch-all";
import { expenseKind, incomeKind } from "@/lib/classify";
import { fmtBRL } from "@/lib/format";
import { AutoForm } from "@/components/AutoForm";
import { HistoryChart } from "@/components/HistoryChart";

export default async function HistoricoPage({ searchParams }: { searchParams: { meses?: string; comTransf?: string } }) {
  const sb = supabaseServer();
  const n = Math.min(Number(searchParams.meses ?? 12) || 12, 36);
  const comTransf = searchParams.comTransf === "1";

  type HTx = {
    date: string; amount: number | null;
    description: string | null; category_pluggy: string | null;
    transaction_tags: { tags: { name: string } | null }[];
  };
  const hasTag = (t: HTx, name: string) => t.transaction_tags.some((x) => x.tags?.name === name);
  // fetchAll: o PostgREST corta em 1000 linhas; sem paginar, os meses novos somem.
  const data = await fetchAll<HTx>(() =>
    sb
      .from("transactions")
      .select("date,amount,description,category_pluggy,transaction_tags(tags(name))")
      .order("date", { ascending: true }),
  );
  type Kinds = {
    salario: number; transfIn: number; resgate: number; outrasRec: number;
    despesa: number; aporte: number; transfOut: number;
  };
  const zeroKinds = (): Kinds =>
    ({ salario: 0, transfIn: 0, resgate: 0, outrasRec: 0, despesa: 0, aporte: 0, transfOut: 0 });
  const own = new Map<string, Kinds>();
  const adv = new Map<string, Kinds>();
  for (const t of data) {
    if (hasTag(t, "btc")) continue; // BTC vive nos investimentos
    const isTransf = hasTag(t, "transferencia-interna");
    if (!comTransf && isTransf) continue;
    const k = t.date.slice(0, 7);
    const target = hasTag(t, "adiantamento") ? adv : own;
    const cur = target.get(k) ?? zeroKinds();
    const v = Number(t.amount ?? 0);
    if (v >= 0) {
      const kind = incomeKind(t, isTransf, hasTag(t, "salario"));
      if (kind === "salario") cur.salario += v;
      else if (kind === "transferencia") cur.transfIn += v;
      else if (kind === "resgate") cur.resgate += v;
      else cur.outrasRec += v;
    } else {
      const kind = expenseKind(t, isTransf);
      if (kind === "aporte") cur.aporte += Math.abs(v);
      else if (kind === "transferencia") cur.transfOut += Math.abs(v);
      else cur.despesa += Math.abs(v);
    }
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
  const sumKinds = (a: Kinds, b: Kinds): Kinds => ({
    salario: a.salario + b.salario, transfIn: a.transfIn + b.transfIn,
    resgate: a.resgate + b.resgate, outrasRec: a.outrasRec + b.outrasRec,
    despesa: a.despesa + b.despesa, aporte: a.aporte + b.aporte,
    transfOut: a.transfOut + b.transfOut,
  });
  const rows = keys.map((k) => {
    // Adiantamento: o próprio do mês sai, o do mês anterior entra (mesma regra de antes).
    const m = sumKinds(own.get(k) ?? zeroKinds(), adv.get(prevOf(k)) ?? zeroKinds());
    const rec = m.salario + m.transfIn + m.resgate + m.outrasRec;
    const des = m.despesa + m.aporte + m.transfOut;
    return { mes: k, ...m, rec, des, saldo: rec - des };
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
