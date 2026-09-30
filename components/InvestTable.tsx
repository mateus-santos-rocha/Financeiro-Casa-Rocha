"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { familyOf, fmtBRL } from "@/lib/format";
import { addInvTag, removeInvTag, setInvestmentClosed, updateInvestment } from "@/lib/actions";

export type InvRow = {
  id: string;
  pluggy_id?: string | null;
  name: string | null;
  type: string | null;
  issuer: string | null;
  indexer: string | null;
  rate: string | null;
  maturity_date: string | null;
  quantity: number | null;
  amount_invested: number | null;
  invested_override: number | null;
  current_value: number | null;
  last_seen_at: string | null;
  updated_at?: string | null;
  closed_manual: boolean | null;
  held_since: string | null;
  base_eff?: number | null;
  origin_label?: string | null;
  accounts: { bank: string | null; holder: string | null } | null;
  investment_tags: { tags: { id: string; name: string; color: string | null } | null }[];
};

/** Uma linha consolidada por família — ver familyOf em lib/format. */

export function InvestTable({ rows }: { rows: InvRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [onlyReserva, setOnlyReserva] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState({ issuer: "", indexer: "", rate: "", maturity_date: "", invested_override: "", held_since: "", current_value: "", amount_invested: "" });
  const [tagRow, setTagRow] = useState<string | null>(null);
  const [tagValue, setTagValue] = useState("");
  const [open, setOpen] = useState<Set<string> | null>(null); // null = auto (abre famílias de 1 lote)
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<unknown>, done?: () => void) {
    setError(null);
    start(async () => {
      try {
        await fn();
        done?.();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Erro");
      }
    });
  }

  const isReserva = (r: InvRow) => r.investment_tags.some((x) => x.tags?.name === "reserva-emergencia");
  const lots = onlyReserva ? rows.filter(isReserva) : rows.filter((r) => !isReserva(r));

  const groups = new Map<string, InvRow[]>();
  for (const r of lots) {
    const k = familyOf(r.name);
    const list = groups.get(k) ?? [];
    list.push(r);
    groups.set(k, list);
  }
  const fams = [...groups.entries()]
    .map(([name, items]) => {
      const base = items.reduce((a, r) => a + Number(r.base_eff ?? r.invested_override ?? r.amount_invested ?? 0), 0);
      const atual = items.reduce((a, r) => a + Number(r.current_value ?? 0), 0);
      const bancos = [...new Set(items.map((r) => r.accounts?.bank).filter(Boolean))].join(", ");
      return { name, items, base, atual, rent: atual - base, bancos };
    })
    .sort((a, b) => b.atual - a.atual);

  const isOpen = (name: string) => open?.has(name) ?? false;
  function toggle(name: string) {
    setOpen((prev) => {
      const next = new Set(prev ?? []);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function lotRow(r: InvRow) {
    const ap = Number(r.base_eff ?? r.invested_override ?? r.amount_invested ?? 0);
    const at = Number(r.current_value ?? 0);
    const rent = at - ap;
    const pct = ap > 0 ? `(${(rent / ap * 100).toFixed(1)}%)` : "";
    const tags = r.investment_tags.map((x) => x.tags).filter(Boolean) as { id: string; name: string }[];
    const isEditing = editing === r.id;
    const isManual = (r.pluggy_id ?? "").startsWith("manual:");
    const saveFields = isManual
      ? form
      : { issuer: form.issuer, indexer: form.indexer, rate: form.rate, maturity_date: form.maturity_date, invested_override: form.invested_override, held_since: form.held_since };
    return (
      <tr key={r.id} className="bg-slate-50/60">
        <td className="pl-8">{r.name ?? "—"} <span className="text-slate-400">· {r.accounts?.bank ?? ""}{r.quantity ? ` · ${Number(r.quantity).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} un.` : ""}{r.held_since ? ` · desde ${r.held_since.slice(0, 7)}` : ""}</span></td>
        <td>
          {isEditing ? (
            <span className="flex flex-col gap-1">
              <input className="input min-w-28" value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} aria-label="Emissor" placeholder="Emissor" />
              <input className="input min-w-28" value={form.invested_override} onChange={(e) => setForm({ ...form, invested_override: e.target.value })} aria-label="Base de custo manual" placeholder="Base de custo R$" inputMode="decimal" />
            </span>
          ) : (r.issuer ?? "—")}
        </td>
        <td>{isEditing
          ? <input className="input min-w-24" value={form.indexer} onChange={(e) => setForm({ ...form, indexer: e.target.value })} placeholder="CDI/IPCA…" aria-label="Indexador" />
          : (r.indexer ?? "—")}</td>
        <td>{isEditing
          ? <input className="input min-w-24" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} placeholder="102% CDI" aria-label="Taxa" />
          : (r.rate ?? "—")}</td>
        <td>{isEditing
          ? <span className="flex flex-col gap-1">
              <input className="input min-w-32" type="date" value={form.maturity_date} onChange={(e) => setForm({ ...form, maturity_date: e.target.value })} aria-label="Vencimento" />
              <input className="input min-w-32" type="date" value={form.held_since} onChange={(e) => setForm({ ...form, held_since: e.target.value })} aria-label="Início da posição" title="Início econômico (compra original)" />
            </span>
          : (r.maturity_date ?? "—")}</td>
        <td className="text-right">{isEditing && isManual
          ? <input className="input min-w-24" value={form.amount_invested} onChange={(e) => setForm({ ...form, amount_invested: e.target.value })} aria-label="Aplicado" inputMode="decimal" />
          : <>{fmtBRL(ap)}{r.invested_override != null && <span className="ml-1 text-xs text-slate-400">(manual)</span>}</>}</td>
        <td className="text-right font-medium">{isEditing && isManual
          ? <input className="input min-w-24" value={form.current_value} onChange={(e) => setForm({ ...form, current_value: e.target.value })} aria-label="Valor atual" inputMode="decimal" />
          : fmtBRL(at)}</td>
        <td className={`whitespace-nowrap text-right ${rent >= 0 ? "text-emerald-700" : "text-red-700"}`}>
          {fmtBRL(rent)} {pct}
          <br />
          {isEditing ? (
            <span className="flex justify-end gap-1">
              <button className="btn-primary" disabled={pending} onClick={() => run(() => updateInvestment(r.id, saveFields), () => setEditing(null))}>OK</button>
              <button className="btn-ghost" onClick={() => setEditing(null)}>✕</button>
            </span>
          ) : (
            <span className="flex justify-end gap-2">
              <button
                className="text-xs text-slate-400 hover:text-slate-900"
                onClick={() => {
                  setEditing(r.id);
                            setForm({ issuer: r.issuer ?? "", indexer: r.indexer ?? "", rate: r.rate ?? "", maturity_date: r.maturity_date ?? "", held_since: r.held_since ?? "", current_value: r.current_value != null ? String(r.current_value).replace(".", ",") : "", amount_invested: (r.invested_override ?? r.amount_invested) != null ? String(r.invested_override ?? r.amount_invested).replace(".", ",") : "", invested_override: r.invested_override != null ? String(r.invested_override).replace(".", ",") : "" });
                }}
              >
                editar
              </button>
              <button
                className="text-xs text-slate-400 hover:text-red-700"
                title="Marcar como encerrada (sai dos totais)"
                onClick={() => {
                  if (window.confirm(`Encerrar "${r.name ?? "título"}"? Sai dos totais.`)) {
                    run(() => setInvestmentClosed(r.id, true));
                  }
                }}
              >
                encerrar
              </button>
            </span>
          )}
        </td>
        <td>
          <span className="flex flex-wrap gap-1">
            {tags.map((g) => (
              <span key={g.id} className={`badge ${g.name === "reserva-emergencia" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                {g.name}
                <button className="ml-1 opacity-60 hover:opacity-100" aria-label={`Remover tag ${g.name}`} onClick={() => run(() => removeInvTag(r.id, g.id))}>×</button>
              </span>
            ))}
            {tagRow === r.id ? (
              <span className="flex gap-1">
                <input className="input min-w-28" placeholder="nova tag" value={tagValue} onChange={(e) => setTagValue(e.target.value)} aria-label="Nova tag" />
                <button className="btn-primary" disabled={pending || !tagValue.trim()} onClick={() => run(() => addInvTag(r.id, tagValue), () => { setTagRow(null); setTagValue(""); })}>+</button>
              </span>
            ) : (
              <button className="badge bg-slate-50 text-slate-400 hover:bg-slate-100" onClick={() => { setTagRow(r.id); setTagValue(""); }}>+ tag</button>
            )}
          </span>
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="card border-red-200 text-sm text-red-700">{error}</p>}

      <label className="flex w-fit items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={onlyReserva} onChange={(e) => setOnlyReserva(e.target.checked)} />
        só reserva de emergência ({rows.filter((r) => r.investment_tags.some((x) => x.tags?.name === "reserva-emergencia")).length})
      </label>

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th>Título</th><th>Emissor</th><th>Indexador</th><th>Taxa</th><th>Vencimento</th>
              <th className="text-right">Aplicado</th><th className="text-right">Atual</th>
              <th className="text-right">Rent.</th><th>Tags</th>
            </tr>
          </thead>
          <tbody>
            {fams.map((f) => (
              <Fragment key={f.name}>
                <tr className="bg-white">
                  <td>
                    <button className="flex items-center gap-1 font-semibold hover:text-slate-600" onClick={() => toggle(f.name)} aria-expanded={isOpen(f.name)}>
                      <span className="inline-block w-4 text-slate-400">{isOpen(f.name) ? "▾" : "▸"}</span>
                      {f.name}
                    </button>
                    <span className="ml-5 text-xs text-slate-400">{f.bancos}{f.items.length > 1 ? ` · ${f.items.length} lotes` : ""}</span>
                  </td>
                  <td colSpan={4}></td>
                  <td className="text-right font-medium">{fmtBRL(f.base)}</td>
                  <td className="text-right font-bold">{fmtBRL(f.atual)}</td>
                  <td className={`text-right font-medium ${f.rent >= 0 ? "text-emerald-700" : "text-red-700"}`}>{fmtBRL(f.rent)}</td>
                  <td></td>
                </tr>
                {isOpen(f.name) && f.items.map(lotRow)}
              </Fragment>
            ))}
            {fams.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">Nada aqui — rode o sync ou desmarque o filtro.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
