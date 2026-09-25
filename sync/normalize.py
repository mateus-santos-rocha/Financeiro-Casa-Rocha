"""normalize.py — normalização comum aos providers (pluggy | csv)."""
from __future__ import annotations


def normalize_amount(raw_amount: float | int | None, raw_type: str | None = None) -> float:
    """Garante convenção: + entrada, - saída.

    O Pluggy varia sinal por conector (alguns trazem despesa positiva com type=DEBIT).
    Regra: se type indicar débito/saída e valor vier positivo, inverte.
    """
    v = float(raw_amount or 0)
    t = (raw_type or "").upper()
    if t in ("DEBIT", "OUTFLOW", "EXPENSE", "WITHDRAWAL", "SAIDA") and v > 0:
        return -v
    if t in ("CREDIT", "INFLOW", "INCOME", "DEPOSIT", "ENTRADA") and v < 0:
        return -v
    return v


def display_category(category_override: str | None, category_pluggy: str | None) -> str:
    return category_override or category_pluggy or "Sem categoria"


def dedup_key(provider: str, provider_id: str) -> str:
    return f"{provider}:{provider_id}"
