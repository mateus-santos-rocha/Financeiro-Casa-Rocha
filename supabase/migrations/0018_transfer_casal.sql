-- 0018_transfer_casal.sql — transferências do casal e entre contas próprias.
-- Lado dela -> ele ("Transferência enviada|Mateus Santos Rocha") e lado dele
-- <- ela ("Transferência Recebida|Lais Coutinho de Souza Rocha") são o mesmo
-- dinheiro trocando de conta, não receita/despesa.
-- O próprio nome como contraparte ("Mateus Santos Rocha" no BV/BB/Nubank dele,
-- "Lais Coutinho de Souza Rocha" na conta dela) indica deslocamento entre
-- contas próprias, mesmo quando a conta destino não está conectada.
-- Exceção consciente: "PAGAMENTO DE SALARIO" (receita) não casa com as regras.
insert into public.auto_rules (match, bank, action, tag_name, invest_name, priority) values
  ('mateus santos rocha', null, 'tag', 'transferencia-interna', null, 34),
  ('lais coutinho de souza rocha', null, 'tag', 'transferencia-interna', null, 35)
on conflict do nothing;
