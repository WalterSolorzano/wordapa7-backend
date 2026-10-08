"""Tests del endpoint /api/proofread-batch y la integración del
proactive_auditor en /api/ai-review.

E1 — /api/proofread-batch:
  Acepta textos sueltos (tests / add-in) o un session_id (frontend).
  Devuelve { findings, used_llm, ai_indices } — el shape que espera el
  frontend (ProofreadBatchResponse en backend.ts).

E2 — /api/ai-review:
  Tras el análisis de IA por párrafo, fusiona hallazgos del auditor
  proactivo local (palabras duplicadas, texto pegado, etc.) en los
  findings de cada párrafo.
"""
import sys
import uuid
from pathlib import Path

# Asegurar que el directorio ``python`` esté en el path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient

from main import app  # noqa: E402

# Cliente in-process (sin context manager → sin lifespan events).
client = TestClient(app)

# ── Helpers de sesión de prueba ──────────────────────────────────────────────

from config import STORAGE_DIR  # noqa: E402
from models import (  # noqa: E402
    APAFormat,
    DocumentModel,
    ElementModel,
    ElementType,
)
from persistence.session_manager import delete_session, save_session_state  # noqa: E402


def _make_test_session(texts: list[str]) -> str:
    """Crea y persiste una sesión de prueba con párrafos, retorna el session_id."""
    sid = f"test-pr-{uuid.uuid4().hex[:8]}"
    elements = [
        ElementModel(id=f"e{i}", type=ElementType.PARAGRAPH, text=t)
        for i, t in enumerate(texts)
    ]
    doc = DocumentModel(
        session_id=sid,
        file_name="test_proofread.docx",
        apa_format=APAFormat.STUDENT,
        elements=elements,
    )
    save_session_state(doc, STORAGE_DIR)
    return sid


def _cleanup_session(sid: str) -> None:
    """Elimina la sesión de prueba de la BD (idempotente)."""
    try:
        delete_session(sid, STORAGE_DIR)
    except Exception:
        pass


# ── E1: /api/proofread-batch ─────────────────────────────────────────────────


class TestProofreadBatch:
    """Revisor por lotes: ortografía + frases IA + texto pegado (local)."""

    def test_duplicate_word_detected(self):
        """POST con un texto que tiene palabra duplicada → finding sobre 'duplic'."""
        resp = client.post(
            "/api/proofread-batch",
            json={"texts": ["El resultado final final fue claro."]},
        )
        assert resp.status_code == 200
        data = resp.json()
        findings = data["findings"]
        dup = [
            f for f in findings
            if "duplic" in f.get("message", "").lower()
        ]
        assert len(dup) >= 1, (
            f"Se esperaba un hallazgo de palabra duplicada, se obtuvo: {findings}"
        )

    def test_response_shape(self):
        """La respuesta debe tener findings (list), used_llm (bool) y ai_indices."""
        resp = client.post(
            "/api/proofread-batch",
            json={"texts": ["El resultado final final fue claro."]},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "findings" in data
        assert "used_llm" in data
        assert isinstance(data["findings"], list)
        assert isinstance(data["used_llm"], bool)
        # ai_indices puede ser null (texto corto) o un dict con score/zone.
        assert "ai_indices" in data

    def test_empty_texts(self):
        """POST con texts vacío → findings vacíos y status 200."""
        resp = client.post("/api/proofread-batch", json={"texts": []})
        assert resp.status_code == 200
        data = resp.json()
        assert data["findings"] == []
        assert data["used_llm"] is False

    def test_finding_has_proofread_finding_fields(self):
        """Cada finding debe tener element_id, start, end, kind, message."""
        resp = client.post(
            "/api/proofread-batch",
            json={"texts": ["El resultado final final fue claro."]},
        )
        assert resp.status_code == 200
        findings = resp.json()["findings"]
        assert len(findings) > 0
        for f in findings:
            assert "element_id" in f
            assert "start" in f
            assert "end" in f
            assert "kind" in f
            assert "message" in f
            assert "source" in f

    def test_session_based_proofread(self):
        """POST con session_id → audita los párrafos de la sesión."""
        sid = _make_test_session(["El resultado final final fue claro y conciso."])
        try:
            resp = client.post(
                "/api/proofread-batch",
                json={"session_id": sid},
            )
            assert resp.status_code == 200
            data = resp.json()
            dup = [
                f for f in data["findings"]
                if "duplic" in f.get("message", "").lower()
            ]
            assert len(dup) >= 1, (
                f"Se esperaba hallazgo de duplicada en modo sesión: {data['findings']}"
            )
        finally:
            _cleanup_session(sid)

    def test_session_not_found(self):
        """POST con session_id inexistente → 404."""
        resp = client.post(
            "/api/proofread-batch",
            json={"session_id": "nonexistent-session-xyz"},
        )
        assert resp.status_code == 404


# ── E2: /api/ai-review + proactive_auditor ────────────────────────────────────


class TestAIReviewProactiveAuditor:
    """El revisor IA fusiona hallazgos del proactive_auditor (palabras duplicadas)."""

    def test_duplicate_word_in_ai_review(self):
        """ai-review con un párrafo con palabra duplicada → finding con 'duplic'."""
        sid = _make_test_session([
            "El resultado final final fue claro y conciso "
            "para todos los participantes del estudio."
        ])
        try:
            resp = client.post(f"/api/ai-review/{sid}")
            assert resp.status_code == 200
            data = resp.json()

            # Recopilar todos los findings de todos los párrafos.
            all_findings: list[dict] = []
            for p in data.get("paragraphs", []):
                all_findings.extend(p.get("findings", []))

            dup = [
                f for f in all_findings
                if "duplic" in f.get("detail", "").lower()
            ]
            assert len(dup) >= 1, (
                "Se esperaba un hallazgo de palabra duplicada fusionado en "
                f"ai-review, se obtuvo: {all_findings}"
            )
        finally:
            _cleanup_session(sid)


    def test_ai_review_response_shape(self):
        """ai-review mantiene el shape esperado por el frontend."""
        sid = _make_test_session([
            "El resultado final final fue claro y conciso "
            "para todos los participantes del estudio."
        ])
        try:
            resp = client.post(f"/api/ai-review/{sid}")
            assert resp.status_code == 200
            data = resp.json()
            assert "session_id" in data
            assert "paragraphs" in data
            assert isinstance(data["paragraphs"], list)
            assert len(data["paragraphs"]) >= 1
            p = data["paragraphs"][0]
            assert "element_id" in p
            assert "findings" in p
            assert "spelling" in p
            assert "ai_score" in p
        finally:
            _cleanup_session(sid)

    def test_unmatched_proactive_findings_exposed(self, monkeypatch):
        """Hallazgos del auditor con element_id desconocido NO se pierden.

        Si un párrafo fue editado/borrado durante la sesión, el finding del
        proactive_auditor debe volver bajo 'unmatched_findings' (misma forma
        que el hallazgo fusionado + element_id), no desaparecer.
        """
        from modules import proactive_auditor

        sid = _make_test_session([
            "Texto suficientemente largo para pasar el umbral del analisis IA."
        ])
        fake = [{
            "element_id": "parrafo-borrado",
            "excerpt": "final final",
            "message": "Palabra duplicada detectada",
            "severity": "warn",
        }]
        monkeypatch.setattr(proactive_auditor, "audit_elements", lambda els: fake)
        try:
            resp = client.post(f"/api/ai-review/{sid}")
            assert resp.status_code == 200
            data = resp.json()
            assert "unmatched_findings" in data
            assert len(data["unmatched_findings"]) == 1
            f = data["unmatched_findings"][0]
            assert f["element_id"] == "parrafo-borrado"
            assert f["phrase"] == "final final"
            assert f["detail"] == "Palabra duplicada detectada"
            assert f["severity"] == "MEDIUM"  # warn → MEDIUM via _SEV_MAP
            # Y no se coló dentro de ningún párrafo real:
            for p in data["paragraphs"]:
                assert all(
                    "duplicada" not in fr.get("detail", "")
                    for fr in p.get("findings", [])
                )
        finally:
            _cleanup_session(sid)


# ── Ambitos de fase en la respuesta ──────────────────────────────────────────
# Review Focus: el modo `texts` no trae H1 (los elementos llegan con
# heading_level=None y type="paragraph"), luego no hay fase. Solo reglas
# generales, y sin inventar una fase que el documento no declara.

def test_la_respuesta_publica_los_ambitos_de_fase():
    resp = client.post("/api/proofread-batch", json={
        "texts": ["Conocer las causas del fenomeno en la muestra", "otro texto"],
    })
    assert resp.status_code == 200
    data = resp.json()
    # La fase viaja en CADA hallazgo, no en un campo aparte. Mandar `phases`
    # además era una segunda derivación del mismo dato que nadie leía, y
    # hacía correr `build_phase_map` dos veces por request.
    assert all("phase" in f and "read_only" in f for f in data["findings"])
    # Sin H1, todo cae en portada: se reconoce, no se inventa nada.
    assert {f["phase"] for f in data["findings"]} <= {"portada", "global"}


def test_todo_hallazgo_trae_fase():
    resp = client.post("/api/proofread-batch", json={
        "texts": ["Yo creo que si, el proceso fue evidente", "mal escrito esto"],
    })
    for f in resp.json()["findings"]:
        assert "phase" in f
        assert "read_only" in f


def test_el_modo_texts_no_produce_reglas_de_fase():
    # El texto lleva un verbo impreciso, pero nadie lo metio en una seccion de
    # objetivos: sin H1 no hay fase, y sin fase no hay criterio de verbos.
    resp = client.post("/api/proofread-batch", json={
        "texts": ["Conocer las causas del fenomeno en la muestra"],
    })
    assert [f for f in resp.json()["findings"] if f["kind"] == "bloom_vague"] == []


def test_la_respuesta_vacia_no_inventa_fases():
    resp = client.post("/api/proofread-batch", json={"texts": []})
    assert resp.status_code == 200
    body = resp.json()
    assert body["findings"] == []
    assert "phases" not in body
