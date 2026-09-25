-- 0003_transfer_tag.sql — tag padrão para excluir movimentações internas
-- (resgate/aporte entre contas próprias) da Análise e do Histórico.
insert into public.tags (name, color) values
  ('transferencia-interna', '#64748b')
on conflict (name) do nothing;
