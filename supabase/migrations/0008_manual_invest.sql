-- 0008_manual_invest.sql — permite ao casal lançar investimentos manuais (ex.: BTC fora da API).
-- Só linhas com pluggy_id 'manual:%' (sync continua via service_role).
drop policy if exists "couple insert manual inv" on public.investments;
create policy "couple insert manual inv" on public.investments
  for insert to authenticated
  with check (pluggy_id like 'manual:%');

drop policy if exists "couple update manual inv" on public.investments;
create policy "couple update manual inv" on public.investments
  for update to authenticated
  using (pluggy_id like 'manual:%')
  with check (pluggy_id like 'manual:%');
