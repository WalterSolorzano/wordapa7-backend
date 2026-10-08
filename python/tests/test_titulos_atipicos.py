"""
WordAPA7 — Titulos atipicos: formatos que el clasificador no reconocia.

Un documento real no siempre marca sus titulos como "Heading 1" ni con
negrita+centrado. Estos son los casos que caian a parrafo o a un nivel
equivocado:

- MAYUSCULAS cortas, sin negrita ni centrado ni numero (p. ej. "INTRODUCCION").
- Titulo solo por tamano grande, alineado a la izquierda.
- "CAPITULO I" / "CAPÍTULO IV" sin punto tras el romano.
- Un parrafo largo en mayusculas NO es un titulo: no se promueve.
- "1. Seiri" sigue siendo un item de lista, no un titulo.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from models import ElementModel, ElementType  # noqa: E402
from parsing.pre_classifier import pre_classify_elements  # noqa: E402


def _elem(texto, **kw):
    base = dict(id="1", text=texto, style_name="Normal", alignment="left",
                font_size=12.0, is_bold=False, is_italic=False)
    base.update(kw)
    return ElementModel(**base)


def test_mayusculas_cortas_sin_formato_es_h1():
    """INTRODUCCION en mayusculas, izquierda, 12pt, sin negrita -> H1."""
    result = pre_classify_elements([_elem("INTRODUCCION")])
    assert result[0].type == ElementType.HEADING
    assert result[0].heading_level == 1


def test_titulo_solo_por_tamano_izquierda_es_h1():
    """Un titulo grande alineado a la izquierda es H1, no H2."""
    result = pre_classify_elements([_elem("Marco teorico", font_size=15.0)])
    assert result[0].type == ElementType.HEADING
    assert result[0].heading_level == 1


def test_capitulo_romano_sin_punto_es_h1():
    """CAPITULO I, sin punto tras el romano, es H1."""
    result = pre_classify_elements([_elem("CAPITULO I")])
    assert result[0].type == ElementType.HEADING
    assert result[0].heading_level == 1


def test_parrafo_largo_en_mayusculas_no_se_promueve():
    """Un parrafo largo en mayusculas sigue siendo parrafo."""
    largo = (
        "ESTE ES UN PARRAFO MUY LARGO QUE AUNQUE ESTE ESCRITO EN MAYUSCULAS "
        "TIENE MUCHAS PALABRAS Y POR ESO NO PUEDE SER UN TITULO DE SECCION "
        "PORQUE LOS TITULOS SON CORTOS Y ESTE SIGUE Y SIGUE CON MAS TEXTO"
    )
    result = pre_classify_elements([_elem(largo)])
    assert result[0].type == ElementType.PARAGRAPH


def test_seiri_sigue_siendo_lista():
    """1. Seiri es un item de lista, no un titulo (no-regresion)."""
    result = pre_classify_elements([_elem("1. Seiri")])
    assert result[0].type == ElementType.NUMBERED_LIST
