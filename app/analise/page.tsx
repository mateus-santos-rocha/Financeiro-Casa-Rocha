import { supabaseServer } from "@/lib/supabase-server";
import { fetchAll } from "@/lib/fetch-all";
import { INCOME_META, incomeKind } from "@/lib/classify";
import { displayCategory, fmtBRL, PALETTE, validMonth } from "@/lib/format";
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

export default async function AnalisePage({ searchParams }: { searchParams: { mes?: string } }) {
  const sb = supabaseServer();
  const mes = validMonth(searchParams.mes, new Date().toISOString().slice(0, 7));
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

  // BTC (cashback convertido) vive nos investimentos — fora da análise
  const inMonth = (k: string) => all.filter((t) => t.date.slice(0, 7) === k && !hasTag(t, "btc"));
  // Transferências internas nunca entram (sem opt-in).
  const noTransf = (rows: Tx[]) => rows.filter((t) => !hasTag(t, TRANSF));

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

  // Transferências detalhadas por nome (aluguel, dízimo, condomínio... em vez do lump genérico)
  const GROUPS = ["custo-fixo", "conforto", "prazeres", "liberdade-financeira", "metas"];
  // Desempate: conforto antes de custo-fixo (ex.: saúde particular como Feminae
  // carrega as duas tags; a escolha particular prevalece). Ordem de exibição inalterada.
  const TIEBREAK = ["conforto", "custo-fixo", "prazeres", "liberdade-financeira", "metas"];
  const groupOf = (t: Tx) => TIEBREAK.find((g) => hasTag(t, g)) ?? "sem-grupo";
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

  // Compras parceladas do mês (metadados do conector: cada parcela no seu mês).
  type ParcRow = {
    date: string; description: string | null; amount: number | null;
    raw: { creditCardMetadata?: { installmentNumber?: number; totalInstallments?: number } } | null;
  };
  const { data: parcRows } = await sb.from("transactions")
    .select("date,description,amount,raw")
    .gte("date", `${mes}-01`)
    .lte("date", end)
    .order("date", { ascending: false })
    .limit(1000);
  const parc = (((parcRows ?? []) as unknown) as ParcRow[])
    .map((t) => ({
      date: t.date,
      description: t.description,
      amount: Number(t.amount ?? 0),
      n: t.raw?.creditCardMetadata?.installmentNumber ?? null,
      m: t.raw?.creditCardMetadata?.totalInstallments ?? null,
    }))
    .filter((t) => t.amount < 0 && t.n !== null && t.m !== null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Análise</h1>
        <AutoForm className="flex flex-wrap items-center gap-2">
          <input name="mes" type="month" defaultValue={mes} className="input" aria-label="Mês" />
        </AutoForm>
        <span className="text-sm text-slate-500">vs {mPrev}</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
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
      </div>

      <Charts porCategoria={porCategoria} receitas={receitas} despesas={despesas} />

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="font-semibold">Despesas por grupo</h2>
          <Donut
            data={porGrupo.filter((g) => g.total > 0).map((g) => ({ name: g.grupo, value: g.total }))}
            colors={PALETTE}
            height={300}
          />
        </div>
        <div className="card">
          <h2 className="font-semibold">Entradas por natureza</h2>
          <Donut data={natIn} colors={natColors} height={300} />
        </div>
      </div>

      <details className="card overflow-x-auto p-0">
        <summary className="cursor-pointer p-4 font-semibold hover:text-slate-900">Despesas por grupo do orçamento</summary>
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
      </details>

      <details className="card overflow-x-auto p-0">
        <summary className="cursor-pointer p-4 font-semibold hover:text-slate-900">Transferências detalhadas</summary>
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
      </details>

      <details className="card overflow-x-auto p-0">
        <summary className="cursor-pointer p-4 font-semibold hover:text-slate-900">Compras parceladas</summary>
        <p className="px-4 text-sm text-slate-500">Parcelas que caem neste mês (dados do conector). O total é aproximado (parcela × Nº de vezes).</p>
        <table className="table">
          <thead><tr><th>Data</th><th>Compra</th><th className="text-right">Parcela</th><th className="text-right">Valor</th><th className="text-right">Total aprox.</th></tr></thead>
          <tbody>
            {parc.map((p, i) => (
              <tr key={`${p.date}-${p.description}-${i}`}>
                <td className="whitespace-nowrap">{p.date.slice(0, 10)}</td>
                <td>{p.description ?? "—"}</td>
                <td className="text-right whitespace-nowrap">{p.n}/{p.m}</td>
                <td className="text-right text-red-700">{fmtBRL(Math.abs(p.amount))}</td>
                <td className="text-right">{fmtBRL(Math.abs(p.amount) * (p.m ?? 1))}</td>
              </tr>
            ))}
            {parc.length === 0 && <tr><td colSpan={5} className="py-4 text-center text-slate-500">Sem parcelas neste mês.</td></tr>}
          </tbody>
        </table>
      </details>
    </div>
  );
}
