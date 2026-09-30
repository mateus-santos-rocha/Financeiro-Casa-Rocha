import { supabaseServer } from "@/lib/supabase-server";
import { fetchAll } from "@/lib/fetch-all";
import { familyOf, fmtBRL, fmtDate, translateInvType } from "@/lib/format";
import { getCdiMensal } from "@/lib/cdi";
import { setInvestmentClosed } from "@/lib/actions";
import { InvestCharts } from "@/components/InvestCharts";
import { InvestTable, type InvRow } from "@/components/InvestTable";

const STALE_DAYS = 3;
const DUST_LIMIT = 1.0; // resíduo menor que R$ 1 conta como encerrada
const RESERVA = "reserva-emergencia";
const PARKING = "adiantamento"; // ETF parking do adiantamento: fora do patrimônio

export default async function InvestimentosPage() {
  const sb = supabaseServer();
  const [{ data }, { data: accs }] = await Promise.all([
    sb
      .from("investments")
      .select("id,pluggy_id,name,type,issuer,indexer,rate,maturity_date,quantity,amount_invested,invested_override,current_value,last_seen_at,updated_at,closed_manual,held_since,pluggy_item_id,accounts(bank,holder),investment_tags(tags(id,name,color))")
      .order("current_value", { ascending: false })
      .limit(500),
    sb.from("accounts").select("bank,pluggy_item_id"),
  ]);

  const bankByItem = new Map(
    ((accs ?? []) as { bank: string | null; pluggy_item_id: string | null }[])
      .filter((a) => a.pluggy_item_id)
      .map((a) => [a.pluggy_item_id as string, a.bank ?? "outro"])
  );
  type Row = InvRow & { pluggy_item_id: string };
  const rows = ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    accounts: {
      bank: r.accounts?.bank ?? bankByItem.get(r.pluggy_item_id ?? "") ?? "—",
      holder: r.accounts?.holder ?? null,
    },
  }));

  const isReserva = (r: Row) => r.investment_tags.some((x) => x.tags?.name === RESERVA);
  const isParking = (r: Row) => r.investment_tags.some((x) => x.tags?.name === PARKING);
  const cutoff = Date.now() - STALE_DAYS * 24 * 3600 * 1000;
  const isStale = (r: Row) => !r.last_seen_at || new Date(r.last_seen_at).getTime() < cutoff;
  const isManual = (r: Row) => (r.pluggy_id ?? "").startsWith("manual:");
  const isClosed = (r: Row) =>
    r.closed_manual === true ||
    (!isManual(r) && !isStale(r) && Number(r.current_value ?? 0) < DUST_LIMIT);

  const active = rows.filter((r) => !isStale(r) && !isClosed(r));
  const closed = rows.filter(isClosed);
  const stale = rows.filter(isStale);

  // Alerta: posição manual (não-cripto) sem atualização no mês corrente
  const monthStart = `${new Date().toISOString().slice(0, 7)}-01`;
  const staleManual = rows.filter(
    (r) =>
      (r.pluggy_id ?? "").startsWith("manual:") &&
      (r.type ?? "") !== "crypto" &&
      !(r.updated_at ?? "").startsWith(monthStart.slice(0, 7))
  );

  // Núcleo das contas: ativas exceto reserva e parking de adiantamento
  // (ambos têm cards/fluxo próprios e não entram no patrimônio)
  const core = active.filter((r) => !isReserva(r) && !isParking(r));
  const base = (r: Row) => Number(r.invested_override ?? r.amount_invested ?? 0);

  const totalAtual = core.reduce((a, r) => a + Number(r.current_value ?? 0), 0);
  const totalAplicado = core.reduce((a, r) => a + base(r), 0);
  const rent = totalAtual - totalAplicado;
  const reserva = active
    .filter(isReserva)
    .reduce((a, r) => a + Number(r.current_value ?? 0), 0);

  const byType = Object.entries(
    core.reduce<Record<string, number>>((acc, r) => {
      const k = translateInvType(r.type);
      acc[k] = (acc[k] ?? 0) + Number(r.current_value ?? 0);
      return acc;
    }, {})
  ).map(([name, value]) => ({ name, value }));

  // Visões agregadas (pizzas): por título (família), indexador e emissor
  const sliceBy = (key: (r: (typeof core)[number]) => string) =>
    Object.entries(
      core.reduce<Record<string, number>>((acc, r) => {
        const k = key(r);
        acc[k] = (acc[k] ?? 0) + Number(r.current_value ?? 0);
        return acc;
      }, {})
    )
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  const byTitle = sliceBy((r) => familyOf(r.name));
  const byIndexer = sliceBy((r) => (r.type === "crypto" ? "Cripto" : (r.indexer ?? "").trim().toUpperCase() || "Não informado"));
  const byIssuer = sliceBy((r) => (r.type === "crypto" ? "Bitcoin" : (r.issuer ?? "").trim() || "Não informado"));
  // pizzas com no máximo 8 fatias (top 7 + Outras) para caberem no card
  const cap = (s: { name: string; value: number }[]) =>
    s.length > 8
      ? [...s.slice(0, 7), { name: "Outras", value: s.slice(7).reduce((a, x) => a + x.value, 0) }]
      : s;

  const outIds = new Set(active.filter((r) => isReserva(r) || isParking(r)).map((r) => r.id));
  // fetchAll: snapshots crescem todo dia; o PostgREST corta em 1000 linhas por resposta.
  const snaps = await fetchAll<{ date: string; value: number | null; investment_id: string }>(() =>
    sb
      .from("investment_snapshots")
      .select("date,value,investment_id")
      .order("date", { ascending: true }),
  );
  const perDay = new Map<string, number>();
  for (const s of (snaps ?? []) as { date: string; value: number | null; investment_id: string }[]) {
    if (outIds.has(s.investment_id)) continue;
    perDay.set(s.date, (perDay.get(s.date) ?? 0) + Number(s.value ?? 0));
  }
  const evolution = [...perDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, total]) => ({ date: date.slice(5), total }));

  // Benchmark: CDI mensal (BCB) x variação da carteira no mês (quando há snapshots)
  const cdi = await getCdiMensal(6);
  const byMonthSnap = new Map<string, number[]>();
  for (const [date, total] of perDay) {
    const k = date.slice(0, 7);
    const list = byMonthSnap.get(k) ?? [];
    list.push(total);
    byMonthSnap.set(k, list);
  }
  const bench = cdi.map((c) => {
    const [mm, yyyy] = c.mes.split("/");
    const vals = byMonthSnap.get(`${yyyy}-${mm}`) ?? [];
    const first = vals[0];
    const last = vals[vals.length - 1];
    const cart = vals.length > 1 && first > 0 ? ((last - first) / first) * 100 : null;
    return { ...c, cart };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Investimentos</h1>

      {staleManual.length > 0 && (
        <p role="alert" className="card border-amber-200 bg-amber-50 text-sm text-amber-900">
          Falta atualizar neste mês: <strong>{staleManual.map((r) => r.name ?? "?").join(", ")}</strong>.
          Abra o título abaixo e edite o valor atual.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card"><p className="text-xs uppercase text-slate-500">Patrimônio atual</p><p className="text-2xl font-bold">{fmtBRL(totalAtual)}</p><p className="text-xs text-slate-400">sem reserva</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Base investida</p><p className="text-2xl font-bold">{fmtBRL(totalAplicado)}</p><p className="text-xs text-slate-400">sem reserva</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Rentabilidade</p><p className={`text-2xl font-bold ${rent >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtBRL(rent)}</p></div>
        <div className="card border-emerald-200"><p className="text-xs uppercase text-emerald-700">Reserva de emergência</p><p className="text-2xl font-bold text-emerald-800">{fmtBRL(reserva)}</p></div>
      </div>

      <InvestCharts evolution={evolution} byType={cap(byType)} byTitle={cap(byTitle)} byIndexer={cap(byIndexer)} byIssuer={cap(byIssuer)} />

      <div className="card overflow-x-auto p-0">
        <h2 className="p-4 pb-0 font-semibold">Benchmark — carteira x CDI (a.m.)</h2>
        <p className="px-4 text-sm text-slate-500">CDI via BCB (grátis, sem chave). A coluna carteira aparece quando há 2+ snapshots no mês.</p>
        <table className="table">
          <thead><tr><th>Mês</th><th className="text-right">CDI</th><th className="text-right">Carteira</th></tr></thead>
          <tbody>
            {bench.map((b) => (
              <tr key={b.mes}>
                <td>{b.mes}</td>
                <td className="text-right">{b.cdi.toFixed(2)}%</td>
                <td className="text-right">{b.cart === null ? "—" : `${b.cart >= 0 ? "+" : ""}${b.cart.toFixed(2)}%`}</td>
              </tr>
            ))}
            {bench.length === 0 && <tr><td colSpan={3} className="px-3 py-4 text-center text-slate-500">CDI indisponível no momento.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2 className="font-semibold">Títulos e lotes</h2>
        <p className="text-sm text-slate-500">
          Uma linha por título — clique para abrir os lotes. <em>Editar</em> completa
          emissor, indexador, taxa, vencimento, base de custo e início da posição.
          Posições manuais (ex.: BTC) têm aplicado e atual editáveis.
        </p>
      </div>

      <InvestTable rows={active} />

      {closed.length > 0 && (
        <details className="card overflow-x-auto p-0">
          <summary className="cursor-pointer p-4 font-semibold hover:text-slate-600">
            Posições encerradas ({closed.length}) — fora dos totais
          </summary>
          <table className="table">
            <thead><tr><th>Título</th><th>Banco</th><th className="text-right">Base</th><th><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {closed.map((r) => (
                <tr key={r.id}>
                  <td>{r.name ?? "—"}{r.closed_manual && <span className="ml-1 text-xs text-slate-400">(manual)</span>}</td>
                  <td>{r.accounts?.bank ?? "—"}</td>
                  <td className="text-right">{fmtBRL(base(r))}</td>
                  <td className="text-right">
                    <form action={setInvestmentClosed.bind(null, r.id, false)}>
                      <button className="text-xs text-slate-500 hover:text-slate-900" type="submit">reabrir</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}

      {stale.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <h2 className="p-4 pb-0 font-semibold">Sem atualização há {STALE_DAYS}+ dias (fora dos totais)</h2>
          <p className="px-4 text-sm text-slate-500">Transferiu de instituição? Use <em>encerrar</em> no lote correspondente.</p>
          <table className="table">
            <thead><tr><th>Título</th><th>Banco</th><th className="text-right">Último valor</th><th>Visto em</th></tr></thead>
            <tbody>
              {stale.map((r) => (
                <tr key={r.id}>
                  <td>{r.name ?? "—"}</td>
                  <td>{r.accounts?.bank ?? "—"}</td>
                  <td className="text-right">{fmtBRL(Number(r.current_value ?? 0))}</td>
                  <td>{fmtDate((r.last_seen_at ?? "").slice(0, 10))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
