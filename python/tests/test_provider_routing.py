"""El ruteo de especialidades tiene que tener providers que respondan.

El 2026-09-27 la sonda encontro que las tres especialidades caian: FAST apuntaba
a Groq (key invalida) y Cerebras (404 en todos los gratuitos), HEAVY a Gemini
(401), NVIDIA NIM (410, modelo muerto) y OpenRouter (402 sin credito). El unico
proveedor que respondia, ZenMux, no estaba en HEAVY ni en FAST, y su modelo
configurado estaba retirado del catalogo.

Este test no pega contra la red —eso no puede ser un test— sino que fija las dos
cosas que SÍ se pueden verificar sin red: que toda especialidad tenga al menos un
proveedor ordenado que hoy responde, y que el orden ponga a los vivos primero.
La sonda viva vive en `probe_providers.py`.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from modules.ai_client import PROVIDER_SPECIALTIES  # noqa: E402

# Estado verificado por sonda el 2026-09-27 con `tools/llm_connect.py`, que carga
# `.env` COMO HACE LA APP. Sin ese load la sonda lee el entorno del proceso, que
# es un subconjunto, y reporta "SIN KEY" de proveedores que si la tienen: ya
# paso y dio un diagnostico equivocado.
#
# Un proveedor sale de aca cuando deja de responder; entra cuando se le agrega
# una key. Actualizar esta lista y la tabla de arriba JUNTAS.
#
# Un proveedor NO sale por estar lento ni por dar 429 una vez. Sale por un error
# que no se arregla esperando:
#   410 = modelo retirado   401 = key invalida   402 = sin credito
#   DNS = endpoint muerto   404 = modelo sin despliegue en la cuenta
RESPONDEN = {"zenmux", "aion", "kilocode", "ollama_cloud", "huggingface"}
MUERTOS = {"nvidia_nim", "groq", "gemini", "openrouter", "cerebras", "mistral",
           "opencodezen", "cloudflare", "modelscope", "sambanova", "agnes_ai"}


def test_toda_especialidad_tiene_un_proveedor_que_responde():
    for esp, ids in PROVIDER_SPECIALTIES.items():
        vivos = [i for i in ids if i in RESPONDEN]
        assert vivos, (
            f"{esp} no tiene ningun proveedor vivo. "
            f"Orden actual: {ids}. Sonda: python tools/llm_probe.py"
        )


def test_el_primer_proveedor_de_cada_especialidad_responde():
    # El orden es el failover: el primero que se prueba es el que gana. Si el
    # primero esta muerto, cada request paga su error antes de llegar al bueno.
    for esp, ids in PROVIDER_SPECIALTIES.items():
        primero = next((i for i in ids if i in RESPONDEN or i not in MUERTOS), None)
        assert primero == ids[0], (
            f"{esp} empieza probando {ids[0]}, que no responde. "
            f"El primero vivo es {primero}."
        )


def test_los_muertos_no_lideran_ninguna_especialidad():
    for esp, ids in PROVIDER_SPECIALTIES.items():
        lider = ids[0]
        assert lider not in MUERTOS, f"{esp} empieza por {lider}, que esta muerto"


def test_toda_especialidad_conserva_su_respaldo():
    # Un unico proveedor vivo es un punto unico de falla: si se cae el throttling
    # o se vence la cuota, la especialidad entera cae.
    for esp, ids in PROVIDER_SPECIALTIES.items():
        assert len(ids) >= 3, f"{esp} tiene {len(ids)} proveedores: no aguanta una caida"


def test_el_proveedor_vivo_usa_un_modelo_free():
    """Un modelo de frontera en una key de free tier es un error de ruteo.

    La cuota de esta cuenta solo cubre unos pocos modelos del catalogo de
    ZenMux y todos los demas dan 402 sin credito. El default tiene que ser uno
    que responda SIN pagar: para corregir prosa y registrar conectores, un
    flash chico alcanza y uno caro se come el presupuesto de una vez.

    ESTA PRUEBA ESTABA ROTA EN LIMPIO, Y NO POR EL MODELO. Leia el `ZENMUX_MODEL`
    DEL ENTORNO sin decir nada, asi que en una maquina con la variable puesta
   probaba el modelo de quien la puso, no el default del repositorio. En una
    instalacion limpia no tenia key y fallaba antes de llegar al modelo. Las dos
    cosas son el mismo defecto: la prueba no aislaba lo que decia medir.

    Ahora mide el default DEL REPOSITORIO: borra la variable, deja la key que
    haya, y mira lo que sale de la entrada del proveedor. Y saltea si no hay
    ninguna key en el entorno, porque sin key no hay nada que afirmar.
    """
    import os

    if not os.getenv("ZENMUX_API_KEY", "").strip():
        import pytest
        pytest.skip(
            "sin ZENMUX_API_KEY: no hay cuenta querazine. El modelo por defecto "
            "del repositorio es 'z-ai/glm-4.6v-flash-free' y lo fija "
            "`python/classification/llm_classifier.py`."
        )

    from classification.llm_classifier import _get_active_providers

    previo = os.environ.pop("ZENMUX_MODEL", None)
    try:
        zens = [p for p in _get_active_providers(None, None, False) if p["id"] == "zenmux"]
    finally:
        if previo is not None:
            os.environ["ZENMUX_MODEL"] = previo
    assert zens, "zenmux no tiene key: la sonda y el catalogo estan desfasados"
    modelo = zens[0]["model"]
    assert "free" in modelo.lower() or "flash" in modelo.lower() or "mini" in modelo.lower(), (
        f"El modelo por defecto de zenmux es {modelo!r}. Si dejaste de usar el "
        f"free porque te quedaste sin cuota, cambia ZENMUX_MODEL y actualiza "
        f"esta lista; no subas a un modelo de frontera en una key gratuita."
    )


def test_el_default_de_zenmux_no_lo_cambia_el_entorno_de_quien_desarrolla(monkeypatch):
    """La otra mitad, y la que hace que la de arriba sirva.

    Con la variable puesta, el motor usa lo que puso el usuario: eso es lo
    correcto y no se toca. Con la variable ausente, el motor usa el default del
    repositorio, y ESO es lo que tiene que ser un modelo free. Son dos
    afirmaciones distintas, y confundirlas es lo que hacia que la prueba
    anterior no midiera nada.
    """
    from classification.llm_classifier import _get_active_providers

    monkeypatch.setenv("ZENMUX_API_KEY", "clave-de-prueba")
    monkeypatch.delenv("ZENMUX_MODEL", raising=False)

    zenmux = [p for p in _get_active_providers() if p["id"] == "zenmux"][0]

    assert zenmux["model"] == "z-ai/glm-4.6v-flash-free"
