-- 0026_manual_snapshots.sql — ao editar/criar posição manual, o app grava o
-- snapshot do dia (evolução passa a incluir BrasilPrev/BTC daqui pra frente;
-- o passado não é reescrito). Sync continua via service_role.
drop policy if exists "couple insert snapshots" on public.investment_snapshots;
create policy "couple insert snapshots" on public.investment_snapshots
  for insert to authenticated
  with check (true);

drop policy if exists "couple update snapshots" on public.investment_snapshots;
create policy "couple update snapshots" on public.investment_snapshots
  for update to authenticated
  using (true)
  with check (true);
