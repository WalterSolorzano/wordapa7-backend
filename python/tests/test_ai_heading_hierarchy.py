"""El editor no debe aplanar la jerarquia que el autor construyo.

El bug: `any(sec in text for sec in [...])` sobre el titulo de un HEADING
promovia a Nivel 1 cualquier encabezado que contuviera una palabra del
vocabulario. "Resultados de la encuesta" que el autor anido deliberadamente
como H2 bajo "Metodo" era promovido a H1, y la jerarquia quedaba aplanada.

La comparacion de titulos ahora vive en `phase_scope.match_phase`, que es la
unica fuente de verdad, y el editor consume ese vocabulario en vez del suyo.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from models import DocumentModel, ElementModel, ElementType  # noqa: E402
from modules.ai_document_editor import _deterministic_chat_fallback  # noqa: E402

INSTRUCCION = "arregla la jerarquia de titulos"


def _h(eid, text, level):
    return ElementModel(id=eid, type=ElementType.HEADING, heading_level=level,
                        text=text)


def _acciones(*elements):
    doc = DocumentModel(session_id="s", elements=list(elements))
    return _deterministic_chat_fallback(doc, INSTRUCCION)["actions"]


def _respuesta(*elements):
    doc = DocumentModel(session_id="s", elements=list(elements))
    return _deterministic_chat_fallback(doc, INSTRUCCION)


def test_promueve_un_h2_que_es_una_fase_real():
    acts = _acciones(_h("h1", "Metodo", 1), _h("h2", "Resultados", 2))
    assert acts == [{"type": "set_type", "element_id": "h2",
                     "element_type": "heading", "level": 1}]


def test_no_promueve_un_h2_que_el_autor_anido_bajo_una_fase():
    # El bug exacto: "Resultados de la encuesta" bajo "Metodo" es un H2 a
    # proposito, con su propio nivel. Antes lo promotes a H1.
    acts = _acciones(_h("h1", "Metodo", 1),
                     _h("h2", "Resultados de la encuesta", 2))
    assert acts == []


def test_no_promueve_si_ya_hay_un_h1_de_esa_fase():
    acts = _acciones(_h("h1", "Resultados", 1),
                     _h("h2", "Resultados de la encuesta", 2))
    assert acts == []


def test_no_toca_la_portada():
    # La portada es zona protegida: use_original_cover no la muta y
    # computePages la trata como bloque indivisible (AGENTS.md §1).
    assert _acciones(_h("c1", "Titulo", 2)) == []


def test_no_toca_un_elemento_de_portada_marcado():
    cover = ElementModel(id="c1", type=ElementType.HEADING, heading_level=2,
                         text="Metodo", is_cover_section=True)
    assert _acciones(cover) == []


def test_no_promueve_un_h1_desconocido():
    # "Agradecimientos" no es una fase: es una seccion cualquiera.
    assert _acciones(_h("h1", "Agradecimientos", 2)) == []


def test_promueve_solo_una_vez_por_fase():
    acts = _acciones(_h("h1", "Metodo", 1),
                     _h("h2", "Resultados", 2),
                     _h("h3", "Resultados de la encuesta", 3))
    # La segunda vez que aparece la fase, ya esta cubierta.
    assert [a["element_id"] for a in acts] == ["h2"]


def test_la_respuesta_no_afirma_ajustes_cuando_no_hubo_ninguno():
    r = _respuesta(_h("h1", "Agradecimientos", 2))
    assert "0 " in r["reply"] or "no hubo" in r["reply"].lower()


def test_la_respuesta_si_cuenta_los_ajustes():
    r = _respuesta(_h("h1", "Metodo", 1), _h("h2", "Resultados", 2))
    assert "1" in r["reply"]
