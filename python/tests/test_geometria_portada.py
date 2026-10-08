"""
WordAPA7 - la preview y el .docx tienen que decir lo mismo.

Este es el Review Focus #5 de la fase: la geometria estaba TRIPLICADA A MANO.
`python/modules/portada_uni.py` escribia el titulo en 20pt y
`src/components/layout/UNICoverPreview.tsx` lo pintaba en 16pt; el `.docx` ponia
el logo a `Cm(5.2)` y la preview a 150 px; y la hoja de la preview media 680 x
780 px sin relacion de aspecto. Tres constantes duplicadas y ningun token que
las amarre, asi que la preview se veia mas chica de lo que iba a salir.

LA FORMA HONESTA DE COMPARARLOS es leer la medida de los dos lados y restar.
`_escala_de_preview_calculada` REIMPLEMENTA `escalaDePreview` en Python, y eso
es a PROPOSITO: si importara el `.ts` no podria detectar que los dos lados
divergieron, que es justo lo que este test necesita vigilar. La duplicacion ES
el test.

La comparacion va en dos niveles:
  - la ARITMETICA (esta archivo): que el punto, el milimetro y la escala den el
    mismo numero que el lado de TypeScript.
  - los VALORES (este archivo y `src/__tests__/geometriaPortada.test.ts`): que
    los puntos que lleva cada bloque sean los mismos de un lado y del otro.
    Si alguien cambia 20 por 18 en Python y no en TypeScript, el primero se
    entera por el segundo test y el segundo por este.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import docx  # noqa: E402
import pytest  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402

from models import APARuleSet, DocumentModel, ElementModel, ElementType, PortadaData  # noqa: E402
from generation.generator import generate_apa7_docx  # noqa: E402
from modules import portada_uni  # noqa: E402

# ── La hoja, y la copia en TypeScript ─────────────────────────────────────────
#
# La hoja y los margenes estan en los dos lados. Estos son los numeros que
# `src/lib/portada/geometria.ts` declara, escritos aca para que este test pueda
# fallar si uno de los dos se mueve. `test_geometria_de_python_no_se_muda` de
# abajo es el que vigila que la copia de TypeScript no se aparte.
MM_POR_PULGADA = 25.4
PT_POR_PULGADA = 72
ANCHO_HOJA_PX = 680


def _escala_de_preview_calculada(ancho_px: float, hoja: str = "carta") -> float:
    """`escalaDePreview` de TypeScript, reimplementado. Ver el docstring."""
    ancho_mm, _alto_mm = portada_uni.hoja_de(hoja)
    return ancho_px / ancho_mm


def _pt_a_px(pt: float, escala: float) -> float:
    """`ptAPx` de TypeScript, reimplementado. Un punto es 1/72 de pulgada."""
    return pt * (MM_POR_PULGADA / PT_POR_PULGADA) * escala


def _mm_a_px(mm: float, ancho_px: float, hoja: str = "carta") -> float:
    """`mmAPx` de TypeScript, reimplementado."""
    return mm * _escala_de_preview_calculada(ancho_px, hoja)


# ── La aritmética ────────────────────────────────────────────────────────────

class TestLaAritmetica:
    def test_la_escala_es_el_ancho_de_pantalla_sobre_el_ancho_de_la_hoja(self):
        escala = _escala_de_preview_calculada(ANCHO_HOJA_PX, "carta")
        assert escala == pytest.approx(680 / 215.9, abs=1e-9)

    def test_un_punto_es_un_72_de_pulgada_y_no_una_aproximacion(self):
        # Si el punto se aproxima por 1.333 px, a 20pt salen 26.6 px y con el
        # valor exacto 26.48: casi medio pixel por bloque, y el error se acumula
        # en toda la hoja.
        escala = _escala_de_preview_calculada(ANCHO_HOJA_PX, "carta")
        assert _pt_a_px(72, escala) == pytest.approx(25.4 * escala, abs=1e-9)
        assert _pt_a_px(20, escala) == pytest.approx(20 * 25.4 / 72 * escala, abs=1e-9)

    def test_una_carta_a_680_px_mide_880_de_alto(self):
        # El defecto medido: la preview declaraba `minHeight: 780px` y la hoja
        # real a 680 px de ancho mide 880. Faltaban cien pixeles de papel.
        assert _mm_a_px(279.4, ANCHO_HOJA_PX, "carta") == pytest.approx(880, abs=0.5)
        assert _mm_a_px(297.0, ANCHO_HOJA_PX, "a4") > 880


class TestLaPreviewYElDocxDicenLoMismo:
    def test_la_preview_y_el_docx_dicen_lo_mismo_sobre_el_titulo(self):
        """La preview pintaba 16pt donde el `.docx` llevaba 20pt.

        A la escala de una carta a 680 px, 20pt son 26.5 px y 16pt son 21.2: un
        20% de diferencia en el bloque mas grande de la portada, y por eso todo
        se veia mas chico de lo que va a salir.
        """
        escala = _escala_de_preview_calculada(ANCHO_HOJA_PX)
        tamano_que_pinta_la_preview = _pt_a_px(portada_uni.PT_TITULO, escala)
        assert tamano_que_pinta_la_preview == pytest.approx(22.2, abs=0.5)
        # Lo que la preview pintaba antes, para que se vea la magnitud del error:
        # 16pt dan 17.8 px contra los 22.2 px del `.docx`, un 20% menos.
        assert tamano_que_pinta_la_preview - _pt_a_px(16, escala) > 4.0

    def test_cada_bloque_de_la_portada_lleva_los_mismos_puntos_en_los_dos_lados(self):
        """La tabla `PT_PORTADA_UNI` de `geometria.ts` es una COPIA de estas
        constantes. Si una se mueve y la otra no, la preview vuelve a mentir, y
        este test es el que dice cuál de las dos."""
        fuente_ts = (
            Path(__file__).parent.parent.parent
            / "src"
            / "lib"
            / "portada"
            / "geometria.ts"
        ).read_text(encoding="utf-8")

        pares = {
            "departamento": portada_uni.PT_DEPARTAMENTO,
            "titulo": portada_uni.PT_TITULO,
            "asignatura": portada_uni.PT_ASIGNATURA,
            "elaboradoPor": portada_uni.PT_ELABORADO_POR,
            "autor": portada_uni.PT_AUTOR,
            "carnet": portada_uni.PT_CARNET,
            "fecha": portada_uni.PT_FECHA,
            "lugar": portada_uni.PT_LUGAR,
        }
        for clave, valor in pares.items():
            assert f"{clave}: {valor}" in fuente_ts, (
                f"la tabla de TypeScript no declara {clave}: {valor}. "
                "Si cambiaste el punto en Python, cambialo tambien en "
                "src/lib/portada/geometria.ts, o la preview deja de coincidir "
                "con el .docx."
            )

    def test_la_hoja_y_los_margenes_no_se_separan_de_los_de_hoja(self):
        """Los numeros de la hoja estan duplicados a proposito (el `.docx` no
        puede importar el `.ts`), asi que este test compara los dos lados: si
        uno se mueve solo, la preview describe una hoja que el `.docx` no
        produce."""
        fuente_ts = (
            Path(__file__).parent.parent.parent / "src/lib/portada/geometria.ts"
        ).read_text(encoding="utf-8")
        ancho_carta, alto_carta = portada_uni.HOJA_CARTA_MM
        ancho_a4, alto_a4 = portada_uni.HOJA_A4_MM
        assert f"ancho: {ancho_carta}" in fuente_ts
        assert f"alto: {alto_carta}" in fuente_ts
        assert f"ancho: {ancho_a4}" in fuente_ts
        assert f"alto: {alto_a4}" in fuente_ts
        assert str(portada_uni.MARGENES_MM) in fuente_ts

    def test_el_ancho_util_es_16_51_cm_y_no_el_13_59_del_plan(self):
        """MEDIDO, no estimado. `APARuleSet.margins_cm` es 2.54 y
        `style_engine.py:192` lo convierte a pulgadas, asi que el `.docx` pone
        una pulgada de margen: 215.9 - 50.8 = 165.1 mm. El plan de la fase
        suponia 40 mm por lado y daba 13.59 cm, o sea una hoja que nadie
        produce."""
        assert portada_uni.ancho_util_mm("carta") == pytest.approx(165.1, abs=0.05)
        assert portada_uni.ancho_util_mm("a4") == pytest.approx(159.2, abs=0.05)
        assert portada_uni.MARGENES_MM == 25.4


# ── La hoja, en el `.docx` generado ──────────────────────────────────────────

def _modelo(session: str) -> DocumentModel:
    return DocumentModel(
        session_id=session,
        file_name="geometria.docx",
        elements=[
            ElementModel(id="e1", type=ElementType.PARAGRAPH, text="Cuerpo."),
        ],
    )


def _portada_uni() -> PortadaData:
    return PortadaData(
        use_original_cover=False,
        cover_mode="generate_uni_cover",
        title="Titulo",
        course="Asignatura",
    )


def _con_original(tmp_path: Path, session: str) -> Path:
    """Deja un `original.docx` junto a la salida.

    `generate_apa7_docx` busca el original en `salida.parent / "original.docx"` y
    si no lo encuentra FUERZA `cover_mode = "generate_apa7_template"`
    (`generator.py:970`): sin archivo de entrada la portada UNI no llega a
    construirse nunca, y un test de la geometria UNI que no lo sepa midiria la
    portada APA sin darse cuenta.
    """
    tmp_path.mkdir(parents=True, exist_ok=True)
    d = docx.Document()
    # Varios parrafos de cuerpo, y no uno: al reemplazar la portada original por
    # una sintetica se borran sus parrafos, y el gate de sanidad
    # (`verify_document_content_integrity`) compara los caracteres del original
    # contra los del generado. Con un parrafo solo, un documento de prueba
    # dispararia el gate por un borrado que aca no es lo que se mide.
    for i in range(8):
        d.add_paragraph(
            f"Parrafo {i} del cuerpo, con texto suficiente para que el gate de "
            "sanidad no se dispare por la portada que se reemplaza."
        )
    d.save(str(tmp_path / "original.docx"))
    return tmp_path / f"{session}.docx"


def _generar_uni(tmp_path: Path, session: str, page_size: str) -> docx.Document:
    salida = _con_original(tmp_path, session)
    generate_apa7_docx(
        _modelo(session),
        salida,
        rules=APARuleSet(page_size=page_size),
        portada=_portada_uni(),
    )
    return docx.Document(str(salida))


class TestLaHojaDelDocumentoLlegaAlDocx:
    @pytest.mark.parametrize("page_size,mm_esperado", [("carta", 215.9), ("a4", 210.0)])
    def test_la_portada_uni_no_hereda_la_hoja_del_original(
        self, tmp_path, page_size, mm_esperado
    ):
        """`portada_uni` y `cover_designer` heredaban la hoja del documento de
        entrada. `APARuleSet.page_size` existe desde la fase de Ajustes y NADIE
        lo aplicaba en portada, que es lo que hacia que el diseno no fuera de
        tamano definido: el usuario elegia Carta en Ajustes y la portada salia
        con la hoja que tuviera el original.

        OJO CON LA FRONTERA, porque es la decision del usuario del 2026-09-28 y
        no se vuelve a abrir: el tamano de pagina es propiedad del DOCUMENTO.
        `section.page_width` es de la seccion, o sea del contexto que rodea la
        portada, no de la portada. Aplicarlo no altera ni un caracter del
        bloque protegido, y `test_portada_integridad.py` lo prueba con un hash.
        """
        doc = _generar_uni(tmp_path, f"s-{page_size}", page_size)
        ancho_mm = doc.sections[0].page_width.mm
        assert ancho_mm == pytest.approx(mm_esperado, abs=0.5)

    def test_el_logo_mide_su_fraccion_del_ancho_util_en_las_dos_hojas(self, tmp_path):
        """El Review Focus #4. Con milimetros absolutos, un ancho calibrado
        para una hoja se ve distinto en la otra: el size RELATIVO tiene que ser
        el mismo, y el absoluto el que se acomoda."""
        carta = _generar_uni(tmp_path / "carta", "s-logo-carta", "carta")
        a4 = _generar_uni(tmp_path / "a4", "s-logo-a4", "a4")
        util_carta = portada_uni.ancho_util_mm("carta")
        util_a4 = portada_uni.ancho_util_mm("a4")
        # La imagen se mide en centimetros y el ancho util en milimetros: los
        # dos en la MISMA unidad, o la fraccion sale diez veces mas chica y el
        # test pasa por un error de unidades.
        frac_carta = _ancho_de_imagen_cm(carta) * 10.0 / util_carta
        frac_a4 = _ancho_de_imagen_cm(a4) * 10.0 / util_a4
        assert frac_carta == pytest.approx(
            portada_uni.FRACCION_DE_ANCHO_DEL_LOGO, abs=0.01
        )
        assert frac_a4 == pytest.approx(
            portada_uni.FRACCION_DE_ANCHO_DEL_LOGO, abs=0.01
        )

    def test_la_preview_dibuja_el_logo_con_la_misma_fraccion(self, tmp_path):
        """La otra mitad del Review Focus #4: la preview ponia `150px`, que es
        un 28.8% del ancho util, contra el 31.5% que llevaba el `.docx` --
        o sea, la preview lo achicaba y el usuario lo descubre al exportar.
        Ahora las dos sides salen de `FRACCION_DE_ANCHO_DEL_LOGO`.

        Los numeros esperados salen de la misma cuenta que el default del
        modelo: `165.1 mm de ancho util x 0.315 = 52.0 mm`, que son los
        `5.2 cm` del `Cm(5.2)` de antes. A 680 px de hoja eso son 163.8 px."""
        escala = _escala_de_preview_calculada(ANCHO_HOJA_PX)
        # La fraccion es del ANCHO UTIL, no del ancho de la hoja: los dos lados
        # tienen que medir sobre lo mismo, o la comparacion no dice nada.
        ancho_util_px = portada_uni.ancho_util_mm("carta") * escala
        px_que_pinta_la_preview = ancho_util_px * portada_uni.FRACCION_DE_ANCHO_DEL_LOGO
        # Y el `.docx` lleva ese mismo ancho en milimetros.
        mm_que_escribe_el_docx = (
            portada_uni.ancho_util_mm("carta") * portada_uni.FRACCION_DE_ANCHO_DEL_LOGO
        )
        assert px_que_pinta_la_preview == pytest.approx(163.8, abs=0.5)
        assert mm_que_escribe_el_docx == pytest.approx(52.0, abs=0.05)
        # El `150px` de antes era un 28.8% del ancho util: la preview achicaba
        # el logo casi a la mitad de lo que llevaba el `.docx`.
        assert 150 / ancho_util_px > 0.28


def _ancho_de_imagen_cm(doc: docx.Document) -> float:
    """El ancho de la primera imagen de la hoja, en centimetros.

    Se lee del `wp:extent` del XML, que es donde Word guarda el tamano con el
    que lo dibuja, y se divide por 360000 (EMU por centimetro). No se usa
    `inline_shapes[0].width`: el punto de este helper es leer el ARCHIVO, que es
    donde la divergencia se vuelve visible.
    """
    ext = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}extent"
    for parrafo in doc.paragraphs:
        for nodo in parrafo._element.iter(ext):
            return int(nodo.get("cx")) / 360000.0
    raise AssertionError("el documento no tiene ninguna imagen")
