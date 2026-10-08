"""
ClusteringHeadingClassifier: Implementación pura en Python sin sklearn/numpy.
Reemplaza DBSCAN con un clustering por reglas + distancia euclidiana simple.
Elimina 400MB+ del build final (sklearn + scipy + numpy + torch indirecto).
"""

import collections
import math
from dataclasses import dataclass
from typing import Dict, List

from models import ElementModel, ElementType


def _has_number_prefix(text: str) -> bool:
    import re
    if not text:
        return False
    return bool(re.match(r'^(\d+\.|\w\.)', text.strip()))


@dataclass
class StyleFingerprint:
    """Vector de características de estilo para un párrafo."""
    font_size: float
    is_bold: float
    is_italic: float
    is_centered: float
    word_count: float
    ends_with_period: float
    spacing_before: float
    spacing_after: float
    indent_left: float
    outline_level: float
    has_number_prefix: float

    def to_vector(self) -> List[float]:
        return [
            self.font_size / 100,
            self.is_bold,
            self.is_italic,
            self.is_centered,
            min(self.word_count, 50) / 50,
            self.ends_with_period,
            self.spacing_before / 240,
            self.spacing_after / 240,
            self.indent_left / 720,
            self.outline_level / 9,
            self.has_number_prefix,
        ]

    @staticmethod
    def from_element(elem: ElementModel, median_font: float):
        font_size = elem.font_size if getattr(elem, 'font_size', None) else median_font
        is_bold = 1.0 if getattr(elem, 'is_bold', False) else 0.0
        is_italic = 1.0 if getattr(elem, 'is_italic', False) else 0.0

        alignment = getattr(elem, 'alignment', 'left')
        is_centered = 1.0 if alignment == 'center' else 0.0

        text = elem.text or ""
        word_count = len(text.split())
        ends_with_period = 1.0 if text and text.rstrip().endswith('.') else 0.0

        indent_left = getattr(elem, 'left_indent_cm', 0) * 28.35

        return StyleFingerprint(
            font_size=float(font_size or median_font),
            is_bold=is_bold,
            is_italic=is_italic,
            is_centered=is_centered,
            word_count=float(word_count),
            ends_with_period=ends_with_period,
            spacing_before=0.0,
            spacing_after=0.0,
            indent_left=float(indent_left),
            outline_level=9.0,
            has_number_prefix=1.0 if _has_number_prefix(text) else 0.0,
        )


def _euclidean_distance(v1: List[float], v2: List[float]) -> float:
    return math.sqrt(sum((a - b) ** 2 for a, b in zip(v1, v2)))


def _median(values: List[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    n = len(s)
    mid = n // 2
    if n % 2 == 0:
        return (s[mid - 1] + s[mid]) / 2.0
    return s[mid]


def _simple_dbscan(vectors: List[List[float]], eps: float = 0.15, min_samples: int = 2) -> List[int]:
    """
    Implementación pura en Python de DBSCAN.
    Retorna lista de labels (-1 = ruido, 0..N = cluster).
    """
    n = len(vectors)
    labels = [-2] * n  # -2 = no visitado
    cluster_id = 0

    def region_query(idx: int) -> List[int]:
        return [
            j for j in range(n)
            if _euclidean_distance(vectors[idx], vectors[j]) <= eps
        ]

    def expand_cluster(idx: int, neighbors: List[int], cid: int):
        labels[idx] = cid
        i = 0
        while i < len(neighbors):
            pt = neighbors[i]
            if labels[pt] == -2:
                labels[pt] = cid
                new_neighbors = region_query(pt)
                if len(new_neighbors) >= min_samples:
                    neighbors.extend(new_neighbors)
            elif labels[pt] == -1:
                labels[pt] = cid
            i += 1

    for idx in range(n):
        if labels[idx] != -2:
            continue
        neighbors = region_query(idx)
        if len(neighbors) < min_samples:
            labels[idx] = -1  # ruido
        else:
            expand_cluster(idx, neighbors, cluster_id)
            cluster_id += 1

    return labels


class ClusteringHeadingClassifier:
    """
    1. Calcula fingerprints para todos los párrafos
    2. Clusteriza usando DBSCAN puro (sin sklearn ni numpy)
    3. Identifica clusters que son headings (short, bold, big font)
    4. Asigna levels dentro de heading clusters (por font_size ranking)
    5. Marca needs_review=True para elementos ambiguos
    """

    def _group_clusters(self, labels: List[int]) -> Dict[int, List[int]]:
        groups: Dict[int, List[int]] = collections.defaultdict(list)
        for idx, label in enumerate(labels):
            if label != -1:
                groups[label].append(idx)
        return groups

    def classify(self, elements: List[ElementModel]) -> List[ElementModel]:
        text_elements = [e for e in elements if e.text and e.text.strip()]
        if not text_elements:
            return elements

        font_sizes = [
            e.font_size for e in text_elements
            if getattr(e, 'font_size', None)
        ]
        median_font = _median(font_sizes) if font_sizes else 11.0

        fp_to_elem_idx: List[int] = []
        fingerprints: List[StyleFingerprint] = []

        for idx, e in enumerate(elements):
            if e.text and e.text.strip():
                fp = StyleFingerprint.from_element(e, median_font)
                fingerprints.append(fp)
                fp_to_elem_idx.append(idx)

        if not fingerprints:
            return elements

        vectors = [fp.to_vector() for fp in fingerprints]

        labels = _simple_dbscan(vectors, eps=0.15, min_samples=2)

        heading_clusters = []
        for label, indices in self._group_clusters(labels).items():
            cluster_fps = [fingerprints[i] for i in indices]
            bold_ratio = sum(fp.is_bold for fp in cluster_fps) / len(cluster_fps)
            avg_words = sum(fp.word_count for fp in cluster_fps) / len(cluster_fps)
            avg_font = sum(fp.font_size for fp in cluster_fps) / len(cluster_fps)

            heading_score = (
                bold_ratio * 0.5
                + (1 - min(avg_words, 20) / 20) * 0.3
                + (1 if avg_font > median_font else 0) * 0.2
            )

            if heading_score > 0.5:
                heading_clusters.append((label, indices, heading_score))

        heading_clusters.sort(key=lambda x: -x[2])
        for level, (label, indices, score) in enumerate(heading_clusters[:5], 1):
            for i in indices:
                real_idx = fp_to_elem_idx[i]
                elem = elements[real_idx]
                # Respetar exclusiones de Pasada 1/3 (captions de figura/tabla,
                # textos legales, referencias APA). Estas NUNCA son headings.
                if elem.pre_classifier_rule in (
                    "exclude_table_caption", "exclude_table_legal",
                    "exclude_figure_caption_upper", "reference_item",
                ):
                    continue
                if elem.type == ElementType.PARAGRAPH:
                    elem.type = ElementType.HEADING
                    elem.heading_level = level
                    elem.confidence = min(0.95, score + 0.3)
                    elem.needs_review = score < 0.7
                elif elem.type == ElementType.HEADING:
                    # YA es un heading con un nivel inferido por la Pasada 3
                    # (scoring heurístico). El clustering NO debe sobreescribir
                    # ese nivel con el nivel del cluster: solo reforzar la
                    # confianza y mantener la revisión pendiente si era ambiguo.
                    elem.confidence = max(elem.confidence or 0, min(0.95, score + 0.3))
                    if (elem.confidence or 0) < 0.85:
                        elem.needs_review = True

        return elements
