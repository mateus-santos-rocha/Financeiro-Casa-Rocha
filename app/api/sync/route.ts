import { supabaseServer } from "@/lib/supabase-server";

const WORKFLOW = process.env.GITHUB_WORKFLOW ?? "sync.yml";
const REF = process.env.GITHUB_REF ?? "main";

function repo(): string {
  return process.env.GITHUB_REPO ?? process.env.NEXT_PUBLIC_GITHUB_REPO ?? "";
}

/** Último sync (p/ polling do botão). Requer login. */
export async function GET() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ ok: false, message: "Não autenticado" }, { status: 401 });
  const { data } = await sb
    .from("sync_runs")
    .select("id,started_at,finished_at,status,stats")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return Response.json({ ok: true, run: data ?? null });
}

/** Dispara o workflow_dispatch do sync-diario. Requer login. */
export async function POST() {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return Response.json({ ok: false, message: "Não autenticado" }, { status: 401 });

  const token = process.env.GITHUB_TOKEN;
  const repoName = repo();
  if (!token || !repoName) {
    return Response.json(
      {
        ok: false,
        message:
          "Sync manual não configurado no servidor (falta GITHUB_TOKEN / GITHUB_REPO). Veja o README.",
      },
      { status: 501 }
    );
  }

  // Anti-duplo-clique: se o último run começou há <90s, não dispara de novo.
  try {
    const { data: last } = await sb
      .from("sync_runs")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const started = (last as { started_at: string } | null)?.started_at;
    if (started && Date.now() - new Date(started).getTime() < 90_000) {
      return Response.json(
        { ok: false, message: "Sync já foi disparado há menos de 2 min. Aguarde." },
        { status: 429 }
      );
    }
  } catch {
    /* best-effort: segue e dispara mesmo assim */
  }

  const res = await fetch(
    `https://api.github.com/repos/${repoName}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: REF }),
    }
  );
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 500);
    return Response.json(
      { ok: false, message: `GitHub recusou o disparo (${res.status}): ${detail}` },
      { status: 502 }
    );
  }
  return Response.json(
    { ok: true, message: "Sync disparado! Leva ~2–5 min. A faixa vai atualizar sozinha." },
    { status: 202 }
  );
}
