"""
WordAPA7 — Tests de los endpoints del Word Add-in (Asistente en Vivo)

Verifica todos los endpoints expuestos por ``python/routers/addin.py`` usando
el ``TestClient`` de FastAPI (tests in-process, sin levantar servidor).

Endpoints cubiertos:
  1.  GET  /api/addin/health
  2.  POST /api/addin/analyze-selection
  3.  POST /api/addin/suggest-caption
  4.  POST /api/addin/validate-fragment
  5.  POST /api/addin/next-figure-number
  6.  POST /api/addin/next-table-number
  7.  POST /api/addin/extract-citations
  8.  GET  /api/addin/references
  9.  POST /api/addin/build-bibliography
  10. DELETE /api/addin/clear-references
  11. POST /api/addin/suggest-cover
  12. POST /api/addin/detect-headings

El store de referencias persiste en un archivo JSON (storage/references/).
Para no ensuciar el store real entre tests, se usa un fixture ``autouse`` que
vacía el store antes y después de cada test vía el endpoint ``clear-references``.
"""

import sys
from pathlib import Path

# Asegurar que el directorio ``python`` esté en el path (igual que conftest.py)
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient

from main import app

# Cliente de pruebas in-process. Se crea a nivel de módulo (sin context
# manager) para que NO se disparen los eventos de lifespan (arranque de
# LibreOffice / Word COM), que no son necesarios para estos tests.
client = TestClient(app)


# ── FIXTURES ──────────────────────────────────────────────────────────────────

import pytest


@pytest.fixture(autouse=True)
def clean_references_store():
    """Vacía el store de referencias del Add-in antes y después de cada test.

    El endpoint ``extract-citations`` persiste citas en un JSON en disco; sin
    esta limpieza, un test podría ver citas dejadas por otro test y fallar de
    forma intermitente.
    """
    client.delete("/api/addin/clear-references")
    yield
    client.delete("/api/addin/clear-references")


# ── 1. HEALTH ─────────────────────────────────────────────────────────────────

class TestAddinHealth:
    """Health check del backend para el Add-in."""

    def test_health_returns_ok(self):
        """GET /api/addin/health → status ok y versión presente."""
        resp = client.get("/api/addin/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "version" in data
        assert data["version"]  # no vacío


# ── 2. ANALYZE-SELECTION ─────────────────────────────────────────────────────

class TestAnalyzeSelection:
    """Análisis heurístico de un fragmento de texto contra APA 7."""

    def test_text_with_known_issues(self):
        """Texto con varios problemas conocidos debe reportar issues y bajar el score.

        Problemas sembrados:
          - "et al" sin punto abreviatura  (error)
          - dobles espacios tras punto    (warning)
          - MAYÚSCULAS sostenidas (20+)    (warning)
          - DOI sin prefijo URL            (warning)
        """
        text = (
            "El estudio de García et al, 2023 muestra resultados.  "
            "El DOI es 10.1234/ejemplo.2023. "
            "MAYUSCULASSOSTENIDASPARAEJEMPLO aquí."
        )
        resp = client.post("/api/addin/analyze-selection", json={"text": text})
        assert resp.status_code == 200
        data = resp.json()

        # Debe haber issues
        assert isinstance(data["issues"], list)
        assert len(data["issues"]) > 0, "Se esperaban issues para un texto con problemas"

        # El score debe ser menor a 100 (hay problemas)
        assert data["score"] < 100, f"Score debería ser < 100, fue {data['score']}"

        # Debe haber una sugerencia general (score < 70 → sugerencia de revisión)
        assert data["suggestion"] is not None

        # Verificar categorías específicas detectadas
        categories = {i["category"] for i in data["issues"]}
        assert "citas" in categories, f"Debería detectar issue de 'citas' (et al): {data['issues']}"
        assert "formato" in categories, f"Debería detectar issue de 'formato': {data['issues']}"
        assert "referencias" in categories, f"Debería detectar issue de 'referencias' (DOI): {data['issues']}"

    def test_clean_text_scores_100(self):
        """Un texto limpio (sin problemas) debe dar score 100."""
        text = "La inteligencia artificial transformó la educación en la última década."
        resp = client.post("/api/addin/analyze-selection", json={"text": text})
        assert resp.status_code == 200
        data = resp.json()
        assert data["score"] == 100, f"Score esperado 100, fue {data['score']}: {data['issues']}"
        assert data["issues"] == []
        assert data["suggestion"] is not None  # "El texto cumple con APA 7."

    def test_empty_text(self):
        """Texto vacío → sin issues y score 100."""
        resp = client.post("/api/addin/analyze-selection", json={"text": ""})
        assert resp.status_code == 200
        data = resp.json()
        assert data["issues"] == []
        assert data["score"] == 100


# ── 3. SUGGEST-CAPTION ────────────────────────────────────────────────────────

class TestSuggestCaption:
    """Sugerencia de caption APA 7 para figura o tabla."""

    def test_figure_caption(self):
        """type='figure' → label 'Figura' y caption no vacío."""
        resp = client.post(
            "/api/addin/suggest-caption",
            json={"type": "figure", "context_text": "Gráfico de barras con resultados."},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["label"] == "Figura"
        assert data["caption"]  # no vacío
        assert "note" in data

    def test_table_caption(self):
        """type='table' → label 'Tabla' y caption no vacío."""
        resp = client.post(
            "/api/addin/suggest-caption",
            json={"type": "table", "context_text": "Comparación de medias."},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["label"] == "Tabla"
        assert data["caption"]


# ── 4. VALIDATE-FRAGMENT ──────────────────────────────────────────────────────

class TestValidateFragment:
    """Validación de un fragmento según su tipo de elemento."""

    def test_heading_ending_with_period_is_flagged(self):
        """Un heading que termina en punto debe ser marcado (APA 7 no lo permite)."""
        resp = client.post(
            "/api/addin/validate-fragment",
            json={"text": "Introducción.", "element_type": "heading"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] != "ok", f"Debería tener issues: {data}"
        # Debe haber un issue de headings sobre el punto final
        headings_issues = [i for i in data["issues"] if i["category"] == "headings"]
        assert len(headings_issues) >= 1
        assert any("punto" in i["message"].lower() for i in headings_issues)

    def test_paragraph_with_et_al_no_dot(self):
        """Un párrafo con 'et al' sin punto debe marcar un error de citas."""
        resp = client.post(
            "/api/addin/validate-fragment",
            json={
                "text": "García et al, 2023 demostró resultados significativos.",
                "element_type": "paragraph",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "error", f"Debería ser error por 'et al': {data}"
        citas_issues = [i for i in data["issues"] if i["category"] == "citas"]
        assert len(citas_issues) >= 1
        assert citas_issues[0]["severity"] == "error"

    def test_clean_paragraph_is_ok(self):
        """Un párrafo limpio → status ok."""
        resp = client.post(
            "/api/addin/validate-fragment",
            json={"text": "El análisis estadístico reveló diferencias significativas.", "element_type": "paragraph"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["issues"] == []

    def test_empty_fragment(self):
        """Texto vacío → status ok sin issues."""
        resp = client.post(
            "/api/addin/validate-fragment",
            json={"text": "", "element_type": "paragraph"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert data["issues"] == []


# ── 5. NEXT-FIGURE-NUMBER ─────────────────────────────────────────────────────

class TestNextFigureNumber:
    """Cálculo del próximo número de figura a partir del texto del documento."""

    def test_next_number_after_gap(self):
        """Texto con 'Figura 1' y 'Figura 3' → próximo número = 4."""
        text = "Como se ve en la Figura 1 y en la Figura 3, los datos confirman."
        resp = client.post("/api/addin/next-figure-number", json={"document_text": text})
        assert resp.status_code == 200
        data = resp.json()
        assert data["next_number"] == 4
        assert "Figura 1" in data["existing_labels"]
        assert "Figura 3" in data["existing_labels"]

    def test_no_figures_returns_one(self):
        """Texto sin figuras → próximo número = 1."""
        resp = client.post("/api/addin/next-figure-number", json={"document_text": "Sin figuras aquí."})
        assert resp.status_code == 200
        data = resp.json()
        assert data["next_number"] == 1
        assert data["existing_labels"] == []


# ── 6. NEXT-TABLE-NUMBER ───────────────────────────────────────────────────────

class TestNextTableNumber:
    """Cálculo del próximo número de tabla a partir del texto del documento."""

    def test_next_number_after_two(self):
        """Texto con 'Tabla 2' → próximo número = 3."""
        text = "La Tabla 2 muestra los resultados consolidados del experimento."
        resp = client.post("/api/addin/next-table-number", json={"document_text": text})
        assert resp.status_code == 200
        data = resp.json()
        assert data["next_number"] == 3
        assert "Tabla 2" in data["existing_labels"]

    def test_no_tables_returns_one(self):
        """Texto sin tablas → próximo número = 1."""
        resp = client.post("/api/addin/next-table-number", json={"document_text": "No hay tablas."})
        assert resp.status_code == 200
        data = resp.json()
        assert data["next_number"] == 1


# ── 7. EXTRACT-CITATIONS ──────────────────────────────────────────────────────

class TestExtractCitations:
    """Extracción y persistencia de citas APA 7 (Asistente en Vivo)."""

    def test_extract_known_citations(self):
        """Texto con '(García, 2023)' y 'López y Martínez (2021, p. 45)' debe detectar citas."""
        text = (
            "El estudio (García, 2023) demuestra la teoría. "
            "López y Martínez (2021, p. 45) confirman los hallazgos."
        )
        resp = client.post("/api/addin/extract-citations", json={"text": text})
        assert resp.status_code == 200
        data = resp.json()

        assert isinstance(data["citations"], list)
        assert len(data["citations"]) >= 2, (
            f"Se esperaban ≥2 citas, se encontraron {len(data['citations'])}: {data['citations']}"
        )
        # Debe haber al menos una cita nueva (store limpio por fixture)
        assert data["new_count"] > 0, f"new_count debería ser > 0: {data}"
        # El store debe reflejar las citas guardadas
        assert data["total_in_store"] >= 2, (
            f"total_in_store debería ser ≥ 2: {data}"
        )

        # Verificar que García y López aparecen entre los autores detectados
        all_authors = []
        for c in data["citations"]:
            all_authors.extend(c.get("authors", []))
        authors_flat = " ".join(all_authors)
        assert "García" in authors_flat, f"Debería detectar a García: {all_authors}"
        assert "López" in authors_flat, f"Debería detectar a López: {all_authors}"

    def test_extract_empty_text(self):
        """Texto vacío → sin citas y total 0."""
        resp = client.post("/api/addin/extract-citations", json={"text": ""})
        assert resp.status_code == 200
        data = resp.json()
        assert data["citations"] == []
        assert data["new_count"] == 0
        assert data["total_in_store"] == 0


# ── 8. REFERENCES ─────────────────────────────────────────────────────────────

class TestReferences:
    """Listado de referencias guardadas en el store local."""

    def test_references_after_extract(self):
        """Tras extraer citas, GET /references debe listar las referencias creadas."""
        # Sembrar citas en el store
        client.post(
            "/api/addin/extract-citations",
            json={"text": "El estudio (García, 2023) confirma los datos."},
        )
        resp = client.get("/api/addin/references")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1, f"Debería haber ≥1 referencia: {data}"
        assert isinstance(data["references"], list)
        assert len(data["references"]) >= 1
        # Las referencias auto-creadas son borradores (drafts)
        assert data["drafts"] >= 1

    def test_references_empty_when_clean(self):
        """Con el store vacío, GET /references → total 0."""
        resp = client.get("/api/addin/references")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["references"] == []


# ── 9. BUILD-BIBLIOGRAPHY ─────────────────────────────────────────────────────

class TestBuildBibliography:
    """Construcción del texto de Referencias en APA 7."""

    def test_bibliography_after_extract(self):
        """Tras extraer citas, build-bibliography debe producir texto no vacío."""
        # Sembrar citas
        client.post(
            "/api/addin/extract-citations",
            json={"text": "El estudio (García, 2023) y López (2021) confirman."},
        )
        resp = client.post("/api/addin/build-bibliography", json={})
        assert resp.status_code == 200
        data = resp.json()
        assert data["bibliography_text"], "bibliography_text no debería estar vacío"
        assert data["total"] >= 1
        assert isinstance(data["references"], list)
        assert len(data["references"]) >= 1

    def test_bibliography_reextracts_from_document_text(self):
        """Si se envía document_text, build-bibliography re-extrae citas antes de construir."""
        resp = client.post(
            "/api/addin/build-bibliography",
            json={"document_text": "La teoría (Pérez, 2020) es relevante."},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["bibliography_text"]
        assert data["total"] >= 1
        # La referencia de Pérez debe aparecer
        bib_text = data["bibliography_text"]
        assert "Pérez" in bib_text or any(
            "Pérez" in " ".join(r.get("authors", [])) for r in data["references"]
        ), f"Pérez debería estar en la bibliografía: {data}"


# ── 10. CLEAR-REFERENCES ──────────────────────────────────────────────────────

class TestClearReferences:
    """Vaciado del store de referencias."""

    def test_clear_after_extract(self):
        """Tras extraer citas, clear-references debe vaciar el store."""
        # Sembrar citas
        client.post(
            "/api/addin/extract-citations",
            json={"text": "El estudio (García, 2023) confirma."},
        )
        # Verificar que hay algo
        refs_before = client.get("/api/addin/references").json()
        assert refs_before["total"] >= 1

        # Limpiar
        resp = client.delete("/api/addin/clear-references")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"

        # Verificar que quedó vacío
        refs_after = client.get("/api/addin/references").json()
        assert refs_after["total"] == 0
        assert refs_after["references"] == []


# ── 11. SUGGEST-COVER ─────────────────────────────────────────────────────────

class TestSuggestCover:
    """Sugerencia de los 5 campos de portada APA 7 (estudiante)."""

    def test_cover_fields_detected(self):
        """Texto con título, autor, universidad, materia y fecha → campos poblados."""
        document_text = (
            "Título: Impacto de la IA en la Educación Superior\n"
            "Autor: María García López\n"
            "Materia: Seminario de Investigación\n"
            "15 de mayo de 2025\n"
            "Universidad Nacional Autónoma de México"
        )
        resp = client.post("/api/addin/suggest-cover", json={"document_text": document_text})
        assert resp.status_code == 200
        data = resp.json()

        # Los 5 campos deben estar presentes
        for field in ("title", "author", "institution", "course", "date"):
            assert field in data, f"Falta el campo '{field}' en la portada: {data}"

        # Verificaciones específicas de la heurística (sin IA en tests)
        assert data["title"], "El título no debería estar vacío"
        assert "IA" in data["title"] or "Educación" in data["title"], (
            f"El título debería contener el tema: {data['title']}"
        )
        assert data["author"], "El autor no debería estar vacío"
        assert "María" in data["author"], f"Debería detectar a María: {data['author']}"
        assert data["institution"], "La institución no debería estar vacía"
        assert "Universidad" in data["institution"], (
            f"Debería detectar la universidad: {data['institution']}"
        )
        assert data["course"], "El curso/materia no debería estar vacío"
        assert "2025" in data["date"], f"La fecha debería contener 2025: {data['date']}"

    def test_cover_date_falls_back_to_today(self):
        """Si no hay fecha en el texto, se usa la fecha actual."""
        document_text = "Título: Algo\nAutor: Juan Pérez\nUniversidad Nacional"
        resp = client.post("/api/addin/suggest-cover", json={"document_text": document_text})
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"], "Debería generar una fecha por defecto"


# ── 12. DETECT-HEADINGS ───────────────────────────────────────────────────────

class TestDetectHeadings:
    """Detección de niveles de título APA 7 por heurística."""

    def test_known_sections_detected_as_level1(self):
        """'Introducción' y 'Metodología' → nivel 1; párrafo largo → no detectado."""
        paragraphs = [
            "Introducción",
            "Metodología",
            "un párrafo muy largo que no es un título.",
        ]
        resp = client.post("/api/addin/detect-headings", json={"paragraphs": paragraphs})
        assert resp.status_code == 200
        data = resp.json()

        assert isinstance(data["suggestions"], list)
        assert data["total"] == 2, (
            f"Debería detectar 2 headings (no el párrafo largo): {data}"
        )

        # Mapear texto → nivel sugerido
        by_text = {s["text"]: s["suggested_level"] for s in data["suggestions"]}
        assert "Introducción" in by_text, f"Debería sugerir 'Introducción': {data['suggestions']}"
        assert "Metodología" in by_text, f"Debería sugerir 'Metodología': {data['suggestions']}"
        assert by_text["Introducción"] == 1
        assert by_text["Metodología"] == 1

        # El párrafo largo (con punto final) NO debe aparecer como heading
        long_para = "un párrafo muy largo que no es un título."
        assert long_para not in by_text, "El párrafo largo no debería ser un heading"

    def test_detect_from_document_text(self):
        """Si se envía document_text en lugar de paragraphs, se divide por líneas."""
        document_text = "Resumen\nIntroducción\n"
        resp = client.post("/api/addin/detect-headings", json={"document_text": document_text})
        assert resp.status_code == 200
        data = resp.json()
        texts = [s["text"] for s in data["suggestions"]]
        assert "Introducción" in texts
        assert "Resumen" in texts

    def test_empty_paragraphs(self):
        """Lista vacía → sin sugerencias."""
        resp = client.post("/api/addin/detect-headings", json={"paragraphs": []})
        assert resp.status_code == 200
        data = resp.json()
        assert data["suggestions"] == []
        assert data["total"] == 0


# ── 13. AI-PROVIDERS ──────────────────────────────────────────────────────────

class TestAIProviders:
    """GET /api/addin/ai-providers — chips de estado de proveedores de IA."""

    def test_shape_and_count_consistency(self, monkeypatch):
        """Sin claves en el entorno → todos inactive y count 0."""
        for key in (
            "NVIDIA_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY",
            "CEREBRAS_API_KEY", "MISTRAL_API_KEY", "OPENCODEZEN_API_KEY",
            "ZENMUX_API_KEY", "GEMINI_API_KEY",
            "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID",
            "AION_API_KEY", "KILOCODE_API_KEY", "OLLAMA_API_KEY",
        ):
            monkeypatch.delenv(key, raising=False)

        resp = client.get("/api/addin/ai-providers")
        assert resp.status_code == 200
        data = resp.json()

        assert isinstance(data["providers"], list)
        assert len(data["providers"]) >= 9
        assert all(set(p.keys()) == {"name", "active"} for p in data["providers"])
        assert data["count"] == sum(1 for p in data["providers"] if p["active"])
        assert data["count"] == 0

    def test_active_provider_when_env_set(self, monkeypatch):
        """GROQ_API_KEY seteada → chip Groq activo y count ≥ 1."""
        monkeypatch.setenv("GROQ_API_KEY", "test-key")
        monkeypatch.delenv("NVIDIA_API_KEY", raising=False)

        data = client.get("/api/addin/ai-providers").json()
        by_name = {p["name"]: p for p in data["providers"]}
        assert by_name["Groq"]["active"] is True
        assert data["count"] >= 1

    def test_cloudflare_requires_token_and_account_pair(self, monkeypatch):
        """Solo CLOUDFLARE_API_TOKEN (sin ACCOUNT_ID) → Cloudflare inactivo."""
        monkeypatch.setenv("CLOUDFLARE_API_TOKEN", "tok")
        monkeypatch.delenv("CLOUDFLARE_ACCOUNT_ID", raising=False)

        data = client.get("/api/addin/ai-providers").json()
        cf = next(p for p in data["providers"] if p["name"] == "Cloudflare")
        assert cf["active"] is False

        monkeypatch.setenv("CLOUDFLARE_ACCOUNT_ID", "acc")
        data = client.get("/api/addin/ai-providers").json()
        cf = next(p for p in data["providers"] if p["name"] == "Cloudflare")
        assert cf["active"] is True
