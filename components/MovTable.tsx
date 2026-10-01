"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { displayCategory, fmtBRL, fmtDate, holderLabel } from "@/lib/format";
import { addTagToTx, applyTagBatch, createRule, removeTagFromTx, setOverride } from "@/lib/actions";

export type MovRow = {
  id: string;
  date: string;
  description: string | null;
  amount: number | null;
  category_pluggy: string | null;
  category_override: string | null;
  accounts: { bank: string | null; holder: string | null; name: string | null } | null;
  transaction_tags: { tags: { id: string; name: string; color: string | null } | null }[];
};

export function MovTable({ rows, suggestions, sort, dir, baseQs, allTags }: {
  rows: MovRow[];
  suggestions: string[];
  sort: string;
  dir: string;
  baseQs: string;
  allTags: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [catEdit, setCatEdit] = useState<string | null>(null);
  const [catValue, setCatValue] = useState("");
  const [tagRow, setTagRow] = useState<string | null>(null);
  const [tagValue, setTagValue] = useState("");
  const [batchTag, setBatchTag] = useState("");
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

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function sortLink(col: string, label: string) {
    const active = sort === col;
    const nextDir = active && dir === "asc" ? "desc" : "asc";
    return (
      <a href={`/movimentacoes?${baseQs}&sort=${col}&dir=${nextDir}`} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : undefined}>
        {label}{active ? (dir === "asc" ? " ▲" : " ▼") : ""}
      </a>
    );
  }

  return (
    <div className="space-y-3">
      {error && <p role="alert" className="card border-red-200 text-sm text-red-700">{error}</p>}

      {selected.size > 0 && (
        <div className="card flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{selected.size} selecionado(s)</span>
          <input
            className="input max-w-52"
            list="tag-suggestions"
            placeholder="tag p/ aplicar em lote"
            value={batchTag}
            onChange={(e) => setBatchTag(e.target.value)}
            aria-label="Tag para aplicar em lote"
          />
          <datalist id="tag-suggestions">
            {allTags.map((t) => <option key={t} value={t} />)}
          </datalist>
          <button
            className="btn-primary"
            disabled={pending || !batchTag.trim()}
            onClick={() => run(() => applyTagBatch([...selected], batchTag), () => { setSelected(new Set()); setBatchTag(""); })}
          >
            Aplicar tag
          </button>
          <button className="btn-ghost" onClick={() => setSelected(new Set())}>Limpar</button>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="table">
          <thead>
            <tr>
              <th><span className="sr-only">Selecionar</span></th>
              <th>{sortLink("date", "Data")}</th>
              <th>{sortLink("description", "Descrição")}</th>
              <th>{sortLink("account", "Conta")}</th>
              <th>{sortLink("category", "Categoria")}</th>
              <th>{sortLink("tags", "Tags")}</th>
              <th className="text-right">{sortLink("value", "Valor")}</th>
              <th><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const tags = t.transaction_tags.map((x) => x.tags).filter(Boolean) as { id: string; name: string; color: string | null }[];
              return (
                <tr key={t.id}>
                  <td>
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} aria-label={`Selecionar ${t.description ?? t.id}`} />
                  </td>
                  <td className="whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td>{t.description ?? "—"}</td>
                  <td className="whitespace-nowrap text-slate-500">
                    {t.accounts?.bank ?? "—"} · {holderLabel[t.accounts?.holder === "esposa" ? "esposa" : "voce"]}
                  </td>
                  <td>
                    {catEdit === t.id ? (
                      <span className="flex gap-1">
                        <input
                          className="input min-w-32"
                          list="cat-suggestions"
                          value={catValue}
                          onChange={(e) => setCatValue(e.target.value)}
                          aria-label="Categoria"
                        />
                        <datalist id="cat-suggestions">
                          {suggestions.map((s) => <option key={s} value={s} />)}
                        </datalist>
                        <button className="btn-primary" disabled={pending} onClick={() => run(() => setOverride(t.id, catValue), () => setCatEdit(null))}>OK</button>
                      </span>
                    ) : (
                      <button
                        className="rounded px-1 text-left hover:bg-slate-100"
                        title="Editar categoria"
                        onClick={() => { setCatEdit(t.id); setCatValue(displayCategory(t)); }}
                      >
                        {displayCategory(t)}
                        {t.category_override && <span className="ml-1 text-xs text-slate-400">(editada)</span>}
                      </button>
                    )}
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {tags.map((g) => (
                        <span key={g.id} className="badge bg-slate-100 text-slate-700">
                          {g.name}
                          <button
                            className="ml-1 text-slate-400 hover:text-red-600"
                            aria-label={`Remover tag ${g.name}`}
                            onClick={() => run(() => removeTagFromTx(t.id, g.id))}
                          >×</button>
                        </span>
                      ))}
                      {tagRow === t.id ? (
                        <span className="flex gap-1">
                          <input
                            className="input min-w-28"
                            list="tag-suggestions"
                            placeholder="nova tag"
                            value={tagValue}
                            onChange={(e) => setTagValue(e.target.value)}
                            aria-label="Nova tag"
                          />
                          <button className="btn-primary" disabled={pending || !tagValue.trim()} onClick={() => run(() => addTagToTx(t.id, tagValue), () => { setTagRow(null); setTagValue(""); })}>+</button>
                        </span>
                      ) : (
                        <button className="badge bg-slate-50 text-slate-400 hover:bg-slate-100" onClick={() => { setTagRow(t.id); setTagValue(""); }}>+ tag</button>
                      )}
                    </span>
                  </td>
                  <td className={`text-right font-medium ${Number(t.amount ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                    {fmtBRL(Number(t.amount ?? 0))}
                  </td>
                  <td>
                    <button
                      className="whitespace-nowrap text-xs text-slate-500 hover:text-slate-900"
                      title="Criar regra desta descrição"
                      onClick={() => {
                        const cat = window.prompt(`Regra para descrições contendo "${t.description ?? ""}": categoria?`, displayCategory(t));
                        if (cat) run(() => createRule(t.description ?? "", cat));
                      }}
                    >
                      regra
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">
                Nenhum lançamento. Rode o sync (↻ Atualizar no topo).
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
