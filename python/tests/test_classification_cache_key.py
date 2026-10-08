"""La clave de cache de la clasificacion tiene que PODER calcularse.

El defecto: `_compute_text_hash` se importaba DENTRO de
`classify_document_with_llm` (`llm_classifier.py`), y lo usa
`_classification_cache_key`, que es OTRA funcion. Un import dentro de una funcion
deja el nombre en el LOCAL de esa funcion; los globales del modulo no lo ven.

Resultado: cada elemento de cada lote levantaba
`NameError: name '_compute_text_hash' is not defined`. El endpoint
`POST /api/classify/{session_id}` devolvia 500, el documento se quedaba con los
tipos con los que entro y la app parecia vieja cuando lo que estaba era rota. La
suite de 1025 pruebas no lo vio porque ninguna llamaba a la funcion de la clave
directamente: la unica forma de llegar era un documento real contra un proveedor
de verdad.

POR QUE EL ARREGLO NO ES UN IMPORT ARRIBA DEL MODULO

`modules/ai_client.py:13` importa ESTE modulo (`PROVIDER_CAPACITY`,
`_get_active_providers`). Un import de vuelta a nivel de modulo seria un ciclo,
que es por lo que el import original vivia adentro de una funcion. La forma
correcta es la que se probo: resolverlo adentro de la funcion que lo usa, que
corre despues de que los dos modulos esten cargados.

Y POR QUE ADEMAS SE PRUEBA QUE USE EL HASH DE `ai_client`

Porque el archivo de cache es UNO y lo comparten dos capas (las respuestas del
prompt y la clasificacion por elemento). Si la clave se calculara con un hash
propio, las dos capas escribiran claves de espacios distintos en el mismo
archivo y ninguna se ahorraria una llamada. Que el nombre se resuelva en cada
llamada es lo que garantiza que hay UN solo hash, y por eso se prueba con un
doble: si el nombre se hubiera congelado en el import de una funcion, el doble no
se veria.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from classification import llm_classifier  # noqa: E402
from models import ElementModel, ElementType  # noqa: E402
from modules import ai_client  # noqa: E402


def un_elemento(texto: str = "Resultados") -> ElementModel:
    return ElementModel(id="elem_001", type=ElementType.PARAGRAPH, text=texto)


def test_la_clave_se_calcula_y_es_un_sha256():
    """La prueba minima: llamarla no explota, y devuelve un hash, no `None`."""
    clave = llm_classifier._classification_cache_key(un_elemento())

    assert isinstance(clave, str)
    assert len(clave) == 64
    assert all(c in "0123456789abcdef" for c in clave)


def test_la_clave_es_estable_y_distingue_el_texto():
    """Estable para el mismo elemento, distinta para otro texto.

    Sin lo primero no hay cache; sin lo segundo, dos parrafos distintos
    comparten entrada y el segundo hereda el tipo del primero.
    """
    elemento = un_elemento()

    assert llm_classifier._classification_cache_key(elemento) == llm_classifier._classification_cache_key(elemento)
    assert llm_classifier._classification_cache_key(elemento) != llm_classifier._classification_cache_key(
        un_elemento("Discusion")
    )


def test_la_clave_usa_el_hash_compartido_de_ai_client(monkeypatch):
    """Las dos capas del archivo de cache usan UN solo hash.

    Se cambia `ai_client._compute_text_hash` por un doble: si el nombre se
    resolviera desde un import congelado, el doble no se veria y la prueba
    fallaria en vez de pasar en silencio.
    """
    visto = []

    def hash_de_prueba(texto: str) -> str:
        visto.append(texto)
        return "hash-de-prueba"

    monkeypatch.setattr(ai_client, "_compute_text_hash", hash_de_prueba)

    assert llm_classifier._classification_cache_key(un_elemento()) == "hash-de-prueba"
    assert visto, "el doble de `_compute_text_hash` no se llamo: la clave no lo usa"
    assert "prompt_version" in visto[0], "se le paso otro payload al hash compartido"
