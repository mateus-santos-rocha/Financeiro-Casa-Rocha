import Link from "next/link";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchAll } from "@/lib/fetch-all";
import { fmtBRL, monthKey } from "@/lib/format";

const SECTIONS = [
  {
    href: "/movimentacoes",
    icon: "🧾",
    title: "Movimentações",
    desc: "Cada lançamento: buscar, categorizar, taguear e importar CSV.",
    statKey: "movs",
  },
  {
    href: "/analise",
    icon: "📊",
    title: "Análise",
    desc: "O raio-x do mês: receitas, despesas, grupos e top gastos.",
    statKey: "analise",
  },
  {
    href: "/historico",
    icon: "📈",
    title: "Histórico",
    desc: "A evolução mês a mês: quem sobe, quem desce, onde ajustar.",
    statKey: "hist",
  },
  {
    href: "/investimentos",
    icon: "💰",
    title: "Investimentos",
    desc: "Patrimônio, renda fixa, reserva de emergência e benchmarks.",
    statKey: "pat",
  },
] as const;

const MES_NOME = new Intl.DateTimeFormat("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" }).format(new Date());

export default async function Home() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();

  if (!user) {
    return (
      <div className="mx-auto max-w-lg space-y-6 py-16 text-center">
        <p className="text-5xl">🏠</p>
        <h1 className="text-3xl font-bold tracking-tight">Financeiro Casa Rocha</h1>
        <p className="text-slate-500">As finanças da casa em um só lugar: movimentações, análise, histórico e investimentos.</p>
        <Link href="/login" className="btn-primary inline-block px-8 py-3 text-base">
          Entrar
        </Link>
      </div>
    );
  }

  const mes = monthKey();
  const start = `${mes}-01`;
  const end = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).toISOString().slice(0, 10);

  const [{ data: lastSync }, txs, invs] = await Promise.all([
    sb.from("sync_runs").select("finished_at,status").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    fetchAll<{ amount: number | null; transaction_tags: { tags: { name: string } | null }[] }>(() =>
      sb.from("transactions").select("amount,transaction_tags(tags(name))").gte("date", start).lte("date", end),
    ),
    fetchAll<{
      current_value: number | null; amount_invested: number | null; invested_override: number | null;
      pluggy_id: string | null; last_seen_at: string | null; closed_manual: boolean | null;
      investment_tags: { tags: { name: string } | null }[];
    }>(() =>
      sb.from("investments").select("current_value,amount_invested,invested_override,pluggy_id,last_seen_at,closed_manual,investment_tags(tags(name))"),
    ),
  ]);

  const noBtc = (txs ?? []).filter((t) => !t.transaction_tags.some((x) => x.tags?.name === "btc"));
  const movs = noBtc.length;

  // Patrimônio: mesma regra da página (ativas, sem reserva/parking, manuais sempre contam).
  const tagsOf = (r: { investment_tags: { tags: { name: string } | null }[] }) =>
    r.investment_tags.map((x) => x.tags?.name).filter(Boolean) as string[];
  const cutoff = Date.now() - 3 * 24 * 3600 * 1000;
  const isManual = (r: { pluggy_id: string | null }) => (r.pluggy_id ?? "").startsWith("manual:");
  const isStale = (r: { pluggy_id: string | null; last_seen_at: string | null }) =>
    !isManual(r) && (!r.last_seen_at || new Date(r.last_seen_at).getTime() < cutoff);
  const isClosed = (r: { pluggy_id: string | null; last_seen_at: string | null; current_value: number | null; closed_manual: boolean | null }) =>
    r.closed_manual === true || (!isManual(r) && !isStale(r) && Number(r.current_value ?? 0) < 1);
  const patrimonio = (invs ?? [])
    .filter((r) => {
      const tags = tagsOf(r);
      return !isStale(r) && !isClosed(r) && !tags.includes("reserva-emergencia") && !tags.includes("adiantamento");
    })
    .reduce((a, r) => a + Number(r.current_value ?? 0), 0);

  const syncRow = lastSync as { finished_at: string | null; status: string | null } | null;
  const syncWhen = syncRow?.finished_at
    ? new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(syncRow.finished_at))
    : "—";

  const stats: Record<string, string> = {
    movs: `${movs} lançamento(s) em ${MES_NOME}`,
    analise: `Mês atual: ${mes.slice(5)}/${mes.slice(0, 4)}`,
    hist: "Receitas × despesas × saldo",
    pat: fmtBRL(patrimonio),
  };

  return (
    <div className="space-y-8">
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-900 p-8 text-white sm:p-10">
        <p className="text-4xl">🏠</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Financeiro Casa Rocha</h1>
        <p className="mt-2 max-w-xl text-slate-300">
          Olá! Por onde começamos hoje? Escolha uma seção abaixo — os dados atualizam sozinhos todo dia de manhã.
        </p>
        <p className="mt-4 text-xs text-slate-400">Última atualização: {syncWhen}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="card group flex items-start gap-4 transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <span className="text-4xl transition group-hover:scale-110">{s.icon}</span>
            <span>
              <span className="block text-lg font-bold tracking-tight group-hover:underline">{s.title}</span>
              <span className="mt-1 block text-sm text-slate-500">{s.desc}</span>
              <span className="mt-2 inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                {stats[s.statKey]}
              </span>
            </span>
          </Link>
        ))}
      </section>
    </div>
  );
}
