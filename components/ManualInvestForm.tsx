"use client";

import { useFormState, useFormStatus } from "react-dom";
import { addManualInvestment } from "@/lib/actions";

const TYPES = [
  { value: "other", label: "Outros" },
  { value: "previdencia", label: "Previdência" },
  { value: "fixed_income", label: "Renda fixa" },
  { value: "mutual_fund", label: "Fundos" },
  { value: "equity", label: "Ações/FII" },
  { value: "etf", label: "ETF" },
  { value: "security", label: "Títulos" },
  { value: "coe", label: "COE" },
  { value: "crypto", label: "Cripto" },
];

function Submit() {
  const { pending } = useFormStatus();
  return <button className="btn-primary" disabled={pending}>{pending ? "Adicionando…" : "Adicionar"}</button>;
}

/** Posição fora do Pluggy (ex.: previdência da esposa): entra nos totais e na evolução a partir de hoje. */
export function ManualInvestForm() {
  const [state, action] = useFormState(addManualInvestment, null as null | { ok: boolean; message: string });
  return (
    <form action={action} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="mi-name">Título</label>
          <input id="mi-name" name="name" required maxLength={120} placeholder="Ex.: BrasilPrev – Laís" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="mi-type">Tipo</label>
          <select id="mi-type" name="type" defaultValue="other" className="input">
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="mi-invested">Aplicado (R$)</label>
          <input id="mi-invested" name="invested" required inputMode="decimal" placeholder="10000,00" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="mi-current">Valor atual (R$)</label>
          <input id="mi-current" name="current" required inputMode="decimal" placeholder="10500,00" className="input" />
        </div>
      </div>
      <p className="text-sm text-slate-500">
        Atualize o valor todo mês em <em>editar</em> na tabela — o alerta cobra e a evolução passa a incluí-lo.
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
