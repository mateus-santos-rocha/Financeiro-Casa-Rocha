export type CdiPoint = { mes: string; cdi: number };

/** CDI mensal (série SGS 4391, % a.m.). Sem chave, com fallback silencioso. */
export async function getCdiMensal(n = 6): Promise<CdiPoint[]> {
  try {
    const res = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados/ultimos/${n}?formato=json`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data: string; valor: string }[];
    return json.map((p) => ({
      mes: `${p.data.slice(3, 5)}/${p.data.slice(6)}`,
      cdi: Number(String(p.valor).replace(",", ".")),
    }));
  } catch {
    return [];
  }
}

type DayQuote = { mes: string; close: number };

/** Agrupa cotações diárias por mês e vira % a.m. (última / primeira − 1). */
function monthlyPct(days: DayQuote[], n: number): { mes: string; pct: number }[] {
  const byMonth = new Map<string, number[]>();
  for (const d of days) {
    if (!Number.isFinite(d.close) || d.close <= 0) continue;
    const list = byMonth.get(d.mes) ?? [];
    list.push(d.close);
    byMonth.set(d.mes, list);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => (sortKey(a) < sortKey(b) ? -1 : 1))
    .slice(-n)
    .map(([mes, closes]) => ({ mes, pct: ((closes[closes.length - 1] - closes[0]) / closes[0]) * 100 }));
}

function sortKey(mes: string): string {
  const [mm, yyyy] = mes.split("/");
  return `${yyyy}-${mm}`;
}

/** Ibovespa mensal via BCB (SGS 7, índice diário → % a.m.). */
export async function getIbovMensal(n = 6): Promise<{ mes: string; ibov: number }[]> {
  try {
    const res = await fetch(
      `https://api.bcb.gov.br/dados/serie/bcdata.sgs.7/dados/ultimos/220?formato=json`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data: string; valor: string }[];
    const days: DayQuote[] = json.map((p) => ({
      mes: `${p.data.slice(3, 5)}/${p.data.slice(6)}`,
      close: Number(String(p.valor).replace(".", "").replace(",", ".")),
    }));
    return monthlyPct(days, n).map((m) => ({ mes: m.mes, ibov: m.pct }));
  } catch {
    return [];
  }
}

/** S&P 500 mensal via Stooq (fechamento diário em USD → % a.m.). Sem câmbio. */
export async function getSP500Mensal(n = 6): Promise<{ mes: string; sp500: number }[]> {
  try {
    const d2 = new Date();
    const d1 = new Date();
    d1.setDate(d1.getDate() - 240);
    const f = (d: Date) =>
      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    const res = await fetch(
      `https://stooq.com/q/d/l/?s=%5Espx&d1=${f(d1)}&d2=${f(d2)}&i=d`,
      { next: { revalidate: 86400 } }
    );
    if (!res.ok) return [];
    const text = await res.text();
    const days: DayQuote[] = text
      .split("\n")
      .slice(1)
      .map((line) => line.trim().split(","))
      .filter((c) => c.length >= 5 && c[0] && c[4] && c[4] !== "N/A")
      .map((c) => ({ mes: `${c[0].slice(5, 7)}/${c[0].slice(0, 4)}`, close: Number(c[4]) }));
    return monthlyPct(days, n).map((m) => ({ mes: m.mes, sp500: m.pct }));
  } catch {
    return [];
  }
}

export type BenchPoint = { mes: string; cdi: number | null; ibov: number | null; sp500: number | null };

/** CDI + Ibovespa + S&P 500 alinhados por mês (últimos n). Falha isolada não derruba os demais. */
export async function getBenchmarks(n = 6): Promise<BenchPoint[]> {
  const [cdi, ibov, sp] = await Promise.all([getCdiMensal(12), getIbovMensal(12), getSP500Mensal(12)]);
  const map = new Map<string, BenchPoint>();
  for (const p of cdi) map.set(p.mes, { mes: p.mes, cdi: p.cdi, ibov: null, sp500: null });
  for (const p of ibov) map.set(p.mes, { ...(map.get(p.mes) ?? { mes: p.mes, cdi: null, ibov: null, sp500: null }), ibov: p.ibov });
  for (const p of sp) map.set(p.mes, { ...(map.get(p.mes) ?? { mes: p.mes, cdi: null, ibov: null, sp500: null }), sp500: p.sp500 });
  return [...map.values()].sort((a, b) => (sortKey(a.mes) < sortKey(b.mes) ? -1 : 1)).slice(-n);
}
