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
3. Rode as migrations em ordem no SQL Editor: `supabase/migrations/0001_schema.sql` … `0026_manual_snapshots.sql` (a 0026 libera o snapshot do dia ao editar posição manual).
4. Confira a seed `reserva-emergencia` em `tags`.

## Sync automático
- `sync/schedule.yml` guarda o cron editável (`0 11 * * *` = 08h BRT).
- `.github/workflows/sync.yml` roda 1x/dia + manual (`workflow_dispatch`). Último sync visível na faixa do topo.
- Botão "↻ Atualizar" no topo = 1 clique: `POST /api/sync` (só logado) dispara o `workflow_dispatch` e acompanha via `sync_runs` (polling 15s, ~2–5 min). Sem `GITHUB_TOKEN`, mostra link fallback p/ Actions.
  - Server-only na Vercel (e `.env.local`): `GITHUB_TOKEN` (fine-grained PAT, repo + Actions: write), `GITHUB_REPO=owner/repo`. Opcionais: `GITHUB_WORKFLOW` (default `sync.yml`), `GITHUB_REF` (default `main`). `NEXT_PUBLIC_GITHUB_REPO` segue só como fallback do link.
- Config local: copie `sync/.env.example` → `sync/.env` (nunca commitado) e rode `python sync/pluggy.py`.
- Janela padrão: últimos 30 dias. Carga histórica: `PLUGGY_WINDOW_DAYS=365 python sync/pluggy.py` (~12 meses, limite do Open Finance). A API limita cada resposta a 500 lançamentos (sem cursor) — o sync caminha para trás com janelas `dateFrom/dateTo` até esgotar; sem isso o cartão voltava só até mai/26.
- App demo sem permissão de listar items → use `PLUGGY_ITEM_IDS_1` + `PLUGGY_ITEM_BANKS_1` (vírgula, mesma ordem). Diagnóstico: `python sync/check.py`.
- Secrets no GitHub (6): `PLUGGY_CLIENT_ID_1/SECRET_1`, `PLUGGY_ITEM_IDS_1`, `PLUGGY_ITEM_BANKS_1`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Esposa depois = conta Meu Pluggy dela + par `_2` (+ ids `_2`). Sem migração.

## Conceitos que o app assume (importante)
- **Categoria exibida** = `category_override` (sua) ou `category_pluggy` (automática).
- **Transferências internas** (conta↔conta, resgate→aporte, compra/venda do ETF parking): marque com a tag `transferencia-interna` — Análise e Histórico as excluem por padrão. Pix entre o casal e deslocamentos p/ conta própria (nome do titular como contraparte, mesmo sem o "DE" — migration 0020) são marcados automaticamente (migration 0018). Pares débito+estorno (ex.: BRASILPREV que falha e estorna, efeito líquido zero) também caem aqui, detectados pelo sync em todo run (`tag_reversal_pairs` em `sync/auto_rules.py`). Pix entre contas próprias com descrição truncada/genérica ("MATEUS SANT", "enviada pelo Pix", "crédito via Pix") são pareados por valor+data+titular (`tag_pix_pairs`). Regras ignoram acento (`Laís` == `Lais`).
- **Natureza da entrada/saída** (`lib/classify.ts`, só visual — não muda totais): entradas abrem em Salário (verde escuro — `PAGAMENTO DE SALARIO` + tag `salario`, ex. clínica da Laís via migration 0019), Transferências (verde claro), Resgates de investimento (teal) e Outras; saídas em Despesas (vermelho) e Aportes (vermelho claro). Histórico empilha por mês; Análise tem o donut "Entradas por natureza".
- **Grupos do orçamento** (tags `custo-fixo`, `conforto`, `prazeres`, `liberdade-financeira`, `metas`, `sem-grupo`): regras automáticas por descrição/categoria, editáveis por lançamento. Desempate: `conforto` antes de `custo-fixo` (ex.: Feminae carrega as duas tags por causa da categoria do conector; a escolha particular prevalece — migration 0023).
- **Titulares**: códigos no banco seguem `voce|esposa`; rótulos na UI vêm de `holderLabel` (`lib/format.ts`): Mateus e Laís.
- **Adiantamento salarial** (regime de competência): o contracheque BV vem em 2 pernas — base 4.200 no meio do mês + adiantamento de 9 a 26 dias antes (data e valor flutuam; às vezes ~3,3k puro, às vezes com benefícios juntos como 26/02 e 29/05). O sync pareia cada base com o crédito `PAGAMENTO DE SALARIO` anterior mais próximo (até 35 dias) e o de mês anterior leva a tag `adiantamento`, **contando no mês do base** (Análise e Histórico deslocam automaticamente). Adiantamento dentro do próprio mês já está certo sem tag. Posição do ETF parking marcada com `adiantamento` fica fora do patrimônio.
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
