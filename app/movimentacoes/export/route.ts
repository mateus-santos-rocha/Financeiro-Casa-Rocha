import { supabaseServer } from "@/lib/supabase-server";
import { displayCategory, holderLabel, validMonth } from "@/lib/format";

function csvCell(v: string | number | null | undefined): string {
  const s = String(v ?? "");
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: Request) {
  const sb = supabaseServer();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("Não autenticado", { status: 401 });

  const url = new URL(req.url);
  const mes = validMonth(url.searchParams.get("mes") ?? undefined, new Date().toISOString().slice(0, 7));
  const q = url.searchParams.get("q") ?? "";
  const titular = url.searchParams.get("titular") ?? "";
  const showBtc = url.searchParams.get("showBtc") === "1";
  const tagFilter = url.searchParams.get("tag") ?? "";
  const catFilter = url.searchParams.get("cat") ?? "";
  const [y, m] = mes.split("-").map(Number);
  const start = `${mes}-01`;
  const end = new Date(y, m, 0).toISOString().slice(0, 10);

  let query = sb
    .from("transactions")
    .select("date,description,amount,category_pluggy,category_override,accounts(bank,holder,name),transaction_tags(tags(name))")
    .gte("date", start)
    .lte("date", end)
    .order("date", { ascending: false })
    .limit(5000);
  if (titular === "voce" || titular === "esposa") query = query.eq("accounts.holder", titular);
  if (q) query = query.ilike("description", `%${q}%`);

  const { data, error } = await query;
  if (error) return new Response(error.message, { status: 500 });

  const lines = ["data;descricao;conta;titular;categoria;valor"];
  for (const t of (data ?? []) as unknown as {
    date: string; description: string | null; amount: number | null;
    category_pluggy: string | null; category_override: string | null;
    accounts: { bank: string | null; holder: string | null; name: string | null } | null;
    transaction_tags: { tags: { name: string } | null }[];
  }[]) {
    if (!showBtc && t.transaction_tags.some((x) => x.tags?.name === "btc")) continue;
    if (tagFilter === "__none" && t.transaction_tags.length > 0) continue;
    if (tagFilter && tagFilter !== "__none" && !t.transaction_tags.some((x) => x.tags?.name === tagFilter)) continue;
    if (catFilter && displayCategory(t) !== catFilter) continue;
    lines.push([
      csvCell(t.date),
      csvCell(t.description),
      csvCell(t.accounts?.name ?? t.accounts?.bank),
      csvCell(holderLabel[t.accounts?.holder === "esposa" ? "esposa" : "voce"]),
      csvCell(displayCategory(t)),
      csvCell(String(Number(t.amount ?? 0)).replace(".", ",")),
    ].join(";"));
  }
  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="movimentacoes-${mes}.csv"`,
    },
  });
}
