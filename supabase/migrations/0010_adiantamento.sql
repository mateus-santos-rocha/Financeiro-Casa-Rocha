-- 0010_adiantamento.sql — tag do fluxo de adiantamento salarial.
-- Regra da casa: crédito do adiantamento + rendimentos do parking contam no mês SEGUINTE.
-- Compra/venda do ETF parking usa `transferencia-interna` (nunca conta).
-- Posição do ETF parking marcada com `adiantamento` fica fora do patrimônio.
insert into public.tags (name, color) values
  ('adiantamento', '#f59e0b')
on conflict (name) do nothing;
