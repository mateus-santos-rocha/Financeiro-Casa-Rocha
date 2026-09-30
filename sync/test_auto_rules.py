from auto_rules import compute_roll, rule_matches
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


def test_salario_lais():
    r = {"match": "pediatherapies", "bank": None, "action": "tag"}
    assert rule_matches(r, "Transferência Recebida|Pediatherapies Clinica De Fisioterapia E Reabil", "nubank")
    assert not rule_matches(r, "PAGAMENTO DE SALARIO", "bv")


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
