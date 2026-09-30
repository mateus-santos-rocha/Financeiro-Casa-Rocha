-- 0021_salario_rocha.sql — pró-labore da empresa do dono (Rocha Soluções,
-- hoje inativa) como tag `salario`. Mesmo mecanismo da 0019: alimenta o stack
-- "Salário" do Histórico e o donut "Entradas por natureza" da Análise.
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('rocha solucoes', null, 'tag', 'salario', null, 37)
on conflict do nothing;
