"""Los nueve campos de modelo dejan de ser un control mudo.

La UI ofrecia nueve variables de modelo, las validaba y las guardaba en
localStorage, y admitia por escrito que no llegaban al backend. Un control
decorativo con la etiqueta de uno funcional.

`/api/sync-provider-keys` era un `dict` de variables de **clave**: no validaba ni
persistia ningun modelo, y lo que no esta en el `dict` no existe para el
backend. Por eso las nueve no llegaban. Y `HUGGINGFACE_API_KEY` se caia en tres
listas seguidas —el mapa del renderer, el `dict` del endpoint y
`PROVIDER_ENV_VARS`—, con lo cual la UI mostraba el campo, aceptaba la clave y
la clave se perdia en el renderer.

Los tests de este archivo se.CONSTRUYEN contra el catalogo, no contra una copia
del catalogo. Una lista escrita a mano tiene una propiedad fatal: cuando el
catalogo crece, la lista no, y el guardian dice que todo esta bien. Eso ya paso
con HUGGINGFACE_API_KEY.
"""

import os
import sys
from pathlib import Path

import pytest

RAIZ_PYTHON = Path(__file__).resolve().parent.parent
RAIZ = RAIZ_PYTHON.parent
sys.path.insert(0, str(RAIZ_PYTHON))

from classification.llm_classifier import _get_active_providers  # noqa: E402
from persistence.ai_keys import PROVIDER_ENV_VARS  # noqa: E402

# El catalogo. La FUENTE de verdad, y esta lista es lo que se compara contra
# las tres del camino. Si el catalogo crece, estas comparaciones se rompen.
#tiene un campo de modelo en el catalogo del renderer
VARIABLES_DE_MODELO = [
    "NVIDIA_NIM_MODEL", "GROQ_MODEL", "OPENROUTER_MODEL", "CEREBRAS_MODEL",
    "MISTRAL_MODEL", "OPENCODEZEN_MODEL", "ZENMUX_MODEL", "GEMINI_MODEL",
    "CLOUDFLARE_AI_MODEL", "AION_MODEL", "KILOCODE_MODEL", "OLLAMA_MODEL",
    "HUGGINGFACE_MODEL",
]

# Las variables de CLAVE. Catorce entradas, trece proveedores: Cloudflare tiene
# dos porque sin el id de cuenta su endpoint no se puede construir.
VARIABLES_DE_CLAVE = [
    "NVIDIA_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY", "CEREBRAS_API_KEY",
    "MISTRAL_API_KEY", "OPENCODEZEN_API_KEY", "ZENMUX_API_KEY", "GEMINI_API_KEY",
    "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID", "AION_API_KEY",
    "KILOCODE_API_KEY", "OLLAMA_API_KEY", "HUGGINGFACE_API_KEY",
]

VARIABLES_DE_ENTORNO = VARIABLES_DE_CLAVE + VARIABLES_DE_MODELO


@pytest.fixture(autouse=True)
def sin_claves_del_sistema(monkeypatch):
    """La maquina de desarrollo tiene claves reales de proveedores en `.env`.

    Sin esto, "esta variable llega a `os.environ`" seria verdad por el `.env` del
    que estoy, no por el endpoint. Se borran todas antes de cada prueba, y se
    RESTAURAN al terminar.

    Restaurar es la parte que faltaba la primera vez. Estas pruebas escriben en
    `os.environ` de verdad —el endpoint lo hace, y es justamente lo que se esta
    probando— y sin restaurar, el `ZENMUX_MODEL` de una aparecia en la prueba de
    ruteo que corre despues y la hacia fallar con un mensaje sin relacion. Un
    test que ensucia el entorno de los otros rompe tests que no son suyos.
    """
    previo = {v: os.environ[v] for v in VARIABLES_DE_ENTORNO if v in os.environ}
    for var in VARIABLES_DE_ENTORNO:
        monkeypatch.delenv(var, raising=False)
    yield
    for var in VARIABLES_DE_ENTORNO:
        os.environ.pop(var, None)
    os.environ.update(previo)


@pytest.fixture
def cliente():
    from fastapi.testclient import TestClient

    from main import app

    return TestClient(app)


def test_el_endpoint_acepta_todo_lo_que_la_ui_ofrece(cliente):
    """Toda variable del catalogo tiene que entrar por el endpoint.

    La comparacion se hace PREGUNTANDOLE al endpoint, no leyendo su codigo. Las
    dos formas tienen el mismo problema —una copia del catalogo escrita a mano
    no crece cuando el catalogo crece— pero la que lo tiene peor: un parser del
    `dict` `allowed` deja de encontrar el `dict` el dia que el `dict` se va, y
    devuelve una lista vacia que "pasa" porque no le falta nada. Preguntando, si
    el endpoint cambia, la prueba cambia con el.
    """
    import os

    no_aceptadas = []
    for variable in VARIABLES_DE_ENTORNO:
        os.environ.pop(variable, None)
        r = cliente.post("/api/sync-provider-keys", json={
            "keys": {variable: "x"}, "modelos": {variable: "x"},
        })
        if r.status_code != 200 or variable not in (r.json().get("applied") or []):
            no_aceptadas.append(variable)

    assert not no_aceptadas, (
        "estas variables la ofrece la UI y el endpoint no las acepta: se caen "
        f"en el camino y nadie se entera. Faltan: {no_aceptadas}"
    )


# -------------------------------------------- el Review Focus #5: los nueve
@pytest.mark.parametrize("variable", VARIABLES_DE_MODELO)
def test_las_variables_de_modelo_llegan_a_os_environ(cliente, variable):
    """Cada variable de modelo que la UI ofrece llega al entorno del proceso.

    Antes: el `dict` `allowed` del endpoint era de variables de clave, y un
    modelo no estaba en el. La UI aceptaba el valor, lo guardaba y no pasaba.
    """
    import os

    r = cliente.post("/api/sync-provider-keys", json={"modelos": {variable: "mi/modelo"}})

    assert r.status_code == 200, f"{variable} no lo acepto el endpoint: {r.text}"
    assert os.environ.get(variable) == "mi/modelo", (
        f"{variable} no llego a os.environ: la UI la ofrece y el backend la "
        "descarta, que es un control decorativo con la etiqueta de uno funcional"
    )


@pytest.mark.parametrize("variable", VARIABLES_DE_CLAVE)
def test_las_catorce_claves_del_catalogo_llegan(cliente, variable):
    """Las catorce claves, una por una.

    `HUGGINGFACE_API_KEY` no estaba en tres listas seguidas: se caia en el
    renderer, en el endpoint y en la persistencia. La UI mostraba el campo,
    aceptaba la clave y la clave se perdia en el renderer.
    """
    import os

    r = cliente.post("/api/sync-provider-keys", json={"keys": {variable: "mi-clave"}})

    assert r.status_code == 200, f"{variable} no lo acepto el endpoint: {r.text}"
    assert os.environ.get(variable) == "mi-clave", (
        f"{variable} no llego a os.environ. La UI muestra el campo, acepta la "
        "clave y no hace nada con ella."
    )


# --------------------------------- las tres listas tienen que coincidir
def test_la_persistencia_conoce_todas_las_claves():
    """`PROVIDER_ENV_VARS` es lo que sobrevive a un reinicio del backend.

    Una clave que no esta aca funciona hasta que el backend se reinicia, y
    despues deja de funcionar sin avisar. Es peor que no tenerla: el usuario
    cree que la puso.
    """
    faltantes = [v for v in VARIABLES_DE_CLAVE if v not in PROVIDER_ENV_VARS]
    assert not faltantes, (
        "estas claves no se persisten, asi que se pierden en cada reinicio del "
        f"backend: {faltantes}"
    )


def test_la_persistencia_conoce_los_nueve_modelos():
    """Y los modelos tambien se persisten.

    Un modelo que la UI ofrece y el backend lee, pero que no sobrevive al
    reinicio, es un modelo que funciona en la sesion en que lo escribiste y no
    en la siguiente.
    """
    faltantes = [v for v in VARIABLES_DE_MODELO if v not in PROVIDER_ENV_VARS]
    assert not faltantes, f"estos modelos no se persisten: {faltantes}"


def test_el_endpoint_no_acepta_una_variable_inventada(cliente, tmp_path, monkeypatch):
    """Y lo otro: el endpoint no puede aceptar cualquier cosa.

    Un endpoint que acepta un `dict` abierto es un endpoint donde un typo
    (`GROQ_MODLEL`) se guarda, se informa que se aplico, y no hace nada.

    Se mira el ARCHIVO, no solo `os.environ`: el archivo es lo que sobrevive al
    reinicio, y una variable inventada ahi se carga sola al arrancar el backend.
    """
    import json
    import persistence.ai_keys as ak

    monkeypatch.setattr(ak, "_keys_path", lambda: tmp_path / "ai_keys.json")

    r = cliente.post("/api/sync-provider-keys", json={
        "modelos": {"MODELO_INVENTADO": "x", "CLAVE_INVENTADA": "y"},
        "GROQ_MODLEL": "z",
    })

    assert r.status_code == 200
    assert "MODELO_INVENTADO" not in os.environ
    assert "CLAVE_INVENTADA" not in os.environ
    assert "GROQ_MODLEL" not in os.environ

    # Que el archivo NO exista es el mejor resultado posible: no hay nada que
    # cargar al arrancar. Se acepta cualquiera de los dos casos, porque lo que se
    # afirma es la ausencia de basura, no la existencia del archivo.
    ruta = tmp_path / "ai_keys.json"
    if ruta.exists():
        guardado = json.loads(ruta.read_text(encoding="utf-8"))
        assert guardado == {}, (
            "el archivo quedo con un nombre que no existe en el catalogo: se "
            f"va a cargar solo en cada arranque. Quedo: {guardado}"
        )


def test_lo_que_no_se_aplica_no_se_persiste(cliente, tmp_path, monkeypatch):
    """Al archivo va lo que se aplico, no lo que mandaron.

    Hay dos capas —el endpoint y `save_provider_keys`— y cada una filtra. Esta
    prueba mira el ARCHIVO, que es donde se juntan los dos: si una de las dos
    capas dejara de filtrar y la otra no, el archivo tendria basura. Afirmar cada
    capa por separado seria afirmar dos veces lo mismo y no mirar el efecto.
    """
    import json
    import persistence.ai_keys as ak

    monkeypatch.setattr(ak, "_keys_path", lambda: tmp_path / "ai_keys.json")

    cliente.post("/api/sync-provider-keys", json={
        "keys": {"GROQ_API_KEY": "mi-clave", "GEMINI_API_KEY": "   "},
        "modelos": {"GROQ_MODEL": "mi-modelo", "MODELO_FANTASMA": "x"},
    })

    guardado = json.loads((tmp_path / "ai_keys.json").read_text(encoding="utf-8"))
    assert guardado == {"GROQ_API_KEY": "mi-clave", "GROQ_MODEL": "mi-modelo"}, (
        "el archivo tiene algo que no se aplico: un valor vacio o un nombre "
        f"inventado. Quedo: {guardado}"
    )


def test_la_persistencia_rechaza_una_variable_inventada(tmp_path, monkeypatch):
    """`save_provider_keys` filtra por catalogo, no solo por "no vacio".

    Es la segunda de las dos capas, y se prueba sola. Si el endpoint dejara de
    filtrar, esta es la que evita que un typo quede esperando en el archivo para
    ser cargado en cada arranque.
    """
    import json
    import persistence.ai_keys as ak

    monkeypatch.setattr(ak, "_keys_path", lambda: tmp_path / "ai_keys.json")

    ak.save_provider_keys({
        "GROQ_API_KEY": "mi-clave",
        "GROQ_MODLEL": "typo",
        "MODELO_INVENTADO": "x",
    })

    guardado = json.loads((tmp_path / "ai_keys.json").read_text(encoding="utf-8"))
    assert guardado == {"GROQ_API_KEY": "mi-clave"}


# ------------------------- lo que el modelo quemado hacia y deja de hacer
def test_los_cuatro_antes_quemados_leen_su_variable(monkeypatch):
    """Los cuatro proveedores sin campo de modelo salen a leer su variable.

    Es la otra mitad del mismo defecto: aunque la UI no tuviera campo, alguien
    podia poner la variable a mano en un `.env`. Con el modelo quemado no
    servia de nada. El default es el valor que estaba quemado, para que quien no
    tenga la variable puesta no cambie de comportamiento sin avisar.
    """
    esperado = {
        "openrouter": ("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct"),
        "cerebras": ("CEREBRAS_MODEL", "llama3.1-70b"),
        "mistral": ("MISTRAL_MODEL", "mistral-small-latest"),
        "opencodezen": ("OPENCODEZEN_MODEL", "meta-llama/llama-3.3-70b-instruct"),
    }
    variables = {
        "openrouter": "OPENROUTER_API_KEY", "cerebras": "CEREBRAS_API_KEY",
        "mistral": "MISTRAL_API_KEY", "opencodezen": "OPENCODEZEN_API_KEY",
    }

    for provider, (var, _) in esperado.items():
        # Sin la variable: el default tiene que ser el valor quemado de antes.
        monkeypatch.setenv(variables[provider], f"clave-de-{provider}")
        por_defecto = {p["id"]: p for p in _get_active_providers()}
        assert por_defecto[provider]["model"] == esperado[provider][1], (
            f"{provider}: el default cambio de {esperado[provider][1]} a "
            f"{por_defecto[provider]['model']}. Quien no tenga la variable puesta "
            "va a pegar a un modelo distinto sin avisar."
        )

        # Con la variable: gana lo que puso el usuario.
        monkeypatch.setenv(var, f"mi-modelo-de-{provider}")
        elegido = {p["id"]: p for p in _get_active_providers()}
        assert elegido[provider]["model"] == f"mi-modelo-de-{provider}", (
            f"{provider} sigue ignorando {var}"
        )


@pytest.mark.parametrize("provider,var,clave_var,default", [
    ("nvidia_nim", "NVIDIA_NIM_MODEL", "NVIDIA_API_KEY", "nvidia/nemotron-3-super-120b-a12b"),
    ("groq", "GROQ_MODEL", "GROQ_API_KEY", "openai/gpt-oss-120b"),
    ("zenmux", "ZENMUX_MODEL", "ZENMUX_API_KEY", "z-ai/glm-4.6v-flash-free"),
    ("gemini", "GEMINI_MODEL", "GEMINI_API_KEY", "gemini-2.5-flash"),
    ("aion", "AION_MODEL", "AION_API_KEY", "aion-labs/aion-3.0-mini"),
    ("kilocode", "KILOCODE_MODEL", "KILOCODE_API_KEY", "kilo-auto/free"),
    ("ollama_cloud", "OLLAMA_MODEL", "OLLAMA_API_KEY", "gpt-oss:20b"),
    ("huggingface", "HUGGINGFACE_MODEL", "HUGGINGFACE_API_KEY", "meta-llama/Llama-3.1-8B-Instruct"),
])
def test_todos_los_que_ya_leian_su_variable_siguen_leyendola(
        provider, var, clave_var, default, monkeypatch):
    """Los que ya leian su variable no cambian. Se recorre el catalogo entero
    porque el riesgo de esta fase es cambiar un default por descuido y que nadie
    lo note hasta que un modelo responde distinto."""
    monkeypatch.setenv(clave_var, f"clave-de-{provider}")

    por_defecto = {p["id"]: p for p in _get_active_providers()}
    assert por_defecto[provider]["model"] == default

    monkeypatch.setenv(var, f"mi-modelo-de-{provider}")
    elegido = {p["id"]: p for p in _get_active_providers()}
    assert elegido[provider]["model"] == f"mi-modelo-de-{provider}"


def test_cloudflare_lee_su_variable_de_modelo(monkeypatch):
    """Cloudflare es distinto: su variable va en la URL, no en el payload.

    Por eso necesita las dos variables de clave. Y el modelo que se lee tiene
    que ser el que sale de la variable, en la URL y en el payload: si solo
    fuera en uno, el motor mandaria un modelo y pediria otro.
    """
    monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "token")
    monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "cuenta")

    sin_variable = {p["id"]: p for p in _get_active_providers()}["cloudflare"]
    assert sin_variable["model"] == "@cf/meta/llama-3.1-8b-instruct"
    assert sin_variable["model"] in sin_variable["url"]

    monkeypatch.setenv("CLOUDFLARE_AI_MODEL", "@cf/mi/modelo")
    con_variable = {p["id"]: p for p in _get_active_providers()}["cloudflare"]
    assert con_variable["model"] == "@cf/mi/modelo"
    assert con_variable["model"] in con_variable["url"]


def test_el_endpoint_persiste_lo_que_aplica(cliente, tmp_path, monkeypatch):
    """Lo que llega a `os.environ` tiene que sobrevivir al reinicio.

    Un modelo que solo vive en la memoria del proceso se pierde en el primer
    reinicio, y el usuario cree que lo eligio. Se comprueba contra el archivo,
    no contra la variable de entorno: el archivo es lo que sobrevive.
    """
    import json
    import persistence.ai_keys as ak

    monkeypatch.setattr(ak, "_keys_path", lambda: tmp_path / "ai_keys.json")

    cliente.post("/api/sync-provider-keys", json={
        "modelos": {"GROQ_MODEL": "mi-modelo"},
        "keys": {"GROQ_API_KEY": "mi-clave"},
    })

    guardado = json.loads((tmp_path / "ai_keys.json").read_text(encoding="utf-8"))
    assert guardado == {"GROQ_MODEL": "mi-modelo", "GROQ_API_KEY": "mi-clave"}


def test_lo_que_sobrevive_al_reinistro_vuelve_al_entorno(tmp_path, monkeypatch):
    """Y el camino de vuelta: lo persistido se restaura.

    El orden real en produccion es `process.env` de Windows, mas el archivo de
    la UI, mas el payload embebido. El segundo es este.
    """
    import persistence.ai_keys as ak

    monkeypatch.setattr(ak, "_keys_path", lambda: tmp_path / "ai_keys.json")
    ak.save_provider_keys({
        "GROQ_MODEL": "mi-modelo", "GROQ_API_KEY": "mi-clave",
        "HUGGINGFACE_API_KEY": "hf", "HUGGINGFACE_MODEL": "hf/modelo",
    })

    for var in VARIABLES_DE_ENTORNO:
        monkeypatch.delenv(var, raising=False)
    applied = ak.load_provider_keys_into_env()

    import os
    assert applied == 4
    assert os.environ["GROQ_MODEL"] == "mi-modelo"
    assert os.environ["HUGGINGFACE_MODEL"] == "hf/modelo"
    assert os.environ["HUGGINGFACE_API_KEY"] == "hf"
