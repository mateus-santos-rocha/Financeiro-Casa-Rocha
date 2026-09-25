-- 0006_invest_item.sql — liga investimento ao item (banco) + limpa snapshots.
-- Motivo: `value` é PREÇO UNITÁRIO neste conector; o correto é `amount` (total do lote).
-- Os snapshots antigos guardaram preço unitário como se fosse total → recomeçam do zero.
alter table public.investments
  add column if not exists pluggy_item_id text null;

delete from public.investment_snapshots;
