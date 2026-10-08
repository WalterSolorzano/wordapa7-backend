"""El diff de un documento contra el que la app tiene guardado, POR CONTENIDO.

El watcher de Word detecta que el `.docx` cambio y nada mas: `src/App.tsx:267`
muestra un toast que dice "el documento esta sincronizado" y no reparsea nada.
Esto contesta la pregunta que hace falta para no gastar de mas, que no es
"cambio el archivo" sino "cambio ESTE TEXTO".

Y POR QUE EL DIFF COMPARA TEXTOS Y NO IDS, QUE ES LA DECISION CENTRAL DEL
MODULO.

Los ids de elemento son `elem_{contador}`, un indice posicional generado al
parsear (`python/parsing/docx_parser.py:1099`). Insertar un parrafo arriba del
todo en Word corre todos los ids de abajo en uno, con el MISMO texto. Un diff
por id reportaria "cambiaron 213 elementos" en un documento donde se toco una
linea, y el LLM volveria a pagar el documento entero en cada guardado: el rapido
por subsistencia del limite, con cinco proveedores de free tier.

Hay un test que fija esto para que nadie lo deshaga sin enterarse.

CINCO REGLAS MAS, Y CADA UNA ESTA EN UN TEST PORQUE CADA UNA FUE UN ERROR
POSIBLE:

  - El hash de un elemento es su TEXTO, con los espacios extremos recortados. Un
    Word que re-serializa puede tocar espacios finales sin tocar el texto, y si
    eso cuenta como "cambiado", cada guardado reaudita el documento entero y la
    regla de "solo lo nuevo" no sirve de nada. No da error: solo cobra.
  - El hash de la ESTRUCTURA va aparte del hash del texto. Si alguien mete un
    capitulo nuevo en Word, el texto de abajo esta intacto y un diff solo por
    texto diria "nada cambio" — que es la razon por la que los titulos abren
    fase. Un H1 organiza todo lo que tiene debajo.
  - No existe "cambiado en el lugar": lo que un parrafo editado produce es un
    texto nuevo y un texto que se fue, y para la cache del LLM es exactamente lo
    mismo. FINGIR que se distinguen seria mentir en el gasto.
  - Un parrafo que se borra no aparece como nuevo: si reapareciera, el LLM
    pagaria por volver a analizar texto que ya existio.
  - El mismo texto en dos sitios son dos elementos y se reportan por separado,
    aunque compartan hash. Lo que los une sin mezclarlos es la fase, y esa vive
    en el registro de auditoria, no aca.
"""

import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import DocumentModel, ElementModel, ImageModel  # noqa: E402

from modules.word_refresh import (  # noqa: E402
    diff_por_elemento,
    hash_de_estructura,
    hash_de_imagenes,
    hash_de_texto,
)


def _el(id, text, nivel=None, tipo="paragraph"):
    """Un elemento. `heading_level` por defecto es 1 en el modelo, asi que un
    parrafo normal lo construye con `nivel=None` a proposito: el diff tiene que
    distinguir "nivel 1 porque es un parrafo" de "nivel 1 porque es un H1"."""
    return ElementModel(
        id=id,
        type=tipo,
        heading_level=nivel,
        text=text,
    )


def _doc(*elementos):
    return DocumentModel(session_id="s1", file_name="t.docx", elements=list(elementos))


def test_insertar_un_parrafo_arriba_no_hace_creer_que_cambio_el_documento():
    """LA TRAMPA CENTRAL DEL MODULO, y la que cuesta plata.

    Los ids son `elem_{contador}`: un indice posicional. Si en Word alguien
    inserta un parrafo arriba del todo, TODOS los ids de abajo se corren en uno
    con el MISMO texto. Un diff por id diria "cambio el documento entero", el
    LLM volveria a pagar los doscientos parrafos, y la regla de "solo lo nuevo"
    habria servido de nada.

    El diff tiene que salir VACIO de cambios de texto aunque los ids se hayan
    movido todos."""
    antes = _doc(_el("elem_1", "Uno"), _el("elem_2", "Dos"), _el("elem_3", "Tres"))
    despues = _doc(_el("elem_2", "Uno"), _el("elem_3", "Dos"), _el("elem_4", "Tres"))
    d = diff_por_elemento(antes, despues)
    assert d["ids_nuevos"] == []
    assert d["ids_eliminados"] == []
    assert d["cambiado"] is False


def test_una_tesis_sin_cambios_no_reporta_nada_nuevo():
    """Word guardo y no cambio nada relevante. El diff tiene que ser vacío, no
    "reanalizados 214 parrafos, 0 hallazgos"."""
    antes = _doc(_el("a", "Uno"), _el("b", "Dos"))
    despues = _doc(_el("a", "Uno"), _el("b", "Dos"))
    d = diff_por_elemento(antes, despues)
    assert d["ids_nuevos"] == []
    assert d["ids_eliminados"] == []
    assert d["cambiado"] is False


def test_un_parrafo_nuevo_aparece_como_nuevo():
    antes = _doc(_el("a", "Uno"))
    despues = _doc(_el("a", "Uno"), _el("z", "Nuevo"))
    d = diff_por_elemento(antes, despues)
    assert d["ids_nuevos"] == ["z"]
    assert d["cambiado"] is True


def test_un_parrafo_editado_es_un_texto_nuevo_y_uno_que_se_fue():
    """No existe "cambiado en el lugar", y no es una LIMITACION: es lo que la
    cache del LLM ya hace, porque indexa por `prompt + system_prompt` y no por
    id. Preguntar "Uno" y preguntar "Uno dos" son dos preguntas nuevas, y una
    es exactamente lo que se paga. Reportar un solo "cambiado" seria hacer
    cuentas que el LLM no hace."""
    antes = _doc(_el("a", "Uno"))
    despues = _doc(_el("a", "Uno dos"))
    d = diff_por_elemento(antes, despues)
    assert d["ids_nuevos"] == ["a"]
    assert d["ids_eliminados"] == ["a"]


def test_un_parrafo_que_se_borra_no_aparece_como_nuevo():
    """Borrar no es anadir. Ademas el id borrado vuelve en `ids_eliminados`
    para que el llamador pueda invalidar hallazgos: un parrafo que ya no esta
    no debe seguir apareciendo como error."""
    antes = _doc(_el("a", "Uno"), _el("b", "Dos"))
    despues = _doc(_el("a", "Uno"))
    d = diff_por_elemento(antes, despues)
    assert d["ids_nuevos"] == []
    assert d["ids_eliminados"] == ["b"]
    assert d["cambiado"] is True


def test_un_h1_nuevo_cambia_el_hash_de_estructura_aunque_el_resto_este_igual():
    """La trampa del solo-hash-de-texto. Si alguien mete un capitulo nuevo en
    Word, los hashes del texto de abajo estan intactos: un diff por texto dira
    "nada cambio" y el capitulo nuevo pasara sin auditar. Por eso el hash de
    estructura va aparte."""
    sin_cap = _doc(
        _el("h1", "Metodo", 1, "heading"),
        _el("a", "Uno"),
    )
    con_cap = _doc(
        _el("h1", "Metodo", 1, "heading"),
        _el("h2", "Resultados", 1, "heading"),
        _el("a", "Uno"),
    )
    assert hash_de_estructura(sin_cap) != hash_de_estructura(con_cap)
    # El parrafo de texto NO cambio: eso es exactamente por lo que hace falta
    # el hash de estructura aparte. Y el titulo que se metio ES texto nuevo, que
    # es lo correcto: un titulo nuevo se audita.
    d = diff_por_elemento(sin_cap, con_cap)
    assert d["ids_nuevos"] == ["h2"]
    assert d["cambiado"] is True


def test_un_parrafo_con_nivel_1_por_defecto_no_es_un_titulo():
    """`ElementModel.heading_level` vale 1 por defecto. Si el diff de estructura
    lo tomara como un H1, `hash_de_estructura` seria distinto en cada documento
    con un solo parrafo y la regla "solo lo nuevo" no cortaria nunca."""
    doc = _doc(_el("a", "Uno"), _el("b", "Dos"))
    vacio = _doc()
    assert hash_de_estructura(doc) == hash_de_estructura(vacio)


def test_el_hash_de_un_elemento_ignora_los_espacios_extremos():
    """Un Word que re-serializa cambia espacios finales sin cambiar el texto. Si
    eso cuenta como "nuevo", cada guardado cobra el documento entero. Y este
    fallo no da error: no se ve en ninguna parte, solo en la factura."""
    antes = _doc(_el("a", "Uno"))
    despues = _doc(_el("a", "Uno   "))
    d = diff_por_elemento(antes, despues)
    assert d["ids_nuevos"] == []
    assert d["cambiado"] is False


def test_dos_parrafos_con_el_mismo_texto_se_reportan_los_dos():
    """El texto repetido comparte hash, y aun asi los DOS elementos se reportan
    como nuevos.

    Podria tempted ded here: "el LLM pregunta lo mismo dos veces, que lo pida
    una". Y estaria mal, porque el diff NO sabe en que fase esta cada parrafo, y
    el motor con fases mete la fase en el prompt — dos parrafos identicos en
    Metodo y en Resultados son dos preguntas distintas para el LLM y dos
    veredictos distintos para el resto de los motores.

    Deduplicar por texto solo seria una optimizacion hecha en el lugar donde no
    se tiene la informacion. El diff reporta lo que vio; quien sabe de fases es
    el registro de auditoria, y ahi se decide."""
    antes = _doc(_el("a", "Mismo texto"), _el("b", "Mismo texto"))
    d = diff_por_elemento(antes, _doc(_el("a", "Otro"), _el("b", "Otro")))
    hashes = {e["id"]: e["hash"] for e in d["elementos"]}
    assert hashes["a"] == hashes["b"] == hash_de_texto("Otro")
    assert d["ids_nuevos"] == ["a", "b"]
    assert len(d["elementos"]) == 2


def test_el_diff_sobre_documentos_vacios_no_rompe():
    """Sin documento y sin elementos: el watcher puede disparar antes de que
    haya un documento cargado, y un `None` adentro revienta la pantalla."""
    assert diff_por_elemento(None, None)["cambiado"] is False
    assert diff_por_elemento(_doc(), None)["ids_nuevos"] == []
    assert diff_por_elemento(None, _doc(_el("a", "Uno")))["ids_nuevos"] == ["a"]


def test_el_hash_usa_sha256_del_texto_recortado():
    """La funcion de hash es el CONTRATO entre el diff y la cache del LLM: si
    difieren, un elemento "igual" se vuelve a pagar. Se fija el valor exacto
    para que cambiarlo rompa esta prueba y no un factura."""
    esperado = hashlib.sha256("Uno".encode("utf-8")).hexdigest()
    d = diff_por_elemento(_doc(), _doc(_el("a", "  Uno  ")))
    assert d["elementos"][0]["hash"] == esperado
    assert hash_de_texto(None) == hash_de_texto("")


# ---------------------------------------------------------------------------
# Tests de deteccion de imagenes
# ---------------------------------------------------------------------------

def _img(id, filename):
    """Elemento IMAGE con image_info apuntando a un filename dado."""
    return ElementModel(
        id=id,
        type="image",  # ElementType.IMAGE.value
        image_info=ImageModel(
            element_id=id,
            file_path=f"/sessions/s1/images/{filename}",
            filename=filename,
        ),
    )


def test_una_imagen_nueva_en_word_activa_cambiado():
    """Pegar una imagen en Word (sin nuevo texto) debe activar cambiado."""
    antes = _doc()
    despues = _doc(_img("img_1", "fig1.png"))
    d = diff_por_elemento(antes, despues)
    assert d["cambiado"] is True
    # La imagen no tiene texto; ids_nuevos queda vacio (solo texto cuenta ahi)
    assert d["ids_nuevos"] == []


def test_una_imagen_eliminada_en_word_activa_cambiado():
    """Borrar la unica imagen del documento debe activar cambiado."""
    antes = _doc(_img("img_1", "fig1.png"))
    despues = _doc()
    d = diff_por_elemento(antes, despues)
    assert d["cambiado"] is True


def test_imagen_sin_cambio_no_activa_cambiado():
    """El mismo filename antes y despues: cambiado debe ser False (texto igual)."""
    antes = _doc(_img("img_1", "fig1.png"))
    despues = _doc(_img("img_1", "fig1.png"))
    d = diff_por_elemento(antes, despues)
    assert d["cambiado"] is False


def test_hash_de_imagenes_sobre_doc_sin_imagenes_no_rompe():
    """Un documento sin elementos IMAGE devuelve string sin lanzar."""
    doc = _doc(_el("a", "Solo texto"))
    resultado = hash_de_imagenes(doc)
    assert isinstance(resultado, str)
    assert len(resultado) > 0


def test_texto_nuevo_mas_imagen_nueva_ambos_detectados():
    """Texto nuevo y imagen nueva simultaneamente: cambiado True e id del parrafo en ids_nuevos."""
    antes = _doc(_el("a", "Intro"))
    despues = _doc(_el("a", "Intro"), _el("b", "Parrafo nuevo"), _img("img_1", "fig1.png"))
    d = diff_por_elemento(antes, despues)
    assert d["cambiado"] is True
    assert "b" in d["ids_nuevos"]
