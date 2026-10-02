"use client";

import { Suspense, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-client";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [forgot, setForgot] = useState(false);
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/movimentacoes";
  const urlError = params.get("error");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.push(next);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setLoading(false);
    }
  }

  async function onForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const sb = supabaseBrowser();
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/confirm?next=/redefinir`,
      });
      if (error) throw error;
      setInfo("Email enviado! Abra o link mais recente para definir a nova senha.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Falha ao enviar email");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm">
      <div className="card">
        <h1 className="text-xl font-bold">Entrar — Casa Rocha</h1>
        <p className="mt-1 text-sm text-slate-500">Use o e-mail cadastrado no Supabase Auth (Mateus ou Laís).</p>
        {urlError && <p role="alert" className="mt-2 text-sm text-red-600">{urlError}</p>}
        {forgot ? (
          <form onSubmit={onForgot} className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="email">E-mail</label>
              <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            {info && <p className="text-sm text-emerald-600">{info}</p>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? "Enviando…" : "Enviar link"}</button>
            <button type="button" className="w-full text-center text-sm text-slate-500 hover:text-slate-800" onClick={() => { setForgot(false); setError(null); setInfo(null); }}>
              Voltar ao login
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="email">E-mail</label>
              <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label className="label" htmlFor="password">Senha</label>
              <input id="password" className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button className="btn-primary w-full" disabled={loading}>{loading ? "Entrando…" : "Entrar"}</button>
            <button type="button" className="w-full text-center text-sm text-slate-500 hover:text-slate-800" onClick={() => { setForgot(true); setError(null); setInfo(null); }}>
              Esqueci a senha
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
