-- 0007_transfer_link.sql — vincula posição de origem à de destino (transferência entre bancos).
-- merged_into: origem aponta para o destino; base/histórico consolidam no destino.
-- held_since: início econômico da posição (manual, ex.: compra original no banco anterior).
alter table public.investments
  add column if not exists merged_into uuid null references public.investments(id) on delete set null,
  add column if not exists held_since date null;
