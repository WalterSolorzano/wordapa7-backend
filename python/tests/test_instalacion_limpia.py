"""La instalación limpia, y la nota de seguridad que faltaba.

Con las TRES fuentes de claves vacías —el `process.env` de Windows, el
`ai_keys.json` de la UI y el payload embebido del instalador— la app tiene que
degradar sin romper. Eso ya lo hacía (`llm_classifier.py` y
`proactive_auditor.py`); lo que faltaba era la prueba que lo demuestra.

Y la decisión sobre el payload embebido. `python/embedded_secrets.py` y
`python/embed_payload.py` usan **XOR con la semilla escrita en el código**: es
ofuscación, no cifrado, y el propio módulo lo dice. El spec de la fase pedía
documentarlo "en un lugar visible" o sacarlo.

**Se documenta, no se saca.** Sacarlo desactivaría la IA en toda instalación
que no tenga clave puesta, sin que nadie lo pidiera: el payload es lo que hace
que un instalador nuevo funcione sin configurar nada. Esa es una decision del
dueño, no de esta fase. Lo que sí hace esta fase es que la advertencia sea
visible —en el módulo, en el endpoint de estado y en la propia pestaña de
Conexión— y que no se pueda borrar en silencio.
"""

import inspect
import json
import os
import sys
from pathlib import Path

import pytest

RAIZ_PYTHON = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ_PYTHON))

# Se deriva del catalogo, no de una lista fija: una lista a mano se queda
# desactualizada en cuanto se agrega un proveedor, y entonces la "instalacion
# limpia" deja de estar limpia sin que nadie lo note (paso con las claves de
# modelscope/sambanova/dashscope/agnes_ai, que vivian en el .env del dev).
from persistence.ai_keys import PROVIDER_ENV_VARS as VARIABLES_DE_ENTORNO


@pytest.fixture
def instalacion_limpia(monkeypatch, tmp_path):
    """Las tres fuentes vacías, de verdad.

    No basta con borrar `os.environ`: hay que borrar también el archivo de la UI
    y el payload. Si el archivo no se borra, la prueba pasa por el camino del
    archivo y no está probando la instalación limpia; y si el payload no se
    borra, peor: `main.py` lo carga al importar, así que una clave embebida
    seguiría ahí y el resto de la prueba mentiría.
    """
    import embedded_secrets
    import persistence.ai_keys as ak

    for var in VARIABLES_DE_ENTORNO:
        monkeypatch.delenv(var, raising=False)

    # 2. El archivo de la UI, en un directorio que no existe.
    vacio = tmp_path / "no-existe"
    monkeypatch.setattr(ak, "_keys_path", lambda: vacio / "ai_keys.json")

    # 3. El payload embebido, inexistente.
    monkeypatch.setattr(embedded_secrets, "_payload_path", lambda: str(vacio / "payload.json"))

    assert ak._keys_path().parent.exists() is False
    assert not Path(embedded_secrets._payload_path()).exists()
    return ak


# ---------------------------------------------- la app degrada sin romperse
def test_sin_ninguna_clave_no_hay_proveedores(instalacion_limpia):
    """La primera fuente vacía: no hay a quién preguntarle, y no es un error."""
    from classification.llm_classifier import _get_active_providers

    assert _get_active_providers() == []


def test_sin_ninguna_clave_el_clasificador_devuelve_el_documento(instalacion_limpia):
    """El clasificador degrada a heurística y devuelve el documento intacto.

    No devuelve un documento vacío ni lanza: devuelve el mismo documento que
    recibió. Un usuario sin clave tiene que poder clasificar, auditar y
    exportar, que es lo que dice la propia pestaña de Conexión.
    """
    import asyncio

    from classification.llm_classifier import classify_document_with_llm, get_classify_progress
    from models import DocumentModel, ElementModel, ElementType

    doc = DocumentModel(
        session_id="limpia",
        file_name="limpia.docx",
        elements=[ElementModel(id="e1", type=ElementType.PARAGRAPH,
                               text="Un parrafo que nadie va a clasificar con IA.")],
    )

    salida = asyncio.run(classify_document_with_llm(doc))

    assert salida is doc
    assert len(salida.elements) == 1
    progreso = get_classify_progress("limpia")
    assert progreso["status"] == "complete"
    assert progreso["elements_processed"] == progreso["elements_total"]


def test_sin_ninguna_clave_el_refinamiento_es_passthrough(instalacion_limpia):
    """El motor de ortografía también degrada, y no se descarta nada."""
    import asyncio

    from modules.proactive_auditor import refine_with_llm

    hallazgos = [{
        "element_id": "e1", "start": 0, "end": 4, "excerpt": "x",
        "kind": "ortografia", "severity": "error", "message": "m", "source": "local",
    }]

    salida, usado = asyncio.run(refine_with_llm(hallazgos, [], ""))

    assert usado is False
    assert salida == hallazgos


def test_sin_ninguna_clave_el_auditor_de_estructura_devuelve_lo_heuristico(instalacion_limpia):
    """La auditoría global cae a heurística, que es la capa que no necesita red."""
    import asyncio

    from modules.doc_auditor import audit_document_structure
    from models import DocumentModel, ElementModel, ElementType

    doc = DocumentModel(
        session_id="limpia",
        file_name="limpia.docx",
        elements=[ElementModel(id="e1", type=ElementType.PARAGRAPH,
                               text="Un parrafo sin ningun titulo encima, que es el problema.")],
    )

    resultado = asyncio.run(audit_document_structure(doc, ""))

    # Sin clave no hay capa de LLM, pero la heurística corrió y dijo algo.
    assert resultado is not None
    assert resultado.summary


def test_el_endpoint_de_ortografia_responde_sin_clave(instalacion_limpia):
    """Y el endpoint completo responde 200, con lo que tiene: reglas locales.

    Un usuario sin clave no puede recibir un error. Recibe sus hallazgos
    locales, que son los que el motor local ya sabia ver.
    """
    from fastapi.testclient import TestClient

    from main import app

    r = TestClient(app).post("/api/proofread-batch", json={
        "texts": ["El resultado final final fue claro y conciso para todos."],
    })

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["used_llm"] is False
    assert len(cuerpo["findings"]) >= 1, "sin clave todavia tiene que haber hallazgos locales"


def test_el_estado_de_proveedores_no_mente_en_limpio(instalacion_limpia):
    """El estado dice que no hay nada, no dice que hay ocho proveedores."""
    from fastapi.testclient import TestClient

    from main import app

    cuerpo = TestClient(app).get("/api/provider-status").json()

    assert cuerpo["total_configured"] == 0
    assert cuerpo["total_active"] == 0
    assert cuerpo["classification_available"] is False


def test_el_archivo_que_no_existe_no_rompe_nada(instalacion_limpia):
    """La segunda fuente vacía: que no exista el archivo no es un error.

    Es el caso de toda instalación nueva, y el que ocurre en cada arranque
    antes de que el usuario escriba su primera clave.
    """
    assert instalacion_limpia.load_provider_keys_into_env() == 0


def test_el_payload_que_no_existe_no_rompe_nada(instalacion_limpia):
    """La tercera: sin payload, cero claves, sin excepción."""
    import embedded_secrets

    assert embedded_secrets.decode_payload() == {}
    assert embedded_secrets.load_embedded_into_env() == 0


# ------------------------------------ la nota de seguridad del payload
def test_el_modulo_dice_que_es_ofuscacion_y_no_cifrado():
    """La advertencia no se puede borrar en silencio.

    El módulo ya lo decía; lo que faltaba era que no se pudiera quitar sin que
    la prueba se caiga. Se lee el `docstring` del módulo, no un archivo aparte:
    un aviso en un documento que nadie abre no es una nota de seguridad.
    """
    import embedded_secrets

    doc = inspect.getdoc(embedded_secrets) or ""

    assert "OFUSCACION, no cifrado" in doc or "ofuscación, no cifrado" in doc, (
        "el modulo perdio la advertencia de que XOR no es cifrado. Esa es la "
        "promesa de seguridad que no es una promesa."
    )
    assert "SEED" in inspect.getsource(embedded_secrets), (
        "la semilla tiene que estar en el codigo: es lo que hace que esto sea "
        "ofuscacion. Si la semilla desapareciera, alguien estaria pensando en "
        "cifrado de verdad y no en esto."
    )


def test_la_semilla_no_es_un_secreto_y_el_codigo_lo_dice():
    """La mitad uncomfortable: la semilla está en el código, a propósito.

    Un guardián que exigiera que la semilla fuera secreta estaría pidiendo algo
    que el sistema no pretende ser. Se afirma lo contrario, para que nadie lo
    "arregle" y crea estar arreglando algo.
    """
    import embedded_secrets

    fuente = inspect.getsource(embedded_secrets)
    assert "No es un secreto" in fuente or "no es un secreto" in fuente, (
        "la semilla es publica por diseño. Si alguien la esconde creyendo que "
        "eso la protege, hay que sacarlo de ese error."
    )


def test_el_endpoint_de_estado_no_dice_que_este_cifrado():
    """Lo que el usuario ve no promete cifrado.

    `/api/provider-status` es lo que la UI lee para decir si hay algo
    configurado. Si un dia mostrara algo como "cifrado", seria una promesa que
    el modulo no puede cumplir.
    """
    from fastapi.testclient import TestClient

    from main import app

    cuerpo = TestClient(app).get("/api/provider-status").text.lower()

    for palabra in ("cifrado", "encrypted", "encriptado", "seguro"):
        assert palabra not in cuerpo, (
            f"el endpoint dice '{palabra}' y el payload NO esta cifrado: es "
            "XOR con la semilla del codigo"
        )


def test_la_ui_dice_que_las_claves_embebidas_no_estan_cifradas():
    """Y en la pestaña donde se escriben las claves, se dice.

    Este es el "lugar visible" que pedia el spec. Un aviso en un documento que
    nadie abre no es una nota de seguridad: la tiene que ver quien va a
    escribir su clave.
    """
    ruta = RAIZ_PYTHON.parent / "src" / "components" / "settings" / "tabs" / "ConexionTab.tsx"
    texto = ruta.read_text(encoding="utf-8")

    assert "ofuscad" in texto.lower(), (
        "la pestaña de Conexion no dice que las claves del instalador vienen "
        "ofuscadas y no cifradas. Sin esa frase, la nota de seguridad solo "
        "existe en el modulo, que es justo donde nadie la lee."
    )
    # Y no basta con la palabra: tiene que decir que NO es cifrado, porque
    # "ofuscadas" solo, sin el contraste, se lee como "protegidas".
    minusculas = texto.lower()
    assert ("no cifrad" in minusculas) or ("no estan cifrad" in minusculas) or (
        "no está cifrad" in minusculas
    ), "la UI dice que estan ofuscadas pero no aclara que eso no es cifrado"


def test_el_payload_no_esta_en_el_repositorio():
    """El archivo con las claves ofuscadas no se versiona.

    Es un `.gitignore` y nada mas: un `.gitignore` no es un guardian, porque
    un `git add -f` lo pasa por alto y el archivo tiene la forma de un JSON
    cualquiera. Se comprueba que hoy no esta, y que el patron esta ignorado.
    """
    import subprocess

    raiz = RAIZ_PYTHON.parent
    payload = RAIZ_PYTHON / "_embedded_payload.json"

    versionado = subprocess.run(
        ["git", "ls-files", "--error-unmatch", "python/_embedded_payload.json"],
        cwd=raiz, capture_output=True, text=True,
    )
    assert versionado.returncode != 0, (
        "el payload con las claves esta en el indice de git: sale en el "
        "historial para siempre, y un .gitignore no lo saca de ahi"
    )

    # Que el archivo exista en el disco de quien desarrollo es normal: lo
    # genera el instalador. Lo que no puede es estar versionado.
    ignorado = subprocess.run(
        ["git", "check-ignore", "-q", "python/_embedded_payload.json"],
        cwd=raiz,
    )
    assert ignorado.returncode == 0, (
        "el payload no esta en el .gitignore: la proxima persona que corra el "
        "instalador y haga commit se lleva las claves al historial"
    )
    assert payload is not None  # la ruta existe aunque el archivo no
