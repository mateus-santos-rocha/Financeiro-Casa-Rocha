-- 0022_drop_installments.sql — remove o rateio manual de parcelas (0022).
-- Decisão do dono: confiar no conector, que já informa installmentNumber/
-- totalInstallments e entrega cada parcela no seu mês. Tabela nunca chegou a
-- ter linhas (nenhum plano foi criado). `if exists` = seguro mesmo se a 0022
-- nunca foi aplicada.
drop table if exists public.installment_plans;
