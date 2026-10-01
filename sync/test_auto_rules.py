from auto_rules import compute_roll, find_pix_pairs, find_reversal_pairs, find_salary_advances, rule_matches
from normalize import inv_indexer, inv_issuer, inv_maturity, inv_rate


def test_tag_match_bank():
    r = {"match": "resgate de cashback", "bank": "nubank", "action": "tag"}
    assert rule_matches(r, "Resgate de Cashback — Nubank", "nubank")
    assert not rule_matches(r, "Resgate de Cashback", "bb")
    assert not rule_matches(r, "Pagamento fatura", "nubank")


def test_invest_match_any_bank():
    r = {"match": "compra de criptomoedas", "bank": None, "action": "invest"}
    assert rule_matches(r, "COMPRA DE CRIPTOMOEDAS 12/09", "nubank")
    assert rule_matches(r, "compra de criptomoedas", "bb")
    assert not rule_matches(r, "compra no mercado", "nubank")
    assert not rule_matches({"match": "", "bank": None}, "qualquer", "nubank")


def test_match_por_categoria():
    r = {"match": "credit card payment", "bank": None, "action": "tag"}
    assert rule_matches(r, "Pagamento recebido", "nubank", "Credit card payment")
    assert not rule_matches(r, "Pagamento recebido", "nubank", "Transfers")


def test_transfer_casal_e_propria():
    enviada = {"match": "mateus santos rocha", "bank": None, "action": "tag"}
    assert rule_matches(enviada, "Transferência enviada|Mateus Santos Rocha", "nubank")
    assert rule_matches(enviada, "PIX - ENVIADO   08/10 09:46 Mateus Santos Rocha", "bb")
    assert rule_matches(enviada, "Mateus Santos Rocha", "bv")
    recebida = {"match": "lais coutinho de souza rocha", "bank": None, "action": "tag"}
    assert rule_matches(recebida, "Transferência Recebida|Lais Coutinho de Souza Rocha", "nubank")
    assert rule_matches(recebida, "Transferência enviada|LAIS COUTINHO DE SOUZA ROCHA", "nubank")
    # salário não é transferência interna
    assert not rule_matches(enviada, "PAGAMENTO DE SALARIO", "bv")
    assert not rule_matches(recebida, "PAGAMENTO DE SALARIO", "bv")


def test_match_sem_acento():
    # Laís (com acento) casa com a regra sem acento; parentes Coutinho, não.
    r = {"match": "lais coutinho", "bank": None, "action": "tag"}
    assert rule_matches(r, "Transferência enviada|Laís Coutinho de Souza", "nubank")
    assert rule_matches(r, "Transferência enviada|LAIS COUTINHO DE SOUZA ROCHA", "nubank")
    assert not rule_matches(r, "Transferência Recebida|Marilia Coutinho de Souza Rachel", "nubank")
    assert not rule_matches(r, "Transferência Recebida|Prescila Coutinho Pereira de Souza", "nubank")


def test_salario_lais():
    r = {"match": "pediatherapies", "bank": None, "action": "tag"}
    assert rule_matches(r, "Transferência Recebida|Pediatherapies Clinica De Fisioterapia E Reabil", "nubank")
    assert not rule_matches(r, "PAGAMENTO DE SALARIO", "bv")
    rocha = {"match": "rocha solucoes", "bank": None, "action": "tag"}
    assert rule_matches(rocha, "Transferência Recebida|ROCHA SOLUCOES", "nubank")
    assert rule_matches(rocha, "Transferência Recebida|ROCHA SOLUCOES LTDA", "nubank")


def test_feminae_conforto():
    r = {"match": "feminae", "bank": None, "action": "tag"}
    assert rule_matches(r, "Transferência enviada|FEMINAE - ASSISTENCIA MEDICA S/S.", "nubank")
    assert rule_matches(r, "Jim.Com* Feminae Ass", "nubank")


def test_grupos_pessoais():
    b = {"match": "bianca de souza oros ferreira", "bank": None, "action": "tag"}
    assert rule_matches(b, "Transferência enviada|BIANCA DE SOUZA OROS FERREIRA", "nubank")
    c = {"match": "claudia regina martins de oliveira", "bank": None, "action": "tag"}
    assert rule_matches(c, "Transferência enviada|Claudia Regina Martins de Oliveira", "nubank")
    d = {"match": "cdb", "bank": None, "action": "tag"}
    assert rule_matches(d, "CDB 120 CDI", "bv")
    assert rule_matches(d, "COMPRA - CDB LECCA CREDITO", "btg")
    assert not rule_matches(d, "PAGAMENTO DE SALARIO", "bv")


def test_personal_conforto():
    r = {"match": "guilherme roberto oliveira", "bank": None, "action": "tag"}
    assert rule_matches(r, "Transferência enviada|GUILHERME ROBERTO OLIVEIRA ESTAVA", "nubank")


def test_reversal_pairs():
    rows = [
        {"id": "d1", "account_id": "a", "date": "2026-05-09", "description": "BRASILPREV SEG", "amount": -100},
        {"id": "c1", "account_id": "a", "date": "2026-05-09", "description": "ESTORNO DEBITO BRASILPREV SEG", "amount": 100},
        {"id": "d2", "account_id": "a", "date": "2026-05-20", "description": "BRASILPREV SEG", "amount": -100},
        {"id": "d3", "account_id": "a", "date": "2026-06-01", "description": "BRASILPREV SEG", "amount": -100},  # sem par (>7d)
        {"id": "x1", "account_id": "a", "date": "2026-05-10", "description": "Compra mercado", "amount": -100},
        {"id": "d4", "account_id": "b", "date": "2026-05-09", "description": "BRASILPREV SEG", "amount": -100},  # outra conta
    ]
    pairs = find_reversal_pairs(rows)
    assert ("d1", "c1") in pairs
    assert len(pairs) == 1


def test_reversal_implicit_credit():
    # estorno sem a palavra "estorno": só vale se posterior ao débito
    rows = [
        {"id": "d", "account_id": "a", "date": "2026-09-09", "description": "BRASILPREV SEG", "amount": -104.39},
        {"id": "c", "account_id": "a", "date": "2026-09-11", "description": "BRASILPREV 27.665 SEG", "amount": 104.39},
        {"id": "d2", "account_id": "a", "date": "2026-09-11", "description": "BRASILPREV SEG", "amount": -104.39},
        {"id": "c2", "account_id": "a", "date": "2026-09-09", "description": "BRASILPREV 27.665 SEG", "amount": 104.39},
    ]
    pairs = find_reversal_pairs(rows)
    assert ("d", "c") in pairs  # crédito 2 dias depois casa
    assert len(pairs) == 1  # crédito anterior ao débito não casa


def test_salary_advance_pairing():
    sal = "PAGAMENTO DE SALARIO"
    rows = [
        {"id": "adv-jul", "date": "2026-06-30", "description": sal, "amount": 3382.79},
        {"id": "base-jul", "date": "2026-07-26", "description": sal, "amount": 4200.0},
        {"id": "adv-abr", "date": "2026-04-03", "description": sal, "amount": 3279.43},  # mesmo mês: fica
        {"id": "base-abr", "date": "2026-04-22", "description": sal, "amount": 4200.0},
        {"id": "adv-jun", "date": "2026-05-29", "description": sal, "amount": 8558.23},  # adianto + benefícios
        {"id": "base-jun", "date": "2026-06-21", "description": sal, "amount": 4200.0},
        {"id": "adv-mar", "date": "2026-02-26", "description": sal, "amount": 12599.50},  # adianto + benefícios
        {"id": "base-mar", "date": "2026-03-23", "description": sal, "amount": 4200.0},
    ]
    assert find_salary_advances(rows) == ["adv-mar", "adv-jun", "adv-jul"]


def test_pix_pairs():
    out_gen = {"id": "o1", "account_id": "nb", "holder": "voce", "date": "2026-01-09",
               "description": "Transferência enviada pelo Pix", "amount": -2888.42}
    in_self = {"id": "i1", "account_id": "bb", "holder": "voce", "date": "2026-01-09",
               "description": "PIX - RECEBIDO 09/01 15:15 00039343041845 MATEUS SANT", "amount": 2888.42}
    out_named = {"id": "o2", "account_id": "nb", "holder": "voce", "date": "2026-07-27",
                 "description": "Transferência enviada|Mateus Santos Rocha", "amount": -1000.0}
    in_cred = {"id": "i2", "account_id": "btg", "holder": "voce", "date": "2026-07-30",
               "description": "TRANSFERÊNCIA A CRÉDITO VIA PIX", "amount": 2000.0}
    out_named2 = {"id": "o3", "account_id": "nb", "holder": "voce", "date": "2026-07-30",
                  "description": "Transferência enviada|Mateus Santos Rocha", "amount": -2000.0}
    merch = {"id": "m1", "account_id": "nb", "holder": "voce", "date": "2026-09-02",
             "description": "Transferência enviada pelo Pix", "amount": -4.18}
    fuel = {"id": "f1", "account_id": "nb", "holder": "voce", "date": "2026-04-24",
            "description": "Ec Shellbox", "amount": -253.55}
    fuel_in = {"id": "f2", "account_id": "nb2", "holder": "esposa", "date": "2026-04-24",
               "description": "Transferência Recebida|Auto Posto", "amount": 253.55}
    rows = [out_gen, in_self, out_named, in_cred, out_named2, merch, fuel, fuel_in]
    internal = {"o2", "o3"}  # saídas nomeadas já marcadas
    pairs = find_pix_pairs(rows, internal_ids=internal)
    assert ("o1", "i1") in pairs  # genérico + recebido com nome
    assert ("o3", "i2") in pairs  # crédito sem nome, saída interna ancora
    assert len(pairs) == 2  # comerciante e posto x reembolso ficam de fora


def test_compute_roll():
    qty, inv, cur = compute_roll(0.0, 0.0, 500.0, 500000.0)
    assert abs(qty - 0.001) < 1e-9
    assert inv == 500.0
    assert cur == 500.0
    qty2, inv2, cur2 = compute_roll(qty, inv, 250.0, 500000.0)
    assert abs(qty2 - 0.0015) < 1e-9
    assert inv2 == 750.0
    assert cur2 == 750.0


def test_inv_indexer_rate_maturity():
    cdb = {"rateType": "CDI", "rate": 120, "fixedAnnualRate": None, "dueDate": "2027-07-06T03:00:00.000Z"}
    assert inv_indexer(cdb) == "CDI"
    assert inv_rate(cdb) == "120% CDI"
    assert inv_maturity(cdb) == "2027-07-06"
    lft = {"rateType": "SELIC", "rate": 100, "fixedAnnualRate": 0.1, "dueDate": "2031-03-01T03:00:00.000Z"}
    assert inv_indexer(lft) == "SELIC"
    assert inv_rate(lft) == "100% SELIC + 0,1% a.a."
    assert inv_maturity(lft) == "2031-03-01"
    pre = {"rateType": None, "rate": 0, "fixedAnnualRate": 12.56, "dueDate": "2028-06-09T03:00:00.000Z"}
    assert inv_indexer(pre) == "PREFIXADO"
    assert inv_rate(pre) == "12,56% a.a. prefixado"
    assert inv_maturity({"dueDate": None}) is None
    assert inv_indexer({"rateType": None, "fixedAnnualRate": 0}) is None
    spread = {"rateType": "SELIC", "rate": 0.0742, "fixedAnnualRate": 0, "dueDate": "2031-03-01T03:00:00.000Z"}
    assert inv_indexer(spread) == "SELIC"
    assert inv_rate(spread) == "SELIC + 0,0742% a.a."


def test_inv_issuer_tesouro():
    assert inv_issuer({"issuer": "Banco X", "name": "CDB", "subtype": "CDB"}) == "Banco X"
    assert inv_issuer({"issuer": {"name": "Banco Y"}, "name": "CDB", "subtype": "CDB"}) == "Banco Y"
    assert inv_issuer({"issuer": None, "name": "Tesouro Selic 2031", "subtype": "TREASURY"}) == "Tesouro Nacional"
    assert inv_issuer({"issuer": None, "name": "TESOURO DIRETO - LFT", "subtype": "OTHER"}) == "Tesouro Nacional"
    assert inv_issuer({"issuer": None, "name": "AUPO11", "subtype": "STOCK"}) is None
