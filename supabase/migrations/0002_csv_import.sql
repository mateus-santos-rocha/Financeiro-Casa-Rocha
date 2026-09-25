-- 0002_csv_import.sql — permite ao casal inserir lançamentos manuais (import CSV).
-- Só linhas com pluggy_id 'csv:%' (sync continua via service_role, sem RLS).

drop policy if exists "couple insert csv" on public.transactions;
create policy "couple insert csv" on public.transactions
  for insert to authenticated
  with check (pluggy_id like 'csv:%');
