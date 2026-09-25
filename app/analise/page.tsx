import { supabaseServer } from "@/lib/supabase-server";
import { displayCategory, fmtBRL } from "@/lib/format";
import { Charts } from "@/components/Charts";

export default async function AnalisePage({ searchParams }: { searchParams: { mes?: string } }) {
  const sb = supabaseServer();
  const mes = searchParams.mes ?? new Date().toISOString().slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const start = `${mes}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);

  const { data } = await sb
    .from("transactions")
    .select("amount,category_pluggy,category_override")
    .gte("date", start)
    .lte("date", end)
    .limit(5000);

  const rows = (data ?? []) as { amount: number | null; category_pluggy: string | null; category_override: string | null }[];
  const receitas = rows.filter((t) => Number(t.amount ?? 0) > 0).reduce((a, t) => a + Number(t.amount ?? 0), 0);
  const despesas = rows.filter((t) => Number(t.amount ?? 0) < 0).reduce((a, t) => a + Number(t.amount ?? 0), 0);
  const saldo = receitas + despesas;

  const porCategoria = Object.entries(
    rows
      .filter((t) => Number(t.amount ?? 0) < 0)
      .reduce<Record<string, number>>((acc, t) => {
        const c = displayCategory(t);
        acc[c] = (acc[c] ?? 0) + Math.abs(Number(t.amount ?? 0));
        return acc;
      }, {})
  )
    .map(([categoria, total]) => ({ categoria, total }))
    .sort((a, b) => b.total - a.total);

  const top = porCategoria[0];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Análise</h1>
        <form method="get" className="flex gap-2">
          <input name="mes" type="month" defaultValue={mes} className="input" aria-label="Mês" />
          <button className="btn-primary" type="submit">Ver</button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card"><p className="text-xs uppercase text-slate-500">Receitas</p><p className="text-xl font-bold text-emerald-700">{fmtBRL(receitas)}</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Despesas</p><p className="text-xl font-bold text-red-700">{fmtBRL(Math.abs(despesas))}</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Saldo</p><p className="text-xl font-bold">{fmtBRL(saldo)}</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Top categoria</p><p className="text-xl font-bold">{top ? `${top.categoria} (${fmtBRL(top.total)})` : "—"}</p></div>
      </div>

      <Charts porCategoria={porCategoria} receitas={receitas} despesas={despesas} />
    </div>
  );
}
