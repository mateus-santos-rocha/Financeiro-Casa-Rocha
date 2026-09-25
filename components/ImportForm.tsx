"use client";

import { useFormState, useFormStatus } from "react-dom";
import { importCsv } from "@/lib/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Importando…" : "Importar"}</button>;
}

export function ImportForm() {
  const [state, action] = useFormState(importCsv, null as null | { ok: boolean; message: string });
  return (
    <form action={action} className="card space-y-3">
      <div>
        <label className="label" htmlFor="file">Arquivo CSV (data, descrição, valor; opcional: categoria, conta)</label>
        <input id="file" name="file" type="file" accept=".csv,.txt" required className="input" />
      </div>
      <p className="text-sm text-slate-500">
        Formato: cabeçalho com <code>date,description,amount</code> (ou <code>data,descricao,valor</code>),
        separados por vírgula ou ponto-e-vírgula. Linhas repetidas não duplicam.
      </p>
      <Submit />
      {state && (
        <p role="status" className={`text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
