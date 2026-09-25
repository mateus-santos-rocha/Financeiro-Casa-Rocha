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
