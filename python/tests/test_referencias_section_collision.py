"""El choque de seccion de Referencias: hay que preguntar ANTES de crear.

`format_apa_referencias_section` hacia `doc.add_page_break()` y un H1
"Referencias" NUEVO sin preguntar si la seccion ya existia. Con una tesis que ya
traia su bibliografia, eso deja DOS titulos "Referencias", un salto de pagina en
el medio, y las referencias escritas a mano junto a las generadas.

El otro motivo de fondo: la funcion tiene "Referencias" ESCRITO A MANO mientras
`_is_references_section_heading` —que ya sabia contestarlo— esta a cien lineas.
Cuatro lugares decidiendo lo mismo con tres vocabularios distintos.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import docx  # noqa: E402

from models import APARuleSet, ReferenciaModel  # noqa: E402
from modules.referencias_module import format_apa_referencias_section  # noqa: E402

REFS = [
    ReferenciaModel(id="r1", authors=["Perez, A."], year="2020",
                    title="Uno", source="Revista", doi_or_url="10.1000/a",
                    formatted_apa="Perez, A. (2020). Uno. Revista. "
                                  "https://doi.org/10.1000/a"),
    ReferenciaModel(id="r2", authors=["Garcia, L."], year="2021",
                    title="Dos", source="Otra", doi_or_url="10.1000/b",
                    formatted_apa="Garcia, L. (2021). Dos. Otra. "
                                  "https://doi.org/10.1000/b"),
]


def _doc_con_seccion(titulo="Referencias", con_entradas=False):
    d = docx.Document()
    d.add_paragraph("Introduccion del trabajo.")
    d.add_paragraph("Aqui va el cuerpo del trabajo.")
    d.add_paragraph(titulo)          # el H1 de la seccion, como lo escribio el autor
    if con_entradas:
        d.add_paragraph("Autor, A. (2019). Lo que el autor escribio a mano.")
    d.save(str(_tmp("base.docx")))
    return d


def _tmp(nombre):
    p = Path(__file__).parent.parent / "storage" / "test_charset"
    p.mkdir(parents=True, exist_ok=True)
    return p / nombre


def _textos(doc):
    return [p.text.strip() for p in doc.paragraphs if p.text.strip()]


def _cuantas_veces(doc, texto):
    return sum(1 for t in _textos(doc) if t == texto)


# ── El bug ───────────────────────────────────────────────────────────────────


def test_no_duplica_el_titulo_si_la_seccion_ya_existe():
    d = _doc_con_seccion("Referencias", con_entradas=True)
    format_apa_referencias_section(d, REFS, APARuleSet())
    assert _cuantas_veces(d, "Referencias") == 1, _textos(d)


def test_no_deja_saltos_de_pagina_dentro_del_cuerpo():
    d = _doc_con_seccion("Referencias")
    format_apa_referencias_section(d, REFS, APARuleSet())
    # Un salto de pagina antes de la seccion que ya existe es una pagina en
    # blanco en medio del trabajo.
    for p in d.paragraphs:
        assert "w:br" not in p._element.xml or 'type="page"' not in p._element.xml, (
            "salto de pagina insertado antes de una seccion que ya existia")


def test_reemplaza_las_entradas_manuscritas_en_vez_de_mezclarlas():
    d = _doc_con_seccion("Referencias", con_entradas=True)
    format_apa_reperencias_si_duplican(d, REFS, APARuleSet())


def format_apa_reperencias_si_duplican(doc, refs, rules):
    format_apa_referencias_section(doc, refs, rules)
    todos = " ".join(_textos(doc))
    # La entrada escrita a mano no debe sobrevivir pegada a las generadas.
    assert "Lo que el autor escribio a mano" not in todos, _textos(doc)
    assert "Uno" in todos


def test_reconoce_bibliografia_y_no_crea_referencias_encima():
    d = _doc_con_seccion("Bibliografia", con_entradas=True)
    format_apa_referencias_section(d, REFS, APARuleSet())
    assert _cuantas_veces(d, "Bibliografia") == 1
    assert _cuantas_veces(d, "Referencias") == 0, _textos(d)


def test_crea_la_seccion_cuando_no_existe():
    d = docx.Document()
    d.add_paragraph("Introduccion del trabajo.")
    format_apa_referencias_section(d, REFS, APARuleSet())
    assert _cuantas_veces(d, "Referencias") == 1
    assert "Uno" in " ".join(_textos(d))


def test_una_tesis_sin_bibliografia_igual_genera_la_seccion():
    d = docx.Document()
    d.add_paragraph("Cuerpo del trabajo.")
    d.add_paragraph("Anexos")
    format_apa_referencias_section(d, REFS, APARuleSet())
    t = _textos(d)
    assert "Referencias" in t
    # La seccion va AL FINAL, despues de los anexos: es una bibliografia.
    assert t.index("Referencias") > t.index("Anexos")


def test_sin_referencias_no_toca_el_documento():
    d = _doc_con_seccion("Referencias")
    antes = _textos(d)
    format_apa_referencias_section(d, [], APARuleSet())
    assert _textos(d) == antes


def test_las_referencias_generadas_si_estan_ordenadas():
    d = docx.Document()
    d.add_paragraph("Cuerpo.")
    format_apa_referencias_section(d, REFS, APARuleSet())
    t = _textos(d)
    # Orden alfabetico por apellido: Garcia antes que Perez.
    assert [x for x in t if "Garcia" in x] and [x for x in t if "Perez" in x], t
    assert next(i for i, x in enumerate(t) if "Garcia" in x) < \
        next(i for i, x in enumerate(t) if "Perez" in x), t


# ── El tercer silencio: una referencia con campos pero sin texto formateado ──


def test_una_referencia_con_campos_pero_sin_apa_no_desaparece():
    """El tercer fallo silencioso, y el peor de los tres.

    La funcion solo escribe `formatted_apa` o `raw_text`. Una referencia que
    tiene autores, ano y titulo —todo lo que hace falta para construir la APA—
    pero no el texto ya formateado, se salta con `continue` y produce una
    seccion VACIA: el titulo "Referencias" y nada debajo, sin error ni aviso.

    Es la misma clase de falla que los otros dos: algo se pierde en silencio y
    el documento sale mal sin que nadie se entere.
    """
    d = docx.Document()
    d.add_paragraph("Cuerpo.")
    ref = ReferenciaModel(id="r1", authors=["Perez, A."], year="2020",
                          title="Uno", source="Revista", doi_or_url="10.1000/a")
    format_apa_referencias_section(d, [ref], APARuleSet())
    t = _textos(d)
    assert "Referencias" in t
    assert any("Perez" in x for x in t), (
        f"seccion vacia: la referencia tiene todos los campos para armar la APA "
        f"y desaparecio. Contenido: {t}")


def test_una_referencia_completamente_vacia_sigue_sintiendose_omitida():
    # Sin NADA que armar, omitir es lo correcto: no se inventa una referencia.
    d = docx.Document()
    d.add_paragraph("Cuerpo.")
    format_apa_referencias_section(d, [ReferenciaModel(id="r9")], APARuleSet())
    assert _cuantas_veces(d, "Referencias") == 1
    assert len(_textos(d)) == 2, _textos(d)
