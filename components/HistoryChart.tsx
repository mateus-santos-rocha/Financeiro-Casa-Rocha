"use client";

import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtBRL } from "@/lib/format";
import { EXPENSE_META, INCOME_META } from "@/lib/classify";

export type MonthRow = {
  mes: string;
  salario: number; transfIn: number; resgate: number; outrasRec: number;
  despesa: number; aporte: number; transfOut: number;
  rec: number; des: number; saldo: number;
};

export function HistoryChart({ rows, hideInvest = false }: { rows: MonthRow[]; hideInvest?: boolean }) {
  return (
    <div className="card">
      <h2 className="font-semibold">Receitas x Despesas x Saldo</h2>
      <div className="h-72">
        <ResponsiveContainer>
          <ComposedChart data={rows} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
            <YAxis tickFormatter={(v: number) => `${Math.round(v / 1000)}k`} />
            <Tooltip formatter={(v: number) => fmtBRL(v)} />
            <Legend />
            <Bar dataKey="salario" name={INCOME_META.salario.label} stackId="rec" fill={INCOME_META.salario.color} />
            {!hideInvest && <Bar dataKey="resgate" name={INCOME_META.resgate.label} stackId="rec" fill={INCOME_META.resgate.color} />}
            <Bar dataKey="outrasRec" name="Outras receitas" stackId="rec" fill={INCOME_META.outras.color} />
            <Bar dataKey="despesa" name={EXPENSE_META.despesa.label} stackId="des" fill={EXPENSE_META.despesa.color} />
            {!hideInvest && <Bar dataKey="aporte" name={EXPENSE_META.aporte.label} stackId="des" fill={EXPENSE_META.aporte.color} />}
            <Line type="monotone" dataKey="saldo" name="Saldo" stroke="#0f172a" strokeWidth={2} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
