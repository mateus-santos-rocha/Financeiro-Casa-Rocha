-- 0014_fatura.sql — pagamento de fatura do cartão vira transferência interna.
-- As compras no crédito já contam como despesa na data da compra (competência);
-- o pagamento da fatura é só deslocamento entre contas próprias.
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('pagamento de fatura', null, 'tag', 'transferencia-interna', null, 30),
  ('pagto fatura', null, 'tag', 'transferencia-interna', null, 31),
  ('pgto fatura', null, 'tag', 'transferencia-interna', null, 32)
on conflict do nothing;
