-- 0016_grupos.sql — 5 grupos de orçamento como tags + regras de aplicação automática.
-- Tudo editável por lançamento (basta remover/trocar a tag). Metas é só manual.
insert into public.tags (name, color) values
  ('custo-fixo', '#0f172a'),
  ('conforto', '#0ea5e9'),
  ('prazeres', '#ec4899'),
  ('liberdade-financeira', '#10b981'),
  ('metas', '#f59e0b')
on conflict (name) do nothing;

-- match = substring (palavra inteira) sobre descrição + categoria
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  -- Custos Fixos (dados pelo dono + contas e proteções recorrentes)
  ('caio cardoso barbosa germano', null, 'tag', 'custo-fixo', null, 40),
  ('igreja batista memorial', null, 'tag', 'custo-fixo', null, 41),
  ('residencial spazio', null, 'tag', 'custo-fixo', null, 42),
  ('insurance', null, 'tag', 'custo-fixo', null, 50),
  ('telecommunications', null, 'tag', 'custo-fixo', null, 50),
  ('internet', null, 'tag', 'custo-fixo', null, 50),
  ('electricity', null, 'tag', 'custo-fixo', null, 50),
  ('utilities', null, 'tag', 'custo-fixo', null, 50),
  ('housing', null, 'tag', 'custo-fixo', null, 50),
  ('rent', null, 'tag', 'custo-fixo', null, 50),
  ('healthcare', null, 'tag', 'custo-fixo', null, 50),
  ('hospital clinics and labs', null, 'tag', 'custo-fixo', null, 50),
  ('bank fees', null, 'tag', 'custo-fixo', null, 50),
  ('tax on financial operations', null, 'tag', 'custo-fixo', null, 50),
  -- Conforto (dia a dia e bem-estar)
  ('groceries', null, 'tag', 'conforto', null, 51),
  ('supermarket', null, 'tag', 'conforto', null, 51),
  ('pharmacy', null, 'tag', 'conforto', null, 51),
  ('food and drinks', null, 'tag', 'conforto', null, 51),
  ('gas stations', null, 'tag', 'conforto', null, 51),
  ('public transportation', null, 'tag', 'conforto', null, 51),
  ('taxi and ride-hailing', null, 'tag', 'conforto', null, 51),
  ('vehicle maintenance', null, 'tag', 'conforto', null, 51),
  ('parking', null, 'tag', 'conforto', null, 51),
  ('wellness and fitness', null, 'tag', 'conforto', null, 51),
  ('kids and toys', null, 'tag', 'conforto', null, 51),
  ('houseware', null, 'tag', 'conforto', null, 51),
  -- Prazeres
  ('food delivery', null, 'tag', 'prazeres', null, 52),
  ('eating out', null, 'tag', 'prazeres', null, 52),
  ('restaurants', null, 'tag', 'prazeres', null, 52),
  ('digital services', null, 'tag', 'prazeres', null, 52),
  ('video streaming', null, 'tag', 'prazeres', null, 52),
  ('shopping', null, 'tag', 'prazeres', null, 52),
  ('clothing', null, 'tag', 'prazeres', null, 52),
  ('bookstore', null, 'tag', 'prazeres', null, 52),
  ('electronics', null, 'tag', 'prazeres', null, 52),
  ('leisure', null, 'tag', 'prazeres', null, 52),
  ('cinema, theater and concerts', null, 'tag', 'prazeres', null, 52),
  ('tickets', null, 'tag', 'prazeres', null, 52),
  -- Liberdade Financeira (previdência e aportes)
  ('pension', null, 'tag', 'liberdade-financeira', null, 53),
  ('brasilprev', null, 'tag', 'liberdade-financeira', null, 53),
  ('investments', null, 'tag', 'liberdade-financeira', null, 53),
  ('mutual funds', null, 'tag', 'liberdade-financeira', null, 53),
  ('fixed income', null, 'tag', 'liberdade-financeira', null, 53)
on conflict do nothing;
