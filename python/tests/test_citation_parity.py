"""
WordAPA7 — Batería de casos de citas para paridad frontend/backend.

Define el conjunto de textos con citas que DEBEN detectarse igual en el
motor Python (citation_engine) y en el highlighter TypeScript
(src/lib/citationHighlighter.ts). Si se agrega un caso aquí, debe reflejarse
en src/__tests__/citationParity.test.ts.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from modules.citation_engine import extract_citations_from_text

# Cada caso: (texto, cantidad mínima de citas esperadas, substring del raw)
PARITY_CASES = [
    ("Las 5S mejoran la moral del personal (Gutiérrez Pulido, 2012).", 1, "Gutiérrez"),
    ("La teoría fue propuesta por García (2023).", 1, "García"),
    ("Se cita a dos autores (García & López, 2023).", 1, "García"),
    ("Según Niebel y Freivalds (2009), el estudio es clave.", 1, "Niebel"),
    ("El informe (OIT, 2007) define los estándares.", 1, "OIT"),
    ("Varios autores (García, 2023; López, 2021; Pérez, 2019).", 3, "García"),
    ("(García, 2023, p. 45) muestra evidencia.", 1, "García"),
    ("Esto no es una cita (Véase Figura 1).", 0, ""),
    ("El peso fue (100 kg) en la medición.", 0, ""),
]


def test_parity_cases_expected_detections():
    """Cada caso de la batería compartida debe detectarse como se espera."""
    for text, min_citas, expected_sub in PARITY_CASES:
        cits = extract_citations_from_text(text, "parity")
        assert len(cits) >= min_citas, (
            f"Para {text!r} se esperaban >= {min_citas} citas, se obtuvieron {len(cits)}"
        )
        if expected_sub and min_citas > 0:
            found = any(expected_sub.lower() in (c.raw_text or "").lower() for c in cits)
            assert found, f"No se encontró la cita con '{expected_sub}' en {text!r}"


def test_compound_surname_parenthetical_detected():
    """Apellido compuesto en cita parentética: (Gutiérrez Pulido, 2012)."""
    text = "Aumenta la moral (Gutiérrez Pulido, 2012)."
    cits = extract_citations_from_text(text, "parity")
    assert len(cits) == 1
    assert cits[0].year == "2012"
    assert "Gutiérrez" in cits[0].authors[0]


def test_second_author_of_reference_matches():
    """El segundo autor de una referencia (Freivalds) debe poder compararse."""
    from modules.citation_engine import _parse_authors_from_match
    authors = _parse_authors_from_match("Niebel & Freivalds")
    assert authors == ["Niebel", "Freivalds"]
