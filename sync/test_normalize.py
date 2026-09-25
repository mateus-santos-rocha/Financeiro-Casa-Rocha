from normalize import normalize_amount, display_category


def test_debit_positivo_vira_negativo():
    assert normalize_amount(100, "DEBIT") == -100


def test_credit_negativo_vira_positivo():
    assert normalize_amount(-100, "CREDIT") == 100


def test_override_prevalece():
    assert display_category("Alimentação", "Food") == "Alimentação"
    assert display_category(None, "Food") == "Food"
    assert display_category(None, None) == "Sem categoria"
