-- 0011_btc.sql — tag do fluxo recorrente cashback -> BTC.
-- Lançamentos taggeados somem de Movimentações/Análise/Histórico;
-- o BTC vive como posição manual em Investimentos (editável).
insert into public.tags (name, color) values
  ('btc', '#f7931a')
on conflict (name) do nothing;
