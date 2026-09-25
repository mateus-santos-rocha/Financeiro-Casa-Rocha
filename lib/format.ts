export const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);
};

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export const displayCategory = (t: { category_override: string | null; category_pluggy: string | null }) =>
  t.category_override ?? t.category_pluggy ?? "Sem categoria";

export type Holder = "voce" | "esposa";
export const holderLabel: Record<Holder, string> = { voce: "Você", esposa: "Esposa" };
