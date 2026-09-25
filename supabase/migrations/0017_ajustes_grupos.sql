-- 0017_ajustes_grupos.sql — mapeamentos confirmados pelo dono + 1 suposição (reversível).
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('w4africa', null, 'tag', 'custo-fixo', null, 43),
  ('eneias florio ramos', null, 'tag', 'custo-fixo', null, 44),
  ('dgbarberhouse', null, 'tag', 'conforto', null, 54),
  ('ministerio da fazenda', null, 'tag', 'custo-fixo', null, 51)
on conflict do nothing;
