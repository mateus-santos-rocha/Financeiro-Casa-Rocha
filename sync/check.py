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
    check_migrations(sb)


def check_migrations(sb: object) -> None:
    """Diz quais migrations faltam (por coluna/tag — sem executar SQL)."""
    def has_col(table: str, col: str) -> bool:
        try:
            sb.table(table).select(col).limit(1).execute()  # type: ignore
            return True
        except Exception:
            return False

    def has_tag(name: string) -> bool:
        try:
            r = sb.table("tags").select("id").eq("name", name).execute()  # type: ignore
            return len(r.data or []) > 0
        except Exception:
            return False

    def has_rule(match: str) -> bool:
        try:
            r = sb.table("auto_rules").select("id").eq("match", match).execute()  # type: ignore
            return len(r.data or []) > 0
        except Exception:
            return False

    checks = [
        ("0003 tag transferencia-interna", has_tag("transferencia-interna")),
        ("0004 invested_override/last_seen_at", has_col("investments", "invested_override") and has_col("investments", "last_seen_at")),
        ("0005 closed_manual", has_col("investments", "closed_manual")),
        ("0006 pluggy_item_id", has_col("investments", "pluggy_item_id")),
        ("0007 held_since", has_col("investments", "held_since")),
        ("0009 merged_into removida", not has_col("investments", "merged_into")),
        ("0010 tag adiantamento", has_tag("adiantamento")),
        ("0011 tag btc", has_tag("btc")),
        ("0018 casal (mateus; lais -> 0020)", has_rule("mateus santos rocha")),
        ("0019 salario (pediatherapies)", has_tag("salario") and has_rule("pediatherapies")),
        ("0020 lais sem DE", has_rule("lais coutinho")),
        ("0021 salario (rocha solucoes)", has_rule("rocha solucoes")),
    ]
    missing = [name for name, ok in checks if not ok]
    for name, ok in checks:
        print(f"migration {name}: {'OK' if ok else 'PENDENTE'}")
    if missing:
        print(f"Rode no SQL Editor: {', '.join(m.split()[0] + '_*.sql' for m in missing)}")
    else:
        print("migrations: tudo aplicado")


if __name__ == "__main__":
    pluggy.load_dotenv()
    check_pluggy()
    check_supabase()
