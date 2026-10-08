import asyncio
import time

import modules.ai_client as ai_client


def setup_function():
    ai_client._provider_breaker.clear()


def test_abre_tras_n_fallos_y_bloquea():
    for _ in range(ai_client._BREAKER_THRESHOLD):
        ai_client._breaker_record("zenmux", ok=False)
    assert ai_client._breaker_estado("zenmux")["state"] == "open"
    assert ai_client._breaker_allows("zenmux") is False


def test_pasa_a_half_open_tras_el_cooldown():
    for _ in range(ai_client._BREAKER_THRESHOLD):
        ai_client._breaker_record("zenmux", ok=False)
    ai_client._provider_breaker["zenmux"]["opened_at"] = (
        time.time() - ai_client._BREAKER_COOLDOWN_S - 1
    )
    assert ai_client._breaker_estado("zenmux")["state"] == "half_open"
    assert ai_client._breaker_allows("zenmux") is True


def test_exito_cierra_el_breaker():
    for _ in range(ai_client._BREAKER_THRESHOLD):
        ai_client._breaker_record("zenmux", ok=False)
    ai_client._breaker_record("zenmux", ok=True)
    assert ai_client._breaker_estado("zenmux")["state"] == "closed"
    assert ai_client._breaker_allows("zenmux") is True


def test_health_expone_breaker():
    for _ in range(ai_client._BREAKER_THRESHOLD):
        ai_client._breaker_record("zenmux", ok=False)
    salud = ai_client.get_ai_system_health()
    assert salud["FAST"]["breaker"] == "open"


def test_fallback_con_bucket_lleno_no_atropella(monkeypatch):
    monkeypatch.setattr(
        ai_client, "_get_active_providers",
        lambda *a, **k: [{"id": "zenmux", "name": "ZenMux", "model": "m"}],
    )

    class BucketLleno:
        async def consume(self, tokens=1):
            return False

    monkeypatch.setattr(
        ai_client._limiter_registry, "get_bucket", lambda *a, **k: BucketLleno()
    )

    async def intento():
        try:
            await ai_client.execute_with_specialty(
                "p", "s", specialty="FAST", use_cache=False
            )
            return "no-lanzo"
        except RuntimeError:
            return "runtime"

    assert asyncio.run(intento()) == "runtime"
