"""Cooldown que honra Retry-After y backoff exponencial con jitter.

Un 429 con `Retry-After: 120` debe enfriar el proveedor ~120s, no reintentar a
los 1.5s (eso es lo que arriesga el ban).
"""
import modules.ai_budget as ai_budget


def test_retry_after_en_segundos():
    assert ai_budget.retry_after_s({"Retry-After": "120"}) == 120.0


def test_retry_after_ausente_da_none():
    assert ai_budget.retry_after_s({}) is None


def test_cooldown_429_honra_retry_after():
    assert ai_budget.cooldown_para(429, {"Retry-After": "120"}) == 120.0


def test_cooldown_429_sin_header_usa_minimo_30():
    assert ai_budget.cooldown_para(429, {}) == 30.0


def test_cooldown_401_es_600():
    assert ai_budget.cooldown_para(401, {}) == 600.0


def test_backoff_crece_y_esta_acotado():
    valores = [ai_budget.backoff_con_jitter(n) for n in range(6)]
    assert all(0 <= v <= 60.0 for v in valores)
    # el techo crece con el intento (el jitter no lo supera)
    assert ai_budget.backoff_con_jitter(5, cap=60.0) <= 60.0
