"""auto_rules.py — regras automáticas do sync (tag + roll para investimento).

- action 'tag': aplica tag a lançamentos cujo description contém `match`
  (opcionalmente só de `bank`). Ex.: "resgate de cashback" (nubank) -> btc.
- action 'invest': soma |amount| do lançamento na posição manual `invest_name`
  (criada se não existir). Idempotente via invest_rolls. Ex.: "compra de
  criptomoedas" -> BTC.

Uso no sync diário: apply_auto_rules(sb, days=30).
Backfill histórico: python sync/auto_rules.py --all
"""
from __future__ import annotations

import datetime as dt


def _norm(s: str) -> str:
    """Minúsculas sem acento (Laís == Lais). Usado em todo match de regra."""
    import unicodedata
    return "".join(
        c for c in unicodedata.normalize("NFD", (s or "").lower())
        if unicodedata.category(c) != "Mn")


def rule_matches(rule: dict, description: str | None, bank: str | None, category: str | None = None) -> bool:
    import re
    needle = _norm((rule.get("match") or "").strip())
    if not needle:
        return False
    hay = _norm(f"{description or ''} {category or ''}")
    if not re.search(r"\b" + re.escape(needle) + r"\b", hay):
        return False
    rb = (rule.get("bank") or "").strip().lower()
    if rb and rb != (bank or "").strip().lower():
        return False
    return True


def ensure_tag(sb: object, name: str) -> str:
    clean = name.strip().lower()
    r = sb.table("tags").select("id").eq("name", clean).execute()  # type: ignore
    if r.data:
        return r.data[0]["id"]
    r = sb.table("tags").insert({"name": clean}).select("id").execute()  # type: ignore
    return r.data[0]["id"]


def compute_roll(qty: float, invested: float, buy_brl: float, price: float) -> tuple[float, float, float]:
    """Compra de buy_brl a `price`: soma qty, aplicado; atual = qty_total * price."""
    qty_new = (qty or 0) + (buy_brl / price if price > 0 else 0)
    invested_new = (invested or 0) + buy_brl
    return qty_new, invested_new, qty_new * price if price > 0 else 0


def btc_brl_price() -> float | None:
    """Preço BTC/BRL em APIs públicas gratuitas (sem chave)."""
    import json
    import urllib.request
    for url, parse in (
        ("https://api.binance.com/api/v3/ticker/price?symbol=BTCBRL",
         lambda j: float(j.get("price") or 0)),
        ("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=brl",
         lambda j: float((j.get("bitcoin") or {}).get("brl") or 0)),
    ):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "casa-rocha-sync"})
            with urllib.request.urlopen(req, timeout=20) as res:
                p = parse(json.loads(res.read().decode()))
                if p > 0:
                    return p
        except Exception:
            continue
    return None


def ensure_manual_investment(sb: object, name: str, inv_type: str = "other") -> str:
    key = f"manual:rule:{name.strip().lower()}"
    r = sb.table("investments").select("id").eq("pluggy_id", key).execute()  # type: ignore
    if r.data:
        return r.data[0]["id"]
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    r = sb.table("investments").insert({  # type: ignore
        "pluggy_id": key, "name": name.strip(), "type": inv_type or "other",
        "amount_invested": 0, "current_value": 0, "last_seen_at": now,
    }).select("id").execute()
    return r.data[0]["id"]


def apply_rules_to_tx(sb: object, txid: string, desc: str | None, amount: float,
                      bank: str | None, rules: list[dict], stats: dict,
                      price_cache: dict | None = None, category: str | None = None) -> None:
    for rule in rules:
        if not rule_matches(rule, desc, bank, category):
            continue
        if rule.get("action") == "tag" and rule.get("tag_name"):
            tid = ensure_tag(sb, rule["tag_name"])
            sb.table("transaction_tags").upsert(  # type: ignore
                {"transaction_id": txid, "tag_id": tid},
                on_conflict="transaction_id,tag_id").execute()
            stats["rules_tagged"] = stats.get("rules_tagged", 0) + 1
        elif rule.get("action") == "invest" and rule.get("invest_name"):
            done = sb.table("invest_rolls").select("transaction_id").eq(  # type: ignore
                "rule_id", rule["id"]).eq("transaction_id", txid).execute().data
            if done:
                continue
            amt = abs(float(amount or 0))
            if amt <= 0:
                continue
            inv_id = ensure_manual_investment(sb, rule["invest_name"], rule.get("invest_type") or "other")
            cur = sb.table("investments").select(  # type: ignore
                "amount_invested,current_value,quantity").eq("id", inv_id).execute().data[0]
            price = None
            if (rule.get("invest_type") or "") == "crypto":
                if price_cache is None:
                    price_cache = {}
                price = price_cache.get("btc")
                if price is None:
                    price = btc_brl_price()
                    price_cache["btc"] = price or 0
            if price:
                qty_new, inv_new, cur_new = compute_roll(
                    float(cur.get("quantity") or 0), float(cur.get("amount_invested") or 0), amt, price)
            else:
                qty_new, inv_new, cur_new = float(cur.get("quantity") or 0), float(cur.get("amount_invested") or 0) + amt, float(cur.get("current_value") or 0) + amt
            sb.table("investments").update({  # type: ignore
                "quantity": qty_new,
                "amount_invested": inv_new,
                "current_value": cur_new,
                "last_seen_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            }).eq("id", inv_id).execute()
            sb.table("invest_rolls").insert({  # type: ignore
                "rule_id": rule["id"], "transaction_id": txid, "amount": amt}).execute()
            stats["rules_rolled"] = stats.get("rules_rolled", 0) + 1
            stats["rules_rolled_total"] = round(stats.get("rules_rolled_total", 0) + amt, 2)


def find_reversal_pairs(rows: list[dict], debit_match: str = "brasilprev",
                        credit_match: str = "estorno", window_days: int = 7) -> list[tuple[str, str]]:
    """Pareia débitos com seus estornos: [(debit_id, credit_id)].

    rows: dicts com id, account_id, date (AAAA-MM-DD), description, amount.
    Débito = contém debit_match mas não credit_match, valor < 0.
    Estorno = contém debit_match, valor > 0, e (a) contém credit_match
    (vale data anterior ou posterior, ex.: lançamento no mesmo dia) ou
    (b) é posterior ao débito (ex.: "BRASILPREV ... +104,39" dois dias depois
    do débito, sem a palavra "estorno"). Pareia por (conta, |valor|) em até
    `window_days` (guloso pelo mais próximo).
    """
    import datetime as _dt
    debits: dict[tuple, list[dict]] = {}
    credits: dict[tuple, list[dict]] = {}
    for r in rows:
        try:
            amt = float(r.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        if amt == 0:
            continue
        d = (r.get("description") or "").lower()
        key = (r.get("account_id"), round(abs(amt), 2))
        if amt < 0 and debit_match in d and credit_match not in d:
            debits.setdefault(key, []).append(r)
        elif amt > 0 and debit_match in d:
            credits.setdefault(key, []).append({**r, "_explicit": credit_match in d})
    pairs: list[tuple[str, str]] = []
    for key, ds in debits.items():
        cs = sorted(credits.get(key, []), key=lambda r: r.get("date") or "")
        used = set()
        for db in sorted(ds, key=lambda r: r.get("date") or ""):
            try:
                dd = _dt.date.fromisoformat((db.get("date") or "")[:10])
            except ValueError:
                continue
            best, best_dist = None, None
            for i, cr in enumerate(cs):
                if i in used:
                    continue
                try:
                    cd = _dt.date.fromisoformat((cr.get("date") or "")[:10])
                except ValueError:
                    continue
                dist = (cd - dd).days
                ok = abs(dist) <= window_days and (cr["_explicit"] or 0 < dist <= window_days)
                if ok and (best_dist is None or abs(dist) < best_dist):
                    best, best_dist = i, abs(dist)
            if best is not None:
                used.add(best)
                pairs.append((db["id"], cs[best]["id"]))
    return pairs


def find_pix_pairs(rows: list[dict], internal_ids: frozenset | set = frozenset(),
                    window_days: int = 3) -> list[tuple[str, str]]:
    """Pareia pix entre contas próprias: [(out_id, in_id)].

    rows: dicts com id, account_id, holder, date (AAAA-MM-DD), description, amount.
    Lado saída: "transferência enviada pelo pix" genérico (sem nome) OU já
    marcado como interno E com o primeiro nome do titular na descrição
    (ex.: "Transferência enviada|Mateus Santos Rocha").
    Lado entrada: contém "pix" + ("receb" ou "credito"), ex.: "PIX - RECEBIDO
    ... MATEUS SANT", "TRANSFERÊNCIA A CRÉDITO VIA PIX".
    Exige mesmo titular, contas diferentes, mesmo |valor|, até `window_days`
    (guloso pelo mais próximo) + UMA âncora de identidade: nome do titular
    na entrada, ou saída já marcada como interna. Sem âncora, não pareia
    (evita marcar pix de/para terceiros, ex. posto x reembolso no mesmo dia).
    """
    import datetime as _dt
    firsts = {"voce": "mateus", "esposa": "lais"}
    outs: dict[tuple, list[dict]] = {}
    ins: dict[tuple, list[dict]] = {}
    for r in rows:
        try:
            amt = float(r.get("amount") or 0)
        except (TypeError, ValueError):
            continue
        if amt == 0:
            continue
        d = _norm(r.get("description") or "")
        holder = r.get("holder") or ""
        first = firsts.get(holder, "")
        key = (holder, round(abs(amt), 2))
        out_ok = d == "transferencia enviada pelo pix" or (
            r["id"] in internal_ids and first and first in d)
        if amt < 0 and out_ok:
            outs.setdefault(key, []).append(r)
        elif amt > 0 and "pix" in d and ("receb" in d or "credito" in d):
            ins.setdefault(key, []).append({**r, "_named": bool(first and first in d)})
    pairs: list[tuple[str, str]] = []
    for key, ds in outs.items():
        cs = sorted(ins.get(key, []), key=lambda r: r.get("date") or "")
        used = set()
        for db in sorted(ds, key=lambda r: r.get("date") or ""):
            try:
                dd = _dt.date.fromisoformat((db.get("date") or "")[:10])
            except ValueError:
                continue
            best, best_dist = None, None
            for i, cr in enumerate(cs):
                if i in used or cr.get("account_id") == db.get("account_id"):
                    continue
                try:
                    cd = _dt.date.fromisoformat((cr.get("date") or "")[:10])
                except ValueError:
                    continue
                dist = abs((cd - dd).days)
                anchored = cr["_named"] or db["id"] in internal_ids
                if dist <= window_days and anchored and (best_dist is None or dist < best_dist):
                    best, best_dist = i, dist
            if best is not None:
                used.add(best)
                pairs.append((db["id"], cs[best]["id"]))
    return pairs


def tag_reversal_pairs(sb: object, days: int | None = 30, stats: dict | None = None) -> int:
    """Marca pares débito+estorno como transferencia-interna (idempotente).

    Tentativas de débito que falham (ex.: BRASILPREV -100 + ESTORNO +100 no dia
    seguinte) poluem resgate/aporte com efeito líquido zero. Roda em todo sync
    via apply_auto_rules e no backfill --all.
    """
    import datetime as dt
    base_q = sb.table("transactions").select("id,account_id,date,description,amount")  # type: ignore
    if days is not None:
        since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
        base_q = base_q.gte("date", since)
    rows: list[dict] = []
    start = 0
    while True:
        page = base_q.range(start, start + 999).execute().data or []
        rows.extend(page)
        if len(page) < 1000:
            break
        start += 1000
    pairs = find_reversal_pairs(rows)
    if not pairs:
        return 0
    tid = ensure_tag(sb, "transferencia-interna")
    txids = sorted({t for p in pairs for t in p})
    existing: set[str] = set()
    for i in range(0, len(txids), 500):
        got = sb.table("transaction_tags").select("transaction_id").eq(  # type: ignore
            "tag_id", tid).in_("transaction_id", txids[i:i + 500]).execute().data or []
        existing.update(g["transaction_id"] for g in got)
    batch = [{"transaction_id": t, "tag_id": tid}
             for p in pairs for t in p if t not in existing]
    if batch:
        sb.table("transaction_tags").upsert(  # type: ignore
            batch, on_conflict="transaction_id,tag_id").execute()
    if stats is not None:
        stats["reversal_tagged"] = stats.get("reversal_tagged", 0) + len(batch)
    return len(batch)


def find_salary_advances(rows: list[dict], base_amount: float = 4200.0,
                          window_days: int = 35) -> list[str]:
    """Acha os créditos-salário dele que contam no mês seguinte (tag `adiantamento`).

    rows: dicts com id, date (AAAA-MM-DD), description, amount, holder.
    Regra global (confirmada pelo dono out/26): o salário dele cai sempre no
    mês anterior ao da competência — adiantamento no meio do mês + restante
    no último dia útil. Logo TODO `PAGAMENTO DE SALARIO` com holder=voce
    leva a tag (Análise/Histórico deslocam +1 mês). Exceção: o restante+PLR
    de 10/10/26 (R$ 12.313,54), escriturado com data de outubro mas recebido
    em 30/09 — conta em outubro (sem tag). base_amount/window_days mantidos
    por compatibilidade (ignorados). Idempotente por construção.
    """
    out: list[str] = []
    for r in rows:
        if "pagamento de salario" not in (r.get("description") or "").lower():
            continue
        if (r.get("holder") or "") != "voce":
            continue
        try:
            amt = float(r.get("amount") or 0)
            d = (r.get("date") or "")[:10]
        except (TypeError, ValueError):
            continue
        if amt <= 0:
            continue
        if d == "2026-10-10" and abs(amt - 12313.54) < 0.01:
            continue  # restante+PLR: competência outubro, sem deslocar
        out.append(r["id"])
    return out


def tag_salary_advances(sb: object, days: int | None = 30, stats: dict | None = None) -> int:
    """Marca o salário dele com a tag `adiantamento` (idempotente, via upsert).

    Conta na competência do mês seguinte — mesma mecânica que Análise e
    Histórico já deslocam. Precisa do holder: busca account_id junto.
    Roda em todo sync e no backfill --all.
    """
    import datetime as dt
    holds = {a["id"]: (a.get("holder") or "") for a in
             (sb.table("accounts").select("id,holder").execute().data or [])}  # type: ignore
    base_q = sb.table("transactions").select("id,account_id,date,description,amount")  # type: ignore
    if days is not None:
        since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
        base_q = base_q.gte("date", since)
    rows: list[dict] = []
    start = 0
    while True:
        page = base_q.range(start, start + 999).execute().data or []
        rows.extend(page)
        if len(page) < 1000:
            break
        start += 1000
    for r in rows:
        r["holder"] = holds.get(r.get("account_id") or "")
    cands = find_salary_advances(rows)
    if not cands:
        return 0
    tid = ensure_tag(sb, "adiantamento")
    existing: set[str] = set()
    for i in range(0, len(cands), 500):
        got = sb.table("transaction_tags").select("transaction_id").eq(  # type: ignore
            "tag_id", tid).in_("transaction_id", cands[i:i + 500]).execute().data or []
        existing.update(g["transaction_id"] for g in got)
    batch = [{"transaction_id": t, "tag_id": tid} for t in cands if t not in existing]
    if batch:
        sb.table("transaction_tags").upsert(  # type: ignore
            batch, on_conflict="transaction_id,tag_id").execute()
    if stats is not None:
        stats["advance_tagged"] = stats.get("advance_tagged", 0) + len(batch)
    return len(batch)


def tag_pix_pairs(sb: object, days: int | None = 30, stats: dict | None = None) -> int:
    """Marca pares de pix próprio como transferencia-interna (idempotente).

    Roda em todo sync via apply_auto_rules e no backfill --all.
    """
    import datetime as dt
    holds = {a["id"]: (a.get("holder") or "") for a in
             (sb.table("accounts").select("id,holder").execute().data or [])}  # type: ignore
    base_q = sb.table("transactions").select("id,account_id,date,description,amount")  # type: ignore
    if days is not None:
        since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
        base_q = base_q.gte("date", since)
    rows: list[dict] = []
    start = 0
    while True:
        page = base_q.range(start, start + 999).execute().data or []
        rows.extend(page)
        if len(page) < 1000:
            break
        start += 1000
    for r in rows:
        r["holder"] = holds.get(r.get("account_id") or "")
    tid = ensure_tag(sb, "transferencia-interna")
    win_ids = [r["id"] for r in rows]
    internal: set[str] = set()
    for i in range(0, len(win_ids), 500):
        got = sb.table("transaction_tags").select("transaction_id").eq(  # type: ignore
            "tag_id", tid).in_("transaction_id", win_ids[i:i + 500]).execute().data or []
        internal.update(g["transaction_id"] for g in got)
    pairs = find_pix_pairs(rows, internal_ids=internal)
    if not pairs:
        return 0
    txids = sorted({t for p in pairs for t in p})
    existing: set[str] = set()
    for i in range(0, len(txids), 500):
        got = sb.table("transaction_tags").select("transaction_id").eq(  # type: ignore
            "tag_id", tid).in_("transaction_id", txids[i:i + 500]).execute().data or []
        existing.update(g["transaction_id"] for g in got)
    batch = [{"transaction_id": t, "tag_id": tid}
             for p in pairs for t in p if t not in existing]
    if batch:
        sb.table("transaction_tags").upsert(  # type: ignore
            batch, on_conflict="transaction_id,tag_id").execute()
    if stats is not None:
        stats["pix_tagged"] = stats.get("pix_tagged", 0) + len(batch)
    return len(batch)


def apply_auto_rules(sb: object, days: int | None = 30) -> dict:
    """Aplica regras à janela (days) ou a tudo (days=None). Retorna stats."""
    stats: dict = {}
    rules = sorted(
        sb.table("auto_rules").select("*").execute().data or [],  # type: ignore
        key=lambda r: (r.get("priority") or 0))
    if not rules:
        return stats
    # cache de tags (1 query) + vínculos já existentes (1 query)
    tag_ids: dict[str, str] = {t["name"]: t["id"] for t in
        (sb.table("tags").select("id,name").execute().data or [])}  # type: ignore
    base_q = sb.table("transactions").select("id,description,amount,category_pluggy,accounts(bank)")  # type: ignore
    if days is not None:
        since = (dt.date.today() - dt.timedelta(days=days)).isoformat()
        base_q = base_q.gte("date", since)
    rows: list[dict] = []
    start = 0
    while True:  # PostgREST pagina em ~1000 linhas
        page = base_q.range(start, start + 999).execute().data or []
        rows.extend(page)
        if len(page) < 1000:
            break
        start += 1000
    txids = [t["id"] for t in rows]
    existing_links: set[tuple[str, str]] = set()
    for i in range(0, len(txids), 500):
        chunk = txids[i:i + 500]
        got = sb.table("transaction_tags").select("transaction_id,tag_id").in_(  # type: ignore
            "transaction_id", chunk).execute().data or []
        existing_links.update((g["transaction_id"], g["tag_id"]) for g in got)
    existing_rolls: set[tuple[str, str]] = set()
    for i in range(0, len(txids), 500):
        chunk = txids[i:i + 500]
        got = sb.table("invest_rolls").select("rule_id,transaction_id").in_(  # type: ignore
            "transaction_id", chunk).execute().data or []
        existing_rolls.update((g["rule_id"], g["transaction_id"]) for g in got)

    def tag_id(name: str) -> str:
        clean = name.strip().lower()
        if clean not in tag_ids:
            r = sb.table("tags").insert({"name": clean}).select("id").execute()  # type: ignore
            tag_ids[clean] = r.data[0]["id"]
        return tag_ids[clean]

    tag_batch: list[dict] = []
    roll_batch: list[dict] = []

    def flush_tags() -> None:
        if not tag_batch:
            return
        sb.table("transaction_tags").upsert(  # type: ignore
            tag_batch, on_conflict="transaction_id,tag_id").execute()
        stats["rules_tagged"] = stats.get("rules_tagged", 0) + len(tag_batch)
        tag_batch.clear()

    price_cache: dict = {}
    for n, t in enumerate(rows, 1):
        acc = t.get("accounts")
        bank = acc.get("bank") if isinstance(acc, dict) else None
        desc, cat = t.get("description"), t.get("category_pluggy")
        for rule in rules:
            if not rule_matches(rule, desc, bank, cat):
                continue
            if rule.get("action") == "tag" and rule.get("tag_name"):
                tid = tag_id(rule["tag_name"])
                if (t["id"], tid) not in existing_links:
                    tag_batch.append({"transaction_id": t["id"], "tag_id": tid})
                    existing_links.add((t["id"], tid))
                    if len(tag_batch) >= 300:
                        flush_tags()
            elif rule.get("action") == "invest" and rule.get("invest_name"):
                if (rule["id"], t["id"]) in existing_rolls:
                    continue
                amt = abs(float(t.get("amount") or 0))
                if amt <= 0:
                    continue
                roll_batch.append({"rule_id": rule["id"], "txid": t["id"],
                                   "name": rule["invest_name"],
                                   "type": rule.get("invest_type") or "other", "amt": amt})
                existing_rolls.add((rule["id"], t["id"]))
        if n % 500 == 0:
            flush_tags()
            print(f"  ...{n}/{len(rows)}", flush=True)
    flush_tags()
    # rolls em lote por investimento
    by_inv: dict[str, dict] = {}
    for rb in roll_batch:
        key = rb["name"].strip().lower()
        by_inv.setdefault(key, {"name": rb["name"], "type": rb["type"], "amt": 0.0, "txs": []})
        by_inv[key]["amt"] += rb["amt"]
        by_inv[key]["txs"].append(rb)
    for info in by_inv.values():
        inv_id = ensure_manual_investment(sb, info["name"], info["type"])
        cur = sb.table("investments").select(  # type: ignore
            "amount_invested,current_value,quantity").eq("id", inv_id).execute().data[0]
        price = btc_brl_price() if info["type"] == "crypto" else None
        if price:
            qty_new, inv_new, cur_new = compute_roll(
                float(cur.get("quantity") or 0), float(cur.get("amount_invested") or 0), info["amt"], price)
        else:
            qty_new, inv_new = float(cur.get("quantity") or 0), float(cur.get("amount_invested") or 0) + info["amt"]
            cur_new = float(cur.get("current_value") or 0) + info["amt"]
        sb.table("investments").update({  # type: ignore
            "quantity": qty_new, "amount_invested": inv_new, "current_value": cur_new,
            "last_seen_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }).eq("id", inv_id).execute()
        sb.table("invest_rolls").insert([{  # type: ignore
            "rule_id": rb["rule_id"], "transaction_id": rb["txid"], "amount": rb["amt"]
        } for rb in info["txs"]]).execute()
        stats["rules_rolled"] = stats.get("rules_rolled", 0) + len(info["txs"])
        stats["rules_rolled_total"] = round(stats.get("rules_rolled_total", 0) + info["amt"], 2)
    reprice_crypto(sb, stats)
    tag_reversal_pairs(sb, days=days, stats=stats)
    tag_salary_advances(sb, days=days, stats=stats)
    tag_pix_pairs(sb, days=days, stats=stats)
    return stats


def reprice_crypto(sb: object, stats: dict) -> None:
    """Atualiza o valor de mercado das posições manuais cripto (qty × spot)."""
    price = btc_brl_price()
    if not price:
        return
    rows = sb.table("investments").select("id,quantity").eq(  # type: ignore
        "type", "crypto").like("pluggy_id", "manual:%").execute().data or []
    for r in rows:
        qty = float(r.get("quantity") or 0)
        if qty <= 0:
            continue
        sb.table("investments").update({  # type: ignore
            "current_value": round(qty * price, 2),
            "last_seen_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }).eq("id", r["id"]).execute()
        stats["reprice_btc"] = round(qty * price, 2)


if __name__ == "__main__":
    import sys
    sys.path.insert(0, __import__("os").path.dirname(__import__("os").path.abspath(__file__)))
    import pluggy
    pluggy.load_dotenv()
    sb = pluggy.supabase()
    if sb is None:
        raise SystemExit("sync/.env sem SUPABASE_URL/SERVICE_ROLE")
    all_flag = "--all" in sys.argv
    print(apply_auto_rules(sb, days=None if all_flag else 30))
