// groups.ts — grupos do orçamento (server-safe: sem "use client").
// Cores iguais às tags seed (migration 0016).
export const GROUP_META: { key: string; label: string; color: string }[] = [
  { key: "custo-fixo", label: "Custo fixo", color: "#0f172a" },
  { key: "conforto", label: "Conforto", color: "#0ea5e9" },
  { key: "prazeres", label: "Prazeres", color: "#ec4899" },
  { key: "liberdade-financeira", label: "Liberdade financeira", color: "#10b981" },
  { key: "sem-grupo", label: "Sem grupo", color: "#64748b" },
];
