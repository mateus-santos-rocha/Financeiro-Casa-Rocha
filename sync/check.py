"""check.py — diagnóstico isolado: Pluggy (auth, connectors, items) e Supabase (tabelas).

Uso: python sync/check.py
Não imprime segredos, só status e contagens. Pode colar a saída no chat.
"""
from __future__ import annotations

import pluggy


def check_pluggy() -> None:
    creds = pluggy.collect_credentials()
    print(f"credenciais Pluggy encontradas: {len(creds)}")
    for cid, sec, holder in creds:
        print(f"[{holder}] clientId prefixo: {cid[:6]}... (len={len(cid)})")
        try:
            key = pluggy.auth(cid, sec)
        except Exception as e:
            print(f"[{holder}] /auth FALHOU: {e}")
            continue
        print(f"[{holder}] /auth OK")
        for path in ("/connectors", "/items", "/v2/items"):
            try:
                res = pluggy._http("GET", path, key, params={"limit": 1} if path == "/connectors" else None)
                n = len(res.get("results") or res.get("items") or [])
                print(f"[{holder}] {path} OK (amostra: {n} registro(s))")
            except Exception as e:
                print(f"[{holder}] {path} FALHOU: {e}")
        try:
            items = pluggy.list_items(key)
            print(f"[{holder}] items vinculados: {len(items)}")
        except Exception as e:
            print(f"[{holder}] list_items FALHOU: {e}")


def check_supabase() -> None:
    sb = pluggy.supabase()
    if sb is None:
        print("Supabase: SUPABASE_URL ou SERVICE_ROLE ausentes no sync/.env")
        return
    for table in ("accounts", "transactions", "investments",
                  "investment_snapshots", "sync_runs", "tags"):
        try:
            r = sb.table(table).select("id", count="exact").limit(1).execute()
            print(f"Supabase {table}: OK (count={r.count})")
        except Exception as e:
            print(f"Supabase {table}: FALHOU: {str(e)[:200]}")


if __name__ == "__main__":
    pluggy.load_dotenv()
    check_pluggy()
    check_supabase()
