"""
WordAPA7 — el tamaño de hoja y el idioma LLEGAN al .docx.

Este archivo es la parte que hace que el selector de la pestaña Documento no sea
otro control muerto. La contradicción que venga a matar: `design-system.css`
fijaba la hoja en A4 (210 x 297 mm), el lienzo pintaba eso, y el `.docx` salía
con el tamaño que tuviera el original. Dos verdades sobre la misma hoja, y
ninguna mirando a la otra.

Lo que se prueba acá, y no se vería en una captura:

  1. `APARuleSet.page_size` es un VALOR CERRADO y su default es Carta, que es lo
     que dice `DESIGN.md:75`. Un default en A4 haría que el caso por defecto
     siguiera siendo una contradicción.
  2. Un documento generado con "a4" mide 210 mm y con "carta" mide 215.9 mm. La
     medida se lee de `section.page_width` del archivo GENERADO, no de un
     diccionario en memoria: si el generador no lo escribiera, esto se caería.
  3. Las TRES rutas de exportación aplican el tamaño. La de omisión es
     `apply_inplace`, y si solo se tocaran las otras dos el control seguiría
     sin hacer nada en el 90% de las descargas.
  4. `PortadaData.language` llega como `w:lang` al archivo generado. Sin eso,
     Word revisa la ortografía con su idioma por omisión y subraya un texto en
     español que está bien escrito.
  5. Lo que se escribe es `w:lang`, y no una nota en el cuerpo: el atributo
     tiene que estar en el `rPr` de los runs, porque ahí es donde gana sobre los
     `docDefaults` de una plantilla que ya traía `en-US`.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import docx
import pytest
from docx.oxml.ns import qn

from generation.generator import generate_apa7_docx
from generation.inplace_editor import apply_inplace
from generation.layered_generator import generate_apa7_from_scratch
from models import (
    APARuleSet,
    DocumentModel,
    ElementModel,
    ElementType,
    PortadaData,
)

# 1 pulgada son 914400 EMU. 25.4 mm son una pulgada.
EMU_POR_MM = 914400 / 25.4

# OOXML guarda el tamaño de hoja en TWIPS (1/1440 de pulgada = 0,0176 mm), no en
# milímetros ni en EMU. El viaje ida y vuelta pasa por esa granularidad, así que
# una igualdad exacta en milímetros sería precisión de mentira: A4 son 11906
# twips y no 11905,51. Por eso se compara con una tolerancia de medio twip, y
# abajo está la comprobación exacta en twips, que es donde vive el número que
# Word realmente escribe.
TOLERANCIA_MM = 0.01


def _mm_aproximado(emu, mm_esperado: float) -> bool:
    return abs(int(emu) / EMU_POR_MM - mm_esperado) < TOLERANCIA_MM


def _twips(emu) -> int:
    return int(emu) // 635


# Los tamaños canónicos, en twips: son los números que Word escribe, y son
# exactos. Carta divide exacto en pulgadas; A4 es el que Word redondea.
TWIPS_CARTA = (12240, 15840)      # 8,5" x 11"
TWIPS_A4 = (11906, 16838)        # 210 x 297 mm


def _model(session: str = "s-pagina") -> DocumentModel:
    return DocumentModel(
        session_id=session,
        file_name="pagina.docx",
        elements=[
            ElementModel(id="e1", type=ElementType.PARAGRAPH, text="Primer parrafo."),
            ElementModel(id="e2", type=ElementType.PARAGRAPH, text="Segundo parrafo."),
        ],
    )


def _model_con_portada(body_start: int) -> DocumentModel:
    """Un modelo que SÍ declara dónde termina la portada, que es lo que lee
    `apply_inplace`. Sin esto el piso por contenido decide, y decide mirando los
    primeros 60 parrafos: una prueba de contrato no puede depender de eso."""
    m = _model("s-portada")
    m.portada = {"detected": True, "body_start_paragraph_idx": body_start}
    return m


def _generar(tmp_path: Path, page_size: str, language: str = "es-ES") -> Path:
    out = tmp_path / f"{page_size}.docx"
    generate_apa7_docx(
        _model(),
        out,
        rules=APARuleSet(page_size=page_size),
        portada=PortadaData(language=language),
    )
    return out


# ── El campo: cerrado, y con el default que dice DESIGN.md ────────────────────

class TestElCampoPageSize:
    def test_el_default_es_carta_no_a4(self):
        """`DESIGN.md:75` pide Carta 8.5 x 11. Un default en A4 dejaría la
        contradicción viva en el caso por defecto, que es el más común."""
        assert APARuleSet().page_size == "carta"

    def test_un_valor_que_no_esta_en_la_lista_se_rechaza(self):
        with pytest.raises(Exception):
            APARuleSet(page_size="legal")

    def test_los_nombres_que_ya_usa_el_cliente_se_normalizan(self):
        """`pageGeometry.ts` ya recibia 'letter' como texto libre, y hay
        documentos guardados con esa forma. Sin normalizar, reabrir uno de ellos
        fallaria en vez de abrir con Carta."""
        assert APARuleSet(page_size="letter").page_size == "carta"
        assert APARuleSet(page_size="LETTER").page_size == "carta"
        assert APARuleSet(page_size="A4").page_size == "a4"
        assert APARuleSet(page_size=None).page_size == "carta"
        assert APARuleSet(page_size="").page_size == "carta"

    def test_un_documento_guardado_sin_el_campo_sigue_abriendo(self):
        """Lo que ya está en disco no tiene `page_size`, y un campo nuevo que
        rompe la apertura de un documento viejo no es un campo nuevo."""
        viejo = APARuleSet.model_validate({"font_family": "Georgia", "margins_cm": 3.0})
        assert viejo.page_size == "carta"
        assert viejo.font_family == "Georgia"


# ── El tamaño, medido en el archivo generado ──────────────────────────────────

class TestElTamanoLlegaAlDocx:
    def test_a4_mide_210_por_297(self, tmp_path):
        sec = docx.Document(str(_generar(tmp_path, "a4"))).sections[0]
        assert _mm_aproximado(sec.page_width, 210.0)
        assert _mm_aproximado(sec.page_height, 297.0)
        assert (_twips(sec.page_width), _twips(sec.page_height)) == TWIPS_A4

    def test_carta_mide_215_9_por_279_4(self, tmp_path):
        sec = docx.Document(str(_generar(tmp_path, "carta"))).sections[0]
        # 8.5" son 215.9 mm y 11" son 279.4 mm. La conversion se hace en mm a
        # proposito: 8.5 pulgadas redondeadas a dos decimales en pulgadas son
        # 215.9 mm, y Word no reconoce la hoja si el ancho no cuadra.
        assert _mm_aproximado(sec.page_width, 215.9)
        assert _mm_aproximado(sec.page_height, 279.4)
        # Carta divide exacto: no hay tolerancia que explicar acá.
        assert (_twips(sec.page_width), _twips(sec.page_height)) == TWIPS_CARTA

    def test_los_dos_tamanos_difieren_en_la_hoja_generada(self, tmp_path):
        """La comprobacion de arriba, comparada. Si `aplicar_tamano_pagina`
        dejara de correr, las dos medidas darian Carta y cada prueba individual
        pasaria igual."""
        a4 = docx.Document(str(_generar(tmp_path, "a4"))).sections[0]
        carta = docx.Document(str(_generar(tmp_path, "carta"))).sections[0]
        assert a4.page_width < carta.page_width
        assert a4.page_height > carta.page_height

    def test_la_ruta_desde_cero_tambien_lo_aplica(self, tmp_path):
        """`generate_apa7_from_scratch` es la segunda ruta de rebuild. Antes
        escribia Letter a mano por encima de lo que hiciera `apply_page_setup`,
        de modo que elegir A4 y usar esta ruta daba Carta."""
        out = tmp_path / "from-scratch-a4.docx"
        generate_apa7_from_scratch(_model(), out, rules=APARuleSet(page_size="a4"))
        sec = docx.Document(str(out)).sections[0]
        assert _mm_aproximado(sec.page_width, 210.0)
        assert _mm_aproximado(sec.page_height, 297.0)


class TestLaRutaDeOmision:
    """`apply_inplace` es la ruta de exportación por omisión: `export_mode` es
    "inplace" y la portada original se conserva. Si el tamaño no llegara acá, el
    selector se vería lleno y el archivo saldría con el papel del original."""

    def _original(self, tmp_path: Path, ancho_in: float, alto_in: float) -> Path:
        d = docx.Document()
        for _ in range(6):
            d.add_paragraph("Parrafo del original.")
        d.sections[0].page_width = int(ancho_in * 914400)
        d.sections[0].page_height = int(alto_in * 914400)
        path = tmp_path / "original.docx"
        d.save(str(path))
        return path

    def test_un_original_a4_sale_en_carta_si_eso_se_elige(self, tmp_path):
        original = self._original(tmp_path, 8.27, 11.69)   # A4
        out = tmp_path / "inplace-carta.docx"
        apply_inplace(original, out, _model(), APARuleSet(page_size="carta"))
        sec = docx.Document(str(out)).sections[0]
        assert _mm_aproximado(sec.page_width, 215.9)
        assert _mm_aproximado(sec.page_height, 279.4)

    def test_y_sale_en_a4_si_se_elige_a4(self, tmp_path):
        original = self._original(tmp_path, 8.5, 11.0)     # Letter
        out = tmp_path / "inplace-a4.docx"
        apply_inplace(original, out, _model(), APARuleSet(page_size="a4"))
        sec = docx.Document(str(out)).sections[0]
        assert _mm_aproximado(sec.page_width, 210.0)
        assert _mm_aproximado(sec.page_height, 297.0)

    def test_una_seccion_apaisada_se_queda_apaisada(self, tmp_path):
        """Se cruzan ancho y alto. Si se escribieran derechos con el flag de
        apaisada, Word muestra una hoja que no es de ningún tamaño conocido."""
        from docx.enum.section import WD_ORIENT
        d = docx.Document()
        for _ in range(4):
            d.add_paragraph("Parrafo.")
        d.sections[0].orientation = WD_ORIENT.LANDSCAPE
        d.sections[0].page_width = int(11 * 914400)
        d.sections[0].page_height = int(8.5 * 914400)
        original = tmp_path / "original-apaisado.docx"
        d.save(str(original))

        out = tmp_path / "inplace-apaisado.docx"
        apply_inplace(original, out, _model(), APARuleSet(page_size="a4"))
        sec = docx.Document(str(out)).sections[0]
        assert _mm_aproximado(sec.page_width, 297.0)
        assert _mm_aproximado(sec.page_height, 210.0)
        assert sec.orientation == WD_ORIENT.LANDSCAPE

    def test_la_portada_no_se_toca_al_cambiar_el_tamano(self, tmp_path):
        """La portada es zona protegida (`AGENTS.md`): cambiar el papel no puede
        pegarle un byte a los parrafos de la portada."""
        d = docx.Document()
        for linea in ("UNIVERSIDAD NACIONAL DE TRUJILLO", "FACULTAD DE PSICOLOGIA", ""):
            d.add_paragraph(linea)
        d.add_heading("Introduccion", level=1)
        for _ in range(6):
            d.add_paragraph("Parrafo del cuerpo con texto suficiente.")
        original = tmp_path / "original-con-portada.docx"
        d.save(str(original))

        antes = docx.Document(str(original))
        antes_portada = [p.text for p in antes.paragraphs[:3]]

        out = tmp_path / "inplace-portada.docx"
        apply_inplace(original, out, _model_con_portada(3), APARuleSet(page_size="a4"))

        despues = docx.Document(str(out))
        assert [p.text for p in despues.paragraphs[:3]] == antes_portada


# ── El idioma ─────────────────────────────────────────────────────────────────

class TestElIdiomaLlegaAlDocx:
    def _langs(self, path: Path) -> set:
        d = docx.Document(str(path))
        vals = set()
        for para in d.paragraphs:
            for run in para._element.iter(qn("w:r")):
                rpr = run.find(qn("w:rPr"))
                if rpr is None:
                    continue
                lang = rpr.find(qn("w:lang"))
                if lang is not None:
                    vals.add(lang.get(qn("w:val")))
        return vals

    def test_el_idioma_elegido_llega_como_w_lang(self, tmp_path):
        out = _generar(tmp_path, "carta", language="en-GB")
        assert "en-GB" in self._langs(out)

    def test_el_default_es_espanol_y_no_el_de_la_plantilla(self, tmp_path):
        out = _generar(tmp_path, "carta")
        langs = self._langs(out)
        assert "es-ES" in langs
        assert "en-US" not in langs, (
            "en-US es el idioma por omision de la plantilla de Word; dejarlo "
            "puesto es lo que hace que la revision de ortografia marque todo"
        )

    def test_los_valores_cerrados_se_normalizan(self):
        assert PortadaData().language == "es-ES"
        assert PortadaData(language="es").language == "es-ES"
        assert PortadaData(language="EN").language == "en-US"
        assert PortadaData(language="en_GB").language == "en-GB"
        assert PortadaData(language=None).language == "es-ES"
        with pytest.raises(Exception):
            PortadaData(language="klingon")

    def test_un_original_que_ya_traia_en_us_lo_pierde(self, tmp_path):
        """El `w:lang` del run gana sobre `docDefaults`. Por eso el idioma se
        escribe tambien en cada run: sin ese paso, elegir el idioma no cambiaria
        nada en la mitad de los documentos reales."""
        d = docx.Document()
        p = d.add_paragraph("El ni\u00f1o comi\u00f3 mermelada.")
        rpr = p.runs[0]._element.get_or_add_rPr()
        lang = rpr.makeelement(qn("w:lang"), {qn("w:val"): "en-US"})
        rpr.append(lang)
        original = tmp_path / "original-en-us.docx"
        d.save(str(original))

        out = tmp_path / "inplace-es.docx"
        apply_inplace(original, out, _model(), APARuleSet(), language="es-ES")

        assert "en-US" not in self._langs(out)
        assert "es-ES" in self._langs(out)

    def test_los_defaults_de_la_hoja_de_estilos_lo_declaran(self, tmp_path):
        """Word mira primero el estilo `Normal`, y despues `docDefaults`. Los
        dos tienen que decir el idioma, o un run nuevo nace sin el."""
        out = _generar(tmp_path, "carta", language="es-MX")
        styles = docx.Document(str(out)).styles._element
        assert "es-MX" in styles.xml
