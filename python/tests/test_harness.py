"""
WordAPA7 — Harness Test (Engine V2, P0a)

Corre el motor actual contra el corpus de documentos y reporta métricas.
Si el corpus está vacío, el test se saltea (el desarrollador agrega docs).

Uso:
    python -m pytest python/tests/test_harness.py -v
    python -m pytest python/tests/test_harness.py -v --threshold=0.85
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, List

import pytest

HARNESS_DIR = Path(__file__).parent / "harness"
CORPUS_DIR = HARNESS_DIR / "corpus"
THRESHOLD = float(pytest.config.getoption("--threshold", "0.75")) if hasattr(pytest, "config") else 0.75


def _discover_corpus() -> List[Path]:
    """Encuentra todos los .docx en el corpus que tengan .expected.json."""
    if not CORPUS_DIR.exists():
        return []
    docs: List[Path] = []
    for docx_path in sorted(CORPUS_DIR.glob("*.docx")):
        expected_path = docx_path.with_suffix(".expected.json")
        if expected_path.exists():
            docs.append(docx_path)
    return docs


def _load_expected(docx_path: Path) -> Dict[str, Any]:
    """Carga el expected.json correspondiente a un .docx."""
    expected_path = docx_path.with_suffix(".expected.json")
    if not expected_path.exists():
        return {}
    with open(expected_path, encoding="utf-8") as f:
        data = json.load(f)
    return data.get("expected", {})


# ── Tests ──────────────────────────────────────────────────────────────────


@pytest.mark.skipif(
    len(_discover_corpus()) == 0,
    reason="Corpus vacío: agregá .docx + .expected.json en python/tests/harness/corpus/",
)
class TestHarness:
    """Suite de evaluación automática del motor."""

    def test_corpus_exists(self):
        """Sanity: el corpus tiene al menos un documento."""
        docs = _discover_corpus()
        assert len(docs) > 0, "El corpus está vacío. Agregá documentos."

    def test_metrics_report(self, api_base: str):
        """Corre cada doc del corpus contra el motor y reporta métricas."""
        from tests.harness import MetricsReport, compute_all_metrics

        docs = _discover_corpus()
        reports: list[MetricsReport] = []

        for docx_path in docs:
            expected = _load_expected(docx_path)
            if not expected:
                pytest.skip(f"{docx_path.name} no tiene expected.json válido")

            # Subir y parsear via API
            import requests

            with open(docx_path, "rb") as f:
                resp = requests.post(
                    f"{api_base}/upload",
                    files={"file": (docx_path.name, f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
                    timeout=60,
                )
            assert resp.status_code == 200, f"Upload falló: {resp.text[:200]}"
            data = resp.json()
            doc = data.get("result") or data.get("document") or data

            # Extraer métricas del output
            actual = {
                "cover_element_count": sum(
                    1 for e in doc.get("elements", []) if e.get("is_cover_section")
                ),
                "heading_count": sum(1 for e in doc.get("elements", []) if e.get("type") == "heading"),
                "heading_levels": {},
                "paragraph_count": sum(1 for e in doc.get("elements", []) if e.get("type") == "paragraph"),
                "table_count": sum(1 for e in doc.get("elements", []) if e.get("type") == "table"),
                "image_count": sum(1 for e in doc.get("elements", []) if e.get("type") == "image"),
                "reference_count": len(doc.get("referencias", [])),
                "ghost_citations": 0,  # requiere /validate-citations, fuera de scope por ahora
                "orphan_references": 0,
                "layout_violations": -1,  # no medido
                "body_paragraph_count": 0,
                "font_compliant_count": 0,
                "field_count": -1,
                "inline_shape_count": -1,
                "section_count": -1,
            }
            for e in doc.get("elements", []):
                if e.get("type") == "heading":
                    lvl = str(e.get("heading_level", 1))
                    actual["heading_levels"][lvl] = actual["heading_levels"].get(lvl, 0) + 1

            report = MetricsReport(docx_path.name, actual, expected)
            reports.append(report)

        # Reporte consolidado
        summary = compute_all_metrics(reports)
        print("\n[HARNESS] Métricas del corpus:")
        for file_report in reports:
            print(f"  {file_report.file_name}: overall={file_report.overall}")

        print(f"\n[HARNESS] Promedio corpus: {summary}")
        assert summary.get("overall", 0) >= THRESHOLD, (
            f"Score del corpus ({summary.get('overall', 0)}) por debajo del umbral ({THRESHOLD}). "
            "Revisá las métricas individuales arriba."
        )


# ── Fixture ────────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def api_base() -> str:
    """URL base del backend (usa el puerto default 8742)."""
    port = 8742
    try:
        # Intentar detectar puerto de electron
        import os
        env_port = os.getenv("WORDAPA7_PORT")
        if env_port:
            port = int(env_port)
    except Exception:
        pass
    base = f"http://127.0.0.1:{port}/api"
    # Verificar que el backend responde
    try:
        import requests
        requests.get(f"{base}/version", timeout=2)
    except Exception:
        pytest.skip(f"Backend no disponible en {base}")
    return base


if __name__ == "__main__":
    docs = _discover_corpus()
    print(f"Corpus: {len(docs)} documento(s)")
    for d in docs:
        exp = _load_expected(d)
        print(f"  {d.name}: expected={json.dumps(exp, indent=2)}")
