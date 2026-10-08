"""Diferencia entre un documento y el que la app tiene guardado, POR CONTENIDO.

El watcher de Word detecta que el `.docx` cambio y nada mas: `src/App.tsx:267`
muestra un toast que dice "el documento esta sincronizado" y no reparsea nada.
Este modulo contesta la pregunta que hace falta para no gastar de mas, que no es
"cambio el archivo" sino "cambio ESTE TEXTO o ESTAS IMAGENES".

POR QUE ESTE TRABAJA POR TEXTO Y NO POR `id`, Y POR QUE ESO NO ES UN DETALLE.

Los ids de elemento son `elem_{contador}` — un INDICE POSICIONAL, generado al
parsear (`python/parsing/docx_parser.py:1099`). No son identidades: si en Word
alguien inserta un parrafo arriba del todo, `elem_5` pasa a ser `elem_6` y todos
los de abajo se corren en uno, con el MISMO texto.

Un diff por `id` reportaria entonces "cambiaron 213 elementos" para un documento
en el que se toco una linea. Y la consecuencia no es cosmetics: la regla de
"llm solo lo nuevo" pagaria el documento entero en cada guardado de Word, que es
exactamente lo que la persona pidio evitar. Con cinco proveedores de free tier
y 10-30 RPM eso no es un desorden, es un rapido por subsistencia del limite.

Ademas, la cache del LLM ya indexa por `sha256(prompt + system_prompt)`, no por
id: para el LLM la identidad de un parrafo ES su texto. Un registro por
contenido calza con lo que el LLM ya hace; un registro por id calza con nada.

LO QUE SE PIERDE AL RENUNCIAR A "CAMBIADO" EN EL LUGAR DE "NUEVO", Y POR QUE
NO SE PIERDE NADA.

Un parrafo que paso de "Uno" a "Uno dos" no es "cambiado": es un texto nuevo y un
texto que se fue. Para la cache del LLM es lo mismo — dos preguntas nuevas— y para
los motores baratos da igual, porque esos corren sobre todo el documento por
decision explicita de la persona. Lo que se pierde es una distincion que el
conteo de gasto no necesita y que con ids posicionales seria mentira.

Y DOS COSAS QUE EL TEXTO SOLO NO ALCANZA A DECIR, Y QUE POR ESO EXISTEN:

El hash de ESTRUCTURA va aparte. Meter un capitulo nuevo en Word deja el texto de
abajo intacto: un diff solo por texto diria "nada cambio" y el capitulo pasaria
sin auditar. Es la misma razon por la que los titulos abren fase.

Y el mismo texto en dos sitios son dos hallazgos. Por eso el registro de
auditoria (que es la Task siguiente) tiene que llevar la FASE en la clave, no solo
el texto: dos parrafos identicos en Metodo y en Resultados no pueden heredar el
veredicto del otro. Aca solo se devuelven los `id` del documento NUEVO, que es
el sobre el que el llamador puede actuar.
"""

import hashlib
from typing import Any, Dict, List, Optional, Set

# El hash del texto recortado. Es el CONTRATO con la cache del LLM y con el
# registro de auditoria. `test_el_hash_usa_sha256_del_texto_recortado` fija el
# valor exacto: cambiarlo no rompe una prueba de arriba, cambia en que se gasta
# la plata.
def hash_de_texto(texto: Optional[str]) -> str:
    return hashlib.sha256((texto or "").strip().encode("utf-8")).hexdigest()


def _elementos(doc) -> List[Any]:
    """Los elementos de un documento, o la lista vacía si no hay documento.

    `None` adentro es un caso real y no un descuido: el watcher puede disparar
    antes de que haya un documento cargado, y un `AttributeError` en un callback
    de un `useEffect` tumba la pantalla de Inicio.
    """
    return list(getattr(doc, "elements", None) or [])


def hash_de_estructura(doc) -> str:
    """Hash de la lista de titulos: que seccion existe y con que nombre.

    Solo mira los que SON titulos. `ElementModel.heading_level` vale 1 por
    defecto, asi que un parrafo normal trae `heading_level == 1` y mirarlo sin
    mirar el `type` haria que cualquier documento con un parrafo tenga una
    estructura distinta de uno vacio.
    """
    partes: List[str] = []
    for e in _elementos(doc):
        if getattr(e, "type", None) != "heading":
            continue
        nivel = getattr(e, "heading_level", 0) or 0
        partes.append(f"{nivel}:{hash_de_texto(getattr(e, 'text', ''))}")
    return hashlib.sha256("|".join(partes).encode("utf-8")).hexdigest()


def hash_de_imagenes(doc) -> str:
    """Hash del conjunto de imágenes del documento, por filename.

    Usa `image_info.filename` (nombre de archivo extraído, único por imagen)
    y NO `file_path` (ruta absoluta de sesión que varía entre recargas).
    Si `image_info` es None en un elemento IMAGE, ese elemento se ignora.
    Devuelve sha256 del join ordenado de filenames; nunca lanza.
    """
    filenames: List[str] = []
    for e in _elementos(doc):
        if getattr(e, "type", None) != "image":
            continue
        img = getattr(e, "image_info", None)
        if img is None:
            continue
        fn = getattr(img, "filename", None)
        if fn:
            filenames.append(fn)
    return hashlib.sha256("|".join(sorted(filenames)).encode("utf-8")).hexdigest()


def diff_por_elemento(antes, despues) -> Dict[str, Any]:
    """Qué textos e imágenes son nuevos y cuáles se fueron, más el veredicto global.

    Se comparan TEXTOS y no `id`, y el motivo está en el docstring del módulo:
    los ids son un índice posicional y un diff por id reporta el documento entero
    como cambiado en cada guardado de Word.

    También compara el hash de imágenes (por filename): si el usuario pegó o
    borró una imagen en Word, `cambiado` sale True aunque no haya texto nuevo.
    """
    hashes_antes: Set[str] = {
        hash_de_texto(getattr(e, "text", ""))
        for e in _elementos(antes)
        if getattr(e, "type", None) != "image"
    }

    hashes_despues: Set[str] = set()
    elementos: List[Dict[str, Any]] = []
    ids_nuevos: List[str] = []

    for e in _elementos(despues):
        if getattr(e, "type", None) == "image":
            elementos.append({"id": e.id, "hash": "", "nuevo": False})
            continue
        h = hash_de_texto(getattr(e, "text", ""))
        es_nuevo = h not in hashes_antes
        if es_nuevo:
            hashes_despues.add(h)
            ids_nuevos.append(e.id)
        elementos.append({"id": e.id, "hash": h, "nuevo": es_nuevo})

    # Los ids del documento VIEJO cuyo texto no aparece en el nuevo. Se devuelven
    # porque el llamador los puede necesitar para invalidar hallazgos: un
    # parrafo que se borro no debe seguir apareciendo como error.
    hashes_nuevos = {e["hash"] for e in elementos}
    ids_eliminados = [
        e.id for e in _elementos(antes)
        if getattr(e, "type", None) != "image"
        and hash_de_texto(getattr(e, "text", "")) not in hashes_nuevos
    ]

    estructura_igual = hash_de_estructura(antes) == hash_de_estructura(despues)
    imagenes_igual = hash_de_imagenes(antes) == hash_de_imagenes(despues)
    return {
        "cambiado": bool(ids_nuevos or ids_eliminados) or not estructura_igual or not imagenes_igual,
        "hash_estructura": hash_de_estructura(despues),
        "elementos": elementos,
        "ids_nuevos": ids_nuevos,
        "ids_eliminados": ids_eliminados,
    }
