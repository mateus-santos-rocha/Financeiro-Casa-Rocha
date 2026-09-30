import { supabaseServer } from "@/lib/supabase-server";
import { fetchAll } from "@/lib/fetch-all";
import { INCOME_META, incomeKind } from "@/lib/classify";
import { displayCategory, fmtBRL, holderLabel } from "@/lib/format";
import { AutoForm } from "@/components/AutoForm";
import { Charts } from "@/components/Charts";
import { Donut } from "@/components/Donut";

const TRANSF = "transferencia-interna";
const ADIANT = "adiantamento";

type Tx = {
  amount: number | null;
  description: string | null;
  merchant: string | null;
  date: string;
  category_pluggy: string | null;
  category_override: string | null;
  accounts: { holder: string | null } | null;
  transaction_tags: { tags: { name: string } | null }[];
};

const hasTag = (t: Tx, name: string) => t.transaction_tags.some((x) => x.tags?.name === name);

function summarize(rows: Tx[]) {
  const rec = rows.filter((t) => Number(t.amount ?? 0) > 0).reduce((a, t) => a + Number(t.amount ?? 0), 0);
  const des = rows.filter((t) => Number(t.amount ?? 0) < 0).reduce((a, t) => a + Number(t.amount ?? 0), 0);
  return { rec, des, saldo: rec + des };
}

function delta(cur: number, prev: number): string {
  if (!prev) return "—";
  const pct = ((cur - prev) / Math.abs(prev)) * 100;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function shiftMonth(d: Date, n: number): string {
  const c = new Date(d.getFullYear(), d.getMonth() + n, 1);
  return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, "0")}`;
}

export default async function AnalisePage({ searchParams }: { searchParams: { mes?: string; comTransf?: string } }) {
  const sb = supabaseServer();
  const mes = searchParams.mes ?? new Date().toISOString().slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const base = new Date(y, m - 1, 1);
  const mPrev = shiftMonth(base, -1);
  const mPrev2 = shiftMonth(base, -2);
  const startPrev2 = `${mPrev2}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);

  const sel = "amount,description,merchant,date,category_pluggy,category_override,accounts(holder),transaction_tags(tags(name))";
  // fetchAll: o PostgREST corta em 1000 linhas por resposta.
  const all = await fetchAll<Tx>(() =>
    sb.from("transactions").select(sel).gte("date", startPrev2).lte("date", end),
  );

  const comTransf = searchParams.comTransf === "1";
  // BTC (cashback convertido) vive nos investimentos — fora da análise
  const inMonth = (k: string) => all.filter((t) => t.date.slice(0, 7) === k && !hasTag(t, "btc"));
  const noTransf = (rows: Tx[]) => (comTransf ? rows : rows.filter((t) => !hasTag(t, TRANSF)));

  // mês atual: próprio (sem adiantamento — vai p/ o próximo) + adiantamento do mês anterior
  const own = noTransf(inMonth(mes)).filter((t) => !hasTag(t, ADIANT));
  const shiftedIn = noTransf(inMonth(mPrev)).filter((t) => hasTag(t, ADIANT));
  const shiftedOut = noTransf(inMonth(mes)).filter((t) => hasTag(t, ADIANT));
  const rows = [...own, ...shiftedIn];
  const { rec: receitas, des: despesas, saldo } = summarize(rows);

  // mês anterior ajustado da mesma forma (p/ MoM consistente)
  const ownP = noTransf(inMonth(mPrev)).filter((t) => !hasTag(t, ADIANT));
  const shiftedInP = noTransf(inMonth(mPrev2)).filter((t) => hasTag(t, ADIANT));
  const p = summarize([...ownP, ...shiftedInP]);

  const advInRec = shiftedIn.filter((t) => Number(t.amount ?? 0) > 0).reduce((a, t) => a + Number(t.amount ?? 0), 0);
  const advOut = shiftedOut.filter((t) => Number(t.amount ?? 0) > 0).reduce((a, t) => a + Number(t.amount ?? 0), 0);

  const porCategoria = Object.entries(
    rows
      .filter((t) => Number(t.amount ?? 0) < 0)
      .reduce<Record<string, { total: number; count: number }>>((acc, t) => {
        const c = displayCategory(t);
        const cur = acc[c] ?? { total: 0, count: 0 };
        cur.total += Math.abs(Number(t.amount ?? 0));
        cur.count += 1;
        acc[c] = cur;
        return acc;
      }, {})
  )
    .map(([categoria, v]) => ({ categoria, total: v.total, count: v.count }))
    .sort((a, b) => b.total - a.total);
  const totDes = porCategoria.reduce((a, c) => a + c.total, 0);

  const merchants = Object.entries(
    rows
      .filter((t) => Number(t.amount ?? 0) < 0)
      .reduce<Record<string, number>>((acc, t) => {
        const k = (t.merchant || t.description || "—").slice(0, 60);
        acc[k] = (acc[k] ?? 0) + Math.abs(Number(t.amount ?? 0));
        return acc;
      }, {})
  )
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const groupSum = (list: Tx[]) =>
    Object.entries(
      list.reduce<Record<string, number>>((acc, t) => {
        const c = displayCategory(t);
        acc[c] = (acc[c] ?? 0) + Math.abs(Number(t.amount ?? 0));
        return acc;
      }, {})
    )
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total);

  const recRows = rows.filter((t) => Number(t.amount ?? 0) > 0);
  // Natureza da entrada (cores fixas por natureza — filtra zeradas sem desalinhar).
  const natFull = (["salario", "transferencia", "resgate", "outras"] as const).map((k) => ({
    name: INCOME_META[k].label,
    color: INCOME_META[k].color,
    value: recRows
      .filter((t) => incomeKind(t, hasTag(t, TRANSF), hasTag(t, "salario")) === k)
      .reduce((a, t) => a + Number(t.amount ?? 0), 0),
  })).filter((s) => s.value > 0);
  const natIn = natFull.map(({ name, value }) => ({ name, value }));
  const natColors = natFull.map((s) => s.color);
  const recCat = groupSum(recRows).slice(0, 7);
  const recCatResto = groupSum(recRows).slice(7).reduce((a, c) => a + c.total, 0);
  const recPie = recCatResto > 0 ? [...recCat, { categoria: "Outras", total: recCatResto }] : recCat;
  const recTop = Object.entries(
    recRows.reduce<Record<string, number>>((acc, t) => {
      const k = (t.merchant || t.description || "—").slice(0, 60);
      acc[k] = (acc[k] ?? 0) + Number(t.amount ?? 0);
      return acc;
    }, {})
  )
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  const porTitular = (["voce", "esposa"] as const).map((h) => {
    const s = summarize(rows.filter((t) => (t.accounts?.holder ?? "voce") === h));
    return { holder: holderLabel[h], ...s };
  });

  const top = porCategoria[0];

  // Transferências detalhadas por nome (aluguel, dízimo, condomínio... em vez do lump genérico)
  const GROUPS = ["custo-fixo", "conforto", "prazeres", "liberdade-financeira", "metas"];
  const groupOf = (t: Tx) => GROUPS.find((g) => hasTag(t, g)) ?? "sem-grupo";
  const transfDetail = Object.entries(
    rows
      .filter((t) => Number(t.amount ?? 0) < 0 && displayCategory(t) === "Transferências")
      .reduce<Record<string, { total: number; count: number; grupo: string }>>((acc, t) => {
        const k = (t.merchant || t.description || "—").slice(0, 60);
        const cur = acc[k] ?? { total: 0, count: 0, grupo: groupOf(t) };
        cur.total += Math.abs(Number(t.amount ?? 0));
        cur.count += 1;
        if (cur.grupo === "sem-grupo") cur.grupo = groupOf(t);
        acc[k] = cur;
        return acc;
      }, {})
  )
    .map(([quem, v]) => ({ quem, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);
  const porGrupo = [...GROUPS, "sem-grupo"].map((g) => {
    const list = rows.filter((t) => Number(t.amount ?? 0) < 0 && groupOf(t) === g);
    const total = list.reduce((a, t) => a + Math.abs(Number(t.amount ?? 0)), 0);
    return { grupo: g, total, count: list.length };
  });
  const totGrupo = porGrupo.reduce((a, g) => a + g.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Análise</h1>
        <AutoForm className="flex flex-wrap items-center gap-2">
          <input name="mes" type="month" defaultValue={mes} className="input" aria-label="Mês" />
          <label className="flex items-center gap-1 text-sm text-slate-600">
            <input type="checkbox" name="comTransf" value="1" defaultChecked={searchParams.comTransf === "1"} />
            incluir transferências
          </label>
        </AutoForm>
        <span className="text-sm text-slate-500">vs {mPrev}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Receitas</p>
          <p className="text-xl font-bold text-emerald-700">{fmtBRL(receitas)}</p>
          <p className="text-xs text-slate-500">mês anterior: {delta(receitas, p.rec)}</p>
          {advInRec > 0 && <p className="text-xs text-amber-700">inclui adiantamento de {mPrev}: {fmtBRL(advInRec)}</p>}
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Despesas</p>
          <p className="text-xl font-bold text-red-700">{fmtBRL(Math.abs(despesas))}</p>
          <p className="text-xs text-slate-500">mês anterior: {delta(Math.abs(despesas), Math.abs(p.des))}</p>
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Saldo</p>
          <p className="text-xl font-bold">{fmtBRL(saldo)}</p>
          <p className="text-xs text-slate-500">mês anterior: {fmtBRL(p.saldo)}</p>
          {advOut > 0 && <p className="text-xs text-amber-700">adiantamento deste mês vai p/ o próximo: {fmtBRL(advOut)}</p>}
        </div>
        <div className="card">
          <p className="text-xs uppercase text-slate-500">Top categoria</p>
          <p className="text-xl font-bold">{top ? `${top.categoria} (${fmtBRL(top.total)})` : "—"}</p>
        </div>
      </div>

      <Charts porCategoria={porCategoria} receitas={receitas} despesas={despesas} />

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-semibold">Por grupo do orçamento</h2>
        <p className="px-4 text-sm text-slate-500">Tags aplicadas automaticamente (editáveis por lançamento). “Sem grupo” = falta classificar.</p>
        <table className="table">
          <thead><tr><th>Grupo</th><th className="text-right">Itens</th><th className="text-right">Total</th><th className="text-right">% das despesas</th></tr></thead>
          <tbody>
            {porGrupo.map((g) => (
              <tr key={g.grupo}>
                <td className="font-medium">{g.grupo}</td>
                <td className="text-right">{g.count}</td>
                <td className="text-right">{fmtBRL(g.total)}</td>
                <td className="text-right">{totGrupo > 0 ? `${((g.total / totGrupo) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-semibold">Todas as categorias de despesa</h2>
        <p className="px-4 text-sm text-slate-500">O “Outras” do gráfico é a soma das categorias fora do top 7 — detalhadas aqui.</p>
        <table className="table">
          <thead><tr><th>Categoria</th><th className="text-right">Itens</th><th className="text-right">Total</th><th className="text-right">% das despesas</th></tr></thead>
          <tbody>
            {porCategoria.map((c) => (
              <tr key={c.categoria}>
                <td>{c.categoria}</td>
                <td className="text-right">{c.count}</td>
                <td className="text-right">{fmtBRL(c.total)}</td>
                <td className="text-right">{totDes > 0 ? `${((c.total / totDes) * 100).toFixed(1)}%` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">Receitas por categoria</h2>
          <Donut data={recPie.map((c) => ({ name: c.categoria, value: c.total }))} height={300} />
        </div>
        <div className="card">
          <h2 className="font-semibold">Entradas por natureza</h2>
          <Donut data={natIn} colors={natColors} height={300} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">Top 10 origens (receitas)</h2>
          <table className="table mt-2">
            <thead><tr><th>Quem</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {recTop.map((x) => (
                <tr key={x.name}><td>{x.name}</td><td className="text-right text-emerald-700">{fmtBRL(x.total)}</td></tr>
              ))}
              {recTop.length === 0 && <tr><td colSpan={2} className="py-4 text-center text-slate-500">Sem receitas no mês.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-semibold">Transferências detalhadas</h2>
        <p className="px-4 text-sm text-slate-500">As conhecidas (aluguel, dízimo, condomínio…) aparecem pelo nome e grupo.</p>
        <table className="table">
          <thead><tr><th>Quem</th><th>Grupo</th><th className="text-right">Itens</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {transfDetail.map((t) => (
              <tr key={t.quem}>
                <td>{t.quem}</td>
                <td>{t.grupo}</td>
                <td className="text-right">{t.count}</td>
                <td className="text-right">{fmtBRL(t.total)}</td>
              </tr>
            ))}
            {transfDetail.length === 0 && <tr><td colSpan={4} className="py-4 text-center text-slate-500">Sem transferências no mês.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">Por titular</h2>
          <table className="table mt-2">
            <thead><tr><th>Titular</th><th className="text-right">Receitas</th><th className="text-right">Despesas</th><th className="text-right">Saldo</th></tr></thead>
            <tbody>
              {porTitular.map((t) => (
                <tr key={t.holder}>
                  <td>{t.holder}</td>
                  <td className="text-right text-emerald-700">{fmtBRL(t.rec)}</td>
                  <td className="text-right text-red-700">{fmtBRL(Math.abs(t.des))}</td>
                  <td className="text-right font-medium">{fmtBRL(t.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h2 className="font-semibold">Top 10 merchants (despesas)</h2>
          <table className="table mt-2">
            <thead><tr><th>Quem</th><th className="text-right">Total</th></tr></thead>
            <tbody>
              {merchants.map((x) => (
                <tr key={x.name}><td>{x.name}</td><td className="text-right">{fmtBRL(x.total)}</td></tr>
              ))}
              {merchants.length === 0 && <tr><td colSpan={2} className="py-4 text-center text-slate-500">Sem despesas no mês.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
