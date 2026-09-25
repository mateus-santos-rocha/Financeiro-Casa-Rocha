import { supabaseServer } from "@/lib/supabase-server";
import fs from "node:fs";
import path from "node:path";

export default async function ConfigPage() {
  const sb = supabaseServer();
  const { data: runs } = await sb.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(10);

  let schedule = "sync/schedule.yml (não encontrado no deploy)";
  try {
    schedule = fs.readFileSync(path.join(process.cwd(), "sync", "schedule.yml"), "utf8");
  } catch { /* mantém fallback */ }

  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Config — sync & conexões</h1>
      <div className="card">
        <h2 className="font-semibold">Sincronizar agora</h2>
        {repo ? (
          <p className="mt-2 text-sm text-slate-600">
            <a className="btn-primary" href={`https://github.com/${repo}/actions/workflows/sync.yml`} target="_blank" rel="noreferrer">
              Abrir Actions e rodar sync-diario
            </a>
            <span className="ml-2">Na página do workflow, clique em <em>Run workflow</em>.</span>
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-500">
            Defina <code>NEXT_PUBLIC_GITHUB_REPO=usuario/repo</code> no deploy para ganhar o botão de sync manual.
            Sem isso, rode em Actions → sync-diario → Run workflow.
          </p>
        )}
        <p className="mt-2 text-sm text-slate-500">
          Se algum banco pedir reconexão (MFA expirou), o sintoma é o sync passar a trazer 0 items/transações:
          revalide a conexão no <code>meu.pluggy.ai</code> (ou no widget Pluggy Connect) e rode o manual de novo.
          Nenhum segredo bancário fica no nosso banco.
        </p>
      </div>
      <div className="card">
        <h2 className="font-semibold">Agendamento atual</h2>
        <pre className="mt-2 overflow-x-auto rounded-xl bg-slate-900 p-3 text-xs text-slate-100">{schedule}</pre>
        <p className="mt-2 text-sm text-slate-500">Para mudar o horário, edite <code>sync/schedule.yml</code> (cron). O workflow lê esse arquivo.</p>
      </div>
      <div className="card">
        <h2 className="font-semibold">Últimas sincronizações</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {((runs ?? []) as { id: string; started_at: string; status: string; provider: string; stats: unknown }[]).map((r) => (
            <li key={r.id} className="flex justify-between border-b border-slate-100 py-1">
              <span>{r.started_at} — {r.provider}</span>
              <span className={`badge ${r.status === "ok" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{r.status}</span>
            </li>
          ))}
          {(!runs || runs.length === 0) && <li className="text-slate-500">Nenhum run ainda.</li>}
        </ul>
      </div>
      <div className="card">
        <h2 className="font-semibold">Fase 0 — validar Pluggy gratuito</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-600">
          <li>Crie sua conta em meu.pluggy.ai e conecte Nubank + BB + BTG.</li>
          <li>No dashboard.pluggy.ai, abra o demo app e conecte os items “Meu Pluggy”.</li>
          <li>Guarde <code>PLUGGY_CLIENT_ID_1/SECRET_1</code> em GitHub Secrets (nunca no código).</li>
          <li>Teste: <code>POST /auth</code> → <code>GET /accounts?itemId=…</code> deve retornar suas contas.</li>
        </ol>
      </div>
    </div>
  );
}
