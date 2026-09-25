# AGENTS.md — Financeiro Casa Rocha (app pessoal do casal)

> App 100% gratuito, uso pessoal, acesso simultâneo do casal.
> Fonte de dados: **Meu Pluggy gratuito** (`meu.pluggy.ai`) como proxy → `api.pluggy.ai`.
> Stack alvo: **Next.js (Vercel Hobby) + Supabase Free + GitHub Actions (cron)**. Nada pago, esforço manual mínimo.

## 1. Visão e restrições duras

1. **Uso pessoal, 2 usuários simultâneos** (você + esposa). Login compartilhado no mesmo projeto, sem servidor para cuidar.
2. **Custo R$ 0 permanente.** Sem trial que vire cobrança. Se qualquer peça exigir cartão/pagamento, trocar por fallback manual (CSV) — nunca quebrar por billing.
3. **Sync automático agendável.** Padrão: 1x/dia de manhã. Agendamento = expressão cron num arquivo (`sync/schedule.yml`), editável sem mexer no código. Botão "Sincronizar agora" no app.
4. **Fontes (5 conexões, rollout em 2 etapas):**
   - Etapa 1 (agora, só você): Nubank (você) + BTG Pactual (você) + BB (você)
   - Etapa 2 (depois, esposa): Nubank (esposa) + BB (esposa)
   - O sync suporta N credenciais (`PLUGGY_CLIENT_ID_1/SECRET_1`, `_2`, ...) + campo `holder` (`voce|esposa`). Adicionar a esposa = criar conta Meu Pluggy dela + adicionar 1 par de secrets, sem migrar banco.
5. **Categorização automática do Pluggy + override + tags personalizadas** (ex.: `reserva-emergencia`, `filhos`, `viagem`, etc.).
6. **LGPD/consentimento:** consentimento Open Finance é por CPF. Logo: **1 conta Meu Pluggy por CPF** (começar só com a sua; a da esposa entra depois). O app consolida todas no mesmo banco.

## 2. Descoberta crítica sobre "Pluggy gratuito" (validar na Fase 0)

- `pluggy.ai/pricing`: API profissional = trial 14 dias (até 20 contas) e depois a partir de R$ 2.500/mês. **Não usar essa contratação.**
- `meu.pluggy.ai`: conta pessoal gratuita ("Data Passport") com acesso via API/MCP/CLI. O fluxo oficial é:
  1. Criar conta Meu Pluggy (1 por CPF) e conectar os bancos nela.
  2. No `dashboard.pluggy.ai`, abrir o **demo app**, conectar os items "Meu Pluggy" (proxy dos consentimentos).
  3. Usar `clientId/clientSecret` do demo app → `POST /auth` → `X-API-KEY` → `GET /accounts`, `/transactions`, `/investments`.
- **Risco nº 1 (atualizado 24/09/2026):** a página oficial do Meu Pluggy afirma "uso pessoal não expira" (fluxo Meu Pluggy + Dashboard para app pessoal, mesma infra dos clientes pagantes). Mesmo assim, a Fase 0 deve validar na prática: a chave do demo app continua funcionando para `POST /auth` + `GET /accounts|/transactions|/investments` com seus dados reais. Se NÃO:
  - Fallback A (ainda grátis): usar MCP/CLI do Meu Pluggy a partir de máquina local + push para Supabase (script local agendado, sem `api.pluggy.ai`).
  - Fallback B (sempre funciona): **import manual CSV/OFX** (Nubank, BB e BTG exportam de graça) na página Transacional. O app deve funcionar 100% mesmo sem Pluggy.
- **Decisão arquitetural:** isolar a fonte atrás da interface `SyncProvider` (`pluggy | csv`). Trocar de provider não quebra as páginas.

## 3. Arquitetura 100% gratuita (recomendada)

```
[2 contas Meu Pluggy] ──consentimento Open Finance──> [Nubank, BB, BTG]
        │ proxy
        v
[dashboard.pluggy.ai demo app] (clientId/secret por CPF, em GitHub Secrets)
        │  api.pluggy.ai (accounts/transactions/investments)
        v
[GitHub Actions cron diário] ──upsert──> [Supabase Postgres Free]
        │                                        │
        │ webhook/manual                         │ Supabase Auth (email) + RLS
        v                                        v
[Botão "Sincronizar agora"]            [Next.js na Vercel Hobby]
(Ede Function que dispara workflow_dispatch)  PWA instalável, acesso simultâneo
```

**Por que essa combinação (e não outras):**

| Opção | Veredito |
|---|---|
| Vercel Hobby + Supabase Free + GitHub Actions cron | **Escolhida.** Tudo free para uso pessoal não-comercial. Actions tem 2.000 min/mês grátis (sync diário usa ~90 min/mês). Supabase Free pausa após 7 dias sem atividade — o sync diário mantém aquecido. |
| Streamlit Cloud | Rejeitado: dorme, UX mobile fraca, auth do casal mais chata. |
| Render/Cloud Run free | Rejeitado: sleep/fragilidade, mais config. |
| Raspberry Pi / PC local | Rejeitado: exige manutenção, acesso externo complicado (túnel/VPN). |
| Backend próprio 24/7 | Desnecessário: sync é batch diário, app é leitura do banco. |

**Segredos:** `PLUGGY_CLIENT_ID_1/SECRET_1` (você), `PLUGGY_CLIENT_ID_2/SECRET_2` (esposa), `SUPABASE_URL/SERVICE_KEY` → só em GitHub Secrets + Vercel Env (server-only). Nunca no frontend.

## 4. Modelo de dados (Supabase Postgres)

```sql
-- dimensões
accounts(id uuid pk, pluggy_item_id text, pluggy_account_id text unique,
  bank text, -- nubank|bb|btg
  holder text, -- voce|esposa
  type text, -- checking|savings|credit_card|investment
  name text, currency text default 'BRL', created_at timestamptz);

-- transacional (contas + cartões)
transactions(id uuid pk, pluggy_id text unique, account_id fk,
  date date, posted_at timestamptz, description text, merchant text,
  amount numeric, -- + entrada, - saída
  currency text, category_pluggy text, subcategory_pluggy text,
  category_override text null, status text, raw jsonb,
  created_at timestamptz, updated_at timestamptz);
create index on transactions(date); create index on transactions(account_id);

tags(id uuid pk, name text unique, color text);
transaction_tags(transaction_id fk, tag_id fk, pk(transaction_id, tag_id));

-- investimentos: posição atual + snapshot diário (performance)
investments(id uuid pk, pluggy_id text unique, account_id fk,
  name text, type text, -- fixed_income|mutual_fund|equity|etf|security|coe|other
  issuer text, indexer text, -- CDI|IPCA|PREFIXADO|SELIC...
  rate text, -- "102% CDI", "IPCA+6.5%" (texto livre + campos)
  maturity_date date null, quantity numeric null, price numeric null,
  amount_invested numeric null, current_value numeric null,
  raw jsonb, updated_at timestamptz);
investment_snapshots(id uuid pk, investment_id fk, date date,
  value numeric, invested numeric, unique(investment_id, date));
investment_tags(investment_id fk, tag_id fk, pk(investment_id, tag_id));
-- tag especial: `reserva-emergencia` (criada por seed)

category_rules(id uuid pk, match text, -- ex. "UBER*"
  category text, priority int, created_at timestamptz);
sync_runs(id uuid pk, started_at timestamptz, finished_at timestamptz,
  provider text, status text, stats jsonb, error text);
```

**RLS:** 1 projeto Supabase, 2 usuários (Supabase Auth email). Policy: `authenticated` pode ler tudo; escrever em `tags/*_tags/category_override/category_rules` (casal edita junto). Escrita de `transactions/investments` só via `service_role` (sync). Nunca via anon key.

**Regras de negócio:**
- Categoria exibida = `category_override ?? category_pluggy`.
- Valor normalizado: Pluggy pode variar sinal por conector — normalizar no sync (débito negativo, crédito positivo) + teste.
- Deduplicação: `pluggy_id` unique + upsert. Re-sync nunca duplica.
- Transações de cartão: agrupar por fatura (mês) na UI; manter `date` original.
- Investimentos: todo sync grava `investment_snapshots` (1 linha/dia/ativo) → base da performance. Renda fixa guarda `issuer/indexer/rate/maturity_date` vindos do `raw` do Pluggy + edição manual quando o Pluggy não trouxer (comum em RF).

## 5. Páginas (nomes finais sugeridos)

> O nome "Transacional" confunde. Sugestão: **Movimentações**. Manter URL `/movimentacoes` com alias `/transacional`.

### 5.1 Movimentações (`/movimentacoes`)
Histórico completo pesquisável. Filtros: período, conta(s), titular, tipo (entrada/saída), categoria (Pluggy+override), tag(s), busca texto, só sem tag. Tabela: data, descrição, conta/titular, categoria, valor (verde/vermelho), tags. Ações por linha: editar categoria (override), adicionar/remover tags, criar regra a partir da descrição. Ações em lote: aplicar tag, ignorar (ex.: transferência entre contas próprias). Import CSV/OFX (fallback). Export CSV do filtro atual.

### 5.2 Análise (`/analise`)
Recorte de **um mês** (seletor mês atual default + meses passados). Cards: receitas, despesas, saldo, top categoria. Gráficos: pizza Receitas x Despesas por categoria, barras por categoria, barras por titular/conta, top 10 merchants. Toggle "com/sem transferências internas". Comparação rápida com mês anterior (delta %).

### 5.3 Histórico (`/historico`)
Evolução ao longo do tempo. Linha mensal: receitas vs despesas vs saldo + acumulado. Empilhado por categoria ao longo dos meses. Heatmap/tabela mês x categoria. Seletor de intervalo (6/12/24 meses, tudo). Filtro por titular/tag.

### 5.4 Investimentos (`/investimentos`)
- **Consolidado:** patrimônio total, evolução (linha a partir de `investment_snapshots`), alocação por banco, por tipo, por tag (fatia `reserva-emergencia` destacada).
- **Renda fixa (detalhe):** tabela por título: emissor, título, indexador, taxa, vencimento, aplicado, atual, rentabilidade (R$ e %), % da carteira. Vencimentos próximos (alertas 30/90 dias). Edição manual de taxa/vencimento quando Pluggy não informar.
- **Performance:** TWR aproximado por ativo e consolidado a partir dos snapshots + aportes (transactions de investimento); benchmark CDI/Selic (tabela manual mensal ou API BCB gratuita — `api.bcb.gov.br`, sem chave).
- **Tags de investimento:** N-N (um título pode ser `reserva-emergencia` + `aposentadoria`). Filtro "só reserva".

## 6. Sync automático (detalhe)

- **Onde roda:** `.github/workflows/sync.yml` — `schedule: cron` (default `0 11 * * *` = 08h BRT) + `workflow_dispatch` (botão manual).
- **O quê (`sync/` em Python, `pluggy.py` + `supabase_client`):**
  1. `POST /auth` por CPF → API key (reuso em memória, não logar secret).
  2. `GET /items` → para cada `itemId`: `GET /accounts`, `GET /v2/transactions` (paginação cursor, janela incremental desde último sync), `GET /investments` + `/investments/{id}/transactions`.
  3. Normalizar → upsert Supabase (`service_role`) → gravar snapshots → gravar `sync_runs`.
  4. Respeitar rate limit (429 → backoff; `PATCH /items` no máximo manual — usar auto-sync do Pluggy).
- **Agendamento configurável:** `sync/schedule.yml` com `cron: "0 11 * * *"` + `timezone: America/Sao_Paulo`. Trocar o cron = trocar a linha (documentado no README). Sem rebuild do app.
- **Re-auth MFA (Nubank/BB/BTG pedem de tempos em tempos):** status `LOGIN_ERROR/MFA` aparece na página Config (`/config` mostra `sync_runs` + status por conexão). Revalidação = abrir Meu Pluggy ou widget Pluggy Connect e reconectar; nenhum segredo bancário fica no nosso banco (só tokens do Pluggy).
- **Botão manual:** Edge Function `supabase/functions/trigger-sync` chama `workflow_dispatch` via GitHub API (token escopo `actions:write` em secret da function). Alternativa sem function: link direto para a Actions.

## 7. Auth do casal + acesso simultâneo

- Supabase Auth (email+senha ou magic link), 2 usuários no mesmo projeto. RLS como na seção 4.
- Frontend Next.js App Router + `@supabase/ssr`, middleware protege `/movimentacoes|/analise|/historico|/investimentos|/config`.
- PWA (`manifest` + instalação na home do celular). Sem build mobile nativo — custo zero.
- Observação Supabase Free: limite 500 MB banco, 5 GB egress, 50k MAU — folga enorme para 2 usuários. Pausa por inatividade resolvida pelo cron diário.

## 8. Estrutura de pastas alvo

```
./
├─ AGENTS.md                  # este arquivo (plano vivo)
├─ README.md                  # como rodar, configurar cron, reconectar banco
├─ app/                       # Next.js App Router
│  ├─ (auth)/login/page.tsx
│  ├─ movimentacoes/page.tsx  # alias: transacional
│  ├─ analise/page.tsx
│  ├─ historico/page.tsx
│  ├─ investimentos/page.tsx
│  └─ config/page.tsx         # status sync, conexões, schedule visível
├─ components/                # tabelas, filtros, gráficos (recharts ou tremor)
├─ lib/                       # supabase client, formatação BRL, categorias
├─ supabase/
│  ├─ migrations/             # schema da seção 4 + RLS + seed tags
│  └─ functions/trigger-sync/ # dispara sync manual
├─ sync/                      # job Python do GitHub Actions
│  ├─ schedule.yml            # cron editável
│  ├─ pluggy.py               # provider pluggy (interface SyncProvider)
│  ├─ csv_import.py           # provider fallback CSV/OFX
│  ├─ normalize.py            # sinais, categorias, dedup
│  └─ requirements.txt
└─ .github/workflows/sync.yml
```

## 9. Plano de execução (fases, cada uma verificável)

- [x] **Fase 0 — Validação gratuita (antes de codar).** Criar conta Meu Pluggy e conectar as fontes (feito 25/09/2026: BTG+BB+Nubank conectados após resolver loop do Nubank). Falta: criar demo app no dashboard, testar `POST /auth` + `GET /accounts|/transactions|/investments` via curl. Critério: dados reais retornam e a chave sobrevive >24h sem cobrança. Se falhar → confirmar Fallback A/B e seguir com CSV primeiro.
- [x] **Fase 1 — Fundação.** Repo + Next.js + Supabase projeto + `supabase/migrations` (schema+RLS+seed) + login do casal + layout + PWA. Critério: os 2 logins veem shell vazio protegido.
- [x] **Fase 2 — Sync.** `sync/pluggy.py` + `normalize.py` + `sync.yml` (cron diário) + `sync_runs` visível em `/config`. Validado 25/09/2026: 2 runs seguidos idempotentes (6 accounts, 169 transactions, 36 investments, 36 snapshots; sem duplicar). App demo sem permissão de listar items → usa `PLUGGY_ITEM_IDS_1/BANKS_1` explícitos + `sync/check.py` p/ diagnóstico. Critério: 2 runs diários seguidos com upsert sem duplicar + snapshots criados.
- [x] **Automação diária.** Repo privado + 6 secrets + workflow `sync-diario` verde em 25/09/2026 (cron 08h BRT + manual).
- [x] **Fase 3 — Movimentações.** Tabela+filtros+override de categoria+tags+regras+import CSV. Validada pelo dono em 25/09/2026 (4/4 testes: busca, categoria+tag, lote, CSV). Critério: achar qualquer lançamento em <3 cliques e retaggear em lote.
- [x] **Fase 4 — Análise + Histórico.** Seletor de mês, pizza/barras, MoM, merchants, por titular, evolução mensal (sem acumulado — removido a pedido do dono; transferências internas excluídas via tag). Critério: fechar o mês atual e um mês passado batendo com o extrato do banco.
- [x] **Fase 5 — Investimentos.** Consolidado, RF detalhada (com edição manual de taxa/vencimento), snapshots/performance, tag `reserva-emergencia` (benchmark CDI via BCB ficou p/ Fase 6). Validada pelo dono em 25/09/2026 (após corrigir mapeamento preço-unitário→total, bank via item, dust <R$1, encerrar manual, base manual, consolidado por família expansível; vínculo de transferência removido e reserva excluída do patrimônio a pedido do dono). Critério: cada título RF exibe aplicado x atual x rentabilidade + evolução patrimonial desenha.
- [x] **Fase 6 — Polimento.** Botão "sincronizar agora" em `/config` (link p/ Actions via `NEXT_PUBLIC_GITHUB_REPO`), guia MFA/reconnect, export CSV, testes de normalização, benchmark CDI via BCB (SGS 4391), lançamento manual (BTC), README final.

## 10. Convenções para agents (quem for executar)

- Commits pequenos por fase; nunca commitar secrets (`.env*`, `service_role`, `clientSecret`). Usar `.env.example` com placeholders.
- Qualquer mudança de schema = nova migration em `supabase/migrations`, nunca edit direto.
- Sync: idempotente sempre (upsert por `pluggy_id`, snapshot 1/dia). Logar `sync_runs` com stats (`novas`, `atualizadas`, `snapshots`).
- Gráficos: preferir `recharts`; datas em `America/Sao_Paulo`; moeda `pt-BR/BRL`.
- Antes de dizer "pronto" numa fase, rodar o critério de aceite da fase e registrar evidência (print/log) no PR/descrição.
- Se o Pluggy bloquear algo (MFA, conector fora, trial), não travar: implementar o fallback CSV daquela fonte e seguir.

## 11. Próximo passo imediato

Decidido com o dono (24/09/2026): (1) começar só com a conta Meu Pluggy dele, esposa entra depois sem migração; (2) stack Next.js+Vercel+Supabase+Actions confirmada; (3) página chama **Movimentações** (`/movimentacoes`, alias `/transacional`). Nota sobre skill de frontend: este ambiente (opencode) não tem a skill de frontend do Claude Code instalada — só `customize-opencode`. O visual seguirá o equivalente: Next.js + Tailwind, layout responsivo mobile-first, componentes acessíveis, gráficos recharts, formatação pt-BR/BRL. Iniciar Fase 0.
