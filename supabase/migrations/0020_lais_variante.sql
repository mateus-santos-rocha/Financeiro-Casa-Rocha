-- 0020_lais_variante.sql — o nome dela vem sem o "DE" em alguns bancos
-- ("LAIS COUTINHO SOUZA ROCHA"). Alarga a regra para o núcleo do nome.
-- Verificado: todas as ocorrências de "lais coutinho" no banco são
-- transferências entre contas próprias / entre o casal.
delete from public.auto_rules where match = 'lais coutinho de souza rocha';
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('lais coutinho', null, 'tag', 'transferencia-interna', null, 35)
on conflict do nothing;
