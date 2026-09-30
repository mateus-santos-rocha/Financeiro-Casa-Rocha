import { supabaseServer } from "@/lib/supabase-server";
import { displayCategory, fmtBRL } from "@/lib/format";
import { AutoForm } from "@/components/AutoForm";
import { MovTable, type MovRow } from "@/components/MovTable";

const SORTS = ["date", "description", "account", "category", "tags", "value"] as const;
type SortKey = (typeof SORTS)[number];

export default async function MovimentacoesPage({
  searchParams,
}: {
  searchParams: { mes?: string; q?: string; titular?: string; showBtc?: string; tag?: string; cat?: string; sort?: string; dir?: string };
}) {
  const sb = supabaseServer();
  const mes = searchParams.mes ?? new Date().toISOString().slice(0, 7);
  const [y, m] = mes.split("-").map(Number);
  const start = `${mes}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);

  let query = sb
    .from("transactions")
    .select("id,date,description,amount,category_pluggy,category_override,accounts(bank,holder,name),transaction_tags(tags(id,name,color))")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false })
    .limit(500);

  if (searchParams.titular === "voce" || searchParams.titular === "esposa") {
    query = query.eq("accounts.holder", searchParams.titular);
  }
  if (searchParams.q) {
    query = query.ilike("description", `%${searchParams.q}%`);
  }

  const [{ data, error }, { data: tagRows }] = await Promise.all([
    query,
    sb.from("tags").select("name").order("name"),
  ]);
  const allTags = ((tagRows ?? []) as { name: string }[]).map((t) => t.name);

  // BTC (cashback convertido) vive nos investimentos — oculto por padrão
  const showBtc = searchParams.showBtc === "1";
  const tagFilter = searchParams.tag ?? "";
  let rows = ((data ?? []) as unknown as MovRow[]).filter(
    (t) => showBtc || !t.transaction_tags.some((x) => x.tags?.name === "btc")
  );
  if (tagFilter === "__none") {
    rows = rows.filter((t) => t.transaction_tags.length === 0);
  } else if (tagFilter) {
    rows = rows.filter((t) => t.transaction_tags.some((x) => x.tags?.name === tagFilter));
  }
  const catFilter = searchParams.cat ?? "";
  const catNames = [...new Set(rows.map(displayCategory))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  if (catFilter) {
    rows = rows.filter((t) => displayCategory(t) === catFilter);
  }

  const sort: SortKey = SORTS.includes((searchParams.sort ?? "") as SortKey)
    ? (searchParams.sort as SortKey)
    : "date";
  const dir = searchParams.dir === "asc" ? "asc" : searchParams.dir === "desc" ? "desc" : (sort === "date" || sort === "value" ? "desc" : "asc");
  const tagNames = (t: MovRow) => t.transaction_tags.map((x) => x.tags?.name ?? "").filter(Boolean).join(", ");
  const by: Record<SortKey, (t: MovRow) => string | number> = {
    date: (t) => t.date,
    description: (t) => (t.description ?? "").toLowerCase(),
    account: (t) => `${t.accounts?.bank ?? ""} ${t.accounts?.holder ?? ""} ${t.accounts?.name ?? ""}`.toLowerCase(),
    category: (t) => displayCategory(t).toLowerCase(),
    tags: (t) => tagNames(t).toLowerCase(),
    value: (t) => Number(t.amount ?? 0),
  };
  const get = by[sort];
  rows = [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    const cmp = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR");
    return dir === "asc" ? cmp : -cmp;
  });

  const total = rows.reduce((acc, t) => acc + Number(t.amount ?? 0), 0);

  const { data: cats } = await sb
    .from("transactions")
    .select("category_pluggy,category_override")
    .limit(5000);  const suggestions = [...new Set(
    ((cats ?? []) as { category_pluggy: string | null; category_override: string | null }[])
      .flatMap((c) => [c.category_override, c.category_pluggy])
      .filter(Boolean) as string[]
  )].sort();

  const qs = new URLSearchParams({
    ...(searchParams.mes ? { mes: searchParams.mes } : {}),
    ...(searchParams.q ? { q: searchParams.q } : {}),
    ...(searchParams.titular ? { titular: searchParams.titular } : {}),
    ...(tagFilter ? { tag: tagFilter } : {}),
    ...(catFilter ? { cat: catFilter } : {}),
    ...(showBtc ? { showBtc: "1" } : {}),
  }).toString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Movimentações</h1>
        <span className="badge bg-slate-100 text-slate-600">{rows.length} lançamentos</span>
        <span className={`badge ${total >= 0 ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>
          Saldo do filtro: {fmtBRL(total)}
        </span>
        <span className="ml-auto flex gap-2">
          <a className="btn-ghost" href={`/movimentacoes/export?${qs}`}>Exportar CSV</a>
          <a className="btn-ghost" href="/movimentacoes/import">Importar CSV</a>
        </span>
      </div>

      <AutoForm className="card flex flex-wrap gap-3">
        <div>
          <label className="label" htmlFor="mes">Mês</label>
          <input id="mes" name="mes" type="month" defaultValue={mes} className="input" />
        </div>
        <div>
          <label className="label" htmlFor="titular">Titular</label>
          <select id="titular" name="titular" defaultValue={searchParams.titular ?? ""} className="input">
            <option value="">Todos</option>
            <option value="voce">Mateus</option>
            <option value="esposa">Laís</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tag">Tag</label>
          <select id="tag" name="tag" defaultValue={tagFilter} className="input">
            <option value="">Todas</option>
            <option value="__none">Sem tag</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="cat">Categoria</label>
          <select id="cat" name="cat" defaultValue={catFilter} className="input">
            <option value="">Todas</option>
            {catNames.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="min-w-52 flex-1">
          <label className="label" htmlFor="q">Buscar</label>
          <input id="q" name="q" defaultValue={searchParams.q ?? ""} placeholder="Ex.: uber, iFood, BTG…" className="input" />
        </div>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1 whitespace-nowrap text-sm text-slate-600">
            <input type="checkbox" name="showBtc" value="1" defaultChecked={showBtc} />
            mostrar BTC
          </label>
          <button className="btn-ghost" type="submit">Filtrar</button>
          <a className="btn-ghost" href="/movimentacoes">Limpar</a>
        </div>
      </AutoForm>

      {error && <p role="alert" className="text-sm text-red-600">Erro ao carregar: {error.message}</p>}

      <MovTable rows={rows} suggestions={suggestions} sort={sort} dir={dir} baseQs={qs} allTags={allTags} />
    </div>
  );
}
