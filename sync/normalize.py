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


def _num(x: object) -> float | None:
    try:
        return float(x)  # type: ignore
    except (TypeError, ValueError):
        return None


def inv_indexer(inv: dict) -> str | None:
    """Indexador a partir de rateType/fixedAnnualRate (este conector não tem campo `indexer`)."""
    rt = (inv.get("rateType") or "").strip().upper()
    if rt in ("CDI", "SELIC", "IPCA", "IGPM", "IPCA+"):
        return rt
    if rt == "DI":
        return "CDI"
    if (_num(inv.get("fixedAnnualRate")) or 0) > 0:
        return "PREFIXADO"
    return None


def _br(x: float) -> str:
    s = f"{x:.4f}".rstrip("0").rstrip(".")
    return s.replace(".", ",")


def inv_rate(inv: dict) -> str | None:
    """Taxa legível: '120% CDI', '100% SELIC + 0,1% a.a.', '12,56% a.a. prefixado'."""
    idx = inv_indexer(inv)
    rate = _num(inv.get("rate"))
    fixed = _num(inv.get("fixedAnnualRate")) or 0
    if idx == "PREFIXADO":
        return f"{_br(fixed)}% a.a. prefixado" if fixed > 0 else None
    if idx and rate is not None:
        if 0 < rate < 1:
            return f"{idx} + {_br(rate)}% a.a."  # spread (ex.: Tesouro Selic)
        base = f"{_br(rate)}% {idx}"
        if fixed > 0:
            base += f" + {_br(fixed)}% a.a."
        return base
    for k in ("rate", "profitability"):
        v = inv.get(k)
        if v:
            return str(v)
    return None


def inv_maturity(inv: dict) -> str | None:
    for k in ("dueDate", "maturityDate"):
        v = inv.get(k)
        if v and len(str(v)) >= 10:
            return str(v)[:10]
    return None


def inv_issuer(inv: dict) -> str | None:
    iss = inv.get("issuer")
    if isinstance(iss, dict):
        iss = iss.get("name")
    if iss:
        return str(iss)
    # Título público não traz emissor — é o Tesouro Nacional
    if (inv.get("subtype") or "").upper() == "TREASURY" or "tesouro" in (inv.get("name") or "").lower():
        return "Tesouro Nacional"
    return None
