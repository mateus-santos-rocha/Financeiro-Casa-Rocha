import { supabaseServer } from "@/lib/supabase-server";
import { fetchAll } from "@/lib/fetch-all";
import { expenseKind, incomeKind } from "@/lib/classify";
import { HistoryExplorer } from "@/components/HistoryExplorer";
import type { MonthRow } from "@/components/HistoryChart";
import type { GroupMonthRow } from "@/components/GroupLines";

export default async function HistoricoPage() {
  const sb = supabaseServer();

  type HTx = {
    date: string; amount: number | null;
    description: string | null; category_pluggy: string | null;
    transaction_tags: { tags: { name: string } | null }[];
  };
  const hasTag = (t: HTx, name: string) => t.transaction_tags.some((x) => x.tags?.name === name);
  // fetchAll: o PostgREST corta em 1000 linhas; sem paginar, os meses novos somem.
  const data = await fetchAll<HTx>(() =>
    sb
      .from("transactions")
      .select("date,amount,description,category_pluggy,transaction_tags(tags(name))")
      .order("date", { ascending: true }),
  );
  type Kinds = {
    salario: number; transfIn: number; resgate: number; outrasRec: number;
    despesa: number; aporte: number; transfOut: number;
  };
  const zeroKinds = (): Kinds =>
    ({ salario: 0, transfIn: 0, resgate: 0, outrasRec: 0, despesa: 0, aporte: 0, transfOut: 0 });
  const own = new Map<string, Kinds>();
  const adv = new Map<string, Kinds>();
  // Gasto por grupo (só saídas; mesmos filtros e deslocamento de adiantamento).
  type GKey = "custo-fixo" | "conforto" | "prazeres" | "liberdade-financeira" | "sem-grupo";
  const zeroG = (): Record<GKey, number> =>
    ({ "custo-fixo": 0, conforto: 0, prazeres: 0, "liberdade-financeira": 0, "sem-grupo": 0 });
  const gOwn = new Map<string, Record<GKey, number>>();
  const gAdv = new Map<string, Record<GKey, number>>();
  const gaOwn = new Map<string, Record<GKey, number>>(); // só aportes (p/ semInvest)
  const gaAdv = new Map<string, Record<GKey, number>>();
  const groupOf = (t: HTx): GKey =>
    (["conforto", "custo-fixo", "prazeres", "liberdade-financeira"].find((g) => hasTag(t, g)) ?? "sem-grupo") as GKey;
  // Desempate: conforto antes de custo-fixo (saúde particular como Feminae
  // carrega as duas tags; a escolha particular prevalece).
  for (const t of data) {
    if (hasTag(t, "btc")) continue; // BTC vive nos investimentos
    if (hasTag(t, "transferencia-interna")) continue; // sempre fora (sem opt-in)
    const v = Number(t.amount ?? 0);
    const inKind = v >= 0 ? incomeKind(t, false, hasTag(t, "salario")) : null;
    const outKind = v < 0 ? expenseKind(t, false) : null;
    const k = t.date.slice(0, 7);
    const target = hasTag(t, "adiantamento") ? adv : own;
    const cur = target.get(k) ?? zeroKinds();
    if (v >= 0) {
      if (inKind === "salario") cur.salario += v;
      else if (inKind === "transferencia") cur.transfIn += v;
      else if (inKind === "resgate") cur.resgate += v;
      else cur.outrasRec += v;
    } else {
      if (outKind === "aporte") cur.aporte += Math.abs(v);
      else if (outKind === "transferencia") cur.transfOut += Math.abs(v);
      else cur.despesa += Math.abs(v);
      if (outKind !== "transferencia") {
        const gtarget = hasTag(t, "adiantamento") ? gAdv : gOwn;
        const gcur = gtarget.get(k) ?? zeroG();
        gcur[groupOf(t)] += Math.abs(v);
        gtarget.set(k, gcur);
        if (outKind === "aporte") {
          const atarget = hasTag(t, "adiantamento") ? gaAdv : gaOwn;
          const acur = atarget.get(k) ?? zeroG();
          acur[groupOf(t)] += Math.abs(v);
          atarget.set(k, acur);
        }
      }
    }
    target.set(k, cur);
  }
  const hoje = new Date().toISOString().slice(0, 7);
  // Parcelas futuras do cartão vêm com data à frente — fora do Histórico (tem página própria na Fase 5).
  // Adiantamento salarial: conta no mês seguinte (próprio do mês sai, anterior entra).
  const prevOf = (k: string) => {
    const [yy, mm] = k.split("-").map(Number);
    const d = new Date(yy, mm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };
  const keys = [...new Set([...own.keys(), ...adv.keys()])].sort().filter((k) => k <= hoje);
  const sumKinds = (a: Kinds, b: Kinds): Kinds => ({
    salario: a.salario + b.salario, transfIn: a.transfIn + b.transfIn,
    resgate: a.resgate + b.resgate, outrasRec: a.outrasRec + b.outrasRec,
    despesa: a.despesa + b.despesa, aporte: a.aporte + b.aporte,
    transfOut: a.transfOut + b.transfOut,
  });
  // Tudo sem fatiar: filtros (período/investimentos) rodam no cliente, sem reload.
  const rows: MonthRow[] = keys.map((k) => {
    // Adiantamento: o próprio do mês sai, o do mês anterior entra (mesma regra de antes).
    const m = sumKinds(own.get(k) ?? zeroKinds(), adv.get(prevOf(k)) ?? zeroKinds());
    const rec = m.salario + m.transfIn + m.resgate + m.outrasRec;
    const des = m.despesa + m.aporte + m.transfOut;
    return { mes: k, ...m, rec, des, saldo: rec - des };
  });
  // Gasto por grupo por mês (todos os grupos, mesmo com filtro de seleção).
  const sumG = (a: Record<GKey, number>, b: Record<GKey, number>): Record<GKey, number> => ({
    "custo-fixo": a["custo-fixo"] + b["custo-fixo"],
    conforto: a.conforto + b.conforto,
    prazeres: a.prazeres + b.prazeres,
    "liberdade-financeira": a["liberdade-financeira"] + b["liberdade-financeira"],
    "sem-grupo": a["sem-grupo"] + b["sem-grupo"],
  });
  const grows: GroupMonthRow[] = keys.map((k) => {
    const m = sumG(gOwn.get(k) ?? zeroG(), gAdv.get(prevOf(k)) ?? zeroG());
    return { mes: k, ...m };
  });
  const growsAp: GroupMonthRow[] = keys.map((k) => {
    const m = sumG(gaOwn.get(k) ?? zeroG(), gaAdv.get(prevOf(k)) ?? zeroG());
    return { mes: k, ...m };
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Histórico</h1>
      </div>
      <HistoryExplorer rows={rows} grows={grows} growsAp={growsAp} />
    </div>
  );
}
