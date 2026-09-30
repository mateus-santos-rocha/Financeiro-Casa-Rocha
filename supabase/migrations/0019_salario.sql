-- 0019_salario.sql — salário da Laís (clínica Pediatherapies) como tag `salario`.
-- A tag alimenta lib/classify.ts: entradas com ela contam no stack "Salário"
-- do Histórico e no donut "Entradas por natureza" da Análise.
-- Se a fonte do salário mudar, basta trocar a regra (ou retaggear à mão).
insert into public.tags (name, color) values
  ('salario', '#059669')
on conflict (name) do nothing;

insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('pediatherapies', null, 'tag', 'salario', null, 36)
on conflict do nothing;
