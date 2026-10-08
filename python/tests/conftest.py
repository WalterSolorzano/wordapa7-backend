"""
WordAPA7 — Fixtures Compartidos para Tests

Proporciona helpers para crear documentos .docx de prueba,
mock de respuestas de NVIDIA NIM, y configuración de sesión.
"""

import atexit
import io
import os
import shutil
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

# Aislamiento de storage (Issue #16): los tests NUNCA escriben en el
# storage real del usuario. Se fija el override ANTES de cualquier
# import del proyecto para que config.py (que lee el env al importar)
# resuelva siempre en un temporal descartado al cerrar la sesión.
if not os.environ.get("WORDAPA7_STORAGE_DIR"):
    _TEST_STORAGE = tempfile.mkdtemp(prefix="wordapa7_tests_")
    os.environ["WORDAPA7_STORAGE_DIR"] = _TEST_STORAGE
    atexit.register(shutil.rmtree, _TEST_STORAGE, ignore_errors=True)

import docx
import pytest
from docx.shared import Inches

# Asegurar que el directorio python está en el path
sys.path.insert(0, str(Path(__file__).parent.parent))

from models import (
    APAFormat,
    APARuleSet,
    DocumentMeta,
    DocumentModel,
    ElementModel,
    ElementType,
    PortadaData,
    ReferenciaModel,
)

# ── FIXTURES DE SESIÓN ──────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def test_output_dir():
    """Directorio temporal para outputs de tests."""
    tmp = Path(tempfile.mkdtemp(prefix="wordapa7_test_"))
    yield tmp
    shutil.rmtree(tmp, ignore_errors=True)


@pytest.fixture(scope="session")
def rules_default():
    """Reglas APA 7 estándar por defecto."""
    return APARuleSet()


@pytest.fixture(scope="session")
def rules_times():
    """Reglas APA 7 con Times New Roman 12pt."""
    return APARuleSet(
        profile_name="Times APA7",
        font_family="Times New Roman",
        font_size_pt=12,
        line_spacing=2.0,
        paragraph_indent_cm=1.27,
        margins_cm=2.54,
    )


@pytest.fixture(scope="session")
def rules(rules_default):
    """Alias para rules_default — usado por la mayoria de los tests."""
    return rules_default


# ── HELPERS DE CREACIÓN DE ELEMENTOS ────────────────────────────────────────────

@pytest.fixture
def make_element():
    """Factory fixture para crear ElementModel rápidamente."""
    def _make(
        elem_id="1",
        elem_type=ElementType.PARAGRAPH,
        text="",
        style_name="Normal",
        alignment="left",
        font_name="Times New Roman",
        font_size=12.0,
        is_bold=False,
        is_italic=False,
        is_bullet=False,
        left_indent_cm=0.0,
        heading_level=1,
        confidence=0.5,
        image_info=None,
        table_info=None,
    ):
        return ElementModel(
            id=elem_id,
            type=elem_type,
            text=text,
            style_name=style_name,
            alignment=alignment,
            font_name=font_name,
            font_size=font_size,
            is_bold=is_bold,
            is_italic=is_italic,
            is_bullet=is_bullet,
            left_indent_cm=left_indent_cm,
            heading_level=heading_level,
            confidence=confidence,
            image_info=image_info,
            table_info=table_info,
        )
    return _make


@pytest.fixture
def make_doc_model():
    """Factory fixture para crear DocumentModel rápidamente."""
    def _make(
        session_id="test_session",
        file_name="test.docx",
        elements=None,
        apa_format=APAFormat.STUDENT,
    ):
        return DocumentModel(
            session_id=session_id,
            file_name=file_name,
            apa_format=apa_format,
            elements=elements or [],
        )
    return _make


# ── HELPERS DE CREACIÓN DE DOCX ────────────────────────────────────────────────

@pytest.fixture
def make_docx_bytes():
    """Factory fixture para crear un .docx en memoria y retornar sus bytes."""
    def _make(build_fn):
        """
        build_fn recibe un docx.Document y le agrega contenido.
        Retorna los bytes del archivo .docx.
        """
        doc = docx.Document()

        # Configurar márgenes por defecto
        section = doc.sections[0]
        section.top_margin = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin = Inches(1.0)
        section.right_margin = Inches(1.0)

        build_fn(doc)

        buf = io.BytesIO()
        doc.save(buf)
        buf.seek(0)
        return buf.getvalue()

    return _make


@pytest.fixture
def make_docx_file(make_docx_bytes, test_output_dir):
    """Factory fixture para crear un archivo .docx temporal en disco."""
    def _make(build_fn, filename="test_doc.docx"):
        file_bytes = make_docx_bytes(build_fn)
        filepath = test_output_dir / filename
        filepath.write_bytes(file_bytes)
        return filepath
    return _make


# ── MOCK NVIDIA API ─────────────────────────────────────────────────────────────

@pytest.fixture
def mock_nvidia_response():
    """Respuesta simulada del API de NVIDIA NIM para clasificación LLM."""
    return {
        "choices": [
            {
                "message": {
                    "content": '{"type": "heading", "heading_level": 2, "confidence": 0.95, "reasoning": "Formato de heading APA nivel 2"}'
                }
            }
        ]
    }


@pytest.fixture
def mock_nvidia_no_response():
    """Respuesta simulada cuando NVIDIA NIM no está disponible."""
    return None


@pytest.fixture
def mock_llm_classifier(mock_nvidia_response):
    """Mockea el clasificador LLM para tests que no requieren API real."""
    with patch("classification.llm_classifier.classify_document_with_llm") as mock:
        async def _side_effect(doc, api_key=None):
            # Marcar elementos de baja confianza como revisados
            for elem in doc.elements:
                if elem.confidence < 0.85:
                    elem.needs_review = True
                    elem.llm_reasoning = "Mock LLM classification"
            return doc
        mock.side_effect = _side_effect
        yield mock


# ── PORTADA Y REFERENCIAS DE PRUEBA ─────────────────────────────────────────────

@pytest.fixture
def portada_sample():
    """Datos de portada de ejemplo.

    Solo el DISENO de la hoja. El autor y el profesor asesor son datos del acta
    y van en `DocumentMeta` (ver el motivo en `models.py`); si se los deja
    acá, el fixture se sigue construyendo sin error y el `.docx` sale sin
    ellos.
    """
    return PortadaData(
        apa_format=APAFormat.STUDENT,
        title="Impacto de la Inteligencia Artificial en la Educación Superior",
        institution="Universidad Nacional Autónoma de México",
        course="Seminario de Investigación Educativa",
        date="15 de mayo de 2025",
    )


@pytest.fixture
def acta_sample():
    """Los datos del acta de ejemplo: autor, profesor asesor y comité."""
    return DocumentMeta(
        autor="María García López",
        profesor_asesor=["Dr. Roberto Méndez Castillo"],
        comite=["Dra. Elena Vargas", "Lic. Miguel Castro"],
        fecha_defensa="15 de mayo de 2025",
    )


@pytest.fixture
def references_sample():
    """Referencias de ejemplo."""
    return [
        ReferenciaModel(
            id="ref_1",
            authors=["García", "M."],
            year="2023",
            title="Inteligencia artificial en el aula: Un estudio comparativo",
            source="Revista de Educación Superior, 45(2), 123-145",
            doi_or_url="https://doi.org/10.1234/edu.2023.45.2",
            raw_text="García, M. (2023). Inteligencia artificial en el aula: Un estudio comparativo. Revista de Educación Superior, 45(2), 123-145.",
        ),
        ReferenciaModel(
            id="ref_2",
            authors=["López", "R.", "Martínez", "A."],
            year="2021",
            title="Modelos de lenguaje y procesamiento de texto académico",
            source="Editorial Universitaria",
            raw_text="López, R. y Martínez, A. (2021). Modelos de lenguaje y procesamiento de texto académico. Editorial Universitaria.",
        ),
    ]
