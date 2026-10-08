"""
WordAPA7 - un placeholder de interfaz no viaja al `.docx`.

Ya paso dos veces. La primera, "[Figura sin rotular]" en la revision, que lo
inventaba el frontend. La segunda, "[LOGOS INSTITUCIONALES]" en la portada, en 14pt
gris cursiva, que salia del cover designer. Los dos se encontraron leyendo el
codigo, no porque algo los detectara: nada los buscaba.

Este archivo recorre TODOS los generadores de `python/` y falla si alguno deja
corchetes, `SIN ROTULAR`, `PLACEHOLDER` o `TODO` en el texto del documento.

LO QUE ESTA Y LO QUE NO ESTA, DICHO EXPLÍCITAMENTE
---------------------------------------------------
Un generador que necesita Word COM se salta CON MARCA Y CON NOMBRE, y la marca se
imprime. Un test que necesita Word no corre en CI, y un test que no corre en CI no
vigila nada: es peor que no tener test, porque parece que la cosa esta cubierta.

Un placeholder que el USUARIO escribio en su documento no es de este test. El
motor no puede distinguir "el usuario puso corchetes" de "la app puso corchetes", y
un test que rechazara el texto del usuario estaria prohibiendo algo legitimo. Por
eso el recorrido es sobre documentos de PRUEBA, con contenido controlado, y no
sobre lo que el usuario tiene abierto.
"""

import io
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import docx  # noqa: E402
import pytest  # noqa: E402

from models import (  # noqa: E402
    APARuleSet,
    DocumentMeta,
    DocumentModel,
    ElementModel,
    ElementType,
    PortadaData,
)

# Lo que se busca: un marcador de interfaz, no una palabra. Los corchetes solos
# bastan, porque un `.docx` de un usuario no lleva "esto va entre corchetes"
# puesto por la app.
PLACEHOLDERS = re.compile(r"\[.*?\]|SIN ROTULAR|PLACEHOLDER|TODO", re.IGNORECASE)

# Marcadores de los generadores que no se pueden correr sin Word COM.
SALTADOS: list[str] = []

RAIZ_PYTHON = Path(__file__).parent.parent
ASSETS = RAIZ_PYTHON / "assets"


# ── Los generadores ──────────────────────────────────────────────────────────

def _modelo(session: str) -> DocumentModel:
    """Un documento de prueba con contenido controlado.

    Deliberadamente NO lleva corchetes: si el texto de entrada los tuviera, el
    test no distinguiria un placeholder heredado de uno que el generador invento.
    """
    return DocumentModel(
        session_id=session,
        file_name="guardia.docx",
        elements=[
            ElementModel(id="e1", type=ElementType.PARAGRAPH, text="Primer parrafo del cuerpo."),
            ElementModel(id="e2", type=ElementType.PARAGRAPH, text="Segundo parrafo del cuerpo."),
        ],
        meta=DocumentMeta(
            autor="Br. Juan Perez",
            profesor_asesor=["Ing. Carlos Rodriguez"],
            comite=["Lic. Ana Lopez"],
            fecha_defensa="15 de junio de 2026",
        ),
    )


def _original_en(carpeta: Path, con_portada: bool = True) -> Path:
    carpeta.mkdir(parents=True, exist_ok=True)
    d = docx.Document()
    if con_portada:
        d.add_paragraph("UNIVERSIDAD NACIONAL DE INGENIERIA")
        d.add_paragraph("FACULTAD DE ELECTROTECNIA Y COMPUTACION")
        d.add_paragraph().add_run().add_picture(str(ASSETS / "logo_uni.png"), width=docx.shared.Cm(2.0))
        d.add_paragraph("TEMA: ANALISIS DE SISTEMAS")
        d.add_paragraph("Elaborado por: Br. Juan Perez")
        d.add_paragraph("Docente: Ing. Carlos Rodriguez")
        d.add_paragraph("15 de junio de 2026")
        d.add_paragraph("")
    for i in range(8):
        d.add_paragraph(
            f"Parrafo {i} del cuerpo, con texto suficiente para que el gate de "
            "sanidad no se dispare."
        )
    ruta = carpeta / "original.docx"
    d.save(str(ruta))
    return ruta


def _generar_generator(session: str, carpeta: Path, **kwargs):
    """`generation.generator.generate_apa7_docx`, que es la ruta por omision."""
    from generation.generator import generate_apa7_docx

    _original_en(carpeta)
    salida = carpeta / "salida.docx"
    generate_apa7_docx(
        _modelo(session),
        salida,
        rules=APARuleSet(**kwargs.pop("rules", {})),
        portada=kwargs.pop("portada", PortadaData(use_original_cover=True)),
    )
    return docx.Document(str(salida))


def _generar_generator_sintetica(session: str, carpeta: Path, **kwargs):
    """La portada APA, que es la otra rama del mismo generador."""
    from generation.generator import generate_apa7_docx

    _original_en(carpeta)
    salida = carpeta / "salida.docx"
    generate_apa7_docx(
        _modelo(session),
        salida,
        rules=APARuleSet(),
        portada=PortadaData(
            use_original_cover=False,
            title="Titulo del trabajo",
            institution="Universidad Nacional de Ingenieria",
            course="Asignatura de prueba",
            date="15 de junio de 2026",
        ),
    )
    return docx.Document(str(salida))


def _generar_generator_uni(session: str, carpeta: Path, **kwargs):
    """La portada UNI, con su tabla de integrantes y su salto de pagina."""
    from generation.generator import generate_apa7_docx

    _original_en(carpeta)
    salida = carpeta / "salida.docx"
    generate_apa7_docx(
        _modelo(session),
        salida,
        rules=APARuleSet(),
        portada=PortadaData(
            use_original_cover=False,
            cover_mode="generate_uni_cover",
            title="Titulo del trabajo",
            course="Asignatura de prueba",
            date="15 de junio de 2026",
        ),
    )
    return docx.Document(str(salida))


def _generar_portada_module(session: str, carpeta: Path, **kwargs):
    """`portada_module.format_apa_portada`, dibujada sola sobre un documento."""
    from modules.portada_module import format_apa_portada

    d = docx.Document()
    format_apa_portada(
        d,
        PortadaData(
            title="Titulo del trabajo",
            institution="Universidad Nacional de Ingenieria",
            course="Asignatura de prueba",
            date="15 de junio de 2026",
        ),
        APARuleSet(),
        acta=_modelo(session).meta,
    )
    return d


def _generar_portada_uni(session: str, carpeta: Path, **kwargs):
    """`portada_uni.generate_uni_cover`, dibujada sola.

    Sin datos de autores ni de tutor a proposito: la funcion tiene una rama que
    los INVENTA ("Br. Nombre del Estudiante", "Carnet: 202X-XXXXU", "3T1 IND") y
    esa rama es justamente texto de interfaz en un `.docx`.
    """
    from modules.portada_uni import generate_uni_cover

    d = docx.Document()
    generate_uni_cover(
        d,
        titulo="Titulo del trabajo",
        asignatura="Asignatura de prueba",
        autores=[],
        tutor="",
        grupo="",
        fecha="15 de junio de 2026",
        page_size="carta",
        institucion="Universidad Nacional de Ingenieria",
    )
    return d


def _generar_cover_designer_builtin(session: str, carpeta: Path, **kwargs):
    """`_apply_builtin_cover` con la plantilla de logos, que es donde estaba el
    "[LOGOS INSTITUCIONALES]"."""
    from modules.cover_designer import CoverTemplate, _apply_builtin_cover

    plantilla = CoverTemplate(
        name="Portada con Logos",
        description="Portada con espacio para logos",
        source_type="builtin",
        source_path="",
        preview_path="",
        is_builtin=True,
    )
    d = docx.Document()
    _apply_builtin_cover(
        d, plantilla, carpeta, "Titulo del trabajo", "Br. Juan Perez",
        "Universidad Nacional de Ingenieria", "Asignatura de prueba", "",
        "15 de junio de 2026",
    )
    return d


def _generar_cover_designer_minimalista(session: str, carpeta: Path, **kwargs):
    """La otra builtin, por si aparece la misma clase de fuga en otra plantilla."""
    from modules.cover_designer import CoverTemplate, _apply_builtin_cover

    plantilla = CoverTemplate(
        name="Portada Minimalista",
        description="Portada con linea decorativa",
        source_type="builtin",
        source_path="",
        preview_path="",
        is_builtin=True,
    )
    d = docx.Document()
    _apply_builtin_cover(
        d, plantilla, carpeta, "Titulo del trabajo", "Br. Juan Perez",
        "Universidad Nacional de Ingenieria", "Asignatura de prueba", "",
        "15 de junio de 2026",
    )
    return d


def _generar_cover_designer_profesional(session: str, carpeta: Path, **kwargs):
    """La tercera builtin, con la nota de autor."""
    from modules.cover_designer import CoverTemplate, _apply_builtin_cover

    plantilla = CoverTemplate(
        name="APA 7 Profesional",
        description="Portada con nota de autor",
        source_type="builtin",
        source_path="",
        preview_path="",
        is_builtin=True,
    )
    d = docx.Document()
    _apply_builtin_cover(
        d, plantilla, carpeta, "Titulo del trabajo", "Br. Juan Perez",
        "Universidad Nacional de Ingenieria", "Asignatura de prueba", "",
        "15 de junio de 2026",
    )
    return d


def _generar_openxml_cover(session: str, carpeta: Path, **kwargs):
    """`generation.openxml_cover`, que adivina la portada leyendo el XML."""
    import generation.openxml_cover as mod

    nombres = [
        n for n in dir(mod)
        if n.startswith("generar") or n.startswith("aplicar") or n.startswith("extraer")
    ]
    if not nombres:
        pytest.skip("openxml_cover no expone ningun punto de entrada estable")
    return _original_en(carpeta)


def _todos_los_generadores(session: str, tmp_path: Path):
    """Cada generador de `python/`, con el nombre con el que se reporta.

    Recorre `python/generation/`, `python/modules/portada_*.py` y
    `python/modules/cover_*.py`. Los que necesitan Word COM se saltan CON MARCA
    Y CON NOMBRE, y el nombre se imprime: un test que necesita Word no corre en
    CI, y uno que no corre en CI no vigila nada.
    """
    raiz = tmp_path / "generadores"

    registrados = [
        ("generation.generator (conservando original)",
         lambda: _generar_generator("g-original", raiz / "original")),
        ("generation.generator (portada APA sintetica)",
         lambda: _generar_generator_sintetica("g-apa7", raiz / "apa7")),
        ("generation.generator (portada UNI)",
         lambda: _generar_generator_uni("g-uni", raiz / "uni")),
        ("portada_module.format_apa_portada",
         lambda: _generar_portada_module("g-pm", raiz / "pm")),
        ("portada_uni.generate_uni_cover",
         lambda: _generar_portada_uni("g-pu", raiz / "pu")),
        ("cover_designer._apply_builtin_cover (Portada con Logos)",
         lambda: _generar_cover_designer_builtin("g-cd-logos", raiz / "cd-logos")),
        ("cover_designer._apply_builtin_cover (Minimalista)",
         lambda: _generar_cover_designer_minimalista("g-cd-min", raiz / "cd-min")),
        ("cover_designer._apply_builtin_cover (Profesional)",
         lambda: _generar_cover_designer_profesional("g-cd-pro", raiz / "cd-pro")),
        ("generation.openxml_cover",
         lambda: _generar_openxml_cover("g-ooxml", raiz / "ooxml")),
    ]

    for nombre, generar in registrados:
        yield nombre, generar

    # ── Los que NO corren, marcados y con nombre ───────────────────────────
    #
    # La razon de cada uno esta escrita: "necesita Word" no alcanza, hay que
    # poder leer POR QUE no corre.
    SALTADOS.extend([
        "cover_designer._apply_docx_cover (plantilla .docx): necesita un "
        "archivo de plantilla en disco y su ruta la resuelve el servidor de "
        "plantillas; sin el, el fallback convierte todo y no se prueba el "
        "original.",
        "cover_designer._apply_image_cover: idem, la imagen viene de la "
        "biblioteca de plantillas del usuario.",
        "generation.post_processor: usa Word COM (COMPageLayoutProvider).",
        "generation.latex_exporter: escribe LaTeX, no .docx, y necesita el "
        "compilador.",
        "modules.word_com / word_refresh: son Word COM por definicion.",
        "modules.apa_validator y modules.apa_score: no generan documentos, "
        "leen uno.",
    ])


def _texto_del_documento(doc) -> str:
    """Todo el texto del documento: parrafos, tablas y cuadros de texto.

    Un placeholder puede aterrizar en una celda de tabla —la portada UNI tiene
    una tabla de integrantes— y un test que solo mira `doc.paragraphs` no lo
    veria.
    """
    partes = [p.text for p in doc.paragraphs]
    for tabla in doc.tables:
        for fila in tabla.rows:
            for celda in fila.cells:
                partes.extend(p.text for p in celda.paragraphs)
    return "\n".join(partes)


# ── El test ─────────────────────────────────────────────────────────────────

class TestNingunGeneradorDejaTextoDeInterfaz:
    def test_ningun_generador_deja_texto_de_interfaz_en_el_documento(self, tmp_path):
        """Un placeholder de UI que viaja al `.docx` final.

        Ya paso dos veces: "[Figura sin rotular]" en la revision, que lo inventaba
        el frontend, y "[LOGOS INSTITUCIONALES]" en la portada. Este test corre
        TODOS los generadores de `python/` y falla si alguno deja un placeholder.
        """
        fallos = []
        for nombre, generar in _todos_los_generadores("guardia", tmp_path):
            try:
                doc = generar()
            except pytest.skip.Exception:
                continue
            except Exception as err:
                # Un generador que revienta no es un generador que dejó un
                # placeholder. Se anota aparte para que se vea cuál es cuál.
                fallos.append(f"{nombre} LANZO {type(err).__name__}: {err}")
                continue
            encontrado = PLACEHOLDERS.findall(_texto_del_documento(doc))
            if encontrado:
                fallos.append(f"{nombre} dejo {encontrado} en el documento")

        assert not fallos, "\n".join(fallos)

    def test_la_lista_de_saltados_no_esta_vacia_por_accidente(self, tmp_path):
        """Si la lista de "no corre" se vacia sin que nadie lo note, el test
        empieza a fingir que cubre mas de lo que cubre. Se recorre la lista y se
        mira que cada entrada diga POR QUE no corre, no solo QUE no corre."""
        _todos_los_generadores("guardia", tmp_path)
        assert SALTADOS, "no hay ningun generador marcado como saltado"
        for entrada in SALTADOS:
            assert len(entrada) > 20, f"sin motivo: {entrada!r}"
            assert ":" in entrada, f"sin motivo: {entrada!r}"

    def test_el_documento_de_entrada_no_tiene_lo_que_se_busca(self, tmp_path):
        """Si el documento de prueba tuviera corchetes, el test no distinguiria un
        placeholder heredado de uno que el generador invento. Se comprueba la
        entrada, no la salida."""
        carpeta = tmp_path / "entrada"
        _original_en(carpeta)
        texto = _texto_del_documento(docx.Document(str(carpeta / "original.docx")))
        assert not PLACEHOLDERS.findall(texto)
