# Financeiro Casa Rocha

App pessoal do casal — Movimentações, Análise, Histórico, Investimentos. 100% gratuito.

## Stack
Next.js 14 (Vercel Hobby) + Supabase Free + GitHub Actions cron + Meu Pluggy gratuito.

## Rodar local
```bash
npm install
cp .env.example .env.local  # preencher SUPABASE + (depois) PLUGGY
npm run dev
```

## Banco (Supabase)
1. Crie o projeto free no Supabase.
2. Crie 2 usuários em Auth (você + esposa).
3. Rode `supabase/migrations/0001_schema.sql` no SQL Editor.
4. Confira a seed `reserva-emergencia` em `tags`.

## Sync automático
- `sync/schedule.yml` guarda o cron editável (`0 11 * * *` = 08h BRT).
- `.github/workflows/sync.yml` roda 1x/dia + manual (`workflow_dispatch`).
- Secrets no GitHub: `PLUGGY_CLIENT_ID_1/SECRET_1` (você agora), `PLUGGY_CLIENT_ID_2/SECRET_2` (esposa depois), `SUPABASE_URL/SERVICE_KEY`.
- Adicionar a esposa depois = criar a conta Meu Pluggy dela + adicionar o par `_2`. Sem migração.

## Fase 0 — validar o Pluggy gratuito
1. Crie sua conta em `meu.pluggy.ai`, conecte Nubank + BB + BTG.
2. Em `dashboard.pluggy.ai`, abra o demo app e conecte os items "Meu Pluggy".
3. Teste: `POST /auth` → `GET /accounts?itemId=…` deve retornar contas reais.
4. Se a chave do demo expirar após o trial, o app continua 100% via import CSV (fallback).

## Páginas
- `/movimentacoes` (alias antigo: `/transacional`) — histórico + filtros
- `/analise?mes=AAAA-MM` — pizza + barras do mês
- `/historico?meses=12` — evolução mensal
- `/investimentos` — consolidado + renda fixa detalhada + tags
- `/config` — schedule visível + últimos `sync_runs`
