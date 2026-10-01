-- 0024_grupos_pessoais.sql — psicóloga e diarista são conforto; CDB avulso
-- (categoria "transferência própria", sem tag) conta como aporte.
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('bianca de souza oros ferreira', null, 'tag', 'conforto', null, 39),
  ('claudia regina martins de oliveira', null, 'tag', 'conforto', null, 40),
  ('cdb', null, 'tag', 'liberdade-financeira', null, 41)
on conflict do nothing;
