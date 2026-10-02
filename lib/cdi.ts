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

/** Ibovespa mensal via Yahoo (^BVSP, fechamento diário em pontos → % a.m.). */
export async function getIbovMensal(n = 6): Promise<{ mes: string; ibov: number }[]> {
  const days = await yahooDaily("^BVSP", 240);
  return monthlyPct(days, n).map((m) => ({ mes: m.mes, ibov: m.pct }));
}

/** S&P 500 mensal via Yahoo (^GSPC, fechamento diário em USD → % a.m.). Sem câmbio. */
export async function getSP500Mensal(n = 6): Promise<{ mes: string; sp500: number }[]> {
  const days = await yahooDaily("^GSPC", 240);
  return monthlyPct(days, n).map((m) => ({ mes: m.mes, sp500: m.pct }));
}

/** Fechamentos diários via Yahoo Finance (sem chave). Mês parcial = mês-até-hoje. */
async function yahooDaily(symbol: string, daysBack: number): Promise<DayQuote[]> {
  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - daysBack);
    const p1 = Math.floor(from.getTime() / 1000);
    const p2 = Math.floor(to.getTime() / 1000) + 86400;
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&period1=${p1}&period2=${p2}`,
      { next: { revalidate: 86400 }, headers: { "User-Agent": "Mozilla/5.0" } }
    );
    if (!res.ok) return [];
    const json = (await res.json()) as {
      chart: { result?: { timestamp?: number[]; indicators?: { quote?: { close?: (number | null)[] }[] } }[] };
    };
    const r = json.chart?.result?.[0];
    const ts = r?.timestamp ?? [];
    const closes = r?.indicators?.quote?.[0]?.close ?? [];
    const out: DayQuote[] = [];
    for (let i = 0; i < ts.length; i++) {
      const c = closes[i];
      if (c === null || c === undefined) continue;
      const d = new Date(ts[i] * 1000);
      out.push({
        mes: `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`,
        close: c,
      });
    }
    return out;
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
