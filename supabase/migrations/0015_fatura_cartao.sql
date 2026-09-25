-- 0015_fatura_cartao.sql — o outro lado do pagamento (categoria do cartão, em inglês).
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('credit card payment', null, 'tag', 'transferencia-interna', null, 33)
on conflict do nothing;
