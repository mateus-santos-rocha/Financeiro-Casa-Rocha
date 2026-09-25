-- 0013_rule_type.sql — tipo da posição criada pela regra (ex.: BTC -> crypto).
alter table public.auto_rules add column if not exists invest_type text not null default 'other';
update public.auto_rules set invest_type = 'crypto' where invest_name = 'BTC';
