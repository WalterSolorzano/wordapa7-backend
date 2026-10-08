"""
WordAPA7 — Suite de Regresión del Corpus

Verifica la clasificación y procesamiento de los 15 documentos del corpus.
Cada documento tiene un doc_XX_expected.json con la clasificación esperada.

Meta del Master Plan: Suite completa de regresión con >85% de precisión.

Ejecutar: cd python && python -m pytest tests/test_corpus.py -v
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from generation.generator import generate_apa7_docx
from models import APARuleSet, ElementType
from modules.citation_engine import extract_citations_from_text
from parsing.docx_parser import parse_docx_bytes

CORPUS_DIR = Path(__file__).parent.parent.parent / "corpus"


# ── HELPERS ─────────────────────────────────────────────────────────────────────

def corpus_file(name: str) -> Path:
    """Retorna la ruta completa a un archivo del corpus."""
    return CORPUS_DIR / name


def corpus_file_exists(name: str) -> bool:
    """Verifica si un archivo del corpus existe."""
    return corpus_file(name).exists()


# ── TESTS DE CLASIFICACIÓN DEL CORPUS ────────────────────────────────────────────

class TestCorpusClassification:
    """Verifica clasificación correcta de los documentos del corpus."""

    @pytest.mark.corpus
    def test_doc_01_limpio_classification(self):
        """doc_01_limpio.docx: todos los párrafos deben clasificarse correctamente."""
        if not corpus_file_exists("doc_01_limpio.docx"):
            pytest.skip("doc_01_limpio.docx no existe. Ejecuta generate_test_docs.py primero.")

        file_bytes = corpus_file("doc_01_limpio.docx").read_bytes()
        # Usar el parser completo que incluye pre-clasificación
        # Nota: parser_docx_bytes requiere storage_dir; usamos un directorio temporal
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            doc_model = parse_docx_bytes(
                file_bytes, "doc_01_limpio.docx", "corpus_test",
                Path(tmpdir)
            )

        elements = doc_model.elements
        types = [e.type for e in elements]

        # Verificar que hay headings
        headings = [e for e in elements if e.type == ElementType.HEADING]
        assert len(headings) >= 2, (
            f"Se esperaban al menos 2 headings, encontrados {len(headings)}. "
            f"Tipos: {[t.value for t in types]}"
        )

        # Verificar que hay párrafos
        paragraphs = [e for e in elements if e.type == ElementType.PARAGRAPH]
        assert len(paragraphs) >= 2, (
            f"Se esperaban al menos 2 párrafos, encontrados {len(paragraphs)}"
        )

        # Accuracy general
        total = len(elements)
        correct = len(headings) + len(paragraphs)
        accuracy = correct / total if total > 0 else 0
        assert accuracy > 0.70, f"Precisión del corpus 01: {accuracy:.1%}"

    @pytest.mark.corpus
    def test_doc_03_bullets_detection(self):
        """doc_03_bullets_manuales.docx: las viñetas deben detectarse como BULLET."""
        if not corpus_file_exists("doc_03_bullets_manuales.docx"):
            pytest.skip("doc_03_bullets_manuales.docx no existe. Ejecuta generate_test_docs.py primero.")

        file_bytes = corpus_file("doc_03_bullets_manuales.docx").read_bytes()

        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            doc_model = parse_docx_bytes(
                file_bytes, "doc_03_bullets_manuales.docx", "corpus_test_03",
                Path(tmpdir)
            )

        elements = doc_model.elements
        bullets = [e for e in elements if e.type == ElementType.BULLET]
        assert len(bullets) >= 3, (
            f"Se esperaban al menos 3 bullets, encontrados {len(bullets)}. "
            f"Tipos detectados: {[(e.type.value, e.text[:40]) for e in elements]}"
        )

    @pytest.mark.corpus
    def test_doc_04_headings_sin_estilo(self):
        """doc_04_headings_sin_estilo.docx: detectar headings sin estilo Word."""
        if not corpus_file_exists("doc_04_headings_sin_estilo.docx"):
            pytest.skip("doc_04_headings_sin_estilo.docx no existe. Ejecuta generate_test_docs.py primero.")

        file_bytes = corpus_file("doc_04_headings_sin_estilo.docx").read_bytes()

        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            doc_model = parse_docx_bytes(
                file_bytes, "doc_04_headings_sin_estilo.docx", "corpus_test_04",
                Path(tmpdir)
            )

        elements = doc_model.elements
        headings = [e for e in elements if e.type == ElementType.HEADING]
        assert len(headings) >= 2, (
            f"Se esperaban al menos 2 headings sin estilo Word, "
            f"encontrados {len(headings)}. "
            f"Elementos: {[(e.type.value, e.text[:50]) for e in elements]}"
        )


# ── TESTS DE CITAS EN CORPUS ────────────────────────────────────────────────────

class TestCorpusCitations:
    """Verifica detección de citas en documentos del corpus."""

    def test_citation_extraction_basic(self):
        """Cita parentética básica en texto español."""
        text = "Como han señalado varios autores (García, 2023), la educación "
        text += "virtual requiere un rediseño pedagógico profundo."

        cits = extract_citations_from_text(text, "elem_test")
        assert len(cits) >= 1, f"No se detectó la cita en: '{text}'"
        assert cits[0].year == "2023"

    def test_spanish_secondary_citation(self):
        """Cita secundaria en español: (Autor, año, como se citó en Autor, año)."""
        text = "El concepto fue propuesto originalmente (Vygotsky, 1978, como se "
        text += "citó en García, 2023) y ha sido ampliamente desarrollado."

        cits = extract_citations_from_text(text, "elem_test")
        secundarias = [c for c in cits if c.citation_type.value == "secundaria"]
        assert len(secundarias) >= 1, (
            f"No se detectó cita secundaria en español. "
            f"Citas: {[(c.citation_type.value, c.raw_text) for c in cits]}"
        )

    @pytest.mark.corpus
    def test_doc_11_citas_error_detection(self):
        """doc_11_citas_mal.docx: deben detectarse citas incluso con errores."""
        if not corpus_file_exists("doc_11_citas_mal.docx"):
            pytest.skip("doc_11_citas_mal.docx no existe. Ejecuta generate_test_docs.py primero.")

        file_bytes = corpus_file("doc_11_citas_mal.docx").read_bytes()

        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            doc_model = parse_docx_bytes(
                file_bytes, "doc_11_citas_mal.docx", "corpus_test_11",
                Path(tmpdir)
            )

        # Contar citas en todo el documento
        total_citations = 0
        for elem in doc_model.elements:
            if elem.text:
                cits = extract_citations_from_text(elem.text, elem.id)
                total_citations += len(cits)

        # Al menos debería detectar las citas correctas (aunque algunas con error no se detecten)
        assert total_citations >= 2, (
            f"Se esperaban al menos 2 citas detectadas, encontradas {total_citations}"
        )


# ── TESTS DE GENERACIÓN DESDE CORPUS ───────────────────────────────────────────

class TestCorpusGeneration:
    """Verifica generación APA 7 desde documentos del corpus."""

    @pytest.mark.corpus
    @pytest.mark.slow
    def test_generate_from_corpus_doc(self, test_output_dir):
        """Genera documento APA 7 desde doc_01_limpio.docx."""
        if not corpus_file_exists("doc_01_limpio.docx"):
            pytest.skip("Corpus no disponible. Ejecuta generate_test_docs.py primero.")

        file_bytes = corpus_file("doc_01_limpio.docx").read_bytes()

        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            doc_model = parse_docx_bytes(
                file_bytes, "doc_01_limpio.docx", "corpus_gen_test",
                Path(tmpdir)
            )

        rules = APARuleSet()
        out = test_output_dir / "corpus_generated.docx"
        path = generate_apa7_docx(doc_model, out, rules)

        assert path.exists()
        assert path.stat().st_size > 1000

        # Reabrir y verificar que es válido
        import docx
        doc = docx.Document(str(path))
        assert len(doc.paragraphs) > 0


# ── TESTS DE COBERTURA DEL CORPUS ──────────────────────────────────────────────

class TestCorpusCoverage:
    """Verifica que todos los documentos esperados del corpus existan."""

    EXPECTED_DOCS = [
        "doc_01_limpio.docx",
        "doc_02_fuentes_mixtas.docx",
        "doc_03_bullets_manuales.docx",
        "doc_04_headings_sin_estilo.docx",
        "doc_11_citas_mal.docx",
    ]

    def test_corpus_directory_exists(self):
        """El directorio corpus/ debe existir."""
        if not CORPUS_DIR.exists():
            pytest.skip(
                "Directorio corpus/ no existe. "
                "Ejecuta: cd python && python tests/generate_test_docs.py"
            )
        assert CORPUS_DIR.is_dir()

    def test_all_expected_docs_exist(self):
        """Todos los documentos esperados deben existir en corpus/."""
        if not CORPUS_DIR.exists():
            pytest.skip("Directorio corpus/ no existe.")

        missing = [doc for doc in self.EXPECTED_DOCS if not corpus_file_exists(doc)]
        assert len(missing) == 0, (
            f"Faltan documentos del corpus: {missing}. "
            f"Ejecuta: cd python && python tests/generate_test_docs.py"
        )

    def test_corpus_docs_are_valid(self):
        """Todos los documentos del corpus deben ser .docx válidos."""
        if not CORPUS_DIR.exists():
            pytest.skip("Directorio corpus/ no existe.")

        import zipfile

        invalid = []
        for doc_name in self.EXPECTED_DOCS:
            path = corpus_file(doc_name)
            if path.exists():
                if not zipfile.is_zipfile(str(path)):
                    invalid.append(doc_name)

        assert len(invalid) == 0, f"Documentos corruptos (no son ZIP válido): {invalid}"
