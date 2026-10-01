"use client";

import { useMemo } from "react";
import { Donut } from "@/components/Donut";
import { PALETTE } from "@/lib/format";

export type CatRow = { categoria: string; total: number };

export function Charts({ porCategoria, receitas, despesas }: { porCategoria: CatRow[]; receitas: number; despesas: number }) {
  const pizza = useMemo(
    () => [
      { name: "Receitas", value: Math.abs(receitas) },
      { name: "Despesas", value: Math.abs(despesas) },
    ],
    [receitas, despesas]
  );

  const top = porCategoria.slice(0, 7);
  const resto = porCategoria.slice(7).reduce((a, c) => a + c.total, 0);
  const catPie = resto > 0 ? [...top, { categoria: "Outras", total: resto }] : top;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="card overflow-hidden">
        <h2 className="font-semibold">Receitas x Despesas</h2>
        <Donut data={pizza} colors={["#10b981", "#ef4444"]} height={260} />
      </div>
      <div className="card overflow-hidden">
        <h2 className="font-semibold">Despesas por categoria</h2>
        <Donut data={catPie.map((c) => ({ name: c.categoria, value: c.total }))} colors={PALETTE} height={300} />
      </div>
    </div>
  );
}
