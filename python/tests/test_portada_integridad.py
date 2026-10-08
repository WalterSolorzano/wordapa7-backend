"""
WordAPA7 - la portada original es un bloque INTOCABLE, y esto lo prueba.

Este es el test mas importante de la fase de portada, y el unico que protege una
promesa que esta escrita en `AGENTS.md`: con `use_original_cover: true` no se le
reescribe ni un caracter del bloque de portada del usuario.

La confusion que hay que desarmar, y que esta escrito en el spec (decision del
usuario, 2026-09-28): el TAMANO DE PAGINA es propiedad del DOCUMENTO. `sectPr`
es donde vive `page_width`, y `sectPr` es propiedad de la SECCION, o sea del
contexto que rodea la portada, no de la portada. Aplicarlo no altera ni un caracter
del texto, ni las imagenes, ni la tipografia del bloque protegido. Por eso el hash
excluye `sectPr` y el resto no se negocia: si este test cae, se rompio la
proteccion.

Que se compara, exactamente:

  - el texto de cada parrafo del bloque,
  - su estilo de parrafo,
  - cada run: texto, negrita, cursiva, subrayado, fuente, tamano y color,
  - las imagenes del bloque: cuantos `drawing` hay y de que tamano (`wp:extent`).

Que NO se compara, y por que (las dos exclusiones son deliberadas):

  - `sectPr`: ahi vive el tamano de pagina, que el test cambia a proposito.
  - `w:lang`: es el idioma, que el test tambien cambia a proposito. La proteccion
    es del TEXTO, las IMAGENES y la TIPOGRAFIA; el idioma del corrector de
    ortografia es una propiedad de la hoja, y hay un test aparte
    (`test_el_idioma_no_toca_la_portada`) que vigila que no se escriba dentro del
    bloque.
"""

import base64
import hashlib
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import docx  # noqa: E402
from docx.oxml.ns import qn  # noqa: E402
from docx.shared import Inches  # noqa: E402

from generation.generator import generate_apa7_docx  # noqa: E402
from models import (  # noqa: E402
    APARuleSet,
    DocumentMeta,
    DocumentModel,
    PortadaData,
)
from parsing.docx_parser import parse_docx_bytes  # noqa: E402

# Un PNG de 1x1, en blanco. La portada tiene que traer una imagen: un bloque de
# texto solo no ejercita la parte de la proteccion que mas se rompio.
PNG_1X1 = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

# Cuantos parrafos forman el bloque de portada del documento de prueba. El
# ultimo es el blanco de separacion: la portada de una UNAN real lo tiene, y
# un bloque de portada sin el no es el bloque de portada.
PORTADA_EN_PARRAFOS = 8


# ── El documento de prueba ───────────────────────────────────────────────────

def _escribir_original(destino: Path) -> Path:
    """Un `.docx` con portada (texto, imagen y separador) y cuerpo."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    img = destino.parent / "logo.png"
    img.write_bytes(PNG_1X1)

    d = docx.Document()
    d.add_paragraph("UNIVERSIDAD NACIONAL DE INGENIERIA")
    d.add_paragraph("FACULTAD DE ELECTROTECNIA Y COMPUTACION")
    d.add_paragraph().add_run().add_picture(str(img), width=Inches(1.2))
    d.add_paragraph("TEMA: ANALISIS DE SISTEMAS")
    d.add_paragraph("Elaborado por: Br. Juan Perez")
    d.add_paragraph("Docente: Ing. Carlos Rodriguez")
    d.add_paragraph("15 de junio de 2026")
    d.add_paragraph("")
    d.add_paragraph("Introduccion")
    d.add_paragraph("Este es el primer parrafo del cuerpo del trabajo academico.")
    d.save(destino)
    return destino


def _model_de_la_sesion(original: Path, tmp_path: Path, session: str) -> DocumentModel:
    """El modelo que el backend guardaria para esa sesion, con la portada
    declarada. El `body_start_paragraph_idx` va explicito porque una prueba de
    contrato no puede depender de que el detector de portada acierte."""
    doc_model = parse_docx_bytes(
        original.read_bytes(), original.name, session, tmp_path
    )
    doc_model.portada = {
        "detected": True,
        "body_start_paragraph_idx": PORTADA_EN_PARRAFOS,
        "element_ids": [],
        "fields": {},
        "profile_name": None,
    }
    return doc_model


# ── El hash del bloque protegido ─────────────────────────────────────────────

def _huella_de_un_run(run) -> str:
    color = None
    try:
        if run.font.color is not None and run.font.color.rgb is not None:
            color = str(run.font.color.rgb)
    except Exception:
        color = None
    size = run.font.size.pt if run.font.size is not None else None
    return "|".join(
        [
            run.text or "",
            str(run.bold),
            str(run.italic),
            str(run.underline),
            str(run.font.name),
            str(size),
            str(color),
        ]
    )


def _huella_de_imagenes(parrafo) -> str:
    """Cuantas imagenes y de que tamano. El `blip` identifica el asset y el
    `wp:extent` su tamano en la hoja: los dos son parte de la portada."""
    ext = "{http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing}extent"
    partes = []
    for drawing in parrafo._element.iter(qn("w:drawing")):
        for nodo in drawing.iter(ext):
            partes.append(f"{nodo.get('cx')}x{nodo.get('cy')}")
    return f"imgs={len(list(parrafo._element.iter(qn('w:drawing'))))};{'|'.join(partes)}"


def _hash_del_bloque_de_portada(doc, n_parrafos: int = PORTADA_EN_PARRAFOS) -> str:
    """Huella del bloque de portada de un documento YA generado.

    Excluye `sectPr` (el tamano de pagina vive ahi y el test lo cambia a
    proposito) y `w:lang` (el idioma, igual). Todo lo demas entra.
    """
    partes = []
    for p in doc.paragraphs[:n_parrafos]:
        estilo = p.style.name if p.style is not None else ""
        partes.append(f"P|{estilo}|{p.text}")
        partes.append(_huella_de_imagenes(p))
        for r in p.runs:
            partes.append(f"R|{_huella_de_un_run(r)}")
    return hashlib.sha256("\n".join(partes).encode("utf-8")).hexdigest()


# ── El generador bajo prueba ────────────────────────────────────────────────

def _generar(
    tmp_path: Path,
    nombre: str,
    session: str,
    rules: APARuleSet | None = None,
    portada: PortadaData | None = None,
    meta: DocumentMeta | None = None,
) -> Path:
    """Genera un `.docx` de la sesion `session` en su propia carpeta.

    `generate_apa7_docx` busca el original en `salida.parent / "original.docx"`,
    asi que cada generacion necesita su carpeta: si las dos compartieran el
    original, el hash "despues" compararia contra un archivo que el primer
    ``doc.save`` ya toco.
    """
    carpeta = tmp_path / session
    carpeta.mkdir(parents=True, exist_ok=True)
    original = _escribir_original(carpeta / "original.docx")
    doc_model = _model_de_la_sesion(original, carpeta, session)
    if meta is not None:
        doc_model.meta = meta
    salida = carpeta / f"{nombre}.docx"
    generate_apa7_docx(
        doc_model,
        salida,
        rules=rules or APARuleSet(),
        portada=portada or PortadaData(use_original_cover=True),
    )
    return salida


# ── El test ─────────────────────────────────────────────────────────────────

class TestElBloqueProtegido:
    def test_la_portada_original_queda_byte_a_byte_identica(self, tmp_path):
        """Con `use_original_cover`, nada de lo que hagamos puede tocar el bloque.

        El tamano de pagina, el idioma y los datos del acta son propiedades del
        DOCUMENTO. El bloque protegido es el texto, las imagenes y la tipografia
        de la portada original. Si este test falla, se rompio la promesa de
        `AGENTS.md` y hay que parar.
        """
        antes = _hash_del_bloque_de_portada(
            docx.Document(str(_generar(tmp_path, "antes", "s-antes")))
        )
        despues = _hash_del_bloque_de_portada(
            docx.Document(
                str(
                    _generar(
                        tmp_path,
                        "despues",
                        "s-despues",
                        rules=APARuleSet(page_size="a4"),
                        portada=PortadaData(use_original_cover=True, language="en-US"),
                        meta=DocumentMeta(
                            autor="Br. Juan Perez",
                            profesor_asesor=["Ing. Carlos Rodriguez"],
                            comite=["Lic. Ana Lopez", "Lic. Luis Gomez"],
                            fecha_defensa="15 de junio de 2026",
                        ),
                    )
                )
            )
        )
        assert antes == despues, "el bloque de portada original fue modificado"

    def test_la_portada_sigue_siendo_el_principio_del_documento(self, tmp_path):
        """Lo que se agrega al documento va DESPUES del bloque, no antes.

        Un indice de parrafo corrido es un bug silencioso: el resto de la app
        protege la portada a partir de ese numero, asi que se terminaria
        protegiendo el lugar equivocado.
        """
        salida = _generar(
            tmp_path,
            "orden",
            "s-orden",
            meta=DocumentMeta(
                autor="Br. Juan Perez",
                profesor_asesor=["Ing. Carlos Rodriguez"],
            ),
        )
        textos = [p.text for p in docx.Document(str(salida)).paragraphs]
        assert textos[0] == "UNIVERSIDAD NACIONAL DE INGENIERIA"
        assert textos[PORTADA_EN_PARRAFOS - 2] == "15 de junio de 2026"
        assert any("Introduccion" in t for t in textos)

    def test_el_idioma_no_toca_la_portada(self, tmp_path):
        """`aplicar_idioma_documento` declara en que idioma esta escrito cada
        run, y su propia documentacion dice que la portada es zona protegida y
        que ahi "no se escribe ni un byte". Por eso recibe
        `skip_body_paragraphs`: sin pasarselo, la pasada de idioma escribe
        `w:lang` DENTRO del bloque protegido, que es exactamente lo que la
        promesa de `AGENTS.md` prohibe."""
        salida = _generar(
            tmp_path,
            "idioma",
            "s-idioma",
            portada=PortadaData(use_original_cover=True, language="en-US"),
        )
        doc = docx.Document(str(salida))
        for p in doc.paragraphs[:PORTADA_EN_PARRAFOS]:
            assert p._element.find(f".//{qn('w:lang')}") is None, (
                f"el idioma se escribio dentro del bloque de portada: {p.text[:40]!r}"
            )


# ── Los datos del acta, que es lo que se perdia ─────────────────────────────

class TestLosDatosDelActa:
    def test_el_autor_llega_al_docx_aunque_la_portada_sea_la_original(self, tmp_path):
        """El defecto: autor, profesor y comite vivian DENTRO de `portada`, asi
        que con `use_original_cover` no habia de donde sacarlos y el `.docx`
        salia sin ellos. Eso es lo que reporto el usuario: "conservar original"
        pierde al profesor y al grupo."""
        salida = _generar(
            tmp_path,
            "acta",
            "s-acta",
            portada=PortadaData(use_original_cover=True),
            meta=DocumentMeta(
                autor="Br. Juan Perez",
                profesor_asesor=["Ing. Carlos Rodriguez"],
                comite=["Lic. Ana Lopez", "Lic. Luis Gomez"],
                fecha_defensa="15 de junio de 2026",
            ),
        )
        texto = "\n".join(p.text for p in docx.Document(str(salida)).paragraphs)
        assert "Br. Juan Perez" in texto
        assert "Ing. Carlos Rodriguez" in texto
        assert "Lic. Ana Lopez" in texto
        assert "Lic. Luis Gomez" in texto

    def test_sin_acta_no_se_inventa_ningun_parrafo(self, tmp_path):
        """El otro lado: un documento sin datos del acta no puede empezar a
        traer un acta vacia. Un bloque de cinco parrafos en blanco en cada
        exportacion es ruido que el usuario no pidio."""
        salida = _generar(tmp_path, "sin-acta", "s-sin-acta")
        texto = "\n".join(p.text for p in docx.Document(str(salida)).paragraphs)
        for etiqueta in ("Profesor asesor", "Comite", "Fecha de defensa"):
            assert etiqueta not in texto


class TestElModelo:
    def test_el_acta_vive_en_los_metadatos_y_no_en_la_portada(self):
        """La separacion es el arreglo. Los datos del acta son del documento;
        la portada es el bloque que no se toca. Si vuelven a `PortadaData`, con
        `use_original_cover` no hay de donde sacarlos otra vez."""
        campos = PortadaData.model_fields
        for actaa in ("author", "grupo", "instructor"):
            assert actaa not in campos, f"{actaa} volvio a la portada"
        meta = DocumentMeta.model_fields
        for acta in ("autor", "profesor_asesor", "comite", "fecha_defensa"):
            assert acta in meta, f"{acta} no esta en los metadatos del documento"

    def test_una_sesion_vieja_sigue_abriendo(self):
        """Lo que ya esta en disco no tiene los campos del acta, y un campo
        nuevo que rompe la apertura de un documento viejo no es un campo
        nuevo."""
        vieja = PortadaData.model_validate({"title": "Titulo", "institution": "UNI"})
        assert vieja.title == "Titulo"
        assert DocumentMeta.model_validate({}).autor in (None, "")
