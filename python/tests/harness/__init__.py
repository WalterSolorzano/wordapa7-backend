"""
WordAPA7 — Evaluation Harness (Engine V2)

Métricas de calidad del motor de parsing/clasificación/generación.
Cada métrica recibe el output del pipeline y lo compara contra ground truth.

Uso:
    from tests.harness.metrics import (
        cover_f1, heading_f1, citation_match_rate, layout_violations,
        font_compliance, structure_preservation,
        compute_all_metrics, MetricsReport,
    )

Todas las funciones reciben (actual: dict, expected: dict) y devuelven float o dict.
"""

from __future__ import annotations
from typing import Dict, Any, List


def cover_f1(actual: Dict[str, Any], expected: Dict[str, Any]) -> float:
    """
    F1 score de detección de elementos de portada.
    Compara conteo de elementos marcados como `is_cover_section`.
    """
    act_count = actual.get("cover_element_count", 0)
    exp_count = expected.get("cover_element_count", 0)
    if exp_count == 0 and act_count == 0:
        return 1.0
    if exp_count == 0 or act_count == 0:
        return 0.0
    tp = min(act_count, exp_count)  # mejor estimación sin alignment por elemento
    fp = max(0, act_count - exp_count)
    fn = max(0, exp_count - act_count)
    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    return 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0


def heading_f1(actual: Dict[str, Any], expected: Dict[str, Any]) -> float:
    """
    F1 basado en estructura de headings: conteo total y por nivel.
    """
    act_levels = actual.get("heading_levels", {})
    exp_levels = expected.get("heading_levels", {})
    all_levels = set(list(act_levels.keys()) + list(exp_levels.keys()))
    scores = []
    for lvl in all_levels:
        a = act_levels.get(lvl, 0)
        e = exp_levels.get(lvl, 0)
        if e == 0 and a == 0:
            scores.append(1.0)
        elif e == 0:
            scores.append(0.0)
        else:
            scores.append(min(a, e) / max(a, e))
    if not scores:
        return 1.0
    return sum(scores) / len(scores)


def citation_match_rate(actual: Dict[str, Any], expected: Dict[str, Any]) -> float:
    """
    Tasa de coincidencia citas ↔ referencias.
    Un score cercano a 1.0 significa que ghost_citations + orphan_references ≈ 0.
    """
    ghosts = actual.get("ghost_citations", 0)
    orphans = actual.get("orphan_references", 0)
    total_issues = ghosts + orphans
    if total_issues == 0:
        return 1.0
    scale = max(1.0, expected.get("reference_count", 1))
    return max(0.0, 1.0 - total_issues / scale)


def layout_violations(actual: Dict[str, Any], expected: Dict[str, Any]) -> float:
    """
    Conteo de violaciones de layout detectadas.
    Retorna score entre 0 (muchas violaciones) y 1 (ninguna).
    """
    count = actual.get("layout_violations", -1)
    if count < 0:
        return 1.0  # no se midió layout → sin información
    if count == 0:
        return 1.0
    return max(0.0, 1.0 - count / 10.0)


def font_compliance(actual: Dict[str, Any], expected: Dict[str, Any]) -> float:
    """
    Porcentaje de párrafos del cuerpo que usan la fuente APA correcta.
    """
    total = actual.get("body_paragraph_count", 0)
    compliant = actual.get("font_compliant_count", 0)
    if total == 0:
        return 1.0
    return compliant / total


def structure_preservation(actual: Dict[str, Any], expected: Dict[str, Any]) -> float:
    """
    Preservación de estructuras especiales (fields, inline shapes, secciones).
    """
    fields_before = expected.get("field_count", 0)
    fields_after = actual.get("field_count", 0)
    shapes_before = expected.get("inline_shape_count", 0)
    shapes_after = actual.get("inline_shape_count", 0)
    sections_before = expected.get("section_count", 0)
    sections_after = actual.get("section_count", 0)

    scores = []
    for before, after in [(fields_before, fields_after), (shapes_before, shapes_after),
                          (sections_before, sections_after)]:
        if before == 0:
            scores.append(1.0)
        else:
            scores.append(min(after, before) / before)
    return sum(scores) / len(scores) if scores else 1.0


class MetricsReport:
    """Reporte estructurado de todas las métricas para un documento."""

    def __init__(self, file_name: str, actual: Dict[str, Any], expected: Dict[str, Any]):
        self.file_name = file_name
        self.cover_f1 = cover_f1(actual, expected)
        self.heading_f1 = heading_f1(actual, expected)
        self.citation_match = citation_match_rate(actual, expected)
        self.layout_score = layout_violations(actual, expected)
        self.font_score = font_compliance(actual, expected)
        self.structure_score = structure_preservation(actual, expected)

    @property
    def overall(self) -> float:
        """Score compuesto promediando todas las métricas."""
        scores = [self.cover_f1, self.heading_f1, self.citation_match,
                  self.layout_score, self.font_score, self.structure_score]
        return sum(scores) / len(scores)

    def to_dict(self) -> Dict[str, float]:
        return {
            "file": self.file_name,
            "cover_f1": round(self.cover_f1, 4),
            "heading_f1": round(self.heading_f1, 4),
            "citation_match": round(self.citation_match, 4),
            "layout_score": round(self.layout_score, 4),
            "font_score": round(self.font_score, 4),
            "structure_score": round(self.structure_score, 4),
            "overall": round(self.overall, 4),
        }

    def __repr__(self) -> str:
        lines = [f"MetricsReport({self.file_name})"]
        for k, v in self.to_dict().items():
            if k != "file":
                lines.append(f"  {k}: {v}")
        return "\n".join(lines)


def compute_all_metrics(reports: List[MetricsReport]) -> Dict[str, float]:
    """Promedia las métricas de múltiples documentos del corpus."""
    if not reports:
        return {}
    keys = ["cover_f1", "heading_f1", "citation_match", "layout_score",
            "font_score", "structure_score", "overall"]
    result = {}
    for key in keys:
        vals = [getattr(r, key) for r in reports]
        result[key] = round(sum(vals) / len(vals), 4)
    return result
