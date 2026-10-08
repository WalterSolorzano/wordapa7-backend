"""Detección real de institución (UNI/UNAN) a partir de evidencia de la portada.

Tres señales, de más a menos fuerte:

1. Nombre o sigla de la universidad en el texto (tolerante a acentos/mayúsculas).
2. ``area_default`` del catálogo (p. ej. 'Área de Conocimiento de Ingeniería y
   Afines' -> UNI). Es evidencia real, pero más débil que el nombre.
3. Ciudad conocida ('Managua, Nicaragua'): señal débil que **nunca decide sola**.

Devuelve ``codigo``/``nombre``/``confidence``/``evidence``. Si no hay evidencia
suficiente, ``codigo`` queda vacío: la institución **no se inventa** y el editor
la deja detrás de "Agregar institución".
"""

from __future__ import annotations

import re
import unicodedata
from typing import Dict, List, Optional

# Espejo de `src/lib/portada/catalogo.ts` (CATALOGO_DE_UNIVERSIDADES).
# Si se agrega una universidad allí, agregarla aquí también.
UNIVERSITY_CATALOG: List[Dict[str, object]] = [
    {
        "codigo": "UNI",
        "nombre": "Universidad Nacional de Ingeniería",
        "area_default": "Área de Conocimiento de Ingeniería y Afines",
        "ciudades": ["managua", "nicaragua"],
        "alias": ["uni", "universidad nacional de ingenieria"],
    },
    {
        "codigo": "UNAN",
        "nombre": "Universidad Nacional Autónoma de Nicaragua (UNAN-Managua)",
        "area_default": "Facultad de Ciencias e Ingeniería",
        "ciudades": ["managua", "nicaragua"],
        "alias": ["unan", "unan managua", "universidad nacional autonoma de nicaragua"],
    },
]

# Debajo de esto, no hay evidencia para elegir: se devuelve vacío.
_CONF_THRESHOLD = 0.45


def _norm(text: str) -> str:
    """Minúsculas sin acentos, con todo lo no alfanumérico reducido a espacio."""
    if not text:
        return ""
    decomposed = unicodedata.normalize("NFKD", text)
    without_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", without_accents.lower()).strip()


def _contains_word(haystack: str, needle: str) -> bool:
    if not needle:
        return False
    return re.search(
        r"(?<![a-z0-9])" + re.escape(needle) + r"(?![a-z0-9])", haystack
    ) is not None


def detect_institution(
    texts: Optional[List[str]] = None,
    element_texts: Optional[List[str]] = None,
) -> Dict[str, object]:
    """Elige la universidad más probable a partir del texto de la portada.

    No lanza con entradas vacías/``None``. Devuelve siempre un dict con
    ``codigo``, ``nombre``, ``confidence`` y ``evidence``.
    """
    empty: Dict[str, object] = {
        "codigo": "",
        "nombre": "",
        "confidence": 0.0,
        "evidence": [],
    }
    parts = list(texts or []) + list(element_texts or [])
    blob = _norm(" \n ".join(p for p in parts if isinstance(p, str)))
    if not blob:
        return empty

    best: Optional[tuple] = None
    for preset in UNIVERSITY_CATALOG:
        score = 0.0
        evidence: List[str] = []

        for alias in preset.get("alias", []):  # type: ignore[union-attr]
            if _contains_word(blob, _norm(str(alias))):
                score += 0.75
                evidence.append(f"nombre:{alias}")
                break

        area_norm = _norm(str(preset.get("area_default", "")))
        if area_norm and area_norm in blob:
            score += 0.5
            evidence.append(f"area:{preset['area_default']}")

        # La ciudad solo refuerza una coincidencia ya existente: sola no decide.
        city_hit = any(
            _contains_word(blob, _norm(str(c)))
            for c in preset.get("ciudades", [])  # type: ignore[union-attr]
        )
        if city_hit and score > 0:
            score += 0.1
            evidence.append("ciudad")

        if score > 0 and (best is None or score > best[1]):
            best = (preset, score, evidence)

    if best is None or best[1] < _CONF_THRESHOLD:
        return empty

    preset, score, evidence = best
    return {
        "codigo": str(preset["codigo"]),
        "nombre": str(preset["nombre"]),
        "confidence": round(min(score, 0.99), 2),
        "evidence": evidence,
    }
