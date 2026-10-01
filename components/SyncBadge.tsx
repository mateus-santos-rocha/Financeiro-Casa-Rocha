import { supabaseServer } from "@/lib/supabase-server";

/** Faixa no topo: quando rodou o último sync + atalho p/ rodar manual (Actions). */
export async function SyncBadge() {
  const sb = supabaseServer();
  const { data } = await sb
    .from("sync_runs")
    .select("finished_at,status")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row = (data ?? null) as { finished_at: string | null; status: string | null } | null;
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "";
  const when = row?.finished_at
    ? new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
      timeZone: "America/Sao_Paulo",
    }).format(new Date(row.finished_at))
    : "—";
  const dot = !row ? "bg-slate-300" : row.status === "ok" ? "bg-emerald-500" : "bg-red-500";
  return (
    <div className="border-b border-slate-100 bg-slate-50">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-1.5 text-xs text-slate-600">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} aria-hidden />
        <span>Atualizado em {when}</span>
        {repo ? (
          <a
            className="ml-auto font-medium text-slate-700 hover:text-slate-900"
            href={`https://github.com/${repo}/actions/workflows/sync.yml`}
            target="_blank"
            rel="noreferrer"
            title="Abrir Actions e rodar sync-diario"
          >
            ↻ Atualizar
          </a>
        ) : null}
      </div>
    </div>
  );
}
