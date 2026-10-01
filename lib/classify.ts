// classify.ts — natureza da entrada/saída para os gráficos (Análise + Histórico).
// Não muda nenhum total: só abre o que já está incluído em sub-barras/fatias.
// Padrões validados contra as 1341 transações do banco em 30/09/2026:
//   salário = "PAGAMENTO DE SALARIO" (categoria Salary, conta BV);
//   resgate/aporte = descrições/categorias de investimento (Resgate RDB,
//     Aplicação em CDB/LCA/Tesouro, BRASILPREV, CONTA REMUNERADA...).
// "Resgate de Cashback" nunca chega aqui (tag btc é excluída antes).

export type IncomeKind = "salario" | "transferencia" | "resgate" | "outras";
export type ExpenseKind = "despesa" | "aporte" | "transferencia";

type TxLike = { description?: string | null; category_pluggy?: string | null };

const SALARIO_RE = /salari|salary|provento/i;
const INVEST_RE =
  /resgat|aplic|cdb|rdb|lci|lca|lft|tesouro|fundo|cota|brasilprev|previd|investimento|investments|fixed income|mutual funds|pension|dividend|jcp|rendimento/i;

export function hayOf(t: TxLike): string {
  // Minúsculas sem acento (Laís == Lais), igual às regras do sync.
  const raw = `${t.description ?? ""} ${t.category_pluggy ?? ""}`.toLowerCase();
  return raw.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Entrada (amount >= 0). isTransfer/isSalario = tags da transação. */
export function incomeKind(t: TxLike, isTransfer: boolean, isSalario = false): IncomeKind {
  if (isTransfer) return "transferencia";
  if (isSalario) return "salario"; // tag `salario` (ex.: salário da Laís, migration 0019)
  const hay = hayOf(t);
  if (SALARIO_RE.test(hay)) return "salario"; // ex.: PAGAMENTO DE SALARIO (BV)
  if (INVEST_RE.test(hay)) return "resgate";
  return "outras";
}

/** Saída (amount < 0). isTransfer = tem a tag transferencia-interna. */
export function expenseKind(t: TxLike, isTransfer: boolean): ExpenseKind {
  if (isTransfer) return "transferencia";
  if (INVEST_RE.test(hayOf(t))) return "aporte";
  return "despesa";
}

export const INCOME_META: Record<IncomeKind, { label: string; color: string }> = {
  salario: { label: "Salário", color: "#059669" },
  transferencia: { label: "Transferências", color: "#34d399" },
  resgate: { label: "Resgates", color: "#14b8a6" },
  outras: { label: "Outras", color: "#a7f3d0" },
};

export const EXPENSE_META: Record<ExpenseKind, { label: string; color: string }> = {
  despesa: { label: "Despesas", color: "#dc2626" },
  aporte: { label: "Aportes", color: "#f87171" },
  transferencia: { label: "Transferências", color: "#fca5a5" },
};
