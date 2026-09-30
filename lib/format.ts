export const fmtBRL = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v ?? 0);

/** Compacto p/ rótulos de gráfico: R$ 152,3k · R$ 1,2M */
export const fmtBRLCompact = (v: number | null | undefined) => {
  const n = Math.abs(v ?? 0);
  const sign = (v ?? 0) < 0 ? "-" : "";
  if (n >= 1_000_000) return `${sign}R$ ${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}M`;
  if (n >= 1_000) return `${sign}R$ ${(n / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return fmtBRL(v);
};

export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso + (iso.length === 10 ? "T12:00:00" : ""));
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d);
};

export const monthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** De-para: categorias do Open Finance/Pluggy (EN) → pt-BR. Override do usuário prevalece. */
const CAT_PTBR: Record<string, string> = {
  transfers: "Transferências",
  transfer: "Transferências",
  food: "Alimentação",
  restaurants: "Restaurantes",
  groceries: "Supermercado",
  supermarket: "Supermercado",
  transport: "Transporte",
  transportation: "Transporte",
  housing: "Moradia",
  rent: "Aluguel",
  utilities: "Contas da casa",
  bills: "Contas",
  health: "Saúde",
  healthcare: "Saúde",
  pharmacy: "Farmácia",
  education: "Educação",
  entertainment: "Lazer",
  leisure: "Lazer",
  shopping: "Compras",
  retail: "Compras",
  clothing: "Vestuário",
  services: "Serviços",
  salary: "Salário",
  income: "Receitas",
  earnings: "Receitas",
  investments: "Investimentos",
  investment: "Investimentos",
  taxes: "Impostos e taxas",
  fees: "Taxas",
  travel: "Viagem",
  pets: "Pets",
  gifts: "Presentes",
  donations: "Doações",
  insurance: "Seguros",
  subscriptions: "Assinaturas",
  cash: "Saques",
  atm: "Saques",
  withdrawal: "Saques",
  refunds: "Reembolsos",
  reimbursement: "Reembolsos",
  credit_card: "Cartão de crédito",
  credit_card_payment: "Fatura do cartão",
  card: "Cartão",
  interest: "Juros",
  charges: "Encargos",
  bank_fees: "Tarifas bancárias",
  same_person_transfer: "Transferência própria",
  third_party_transfer: "Transferência a terceiros",
  third_party_transfers: "Transferências a terceiros",
  telecommunications: "Telefonia e internet",
  eating_out: "Restaurantes",
  food_delivery: "Delivery",
  food_and_drinks: "Alimentação",
  digital_services: "Serviços digitais",
  bookstore: "Livraria",
  gas_stations: "Combustível",
  kids_and_toys: "Crianças e brinquedos",
  taxi_and_ride_hailing: "Transporte por app",
  parking: "Estacionamento",
  pension: "Previdência",
  others: "Outros",
  other: "Outros",
  uncategorized: "Sem categoria",
};

export const translateCategory = (c: string | null | undefined) => {
  if (!c) return "Sem categoria";
  const hit = CAT_PTBR[c.trim().toLowerCase().replace(/[\s-]+/g, "_")];
  return hit ?? c;
};

export const displayCategory = (t: { category_override: string | null; category_pluggy: string | null }) =>
  t.category_override ?? translateCategory(t.category_pluggy);

export type Holder = "voce" | "esposa";
export const holderLabel: Record<Holder, string> = { voce: "Você", esposa: "Esposa" };

/** Família do título p/ consolidação: Tesouro Direto junta as variações de nome. */
export function familyOf(name: string | null): string {
  const n = (name ?? "Sem nome").toLowerCase();
  if (n.includes("tesouro")) return "Tesouro Direto";
  return (name ?? "Sem nome").slice(0, 60);
}

export const translateInvType = (t: string | null | undefined) => {
  const map: Record<string, string> = {
    fixed_income: "Renda fixa",
    mutual_fund: "Fundos",
    equity: "Ações/FII",
    etf: "ETF",
    security: "Títulos",
    previdencia: "Previdência",
    coe: "COE",
    other: "Outros",
    crypto: "Cripto",
  };
  if (!t) return "Outros";
  return map[t.trim().toLowerCase().replace(/[\s-]+/g, "_")] ?? t;
};
