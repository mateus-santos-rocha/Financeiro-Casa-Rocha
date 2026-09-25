"""pluggy.py — SyncProvider Pluggy (Meu Pluggy como proxy).

Suporta N credenciais (1 por CPF): PLUGGY_CLIENT_ID_1/SECRET_1, _2, ...
Cada par vira 1 API key e tem seus items. `holder` é derivado do índice:
  _1 -> voce (etapa 1), _2 -> esposa (etapa 2).

Fluxo por credencial:
  POST /auth -> X-API-KEY
  GET /v2/items (ou /items) -> para cada item:
    GET /accounts?itemId=...
    GET /v2/transactions?itemId=... (cursor, janela incremental)
    GET /investments?itemId=...

Idempotente: upsert por pluggy_id; snapshots 1/dia/ativo; log em sync_runs.
Sem SUPABASE_URL/SERVICE_KEY: roda em dry-run (só conta, não grava).
"""
from __future__ import annotations

import datetime as dt
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from normalize import normalize_amount

API_BASE = os.environ.get("PLUGGY_API_BASE", "https://api.pluggy.ai")


def load_dotenv(path: str | None = None) -> None:
    """Carrega sync/.env (KEY=valor) sem dependências. Não sobrescreve o ambiente."""
    if path is None:
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k == "SUPABASE_URL":
                    v = v.rstrip("/")  # cliente adiciona /rest/v1 sozinho
                if k and k not in os.environ:
                    os.environ[k] = v
    except FileNotFoundError:
        pass


load_dotenv()
WINDOW_DAYS = int(os.environ.get("PLUGGY_WINDOW_DAYS", "30"))


def _http(method: str, path: str, api_key: str | None = None,
          body: dict | None = None, params: dict | None = None):
    url = API_BASE + path
    if params:
        url += "?" + urllib.parse.urlencode({k: v for k, v in params.items() if v is not None})
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    if api_key:
        req.add_header("X-API-KEY", api_key)
    for _ in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                return json.loads(res.read().decode() or "{}")
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(60)
                continue
            try:
                detail = e.read().decode()[:500]
            except Exception:
                detail = ""
            raise RuntimeError(f"{method} {path} -> HTTP {e.code}: {detail}") from e


def collect_credentials() -> list[tuple[str, str, str]]:
    """Retorna [(client_id, secret, holder)]. Só inclui pares preenchidos."""
    out = []
    holders = ["voce", "esposa"]
    for i in (1, 2, 3, 4):
        cid = os.environ.get(f"PLUGGY_CLIENT_ID_{i}")
        sec = os.environ.get(f"PLUGGY_CLIENT_SECRET_{i}")
        if cid and sec:
            holder = holders[i - 1] if i - 1 < len(holders) else f"extra{i}"
            out.append((cid, sec, holder))
    return out


def auth(client_id: str, secret: str) -> str:
    res = _http("POST", "/auth", body={"clientId": client_id, "clientSecret": secret})
    return res["apiKey"]


def list_items(api_key: str) -> list[dict]:
    errs: list[str] = []
    for path in ("/v2/items", "/items"):
        try:
            res = _http("GET", path, api_key)
            items = res.get("results") or res.get("items") or []
            if items:
                return items
            return []  # endpoint respondeu, só não há items vinculados a esta credencial
        except Exception as e:
            errs.append(str(e))
            continue
    print(f"AVISO: não consegui listar items: {errs[-1] if errs else 'desconhecido'}")
    if any("LIST_ITEMS_FEATURE_NOT_ENABLED" in e for e in errs):
        print("Este app não tem permissão de listar items. "
              "Informe os itemIds no sync/.env via PLUGGY_ITEM_IDS_1 (vírgula).")
    else:
        print("Confira se o clientId/secret são do MESMO app onde você vinculou os 3 bancos no demo app.")
    return []


def collect_item_ids(index: int) -> list[str]:
    """ItemIds explícitos (demo app sem permissão de listar). Ex.: PLUGGY_ITEM_IDS_1=id1,id2,id3"""
    raw = os.environ.get(f"PLUGGY_ITEM_IDS_{index}", "")
    return [x.strip() for x in raw.split(",") if x.strip()]


def collect_item_banks(index: int) -> list[str]:
    """Bancos na mesma ordem dos ids. Ex.: PLUGGY_ITEM_BANKS_1=nubank,bb,btg"""
    raw = os.environ.get(f"PLUGGY_ITEM_BANKS_{index}", "")
    return [x.strip().lower() for x in raw.split(",") if x.strip()]


def fetch_accounts(api_key: str, item_id: str) -> list[dict]:
    res = _http("GET", "/accounts", api_key, params={"itemId": item_id})
    return res.get("results") or []


def fetch_transactions(api_key: str, account_id: str,
                       from_date: str = "") -> list[dict]:
    """Transações por CONTA (a API v2 exige accountId). Pagina via cursor e filtra localmente."""
    out: list[dict] = []
    cursor: str | None = None
    for _ in range(50):  # teto: 50 páginas (folga p/ uso pessoal)
        res = _http("GET", "/v2/transactions", api_key,
                    params={"accountId": account_id, "cursor": cursor})
        page = res.get("results") or []
        out.extend(page)
        cursor = (res.get("page") or {}).get("nextCursor") or res.get("nextCursor")
        if not cursor or not page:
            break
    if from_date:
        out = [t for t in out if (t.get("date") or "")[:10] >= from_date]
    return out


def fetch_investments(api_key: str, item_id: str) -> list[dict]:
    res = _http("GET", "/investments", api_key, params={"itemId": item_id})
    return res.get("results") or []


def bank_from_connector(name: str) -> str:
    n = (name or "").lower()
    if "nubank" in n or "nu " in n:
        return "nubank"
    if "btg" in n:
        return "btg"
    if "brasil" in n or n.strip() == "bb":
        return "bb"
    return (name or "outro").lower().replace(" ", "_")[:32]


def supabase() -> object | None:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None
    from supabase import create_client  # import tardio p/ dry-run sem dependência
    return create_client(url, key)


def log_start(sb: object) -> str | None:
    """Cria a linha em sync_runs. Best-effort: nunca quebra o sync."""
    try:
        r = sb.table("sync_runs").insert(  # type: ignore
            {"provider": "pluggy", "status": "running", "stats": {}}).execute()
        return (r.data or [{}])[0].get("id")
    except Exception as e:
        print(f"AVISO: não consegui logar início em sync_runs: {e}")
        print("Verifique se a migration 0001_schema.sql foi aplicada (Table Editor).")
        return None


def log_end(sb: object, run_id: str | None, status: str, stats: dict,
            error: str | None = None) -> None:
    if run_id is None:
        return
    try:
        sb.table("sync_runs").update({  # type: ignore
            "status": status, "stats": stats, "error": (error or "")[:2000] or None,
            "finished_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        }).eq("id", run_id).execute()
    except Exception as e:
        print(f"AVISO: não consegui atualizar sync_runs: {e}")


def run() -> dict:
    today = dt.date.today()
    from_date = (today - dt.timedelta(days=WINDOW_DAYS)).isoformat()
    to_date = today.isoformat()
    sb = supabase()
    dry = sb is None

    stats: dict = {"dry_run": dry, "credentials": 0, "items": 0,
                   "accounts": 0, "transactions": 0, "investments": 0, "snapshots": 0}
    run_id: str | None = None
    if not dry:
        run_id = log_start(sb)

    try:
        for idx, (cid, sec, holder) in enumerate(collect_credentials(), start=1):
            key = auth(cid, sec)
            ids = collect_item_ids(idx)
            if ids:
                banks = collect_item_banks(idx)
                items = [{"id": iid, "connector": {"name": banks[i] if i < len(banks) else ""}}
                         for i, iid in enumerate(ids)]
            else:
                items = list_items(key)
            stats["credentials"] += 1
            stats["items"] += len(items)
            for item in items:
                item_id = item.get("id")
                conn_name = ((item.get("connector") or {}).get("name")
                             or item.get("connectorName") or "")
                bank = bank_from_connector(str(conn_name))
                pluggy_accounts = fetch_accounts(key, item_id)
                for acc in pluggy_accounts:
                    stats["accounts"] += 1
                    if not dry:
                        sb.table("accounts").upsert({  # type: ignore
                            "pluggy_item_id": item_id,
                            "pluggy_account_id": acc.get("id"),
                            "bank": bank, "holder": holder,
                            "type": (acc.get("type") or "").lower() or None,
                            "name": acc.get("name") or acc.get("number"),
                            "currency": acc.get("currencyCode") or "BRL",
                        }, on_conflict="pluggy_account_id").execute()
                acc_map: dict[str, str] = {}
                if not dry:
                    existing = sb.table("accounts").select("id,pluggy_account_id")  # type: ignore
                    if item_id:
                        existing = existing.eq("pluggy_item_id", item_id)
                    for row in (existing.execute().data or []):
                        acc_map[row["pluggy_account_id"]] = row["id"]
                for acc in pluggy_accounts:
                    for tx in fetch_transactions(key, acc.get("id") or "", from_date):
                        stats["transactions"] += 1
                        if not dry:
                            sb.table("transactions").upsert({  # type: ignore
                                "pluggy_id": tx.get("id"),
                                "account_id": acc_map.get(tx.get("accountId") or "")
                                or acc_map.get(acc.get("id") or ""),
                                "date": (tx.get("date") or "")[:10],
                                "posted_at": tx.get("date"),
                                "description": tx.get("description"),
                                "merchant": (tx.get("merchant") or {}).get("name")
                                if isinstance(tx.get("merchant"), dict) else tx.get("merchant"),
                                "amount": normalize_amount(tx.get("amount"), tx.get("type")),
                                "currency": tx.get("currencyCode") or "BRL",
                                "category_pluggy": tx.get("category"),
                                "subcategory_pluggy": tx.get("subcategory"),
                                "status": tx.get("status"),
                                "raw": tx,
                                "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                            }, on_conflict="pluggy_id").execute()
                for inv in fetch_investments(key, item_id):
                    stats["investments"] += 1
                    if not dry:
                        sb.table("investments").upsert({  # type: ignore
                            "pluggy_id": inv.get("id"),
                            "account_id": acc_map.get(inv.get("accountId") or ""),
                            "name": inv.get("name"),
                            "type": (inv.get("type") or "").lower() or None,
                            "issuer": (inv.get("issuer") or {}).get("name")
                            if isinstance(inv.get("issuer"), dict) else inv.get("issuer"),
                            "indexer": inv.get("indexer"),
                            "rate": inv.get("rate") or inv.get("profitability"),
                            "maturity_date": inv.get("maturityDate"),
                            "quantity": inv.get("quantity"),
                            "price": inv.get("price"),
                            "amount_invested": inv.get("amountInvested") or inv.get("balance"),
                            "current_value": inv.get("currentValue") or inv.get("value"),
                            "raw": inv,
                            "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
                        }, on_conflict="pluggy_id").execute()
                        row = sb.table("investments").select("id").eq(  # type: ignore
                            "pluggy_id", inv.get("id")).execute().data
                        if row:
                            sb.table("investment_snapshots").upsert({  # type: ignore
                                "investment_id": row[0]["id"], "date": to_date,
                                "value": inv.get("currentValue") or inv.get("value"),
                                "invested": inv.get("amountInvested") or inv.get("balance"),
                            }, on_conflict="investment_id,date").execute()
                            stats["snapshots"] += 1
                print(f"[{holder}/{bank}] item {item_id}: ok")
        if not dry:
            log_end(sb, run_id, "ok", stats)
    except Exception as e:
        stats["error"] = str(e)[:500]
        if not dry:
            log_end(sb, run_id, "error", stats, error=str(e))
        raise
    return stats


if __name__ == "__main__":
    print(json.dumps(run(), indent=2))
