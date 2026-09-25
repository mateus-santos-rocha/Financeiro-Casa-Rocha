-- 0004_invest_basis.sql — base de custo manual + rastreio de atualização.
-- invested_override: quanto saiu do seu bolso (desconta resgates, ignora transferências).
-- last_seen_at: último sync em que o Pluggy retornou o ativo (detecta transferidos/encerrados).

alter table public.investments
  add column if not exists invested_override numeric null,
  add column if not exists last_seen_at timestamptz null;

-- existentes começam como "desatualizados" até o próximo sync carimbar os vivos
update public.investments
  set last_seen_at = now() - interval '30 days'
  where last_seen_at is null;
