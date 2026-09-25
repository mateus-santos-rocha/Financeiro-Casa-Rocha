import { supabaseServer } from "@/lib/supabase-server";
import { displayCategory, fmtBRL, fmtDate } from "@/lib/format";

type Tx = {
  id: string;
  date: string;
  description: string | null;
  amount: number | null;
  category_pluggy: string | null;
  category_override: string | null;
  accounts: { bank: string | null; holder: string | null; name: string | null } | null;
};

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: { mes?: string; q?: string; titular?: string };
}) {
  const sb = supabaseServer();
  const mes = searchParams.mes ?? new Date().toISOString().slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const start = `${mes}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);

  let query = sb
    .from("transactions")
    .select("id,date,description,amount,category_pluggy,category_override,accounts(bank,holder,name)")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false })
    .limit(200);

  if (searchParams.titular === "voce" || searchParams.titular === "esposa") {
    query = query.eq("accounts.holder", searchParams.titular);
  }
  if (searchParams.q) {
    query = query.ilike("description", `%${searchParams.q}%`);
  }

  const { data, error } = await query;
  const rows = (data ?? []) as unknown as Tx[];
  const total = rows.reduce((acc, t) => acc + Number(t.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Movimentações</h1>
        <span className="badge bg-slate-100 text-slate-600">{rows.length} lançamentos</span>
        <span className={`badge ${total >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
          Saldo do filtro: {fmtBRL(total)}
        </span>
      </div>

      <form className="card flex flex-wrap gap-3" method="get">
        <div>
          <label className="label" htmlFor="mes">Mês</label>
          <input id="mes" name="mes" type="month" defaultValue={mes} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="titular">Titular</label>
          <select id="titular" name="titular" defaultValue={searchParams.titular ?? ""} className="input">
            <option value="">Todos</option>
            <option value="voce">Você</option>
            <option value="esposa">Esposa</option>
          </select>
        </div>
        <div className="min-w-52 flex-1">
          <label className="label" htmlFor="q">Buscar</label>
          <input id="q" name="q" defaultValue={searchParams.q ?? ""} placeholder="Ex.: uber, iFood, BTG…" className="input" />
        </div>
        <div className="flex items-end gap-2">
          <button className="btn-primary" type="submit">Filtrar</button>
          <a className="btn-ghost" href="/movimentacoes">Limpar</a>
        </div>
      </form>

      {error && <p role="alert" className="text-sm text-red-600">Erro ao carregar: {error.message}</p>}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr><th>Data</th><th>Descrição</th><th>Conta</th><th>Categoria</th><th className="text-right">Valor</th></tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap">{fmtDate(t.date)}</td>
                <td>{t.description ?? "—"}</td>
                <td className="whitespace-nowrap text-slate-500">
                  {t.accounts?.bank ?? "—"} · {t.accounts?.holder === "esposa" ? "Esposa" : "Você"}
                </td>
                <td>{displayCategory(t)}</td>
                <td className={`text-right font-medium ${Number(t.amount ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  {fmtBRL(Number(t.amount ?? 0))}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                Nenhum lançamento. Rode o sync (ver /config) ou importe um CSV.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
