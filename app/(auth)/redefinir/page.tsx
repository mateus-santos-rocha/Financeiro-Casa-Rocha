"use client";

import { Suspense, useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-client";
import { useRouter } from "next/navigation";

function RedefinirForm() {
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    supabaseBrowser().auth.getSession().then(({ data }) => setHasSession(!!data.session));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (p1.length < 6) {
      setError("A senha precisa de ao menos 6 caracteres.");
      return;
    }
    if (p1 !== p2) {
      setError("As senhas não conferem.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabaseBrowser().auth.updateUser({ password: p1 });
      if (error) throw error;
      setOk(true);
      setTimeout(() => router.push("/movimentacoes"), 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao salvar");
    } finally {
      setLoading(false);
    }
  }

  if (hasSession === false) {
    return (
      <div className="mx-auto mt-16 max-w-sm">
        <div className="card">
          <h1 className="text-xl font-bold">Link inválido ou expirado</h1>
          <p className="mt-2 text-sm text-slate-500">
            Abra o email mais recente e clique de novo — cada link vale uma vez. Ou peça outro na tela de login.
          </p>
          <a className="btn-primary mt-4 inline-block" href="/login">Voltar ao login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="card">
        <h1 className="text-xl font-bold">Definir nova senha</h1>
        {ok ? (
          <p className="mt-2 text-sm text-emerald-600">Senha salva! Redirecionando…</p>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="p1">Nova senha</label>
              <input id="p1" className="input" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="p2">Repetir senha</label>
              <input id="p2" className="input" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} required />
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full" disabled={loading || hasSession === null}>
              {loading ? "Salvando…" : "Salvar senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function RedefinirPage() {
  return (
    <Suspense>
      <RedefinirForm />
    </Suspense>
  );
}
