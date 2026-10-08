"""Limites reales por proveedor y presupuesto diario.

El router no debe abusar de un proveedor: esta capa declara los limites del
plan gratuito vigente y raciona el consumo por usuario (fraccion del free tier).
"""
import modules.ai_budget as ai_budget


def test_limites_reales_cubren_los_proveedores_conocidos():
    for p in ["groq", "openrouter", "cerebras", "gemini", "cloudflare", "nvidia_nim"]:
        assert p in ai_budget.LIMITES_REALES, f"falta {p}"


def test_groq_tiene_rpd_del_free_tier():
    # Free tier ejemplo: 30 RPM, 1000 RPD, 8000 TPM, 200000 TPD.
    g = ai_budget.LIMITES_REALES["groq"]
    assert g["rpm"] == 30
    assert g["rpd"] == 1000
    assert g["tpm"] == 8000
    assert g["tpd"] == 200000


def test_proveedor_desconocido_es_conservador_y_sin_rpd():
    assert ai_budget.limite("proveedor_inexistente", "rpd") is None
    # Sin dato no se inventa un limite duro; el default es None (no bloquea por rpd).
    assert ai_budget.limite("proveedor_inexistente", "rpm", default=5) == 5


def test_presupuesto_raciona_al_45_por_ciento():
    p = ai_budget.PresupuestoDiario(fraccion_de_cupo=0.45)
    assert p.cupo("groq") == 450  # 1000 * 0.45
    for _ in range(450):
        assert p.puede("groq")
        p.registrar("groq")
    assert not p.puede("groq")
    assert p.restante("groq") == 0


def test_presupuesto_sin_rpd_no_bloquea():
    p = ai_budget.PresupuestoDiario()
    assert p.puede("mistral")  # rpd None -> no bloquea


def test_router_salta_proveedor_sin_presupuesto(monkeypatch):
    """El router no debe golpear un proveedor cuyo cupo diario ya se agoto.

    Se agota el preferente de FAST y se comprueba que el router elige el
    siguiente proveedor disponible en vez de llamarlo igual.
    """
    import asyncio
    import sys
    from pathlib import Path

    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from modules import ai_client

    # Proveedores de prueba: dos con clave puesta, el primero con cupo agotado.
    proveedores = [
        {"id": "groq", "name": "Groq", "url": "https://api.groq.com/openai/v1/chat/completions",
         "model": "m", "key": "k", "headers": lambda k: {"Authorization": f"Bearer {k}"}},
        {"id": "openrouter", "name": "OpenRouter", "url": "https://openrouter.ai/api/v1/chat/completions",
         "model": "m", "key": "k", "headers": lambda k: {"Authorization": f"Bearer {k}"}},
    ]
    monkeypatch.setattr(ai_client, "_get_active_providers", lambda *a, **k: proveedores)

    class PresupuestoQueRechazaGroq:
        def puede(self, p_id: str) -> bool:
            return p_id != "groq"

        def registrar(self, p_id: str, *a) -> None:
            pass

    monkeypatch.setattr(ai_client, "_presupuesto", PresupuestoQueRechazaGroq())

    llamados = []

    async def _try_provider_falso(provider, payload, timeout, retries=1):
        llamados.append(provider["id"])
        return {"choices": [{"message": {"content": "ok"}}]}

    monkeypatch.setattr(ai_client, "_try_provider", _try_provider_falso)
    # El breaker no debe entorpecer: arranca limpio.
    monkeypatch.setattr(ai_client, "_breaker_allows", lambda p_id: True)
    monkeypatch.setattr(ai_client, "_breaker_record", lambda p_id, ok: None)

    salida = asyncio.run(
        ai_client.execute_with_specialty("hola", "system", specialty="FAST", use_cache=False)
    )

    assert salida == "ok"
    assert llamados == ["openrouter"], f"no debe tocar groq: {llamados}"

