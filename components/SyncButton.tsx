"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Run = {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string | null;
};

const POLL_MS = 15_000;
const POLL_MAX = 40; // ~10 min

/** Botão 1-clique: dispara o sync-diario via /api/sync e acompanha via sync_runs. */
export function SyncButton() {
  const router = useRouter();
  const [phase, setPhase] = useState<"idle" | "firing" | "polling" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");
  const baseline = useRef<string | null>(null);
  const polls = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  // Guarda o id do último run antes do clique, p/ detectar o run novo.
  const snapshotBaseline = useCallback(async () => {
    try {
      const r = await fetch("/api/sync", { cache: "no-store" });
      const j = (await r.json()) as { run: Run | null };
      baseline.current = j.run?.id ?? null;
    } catch {
      baseline.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    polls.current += 1;
    try {
      const r = await fetch("/api/sync", { cache: "no-store" });
      const j = (await r.json()) as { run: Run | null };
      const run = j.run;
      // Run novo = id diferente do baseline (ou baseline vazio e run recente).
      if (run && run.id !== baseline.current) {
        if (run.status === "ok" || run.status === "error") {
          stop();
          setPhase("done");
          setMsg(
            run.status === "ok"
              ? "Atualizado! Recarregando…"
              : "Sync terminou com erro — veja sync_runs."
          );
          router.refresh();
          // Volta ao idle após alguns segundos
          setTimeout(() => {
            setPhase("idle");
            setMsg("");
          }, 8000);
          return;
        }
        setMsg(`Sincronizando… (${Math.round((polls.current * POLL_MS) / 60000)} min)`);
      }
    } catch {
      /* mantém polling em erro transitório */
    }
    if (polls.current >= POLL_MAX) {
      stop();
      setPhase("done");
      setMsg("Ainda rodando — recarregue a página em instantes.");
      router.refresh();
    }
  }, [router, stop]);

  const fire = useCallback(async () => {
    setPhase("firing");
    setMsg("Disparando…");
    await snapshotBaseline();
    let res: Response;
    try {
      res = await fetch("/api/sync", { method: "POST" });
    } catch {
      setPhase("error");
      setMsg("Falha de rede ao disparar.");
      return;
    }
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
    if (res.status === 501) {
      // Servidor sem GITHUB_TOKEN: mostra fallback p/ Actions.
      setPhase("error");
      setMsg(j.message ?? "Não configurado.");
      return;
    }
    if (res.status === 429) {
      setPhase("error");
      setMsg(j.message ?? "Aguarde antes de disparar de novo.");
      setTimeout(() => {
        setPhase("idle");
        setMsg("");
      }, 6000);
      return;
    }
    if (!res.ok || !j.ok) {
      setPhase("error");
      setMsg(j.message ?? `Erro ${res.status} ao disparar.`);
      return;
    }
    // Disparado: entra em polling (Actions leva 2–5 min p/ terminar).
    setPhase("polling");
    setMsg("Sync disparado! Acompanhando…");
    polls.current = 0;
    stop();
    timer.current = setInterval(poll, POLL_MS);
  }, [poll, snapshotBaseline, stop]);

  const busy = phase === "firing" || phase === "polling";
  const repo = process.env.NEXT_PUBLIC_GITHUB_REPO ?? "";

  return (
    <span className="ml-auto inline-flex items-center gap-2">
      {msg ? (
        <span
          role="status"
          className={phase === "error" ? "text-red-600" : "text-slate-500"}
        >
          {msg}
        </span>
      ) : null}
      {phase === "error" && !busy && repo ? (
        <a
          className="font-medium text-slate-700 hover:text-slate-900"
          href={`https://github.com/${repo}/actions/workflows/sync.yml`}
          target="_blank"
          rel="noreferrer"
          title="Abrir Actions e rodar sync-diario manualmente"
        >
          Abrir Actions
        </a>
      ) : null}
      <button
        type="button"
        onClick={fire}
        disabled={busy}
        title={busy ? "Sync em andamento…" : "Atualizar agora (dispara o sync)"}
        className="font-medium text-slate-700 hover:text-slate-900 disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? "⟳ Sincronizando…" : "↻ Atualizar"}
      </button>
    </span>
  );
}
