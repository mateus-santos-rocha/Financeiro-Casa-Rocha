-- 0023_feminae.sql — todo gasto Feminae é conforto (dono poderia usar o SUS,
-- escolheu particular). A categoria do conector (healthcare/hospital) ainda
-- marca custo-fixo junto; o desempate em groupOf (Análise/Histórico) prefere
-- conforto nesse empate. Verificado: únicos empates no banco são
-- "Estac Shopping" (conforto+prazeres), não afetados pela troca.
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('feminae', null, 'tag', 'conforto', null, 38)
on conflict do nothing;
