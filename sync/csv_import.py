"""csv_import.py — provider fallback (sempre funciona, 100% grátis).

Uso: o casal exporta OFX/CSV do Nubank/BB/BTG e importa pela página
Movimentações (Fase 3) ou via CLI aqui. Colunas esperadas:
  date,description,amount[,category,account]
Datas: YYYY-MM-DD ou DD/MM/YYYY. Valores: + entrada, - saída.
"""
from __future__ import annotations

import csv
from datetime import datetime


def parse_date(s: str) -> str:
    s = s.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"data inválida: {s}")


def parse_amount(s: str) -> float:
    s = s.strip().replace("R$", "").replace(".", "").replace(",", ".") if "," in s else s.strip()
    return float(s)


def read_csv(path: str) -> list[dict]:
    rows = []
    with open(path, newline="", encoding="utf-8-sig") as f:
        for r in csv.DictReader(f):
            rows.append({
                "date": parse_date(r.get("date", "")),
                "description": (r.get("description") or "").strip(),
                "amount": parse_amount(r.get("amount", "0")),
                "category": (r.get("category") or "").strip() or None,
                "account": (r.get("account") or "").strip() or None,
            })
    return rows
