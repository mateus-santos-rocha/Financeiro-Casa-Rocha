-- 0005_manual_close.sql — permite marcar posição como encerrada manualmente
-- (ex.: transferência recente que ainda aparece no banco de origem).
alter table public.investments
  add column if not exists closed_manual boolean not null default false;
