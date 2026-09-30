# Financeiro Casa Rocha

App pessoal do casal — Movimentações, Análise, Histórico, Investimentos. 100% gratuito.

## Stack
Next.js 14 (Vercel Hobby) + Supabase Free + GitHub Actions cron + Meu Pluggy gratuito.

## Rodar local
```bash
npm install
cp .env.example .env.local  # preencher NEXT_PUBLIC_SUPABASE_URL + ANON (ou PUBLISHABLE)
npm run dev                  # http://localhost:3000/login
```

## Banco (Supabase)
1. Crie o projeto free no Supabase.
2. Crie 2 usuários em Auth (você + esposa).
3. Rode as migrations em ordem no SQL Editor: `supabase/migrations/0001_schema.sql` … `0008_manual_invest.sql`.
4. Confira a seed `reserva-emergencia` em `tags`.

## Sync automático
- `sync/schedule.yml` guarda o cron editável (`0 11 * * *` = 08h BRT).
- `.github/workflows/sync.yml` roda 1x/dia + manual (`workflow_dispatch`, ou botão em `/config` com `NEXT_PUBLIC_GITHUB_REPO`).
- Config local: copie `sync/.env.example` → `sync/.env` (nunca commitado) e rode `python sync/pluggy.py`.
- Janela padrão: últimos 30 dias. Carga histórica: `PLUGGY_WINDOW_DAYS=365 python sync/pluggy.py` (~12 meses, limite do Open Finance).
- App demo sem permissão de listar items → use `PLUGGY_ITEM_IDS_1` + `PLUGGY_ITEM_BANKS_1` (vírgula, mesma ordem). Diagnóstico: `python sync/check.py`.
- Secrets no GitHub (6): `PLUGGY_CLIENT_ID_1/SECRET_1`, `PLUGGY_ITEM_IDS_1`, `PLUGGY_ITEM_BANKS_1`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Esposa depois = conta Meu Pluggy dela + par `_2` (+ ids `_2`). Sem migração.

## Conceitos que o app assume (importante)
- **Categoria exibida** = `category_override` (sua) ou `category_pluggy` (automática).
- **Transferências internas** (conta↔conta, resgate→aporte, compra/venda do ETF parking): marque com a tag `transferencia-interna` — Análise e Histórico as excluem por padrão. Pix entre o casal e deslocamentos p/ conta própria (nome do titular como contraparte) são marcados automaticamente (migration 0018).
- **Adiantamento salarial** (regime de competência): crédito do adiantamento + rendimentos do parking levam a tag `adiantamento` e **contam no mês seguinte** (Análise e Histórico deslocam automaticamente). Posição do ETF parking marcada com `adiantamento` fica fora do patrimônio.
- **BTC (cashback convertido)**: cada conversão leva a tag `btc` e **sai de Movimentações/Análise/Histórico**; o BTC vive como posição **manual** em Investimentos (`Adicionar manual`, com aplicado/atual editáveis no *editar*).
- **Investimentos, `value` x `amount`**: neste conector, `value` é PREÇO UNITÁRIO e `amount` é o TOTAL do lote. O sync usa `amount` (atual) e `balance` (aplicado). Não trocar.
- **Reserva de emergência** (tag): tem card próprio e **não entra** no patrimônio, base, rent, evolução, alocações nem consolidados.
- **Posições**: ativas entram nos totais; zeradas/resíduo <R$1 → encerradas; sumidas do banco há 3+ dias → desatualizadas; `encerrar` manual p/ casos recentes. Exibição consolidada por família de título (Tesouro Direto junta as variações), expansível em lotes.
- **Benchmark**: CDI mensal via BCB (SGS 4391, sem chave) x variação da carteira quando há 2+ snapshots no mês.

## Problemas conhecidos (e como resolvemos)
- `PGRST125` em tudo → `SUPABASE_URL` com `/rest/v1/` ou barra no final. Use `https://xxx.supabase.co` puro.
- `/auth` 401 → secret colado errado (espaço/quebra). Recopiar do demo app.
- `/v2/items` 403 `LIST_ITEMS_FEATURE_NOT_ENABLED` → usar itemIds explícitos (acima).
- Login Nubank em loop → autorizar pelo leitor interno do app (Perfil → Meus Dados → Acesso pelo Site), ou fluxo todo no celular.
- Build `EINVAL readlink .next` (OneDrive) → apagar `.next` e rebuildar.

## Páginas
- `/movimentacoes` (alias: `/transacional`) — filtros, override de categoria, tags, lote, regras, import/export CSV
- `/analise?mes=AAAA-MM` — cards MoM, pizza/barras, por titular, top merchants
- `/historico?meses=12` — gráfico + tabela mensal (sem acumulado; transferências excluídas via tag)
- `/investimentos` — consolidado por título (expansível em lotes), evolução, alocação, RF editável, reserva, benchmark CDI, manual (BTC)
- `/config` — sincronizar agora, schedule, últimos `sync_runs`, guia MFA
