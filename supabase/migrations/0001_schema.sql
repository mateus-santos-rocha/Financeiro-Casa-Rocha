-- 0001_schema.sql — Financeiro Casa Rocha (Fase 1)
-- Tabelas + índices + RLS + seed de tags. Idempotente na medida do possível.

create extension if not exists "pgcrypto";

-- ============ accounts ============
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  pluggy_item_id text,
  pluggy_account_id text unique,
  bank text not null,            -- nubank|bb|btg
  holder text not null default 'voce', -- voce|esposa
  type text,                     -- checking|savings|credit_card|investment
  name text,
  currency text not null default 'BRL',
  created_at timestamptz not null default now()
);

-- ============ transactions ============
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  pluggy_id text unique,
  account_id uuid references public.accounts(id) on delete set null,
  date date not null,
  posted_at timestamptz,
  description text,
  merchant text,
  amount numeric not null,        -- + entrada, - saída (normalizado no sync)
  currency text not null default 'BRL',
  category_pluggy text,
  subcategory_pluggy text,
  category_override text,
  status text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_tx_date on public.transactions(date desc);
create index if not exists idx_tx_account on public.transactions(account_id);

-- ============ tags ============
create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  color text
);

create table if not exists public.transaction_tags (
  transaction_id uuid references public.transactions(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);

-- ============ investments ============
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  pluggy_id text unique,
  account_id uuid references public.accounts(id) on delete set null,
  name text,
  type text,
  issuer text,
  indexer text,
  rate text,
  maturity_date date,
  quantity numeric,
  price numeric,
  amount_invested numeric,
  current_value numeric,
  raw jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.investment_snapshots (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid references public.investments(id) on delete cascade,
  date date not null,
  value numeric,
  invested numeric,
  unique (investment_id, date)
);
create index if not exists idx_snap_date on public.investment_snapshots(date desc);

create table if not exists public.investment_tags (
  investment_id uuid references public.investments(id) on delete cascade,
  tag_id uuid references public.tags(id) on delete cascade,
  primary key (investment_id, tag_id)
);

-- ============ rules + sync_runs ============
create table if not exists public.category_rules (
  id uuid primary key default gen_random_uuid(),
  match text not null,
  category text not null,
  priority int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  provider text not null default 'pluggy',
  status text not null default 'running',
  stats jsonb,
  error text
);

-- ============ RLS ============
alter table public.accounts enable row level security;
alter table public.transactions enable row level security;
alter table public.tags enable row level security;
alter table public.transaction_tags enable row level security;
alter table public.investments enable row level security;
alter table public.investment_snapshots enable row level security;
alter table public.investment_tags enable row level security;
alter table public.category_rules enable row level security;
alter table public.sync_runs enable row level security;

-- Leitura: qualquer usuário autenticado (o casal) lê tudo.
drop policy if exists "authenticated read" on public.accounts;
create policy "authenticated read" on public.accounts for select to authenticated using (true);
drop policy if exists "authenticated read" on public.transactions;
create policy "authenticated read" on public.transactions for select to authenticated using (true);
drop policy if exists "authenticated read" on public.tags;
create policy "authenticated read" on public.tags for select to authenticated using (true);
drop policy if exists "authenticated read" on public.transaction_tags;
create policy "authenticated read" on public.transaction_tags for select to authenticated using (true);
drop policy if exists "authenticated read" on public.investments;
create policy "authenticated read" on public.investments for select to authenticated using (true);
drop policy if exists "authenticated read" on public.investment_snapshots;
create policy "authenticated read" on public.investment_snapshots for select to authenticated using (true);
drop policy if exists "authenticated read" on public.investment_tags;
create policy "authenticated read" on public.investment_tags for select to authenticated using (true);
drop policy if exists "authenticated read" on public.category_rules;
create policy "authenticated read" on public.category_rules for select to authenticated using (true);
drop policy if exists "authenticated read" on public.sync_runs;
create policy "authenticated read" on public.sync_runs for select to authenticated using (true);

-- Escrita do casal: tags, vínculos, overrides e regras (escrita de transactions/investments é só via service_role no sync).
drop policy if exists "couple write tags" on public.tags;
create policy "couple write tags" on public.tags for all to authenticated using (true) with check (true);
drop policy if exists "couple write tx tags" on public.transaction_tags;
create policy "couple write tx tags" on public.transaction_tags for all to authenticated using (true) with check (true);
drop policy if exists "couple write inv tags" on public.investment_tags;
create policy "couple write inv tags" on public.investment_tags for all to authenticated using (true) with check (true);
drop policy if exists "couple write rules" on public.category_rules;
create policy "couple write rules" on public.category_rules for all to authenticated using (true) with check (true);
drop policy if exists "couple override category" on public.transactions;
create policy "couple override category" on public.transactions for update to authenticated using (true) with check (true);
drop policy if exists "couple edit rf manual" on public.investments;
create policy "couple edit rf manual" on public.investments for update to authenticated using (true) with check (true);

-- ============ seed ============
insert into public.tags (name, color) values
  ('reserva-emergencia', '#10b981'),
  ('filhos', '#0ea5e9'),
  ('viagem', '#f59e0b')
on conflict (name) do nothing;
