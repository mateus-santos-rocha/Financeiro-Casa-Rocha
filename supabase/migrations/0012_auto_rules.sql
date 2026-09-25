-- 0012_auto_rules.sql — regras automáticas aplicadas pelo sync (e backfill).
-- action 'tag': marca lançamentos (ex.: cashback -> btc).
-- action 'invest': acumula o valor na posição manual (ex.: compra de cripto -> BTC).
-- invest_rolls garante idempotência (re-sync nunca soma 2x).
create table if not exists public.auto_rules (
  id uuid primary key default gen_random_uuid(),
  match text not null,               -- substring, case-insensitive, sobre description
  bank text null,                    -- nubank|bb|btg ou null (= qualquer banco)
  action text not null check (action in ('tag', 'invest')),
  tag_name text null,
  invest_name text null,             -- nome da posição manual (criada se não existir)
  priority int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.invest_rolls (
  rule_id uuid references public.auto_rules(id) on delete cascade,
  transaction_id uuid references public.transactions(id) on delete cascade,
  amount numeric not null,
  created_at timestamptz not null default now(),
  primary key (rule_id, transaction_id)
);

alter table public.auto_rules enable row level security;
alter table public.invest_rolls enable row level security;

drop policy if exists "authenticated read" on public.auto_rules;
create policy "authenticated read" on public.auto_rules for select to authenticated using (true);
drop policy if exists "couple write rules" on public.auto_rules;
create policy "couple write rules" on public.auto_rules for all to authenticated using (true) with check (true);
drop policy if exists "authenticated read" on public.invest_rolls;
create policy "authenticated read" on public.invest_rolls for select to authenticated using (true);

insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('resgate de cashback', 'nubank', 'tag', 'btc', null, 10),
  ('compra de criptomoedas', null, 'invest', 'btc', 'BTC', 20)
on conflict do nothing;
