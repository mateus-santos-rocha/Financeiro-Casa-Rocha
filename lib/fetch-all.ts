// fetch-all.ts — o PostgREST do Supabase limita cada resposta a 1000 linhas;
// passar .limit(N > 1000) é ignorado em silêncio e a query volta cortada
// (foi assim que o mês atual sumiu do Histórico ao passar de ~1000 lançamentos).
// Este helper pagina com .range() até esgotar. Passe uma função que monta
// uma query NOVA a cada chamada (o builder é consumido a cada await).
type BuiltQuery = {
  range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>;
};

export async function fetchAll<T>(build: () => BuiltQuery, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  let from = 0;
  for (;;) {
    const { data, error } = await build().range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as T[];
    out.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }
  return out;
}
