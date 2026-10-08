"""El refinamiento de ortografía pasa por el router, y corre con los cinco
proveedores que el repo declara vivos.

`refine_with_llm` era el único motor del producto que NO llamaba a
`execute_with_specialty`: pegaba directo a `integrate.api.nvidia.com` con
`requests.post`, con el modelo quemado en el código, ignorando
`NVIDIA_NIM_MODEL`, y su consumidor leía `os.getenv("NVIDIA_API_KEY")` en vez de
lo que había llegado en el request. Y como era una función **sincrónica** llamada
desde un endpoint `async`, la llamada de red bloqueaba el event loop del backend
entero mientras la red contestaba.

Las dos consecuencias, en orden de daño:

- Un usuario con ZenMux, Aion, Kilo, Ollama Cloud o HuggingFace —los cinco que
  `_get_active_providers` declara vivos— obtiene CERO refinamiento, y esa es la
  auditoría que dispara al abrir el documento.
- Mientras el corrector espera, el backend no atiende nada: dos peticiones
  simultáneas se serializan.

Estas pruebas no tocan la red. El cliente del router se inyecta por parámetro
(`_router`), igual que antes lo hacía el transporte (`_post`), y el doble registra
qué recibió.
"""

import asyncio
import sys
import time
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import ElementModel, ElementType  # noqa: E402
from modules import audit_registry  # noqa: E402
from modules import proactive_auditor as pa  # noqa: E402

# Los cinco que el repo declara vivos: son los que Contestan, los que están en
# FAST/HEAVY/REASONING y los que el comentario de `ai_client.PROVIDER_SPECIALTIES`
# llama "los únicos que responden".
PROVEEDORES_VIVOS = ["zenmux", "aion", "kilocode", "ollama_cloud", "huggingface"]

# La variable de entorno que `_get_active_providers` lee para cada uno. Se usa
# para poner UNA clave y comprobar que el proveedor queda realmente disponible:
# sin esto, el test afirmaría que el router corrió con algo que nunca existió.
ENV_DE_CADA_UNO = {
    "zenmux": "ZENMUX_API_KEY",
    "aion": "AION_API_KEY",
    "kilocode": "KILOCODE_API_KEY",
    "ollama_cloud": "OLLAMA_API_KEY",
    "huggingface": "HUGGINGFACE_API_KEY",
}

# Todas las variables que `_get_active_providers` consulta. El test las borra una
# por una: si queda una sola, el motor puede encontrar otro proveedor y la
# afirmación "este proveedor corrió" dejaría de ser sobre este.
TODAS_LAS_CLAVES = [
    "NVIDIA_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY",
    "MISTRAL_API_KEY", "OPENCODEZEN_API_KEY", "ZENMUX_API_KEY", "GEMINI_API_KEY",
    "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "AION_API_KEY",
    "KILOCODE_API_KEY", "OLLAMA_API_KEY", "HUGGINGFACE_API_KEY",
]

TEXTO = "deberia tambien"


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    """Sin ninguna clave del entorno, y con el registro de consultas limpio.

    El registro es de módulo y vive entre pruebas: sin limpiarlo, un veredicto
    de la prueba anterior aparecería como "ya consultado" y el motor ni
    preguntaría.
    """
    for var in TODAS_LAS_CLAVES:
        monkeypatch.delenv(var, raising=False)
    audit_registry._EN_MEMORIA.clear()
    yield
    audit_registry._EN_MEMORIA.clear()


def _elementos():
    return [ElementModel(id="e1", type=ElementType.PARAGRAPH, text=TEXTO)]


def _hallazgos():
    start = TEXTO.index("deberia")
    return [{
        "element_id": "e1",
        "start": start,
        "end": start + len("deberia"),
        "excerpt": TEXTO[start:start + 14],
        "kind": "ortografia",
        "severity": "error",
        "message": "Falta tilde",
        "source": "local",
        "phase": "global",
        "read_only": False,
    }]


# Un veredicto con `keep: false` y sugerencia es el unico caso en que el motor
# CAMBIA el hallazgo: `keep: true` deja el hallazgo tal cual y descarta lo que
# vieran en `suggestion`. Se usa este porque es el que prueba que la respuesta
# del corrector llego de verdad al hallazgo, y no solo que la llamada salio.
VEREDICTO_CON_SUGERENCIA = '[{"i":0,"keep":false,"suggestion":"debería"}]'


def _router_que_responde(llamadas, contenido=VEREDICTO_CON_SUGERENCIA):
    """Un cliente del router falso: registra lo que recibió y devuelve un sobre."""
    async def router(prompt, **kw):
        llamadas.append({"prompt": prompt, **kw})
        return contenido
    return router


def _refinar(*args, **kw):
    return asyncio.run(pa.refine_with_llm(*args, **kw))


# ------------------------------------------- el Review Focus #1: los cinco vivos
@pytest.mark.parametrize("provider", PROVEEDORES_VIVOS)
def test_el_refinamiento_corre_con_cada_proveedor_vivo(provider, monkeypatch):
    """Con la clave de CADA uno de los cinco, el motor corre.

    Antes leía `os.getenv("NVIDIA_API_KEY")`: sin esa variable el motor no
    entraba, y con ella pegaba a NIM. Un usuario de los otros cinco obtains
    CERO refinamiento, que es la auditoría que dispara al abrir el documento.
    """
    env_var = ENV_DE_CADA_UNO[provider]
    monkeypatch.setenv(env_var, f"clave-de-{provider}")

    llamadas = []
    router = _router_que_responde(llamadas)

    out, usado = _refinar(_hallazgos(), _elementos(), f"clave-de-{provider}",
                          provider_id=provider, _router=router)

    # 1. El motor вопросó al router (antes no lo conocía).
    assert len(llamadas) == 1, f"{provider}: el refinamiento no pasó por el router"
    # 2. Le dijo a QUIÉN: la elección viaja, no se adivina.
    assert llamadas[0]["provider_id"] == provider
    # 3. Y la clave que usó es la del request, no la que hubiera en el entorno.
    assert llamadas[0]["api_key"] == f"clave-de-{provider}"
    # 4. La respuesta se aplicó: la sugerencia del corrector está en el hallazgo.
    assert usado is True
    assert out[0]["suggestion"] == "debería"


@pytest.mark.parametrize("provider", PROVEEDORES_VIVOS)
def test_el_proveedor_elegido_existe_de_verdad_para_el_router(provider, monkeypatch):
    """El paso anterior no es una tautología: la clave del request SÍ llega al
    registro de proveedores.

    Sin esta mitad, "el motor corrió con zenmux" se podría afirmar con el router
    roto: `refine_with_llm` pasaría `provider_id`, `execute_with_specialty`
    levantaría `Proveedor no configurado` y el `except` devolvería los hallazgos
    intactos. Acá se comprueba el otro lado: con esa clave puesta, el proveedor
    entra en la lista que el router recorre.
    """
    from classification.llm_classifier import _get_active_providers

    monkeypatch.setenv(ENV_DE_CADA_UNO[provider], f"clave-de-{provider}")

    activos = _get_active_providers(f"clave-de-{provider}", None, False, provider)

    assert [p["id"] for p in activos] == [provider]


def test_el_refinamiento_toma_la_clave_del_request_y_no_del_entorno(monkeypatch):
    """`NVIDIA_API_KEY` en el entorno no decide nada.

    El defecto era que el CONSUMIDOR leía la variable de entorno y le pasaba esa
    al motor. Con NVIDIA puesta en el entorno y la clave de Aion en el request,
    lo que tiene que viajar es la de Aion.
    """
    monkeypatch.setenv("NVIDIA_API_KEY", "clave-nvidia-del-entorno")

    llamadas = []
    _refinar(_hallazgos(), _elementos(), "clave-de-aion-del-request",
             provider_id="aion", _router=_router_que_responde(llamadas))

    assert llamadas[0]["api_key"] == "clave-de-aion-del-request"


def test_el_modelo_quemado_desaparecio(monkeypatch):
    """El motor no vuelve a decidir el modelo: eso es del router y de la
    entrada del proveedor, que ya lee `NVIDIA_NIM_MODEL` con default."""
    llamadas = []
    _refinar(_hallazgos(), _elementos(), "k", provider_id="zenmux",
             _router=_router_que_responde(llamadas))

    # El router arma el payload; el motor solo manda el prompt. Si aparece un
    # modelo en lo que el motor pasa, el quemado volvió.
    assert "model" not in llamadas[0]


# ---------------------------------------- el Review Focus #2: el event loop
def test_el_refinamiento_no_bloquea_el_event_loop():
    """Dos refinamientos simultáneos se solapan en el tiempo.

    El defecto era `requests.post` sincrónico —además dentro de un `async def`—
    esperando la red. Con eso, el backend entero queda parado: la segunda
    petición no empieza hasta que la primera termina de contestar.

    La prueba no mide tiempos: usa una barrera. Cada llamada entra al router
    falso y espera un `Event` que solo se dispara cuando las DOS llegaron. Si se
    serializaran, la primera esperaría para siempre y el `wait_for` vencería.
    Es la diferencia entre "tardó el doble" (frágil) y "no hay solapamiento"
    (exacto).
    """
    llegaron = asyncio.Event()
    en_vuelo = 0
    ventana = []

    async def router(prompt, **kw):
        nonlocal en_vuelo
        en_vuelo += 1
        inicio = time.perf_counter()
        if en_vuelo == 2:
            llegaron.set()
        await asyncio.wait_for(llegaron.wait(), timeout=2.0)
        ventana.append((inicio, time.perf_counter()))
        return VEREDICTO_CON_SUGERENCIA

    async def dos_a_la_vez():
        return await asyncio.gather(
            pa.refine_with_llm(_hallazgos(), _elementos(), "k",
                               provider_id="zenmux", _router=router),
            pa.refine_with_llm(_hallazgos(), _elementos(), "k",
                               provider_id="aion", _router=router),
        )

    resultados = asyncio.run(dos_a_la_vez())

    assert [usado for _, usado in resultados] == [True, True]
    # La segunda entró antes de que saliera la primera: se solaparon de verdad.
    (ini1, fin1), (ini2, fin2) = ventana
    assert ini2 < fin1, "las dos llamadas no se solaparon: una espero a la otra"


# ------------------------------------------------- lo que no puede romperse
def test_sin_clave_no_se_llega_a_preguntar_a_nadie():
    """Sin ninguna clave —ni en el request ni en el entorno— el motor degrada.

    Acá se usa el router DE VERDAD, y es a proposito: sin proveedores,
    `_get_active_providers` devuelve una lista vacia y `execute_with_specialty`
    levanta `ValueError` ANTES de abrir un socket. Por eso la prueba no toca la
    red aunque no inyecte nada, y por eso es una prueba y no un comentario: si
    alguien hiciera que el router saliera a la red antes de saber si hay a quien
    preguntarle, esta prueba pasaria a pagarla.
    """
    out, usado = _refinar(_hallazgos(), _elementos(), "")

    assert usado is False
    assert out == _hallazgos()


def test_un_proveedor_que_no_esta_configurado_no_toca_la_red(monkeypatch):
    """Elegir un proveedor sin clave no es un error, es una caida.

    La UI deja elegir un proveedor que todavia no tiene clave puesta, asi que
    esto es un camino real: el router dice que no hay a quien preguntarle y el
    motor devuelve los hallazgos como estaban.
    """
    from modules.ai_client import execute_with_specialty

    out, usado = _refinar(_hallazgos(), _elementos(), "k", provider_id="zenmux")

    assert usado is False
    assert out == _hallazgos()
    # El mensaje es el del router, no uno inventado aca: el motor no sabe
    # distinguishes "no hay proveedor" de "el proveedor cayo".
    with pytest.raises(ValueError, match="Proveedor no configurado"):
        asyncio.run(execute_with_specialty("p", "s", provider_id="zenmux"))


def test_un_router_que_falla_deja_los_hallazgos_intactos():
    """Nunca lanza y nunca borra: una infraestructura caída no puede dejar la
    lista a medias. `(findings, False)`, los mismos de entrada."""
    async def router(prompt, **kw):
        raise RuntimeError("La infraestructura LLM colapsó")

    out, usado = _refinar(_hallazgos(), _elementos(), "k", _router=router)

    assert usado is False
    assert out == _hallazgos()


def test_el_contrato_de_la_cache_no_se_rompio(monkeypatch):
    """`(findings, True)` solo con `_armar`.

    Devolver los hallazgos pelado con `True` resucita falsos positivos que el
    registro ya había descartado: el corrector dijo que eran errores de verdad y
    la lista vuelve a traerlos. Por eso `True` va siempre acompañado de `_armar`.
    """
    llamadas = []
    router = _router_que_responde(llamadas)
    hallazgos = _hallazgos()

    primera, usado_1 = _refinar(hallazgos, _elementos(), "k",
                                session_id="s1", _router=router)
    segunda, usado_2 = _refinar(hallazgos, _elementos(), "k",
                                session_id="s1", _router=router)

    # La segunda no vuelve a pagar la consulta: el registro por item es lo que
    # hace que doce guardados de Word cuesten una sola llamada.
    assert len(llamadas) == 1
    assert usado_1 is True and usado_2 is True
    assert primera[0]["suggestion"] == "debería"
    assert segunda == primera
    # Y el hallazgo original no se mutó al aplicar la sugerencia.
    assert "suggestion" not in hallazgos[0]


# --------------------------------- el otro lado del cable: el endpoint real
def test_el_endpoint_manda_la_clave_y_el_proveedor_del_request(monkeypatch):
    """Lo que viaja a `/api/proofread-batch` es lo que decide.

    Esta es la mitad del defecto que faltaba: el motor ya sabe recibir la clave
    del request, pero si el endpoint sigue leyendo `os.getenv`, la eleccion de la
    pestana Conexion no llega a ningun lado y el arreglo de arriba no sirve de
    nada. Se comprueba sobre el endpoint de verdad, no sobre la funcion.
    """
    from fastapi.testclient import TestClient

    from main import app
    from routers import proofread as modulo

    recibido = {}

    async def espia(findings, elements, api_key="", session_id="",
                    provider_id=None, _router=None):
        recibido["api_key"] = api_key
        recibido["provider_id"] = provider_id
        return findings, True

    monkeypatch.setattr(modulo, "refine_with_llm", espia)

    client = TestClient(app)
    # El texto TIENE que producir hallazgos del motor local: el endpoint solo
    # refina si hay algo que dudar. Con un texto limpio, la espia no se llamaria
    # y la prueba pasaria sin comprobar nada.
    r = client.post("/api/proofread-batch", json={
        "texts": ["El resultado final final fue claro y conciso, deberia tambien."],
        "api_key": "clave-de-zenmux",
        "provider_id": "zenmux",
    })

    assert r.status_code == 200
    assert r.json()["used_llm"] is True
    assert recibido == {"api_key": "clave-de-zenmux", "provider_id": "zenmux"}


def test_el_endpoint_no_usa_la_clave_del_entorno(monkeypatch):
    """Con `NVIDIA_API_KEY` en el entorno y otra clave en el request, gana la del
    request. Es el defecto original, afirmado desde el otro lado del cable."""
    from fastapi.testclient import TestClient

    from main import app
    from routers import proofread as modulo

    monkeypatch.setenv("NVIDIA_API_KEY", "clave-nvidia-del-entorno")

    recibido = {}

    async def espia(findings, elements, api_key="", session_id="",
                    provider_id=None, _router=None):
        recibido["api_key"] = api_key
        return findings, True

    monkeypatch.setattr(modulo, "refine_with_llm", espia)

    client = TestClient(app)
    r = client.post("/api/proofread-batch", json={
        "texts": ["El resultado final final fue claro y conciso, deberia tambien."],
        "api_key": "clave-de-aion",
    })

    assert r.status_code == 200
    assert recibido["api_key"] == "clave-de-aion"


def test_el_endpoint_sin_clave_devuelve_los_hallazgos_del_motor_local(monkeypatch):
    """Sin clave, el request se acepta igual y `used_llm` dice la verdad.

    El modo `texts` lo usan las pruebas y el addin, que mandan el documento y no
    una clave. Que se acepte sin clave no es un premio: es que el refinamiento
    es opcional, y la respuesta tiene que distinguir "no se pregunto" de "se
    pregunto y no cambio nada".
    """
    from fastapi.testclient import TestClient

    from main import app

    client = TestClient(app)
    r = client.post("/api/proofread-batch", json={
        "texts": ["El resultado final final fue claro y conciso."],
    })

    assert r.status_code == 200
    assert r.json()["used_llm"] is False
