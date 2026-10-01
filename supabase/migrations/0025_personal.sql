-- 0025_personal.sql — personal trainer (Guilherme) é conforto.
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('guilherme roberto oliveira', null, 'tag', 'conforto', null, 42)
on conflict do nothing;
