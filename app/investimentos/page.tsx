import { supabaseServer } from "@/lib/supabase-server";
import { fmtBRL } from "@/lib/format";

type Inv = {
  id: string;
  name: string | null;
  type: string | null;
  issuer: string | null;
  indexer: string | null;
  rate: string | null;
  maturity_date: string | null;
  amount_invested: number | null;
  current_value: number | null;
  accounts: { bank: string | null; holder: string | null } | null;
};

export default async function InvestimentosPage({ searchParams }: { searchParams: { tag?: string } }) {
  const sb = supabaseServer();
  const { data } = await sb
    .from("investments")
    .select("id,name,type,issuer,indexer,rate,maturity_date,amount_invested,current_value,accounts(bank,holder)")
    .order("current_value", { ascending: false })
    .limit(500);

  const rows = (data ?? []) as unknown as Inv[];
  const rf = rows.filter((r) => (r.type ?? "").toLowerCase().includes("fix") || r.indexer);
  const totalAtual = rows.reduce((a, r) => a + Number(r.current_value ?? 0), 0);
  const totalAplicado = rows.reduce((a, r) => a + Number(r.amount_invested ?? 0), 0);
  const rent = totalAtual - totalAplicado;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Investimentos</h1>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-xs uppercase text-slate-500">Patrimônio atual</p><p className="text-2xl font-bold">{fmtBRL(totalAtual)}</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Total aplicado</p><p className="text-2xl font-bold">{fmtBRL(totalAplicado)}</p></div>
        <div className="card"><p className="text-xs uppercase text-slate-500">Rentabilidade</p><p className={`text-2xl font-bold ${rent >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtBRL(rent)}</p></div>
      </div>

      <div className="card">
        <h2 className="font-semibold">Renda fixa — detalhamento</h2>
        <p className="text-sm text-slate-500">Emissor, indexador, taxa, vencimento, aplicado x atual. Edição manual de taxa/vencimento entra na Fase 5.</p>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead><tr><th>Título</th><th>Emissor</th><th>Indexador</th><th>Taxa</th><th>Vencimento</th><th className="text-right">Aplicado</th><th className="text-right">Atual</th><th className="text-right">Rent.</th></tr></thead>
          <tbody>
            {(rf.length ? rf : rows).map((r) => {
              const ap = Number(r.amount_invested ?? 0);
              const at = Number(r.current_value ?? 0);
              return (
                <tr key={r.id}>
                  <td>{r.name ?? "—"} <span className="text-slate-400">· {r.accounts?.bank ?? ""}</span></td>
                  <td>{r.issuer ?? "—"}</td>
                  <td>{r.indexer ?? "—"}</td>
                  <td>{r.rate ?? "—"}</td>
                  <td>{r.maturity_date ?? "—"}</td>
                  <td className="text-right">{fmtBRL(ap)}</td>
                  <td className="text-right font-medium">{fmtBRL(at)}</td>
                  <td className={`text-right ${at - ap >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtBRL(at - ap)}</td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">Sem investimentos ainda — rode o sync.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
