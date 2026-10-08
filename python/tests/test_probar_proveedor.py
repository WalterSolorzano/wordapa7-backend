"""El botón "Probar": una consulta mínima, y lo que costó.

No existía. `get_ai_system_health()` dice cómo está el token bucket de cada
especialidad, no si la clave del usuario funciona: un 401, una cuota agotada y un
propositor que responde rápido se ven igual desde la UI. La única forma de
saberlo era gastar una tarea completa del documento.

El ping manda `max_tokens: 1`. No interesa la respuesta: interesa la línea de
estado, y un ping que pide quinientas palabras para decir "anduvo" es un ping que
cuesta.

Y lo que se afirma acá, además del resultado:

- **Nunca lanza.** Un botón Probar que tira una excepción en pantalla no es un
  botón Probar. Un proveedor caído es un `ok: false` con motivo.
- **Pregunta al que se le pidió**, no al primero de la lista. Un ping que dice
  "anduvo" habiendo preguntado a otro es peor que no tener ping: miente.
- **No toca la red cuando no hay clave.** Elegir un proveedor sin clave es un
  camino real de la UI, y una prueba que sale a la red en ese caso es una prueba
  que un día pega contra un endpoint de verdad.
"""
import sys
from pathlib import Path

import httpx
import pytest

RAIZ_PYTHON = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ_PYTHON))

VARIABLES = [
    "NVIDIA_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY",
    "MISTRAL_API_KEY", "OPENCODEZEN_API_KEY", "ZENMUX_API_KEY", "GEMINI_API_KEY",
    "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "AION_API_KEY",
    "KILOCODE_API_KEY", "OLLAMA_API_KEY", "HUGGINGFACE_API_KEY",
]


@pytest.fixture(autouse=True)
def sin_claves(monkeypatch):
    """Sin ninguna clave en el entorno.

    Importa el orden: `main.py` hace `load_dotenv()` al importarse, asi que
    importar el backend LLENA el entorno con el `.env` de la maquina. Si el
    fixture corre antes de la importacion, la clave vuelve a aparecer despues y
    la prueba cree que hay una clave que no puso. Por eso se importa primero y
    despues se borra: el orden de los fixtures es el orden de los hechos.
    """
    import main  # noqa: F401  — el import carga el `.env` de la maquina
    for var in VARIABLES:
        monkeypatch.delenv(var, raising=False)
    yield
    for var in VARIABLES:
        import os
        if var in os.environ:
            del os.environ[var]


@pytest.fixture
def cliente():
    from fastapi.testclient import TestClient

    from main import app

    return TestClient(app)


class _Resp:
    def __init__(self, status_code, cuerpo=None):
        self.status_code = status_code
        self._cuerpo = cuerpo if cuerpo is not None else {}
        self.text = str(self._cuerpo)

    def json(self):
        return self._cuerpo


def _transporte(monkeypatch, status=200, cuerpo=None):
    """Pone un `httpx.AsyncClient` falso y devuelve donde se registro la llamada."""
    import httpx

    llamadas = []

    class Cliente:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, url, json=None, headers=None):
            llamadas.append({"url": url, "json": json, "headers": headers})
            return _Resp(status, cuerpo)

    monkeypatch.setattr(httpx, "AsyncClient", Cliente)
    return llamadas


# ------------------------------------------------------------ lo que responde
def test_sin_clave_no_sale_a_la_red(cliente, monkeypatch):
    """El camino de la UI con el proveedor elegido y sin clave escrita.

    Y la razon de que este test no sea decorativo: sin esta guarda, alguien
    podria "arreglar" el endpoint para que probe de todos modos y esta prueba
    seguiria pasando, porque solo mira el `ok`.
    """
    llamadas = _transporte(monkeypatch)
    from modules import ai_client
    ai_client._provider_cooldowns.clear()

    r = cliente.post("/api/ai/probar-proveedor", json={"provider_id": "groq"})

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["ok"] is False
    assert "clave" in cuerpo["motivo"].lower()
    assert llamadas == [], "salio a la red sin que haya clave"


def test_un_proveedor_desconocido_y_uno_sin_clave_dicen_cosas_distintas(cliente):
    """"No lo conozco" y "le falta la clave" no son el mismo mensaje.

    Mezclarlos le dice al usuario que hay un error en la app cuando lo que
    forgot es escribir la clave. Y al revés: si el renderer manda un id que el
    backend no tiene, el mensaje "falta la clave" lo manda a escribir una clave
    que no arregla nada.
    """
    sin_clave = cliente.post("/api/ai/probar-proveedor", json={"provider_id": "groq"}).json()
    desconocido = cliente.post("/api/ai/probar-proveedor", json={"provider_id": "no-existe"}).json()

    assert "clave" in sin_clave["motivo"].lower()
    assert "desconocido" in desconocido["motivo"].lower()
    assert sin_clave["motivo"] != desconocido["motivo"]


def test_una_clave_buena_dice_que_anda_y_cuanto_tardo(cliente, monkeypatch):
    """El caso feliz: contesta, y dice el modelo que uso y cuantos ms tardo."""
    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")
    llamadas = _transporte(monkeypatch)

    r = cliente.post("/api/ai/probar-proveedor", json={"provider_id": "groq"})

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["ok"] is True
    assert cuerpo["status"] == 200
    assert cuerpo["model"] == "openai/gpt-oss-120b"
    assert cuerpo["ms"] >= 0
    assert len(llamadas) == 1


def test_el_ping_pide_una_palabra_nada_mas(cliente, monkeypatch):
    """`max_tokens: 1`. Un ping que pide quinientas palabras para decir "anduvo"
    es un ping que cuesta."""
    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")
    llamadas = _transporte(monkeypatch)

    cliente.post("/api/ai/probar-proveedor", json={"provider_id": "groq"})

    assert llamadas[0]["json"]["max_tokens"] == 1


def test_le_pregunta_al_proveedor_pedido_no_al_primero(cliente, monkeypatch):
    """La parte que hace que el ping sirva: si no, miente.

    Con NVIDIA y Groq las dos puestas, un ping que no mandara `provider_id`
    respondería por NVIDIA y diría que Groq anda. Es la misma clase de defecto
    que la inyeccion de `api_key` en la entrada de NIM.
    """
    monkeypatch.setenv("NVIDIA_API_KEY", "clave-de-nvidia")
    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")
    llamadas = _transporte(monkeypatch)

    cuerpo = cliente.post("/api/ai/probar-proveedor", json={
        "provider_id": "groq", "api_key": "clave-de-groq",
    }).json()

    assert cuerpo["ok"] is True
    assert len(llamadas) == 1
    assert "api.groq.com" in llamadas[0]["url"], (
        f"el ping respondio por otro: {llamadas[0]['url']}"
    )
    assert llamadas[0]["headers"]["Authorization"] == "Bearer clave-de-groq"


# ------------------------------------------------- degrada sin romperse
@pytest.mark.parametrize("status,motivo_debe", [
    (401, "clave"),
    (402, "clave"),
    (403, "clave"),
    (404, "clave"),
    (410, "clave"),
    (429, "cuota"),
])
def test_un_proveedor_que_rechaza_no_tumba_el_endpoint(cliente, monkeypatch, status, motivo_debe):
    """Un 401 no es un 500. Y el motivo tiene que ser legible.

    Se comprueba el motivo y no solo el `ok: false`: un ping que dice "fallo" sin
    decir por que deja al usuario en el mismo lugar del que empezo.
    """
    monkeypatch.setenv("GROQ_API_KEY", "clave-invalida")
    _transporte(monkeypatch, status=status)
    from modules import ai_client
    ai_client._provider_cooldowns.clear()
    ai_client._provider_health.clear()

    r = cliente.post("/api/ai/probar-proveedor", json={"provider_id": "groq"})

    assert r.status_code == 200, "el endpoint no puede devolver 500 por un proveedor caido"
    cuerpo = r.json()
    assert cuerpo["ok"] is False
    assert cuerpo["motivo"], "un fallo sin motivo no le dice nada a nadie"
    assert motivo_debe in cuerpo["motivo"].lower(), (
        f"el motivo no menciona lo que hay que revisar: {cuerpo['motivo']!r}"
    )
    ai_client._provider_cooldowns.clear()


def test_cualquier_fallo_dentro_del_ping_se_convierte_en_motivo(cliente, monkeypatch):
    """La proteccion del ping tiene dos capas, y la de adentro se prueba sola.

    Acá se hace fallar el transporte con una excepcion que no es de red —un
    `RuntimeError`— para no depender de que `httpx` la clasifique como
    `RequestError`. La segunda capa, la que envuelve toda la funcion, esta
    probada aparte: sin esta, sacar la de adentro no caeria ninguna prueba, y eso
    es un guardian que no vigila.

    Y el motivo tiene que decir que paso: un `ok: false` mudo deja al usuario
    exactamente donde estaba.
    """
    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")

    class ClienteQueSeRompe:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *a, **kw):
            raise RuntimeError("algo raro que no es un error de red")

    monkeypatch.setattr(httpx, "AsyncClient", ClienteQueSeRompe)
    from modules import ai_client
    ai_client._provider_cooldowns.clear()

    r = cliente.post("/api/ai/probar-proveedor", json={"provider_id": "groq"})

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["ok"] is False
    assert "algo raro" in cuerpo["motivo"], (
        f"el fallo no llego al usuario: {cuerpo['motivo']!r}"
    )
    ai_client._provider_cooldowns.clear()


def test_un_proveedor_inaccesible_no_tumba_el_endpoint(cliente, monkeypatch):
    """Un DNS muerto es un error de red: degrada, no rompe."""
    import httpx

    monkeypatch.setenv("GROQ_API_KEY", "clave-de-groq")

    class ClienteRoto:
        def __init__(self, *a, **kw):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def post(self, *a, **kw):
            raise httpx.ConnectError("no such host")

    monkeypatch.setattr(httpx, "AsyncClient", ClienteRoto)
    from modules import ai_client
    ai_client._provider_cooldowns.clear()

    r = cliente.post("/api/ai/probar-proveedor", json={"provider_id": "groq"})

    assert r.status_code == 200
    assert r.json()["ok"] is False
    ai_client._provider_cooldowns.clear()


def test_un_proveedor_que_no_existe_no_tumba_el_endpoint(cliente):
    """Un id que no esta en el catalogo es un 200 con motivo, no un error.

    La UI lo mandaria si el catalogo del renderer y el del backend se
    desincronizaran, y eso tiene que ser visible como "no lo conozco" y no como
    una pantalla en blanco.
    """
    r = cliente.post("/api/ai/probar-proveedor", json={"provider_id": "no-existe"})

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["ok"] is False
    assert cuerpo["motivo"]


def test_la_forma_de_la_respuesta_no_cambia_mas_adelante(cliente):
    """La UI desarma este objeto. Si le falta una clave, se rompe entera.

    Se afirma la forma, no los valores: es un contrato entre dos archivos que no
    se ven entre si, y esa es la clase de contrato que se rompe sin que nadie
    entienda por que.
    """
    cuerpo = cliente.post("/api/ai/probar-proveedor", json={"provider_id": "groq"}).json()

    assert set(cuerpo) == {"provider_id", "ok", "status", "ms", "model", "motivo"}
    assert isinstance(cuerpo["ok"], bool)
    assert isinstance(cuerpo["ms"], int)


def test_la_clave_se_puede_mandar_sin_esperar_el_autoguardado(cliente, monkeypatch):
    """Probar una clave recien escrita no tiene que esperar a que se sincronice.

    El campo tiene un debounce de 800 ms y la pestana manda la clave sola. Sin
    esto habria una ventana en la que el boton dice que no hay clave y el
    usuario piensa que escribio mal.
    """
    llamadas = _transporte(monkeypatch)

    cuerpo = cliente.post("/api/ai/probar-proveedor", json={
        "provider_id": "groq", "api_key": "clave-escrita-ahora",
    }).json()

    assert cuerpo["ok"] is True
    assert llamadas[0]["headers"]["Authorization"] == "Bearer clave-escrita-ahora"
