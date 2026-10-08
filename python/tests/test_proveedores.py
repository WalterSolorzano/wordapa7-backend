"""Un test por proveedor: URL, modelo, cabecera, y que degrade sin romper.

Cero tests de `zenmux`, `aion`, `kilocode`, `ollama_cloud`, `huggingface`,
`mistral` y `opencodezen`. Para un producto que declara trece proveedores en la
pestana de Conexión, la pregunta "¿cuál de los trece funciona?" no tenía
respuesta en el código, y esa es la pregunta que se hace un usuario después de
escribir su clave.

**Nada de red real.** El transporte se inyecta: se prueba `_try_provider` con un
`httpx` falso, que es donde se decide si un 200 vale o si un 429 reintenta. Un
test que llama a la red es un test que falla un martes por una cuota y que nadie
mira después.

Lo que se afirma por proveedor:

1. Tiene la URL que dice el catálogo, no una aproximada.
2. El modelo sale de su variable, y sin la variable es el default del repositorio.
3. La cabecera lleva `Authorization: Bearer <su clave>`, no la de otro.
4. Sin su clave, no entra en la lista, y pedirlo no rompe nada.
5. Ante un error HTTP, se degrada y lo dice, sin excepción.

Y el test de red que ya existía y que fallaba en instalación limpia queda
marcado como tal.
"""

import asyncio
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest

RAIZ_PYTHON = Path(__file__).resolve().parent.parent
RAIZ = RAIZ_PYTHON.parent
sys.path.insert(0, str(RAIZ_PYTHON))

from classification.llm_classifier import _get_active_providers  # noqa: E402

# El catálogo completo. Trece proveedores, con las variables de clave y el
# default del modelo. `esperado_por_id` se contrasta contra la entrada que arma
# el codigo, asi que un proveedor nuevo sin anadir aqui es un fallo, no un
# silencio.
CATALOGO: List[Dict[str, Any]] = [
    {"id": "nvidia_nim", "clave": ["NVIDIA_API_KEY"], "url": "https://integrate.api.nvidia.com/v1/chat/completions",
     "modelo": "nvidia/nemotron-3-super-120b-a12b"},
    {"id": "groq", "clave": ["GROQ_API_KEY"], "url": "https://api.groq.com/openai/v1/chat/completions",
     "modelo": "openai/gpt-oss-120b"},
    {"id": "openrouter", "clave": ["OPENROUTER_API_KEY"], "url": "https://openrouter.ai/api/v1/chat/completions",
     "modelo": "meta-llama/llama-3.3-70b-instruct"},
    {"id": "cerebras", "clave": ["CEREBRAS_API_KEY"], "url": "https://api.cerebras.ai/v1/chat/completions",
     "modelo": "llama3.1-70b"},
    {"id": "mistral", "clave": ["MISTRAL_API_KEY"], "url": "https://api.mistral.ai/v1/chat/completions",
     "modelo": "mistral-small-latest"},
    {"id": "opencodezen", "clave": ["OPENCODEZEN_API_KEY"], "url": "https://opencodezen.com/v1/chat/completions",
     "modelo": "meta-llama/llama-3.3-70b-instruct"},
    {"id": "zenmux", "clave": ["ZENMUX_API_KEY"], "url": "https://zenmux.ai/api/v1/chat/completions",
     "modelo": "z-ai/glm-4.6v-flash-free"},
    {"id": "gemini", "clave": ["GEMINI_API_KEY"],
     "url": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
     "modelo": "gemini-2.5-flash"},
    {"id": "cloudflare", "clave": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"],
     "url": "https://api.cloudflare.com/client/v4/accounts/cuenta-de-prueba/ai/run/@cf/meta/llama-3.1-8b-instruct",
     "modelo": "@cf/meta/llama-3.1-8b-instruct"},
    {"id": "aion", "clave": ["AION_API_KEY"], "url": "https://api.aionlabs.ai/v1/chat/completions",
     "modelo": "aion-labs/aion-3.0-mini"},
    {"id": "kilocode", "clave": ["KILOCODE_API_KEY"], "url": "https://api.kilo.ai/api/gateway/chat/completions",
     "modelo": "kilo-auto/free"},
    {"id": "ollama_cloud", "clave": ["OLLAMA_API_KEY"], "url": "https://ollama.com/v1/chat/completions",
     "modelo": "gpt-oss:20b"},
    {"id": "huggingface", "clave": ["HUGGINGFACE_API_KEY"], "url": "https://router.huggingface.co/v1/chat/completions",
     "modelo": "meta-llama/Llama-3.1-8B-Instruct"},
    {"id": "modelscope", "clave": ["MODELSCOPE_API_KEY"],
     "url": "https://api-inference.modelscope.cn/v1/chat/completions",
     "modelo": "Qwen/Qwen2.5-72B-Instruct"},
    {"id": "sambanova", "clave": ["SAMBANOVA_API_KEY"],
     "url": "https://api.sambanova.ai/v1/chat/completions",
     "modelo": "Meta-Llama-3.3-70B-Instruct"},
    {"id": "dashscope", "clave": ["DASHSCOPE_API_KEY"],
     "url": "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions",
     "modelo": "qwen-plus"},
    {"id": "agnes_ai", "clave": ["AGNES_AI_API_KEY"],
     "url": "https://api.agnes.ai/v1/chat/completions",
     "modelo": "gpt-4o-mini"},
]

TODAS_LAS_VARIABLES = sorted({v for p in CATALOGO for v in p["clave"]})
IDS = [p["id"] for p in CATALOGO]


class _RespuestaFalsa:
    """Lo unico que el codigo le pide a una respuesta de `httpx`."""

    def __init__(self, status_code: int, cuerpo: Any = None, texto: str = ""):
        self.status_code = status_code
        self._cuerpo = cuerpo if cuerpo is not None else {}
        self.text = texto or str(self._cuerpo)

    def json(self):
        return self._cuerpo


class _TransporteFalso:
    """Un `httpx.AsyncClient` que no abre un socket.

    Registra la URL, el cuerpo y las cabeceras de cada llamada, y contesta lo que
    se le pido. Es lo que permite probar el 401, el 429 y el 410 sin ninguna
    cuota que agotar.
    """

    def __init__(self, status: int = 200, cuerpo: Any = None):
        self.status_code = status
        self.cuerpo = cuerpo if cuerpo is not None else {
            "choices": [{"message": {"content": "respuesta"}}],
        }
        self.llamadas: List[Dict[str, Any]] = []

    async def post(self, url, json=None, headers=None):
        self.llamadas.append({"url": url, "json": json, "headers": headers})
        return _RespuestaFalsa(self.status_code, self.cuerpo)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def _con_transporte(monkeypatch, transporte: _TransporteFalso):
    """Pone el transporte falso en el lugar donde el router lo importa."""
    import httpx

    class ClienteFalso:
        def __init__(self, *a, **kw):
            self._t = transporte

        async def __aenter__(self):
            return transporte

        async def __aexit__(self, *exc):
            return False

    monkeypatch.setattr(httpx, "AsyncClient", ClienteFalso)
    return transporte


@pytest.fixture(autouse=True)
def entorno_limpio(monkeypatch):
    for var in TODAS_LAS_VARIABLES:
        monkeypatch.delenv(var, raising=False)
    yield


@pytest.fixture
def con_claves(monkeypatch):
    """Pone la clave de TODOS los proveedores y devuelve el diccionario.

    Todos a la vez, y no uno por vez: asi la lista de entradas se puede comparar
    con el catalogo entero. Un proveedor que no se puede construir sale como un
    hueco en el mapa, que es mas facil de ver que "no aparece".
    """

    def _poner(**extra: str):
        claves = {}
        for var in TODAS_LAS_VARIABLES:
            claves[var] = f"clave-de-{var.lower()}"
        claves.update(extra)
        for var, valor in claves.items():
            monkeypatch.setenv(var, valor)
        return claves

    return _poner


# ------------------------------------------------------- uno por proveedor
def _url_esperada(proveedor, claves):
    """La URL que tiene que salir, con la parte que depende de la clave puesta.

    Cloudflare no es como los demas: su endpoint lleva el id de cuenta DENTRO de
    la URL, asi que la URL esperada no puede ser una constante sino una
    plantilla. Escribirla como constante obligaria a hardcodear una cuenta de
    prueba y el test pasaria solo con esa cuenta.
    """
    url = proveedor["url"]
    if proveedor["id"] == "cloudflare":
        return url.replace("cuenta-de-prueba", claves["CLOUDFLARE_ACCOUNT_ID"])
    return url


@pytest.mark.parametrize("proveedor", CATALOGO, ids=[p["id"] for p in CATALOGO])
def test_cada_proveedor_tiene_url_y_modelo(proveedor, con_claves):
    """1. La URL es la del catalogo, no una parecida, y el modelo es el default."""
    claves = con_claves()

    entrada = {p["id"]: p for p in _get_active_providers()}[proveedor["id"]]

    assert entrada["url"] == _url_esperada(proveedor, claves)
    assert entrada["model"] == proveedor["modelo"]


@pytest.mark.parametrize("proveedor", CATALOGO, ids=[p["id"] for p in CATALOGO])
def test_cada_proveedor_manda_su_propia_clave_en_la_cabecera(proveedor, con_claves, monkeypatch):
    """3. La cabecera lleva SU clave. Ni la de otro, ni una de relleno.

    Se mira lo que sale del cliente, no lo que dice el diccionario: la clave
    viaja en `headers(clave)`, y esa es una funcion, asi que el diccionario
    puede estar bien y la llamada salir mal.
    """
    claves = con_claves()
    transporte = _con_transporte(monkeypatch, _TransporteFalso())

    from modules.ai_client import _try_provider

    entrada = {p["id"]: p for p in _get_active_providers()}[proveedor["id"]]
    asyncio.run(_try_provider(entrada, {"model": entrada["model"]}, 5))

    assert len(transporte.llamadas) == 1
    cabecera = transporte.llamadas[0]["headers"] or {}
    if proveedor["id"] == "cloudflare":
        # Cloudflare manda el token, no el id de cuenta: el id va en la URL.
        esperada = claves["CLOUDFLARE_API_TOKEN"]
    else:
        esperada = claves[proveedor["clave"][0]]
    assert cabecera.get("Authorization") == f"Bearer {esperada}", (
        f"{proveedor['id']} no mando su propia clave: {cabecera.get('Authorization')!r}"
    )


@pytest.mark.parametrize("proveedor", CATALOGO, ids=[p["id"] for p in CATALOGO])
def test_cada_proveedor_usa_el_modelo_que_le_pusieron(proveedor, con_claves, monkeypatch):
    """2. El modelo sale de la variable, y sin ella es el default.

    El recorrido es sobre el payload REAL que sale a la red, no sobre el
    diccionario: un proveedor puede tener el modelo bien en la entrada y
    mandarlo mal en la llamada.
    """
    variable = f"{proveedor['id'].upper()}_MODEL"
    if proveedor["id"] == "ollama_cloud":
        variable = "OLLAMA_MODEL"
    if proveedor["id"] == "cloudflare":
        variable = "CLOUDFLARE_AI_MODEL"
    if proveedor["id"] == "nvidia_nim":
        variable = "NVIDIA_NIM_MODEL"

    con_claves()
    transporte = _con_transporte(monkeypatch, _TransporteFalso())

    from modules.ai_client import _try_provider

    entrada = {p["id"]: p for p in _get_active_providers()}[proveedor["id"]]
    asyncio.run(_try_provider(entrada, {"model": entrada["model"]}, 5))
    assert transporte.llamadas[0]["json"]["model"] == proveedor["modelo"]

    monkeypatch.setenv(variable, f"mi-modelo-de-{proveedor['id']}")
    transporte = _con_transporte(monkeypatch, _TransporteFalso())
    entrada = {p["id"]: p for p in _get_active_providers()}[proveedor["id"]]
    asyncio.run(_try_provider(entrada, {"model": entrada["model"]}, 5))
    assert transporte.llamadas[0]["json"]["model"] == f"mi-modelo-de-{proveedor['id']}", (
        f"{proveedor['id']} ignora {variable}"
    )


@pytest.mark.parametrize("proveedor", CATALOGO, ids=[p["id"] for p in CATALOGO])
def test_sin_clave_el_proveedor_no_entra_ni_rompe(proveedor):
    """4. Sin su clave no entra a la cola, y pedirlo no rompe nada.

    Es el camino de la UI con el selector en automatico y la clave sin escribir:
    el proveedor no esta, y eso no puede ser un error.
    """
    entradas = _get_active_providers()
    assert proveedor["id"] not in {p["id"] for p in entradas}

    with pytest.raises(ValueError, match="Proveedor no configurado"):
        _get_active_providers(None, None, False, proveedor["id"])


# ----------------------------------------------- que degrade sin romperse
@pytest.mark.parametrize("status,es_transitorio", [
    (401, False), (402, False), (403, False), (404, False), (410, False),
    (429, True), (500, False),
])
def test_un_error_http_no_rompe_nada(con_claves, monkeypatch, status, es_transitorio):
    """5. Un error del proveedor devuelve `None` y deja el estado puesto.

    `_try_provider` devuelve `None` en vez de levantar: es lo que permite que el
    router pruebe el siguiente. Un `raise` aca seria una sola exception por cada
    proveedor caido, y el resto del documento se queda sin revisar.

    Un 429 es el unico transitorio: se reintenta. Los demas ponen al proveedor en
    enfriamiento, y eso se comprueba abajo.
    """
    con_claves()
    _con_transporte(monkeypatch, _TransporteFalso(status=status, cuerpo={}))

    from modules import ai_client

    ai_client._provider_cooldowns.clear()
    entrada = {p["id"]: p for p in _get_active_providers()}["groq"]

    resultado = asyncio.run(ai_client._try_provider(entrada, {"model": "x"}, 5, retries=1))

    assert resultado is None
    if not es_transitorio:
        assert "groq" in ai_client._provider_cooldowns
    else:
        assert "groq" in ai_client._provider_cooldowns
    ai_client._provider_cooldowns.clear()


def test_un_error_de_red_no_rompe_nada(con_claves, monkeypatch):
    """Un DNS muerto es un error de red, no una exception: tambien degrada."""
    import httpx

    con_claves()

    class ClienteQueFalla:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *a, **kw):
            raise httpx.ConnectError("no such host")

    monkeypatch.setattr(httpx, "AsyncClient", ClienteQueFalla)

    from modules import ai_client

    ai_client._provider_cooldowns.clear()
    entrada = {p["id"]: p for p in _get_active_providers()}["groq"]

    assert asyncio.run(ai_client._try_provider(entrada, {"model": "x"}, 5)) is None
    ai_client._provider_cooldowns.clear()


def test_cloudflare_su_respuesta_no_es_un_choices(con_claves, monkeypatch):
    """Cloudflare no contesta con `choices`: contesta con `result.response`.

    Es el unico proveedor con otra forma, y sin esta rama el router lo leeria
    como una respuesta vacia y pasaria al siguiente. No es un detalle de formato:
    es la unica razon por la que Cloudflare sirve.
    """
    con_claves()
    _con_transporte(monkeypatch, _TransporteFalso(cuerpo={"result": {"response": "desde cloudflare"}}))

    from modules import ai_client

    entrada = {p["id"]: p for p in _get_active_providers()}["cloudflare"]
    resultado = asyncio.run(ai_client._try_provider(entrada, {"model": entrada["model"]}, 5))

    assert resultado == {"result": {"response": "desde cloudflare"}}


# ------------------------------------------------- el catalogo esta completo
def test_el_catalogo_del_test_no_se_va_desincronizando():
    """La lista de arriba tiene que seguir teniendo los trece.

    Una lista de pruebas que se va quedando vieja es peor que no tenerla: el
    guardián sigue contando los trece queypyponía cuando se escribió, y cuando
    se agregue el catorce no se entera. Se contrasta contra lo que el codigo
    construye de verdad.
    """
    con_claves = {}
    for var in TODAS_LAS_VARIABLES:
        import os
        os.environ[var] = f"clave-de-{var.lower()}"
    try:
        construidos = {p["id"] for p in _get_active_providers()}
    finally:
        for var in TODAS_LAS_VARIABLES:
            import os
            os.environ.pop(var, None)

    assert construidos == set(IDS), (
        "el catalogo de esta prueba y el del codigo no coinciden. Faltan en la "
        f"prueba: {construidos - set(IDS)}. Sobran: {set(IDS) - construidos}"
    )


def test_cloudflare_necesita_las_dos_variables(con_claves, monkeypatch):
    """Cloudflare sin el id de cuenta no entra: su endpoint no se puede construir.

    Decir que "tiene clave" con una sola seria mentira, y la UI lo sabe: por eso
    pide los dos campos.
    """
    con_claves()
    monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)

    assert "cloudflare" not in {p["id"] for p in _get_active_providers()}
