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


def rule_matches(rule: dict, description: str | None, bank: str | None, category: str | None = None) -> bool:
    import re
    needle = (rule.get("match") or "").strip().lower()
    if not needle:
        return False
    hay = f"{description or ''} {category or ''}".lower()
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


def apply_auto_rules(sb: object, days: int | None = 30) -> dict:
    """Aplica regras à janela (days) ou a tudo (days=None). Retorna stats."""
    stats: dict = {}
    rules = sorted(
        sb.table("auto_rules").select("*").execute().data or [],  # type: ignore
        key=lambda r: (r.get("priority") or 0))
    if not rules:
        return stats
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
