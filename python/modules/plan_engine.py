"""Plan Engine — CEREBRO único de clasificación APA 7.
Decide el rol de cada párrafo para TODOS los motores (export in-place,
scoped y add-in en vivo). El add-in jamás clasifica por su cuenta.

Roles: cover | toc_header | toc_line | heading1 | heading2 | heading3 |
       list_item | reference | body
"""
from __future__ import annotations

import re
from typing import Any, Dict, List

try:
    from modules.apa_rules import RULES
except Exception:  # pragma: no cover
    RULES = {}

_H1_CANON = re.compile(r"^(?:resumen|abstract|introducci[oó]n|conclusi[oó]n(?:es)?|referencias|anexos?|bibliograf[ií]a|discusi[oó]n|metodolog[ií]a|resultados|m[eé]todo)$", re.I)
_H1_ROMAN = re.compile(r"^(?:cap[ií]tulo\s+[ivxlcdm\d]+|[ivxlcdm]+\.\s+\S)", re.I)
_H2_DEC = re.compile(r"^\d+\.\d+\.?\s+\S")
_H3_SUB = re.compile(r"^\d+\.\d+\.\d+\.?\s+\S")
_LIST = re.compile(r"^(?:[•‣◦∙\-*–—]|\d+[.)]|[a-z][.)]|\([a-z\d]+\))\s+", re.I)
_TOC_HEADER = re.compile(r"^(?:tabla de contenido|contenido|[íi]ndice( general| de tablas| de figuras)?)$:?", re.I)
_TOC_LINE = re.compile(r"(?:\.{2,}|_{2,}|\t|\s{4,})\s*\d+\s*$")
_REF_LINE = re.compile(r"\([A-ZÁÉÍÓÚÑ][^)]{2,60},\s*(19|20)\d{2}\)")
_COVER_META = re.compile(r"(?:universidad|facultad|instituto|carrera|autor(?:a)?|estudiante|docente|profesor(?:a)?|recinto|carnet|\d{4}-\d{2,6}|managua|nicaragua)", re.I)

_HEAD_ROLES = {"heading1": 12, "heading2": 12, "heading3": 12}


def classify(texts: List[str]) -> Dict[str, Any]:
    n = len(texts)
    floor = _cover_floor(texts)
    refs_start = _refs_zone(texts)
    roles: List[Dict[str, Any]] = []
    in_toc = False
    for i, raw in enumerate(texts):
        t = (raw or "").strip()
        op: Dict[str, Any] = {"i": i}
        if i < floor or not t:
            op["role"] = "cover"
            roles.append(op)
            continue
        if _TOC_HEADER.match(t):
            in_toc = True
            op["role"] = "toc_header"
        elif in_toc and _TOC_LINE.search(t):
            op["role"] = "toc_line"
        elif in_toc and (_H1_CANON.match(t) or _H1_ROMAN.match(t)) and len(t) < 70:
            in_toc = False
            op["role"] = "heading1"
        elif _TOC_LINE.search(t):
            op["role"] = "toc_line"
        elif refs_start != -1 and i >= refs_start:
            op["role"] = "reference" if _REF_LINE.search(t) or len(t) > 60 else "body"
        elif _H3_SUB.match(t):
            op["role"] = "heading3"
        elif _H2_DEC.match(t):
            op["role"] = "heading2"
        elif _H1_CANON.match(t.rstrip(":").strip()) or _H1_ROMAN.match(t) or (t.isupper() and 8 < len(t) < 80):
            op["role"] = "heading1"
        elif _LIST.match(t):
            op["role"] = "list_item"
        else:
            op["role"] = "body"
        roles.append(op)
    return {"floor": floor, "refs_start": refs_start, "ops": roles, "rules": RULES}


def _cover_floor(texts: List[str]) -> int:
    for i, t in enumerate(texts[:60]):
        s = (t or "").strip()
        if not s:
            continue
        low = s.lower().rstrip(":")
        if _H1_CANON.match(low) or _H1_ROMAN.match(s) or _H2_DEC.match(s):
            return i
        if len(s) > 180 or _REF_LINE.search(s):
            return i
    return 0


def _refs_zone(texts: List[str]) -> int:
    idx = -1
    for i, t in enumerate(texts):
        if (t or "").strip().lower().rstrip(":") == "referencias":
            idx = i + 1
    return idx


def findings(texts: List[str], floor: int) -> List[Dict[str, Any]]:
    """Auditoría ligera servidor-side: duplicaciones, colgantes, persona."""
    out: List[Dict[str, Any]] = []
    seen_first: Dict[str, int] = {}
    for i, raw in enumerate(texts):
        if i < floor:
            continue
        t = (raw or "").strip()
        if not t:
            continue
        # duplicación de arranque de párrafos
        key = t[:38].lower()
        if len(key) > 15:
            if key in seen_first:
                out.append({"i": i, "kind": "dup", "message": f"Párrafo inicia igual que el {seen_first[key]+1}"})
            else:
                seen_first[key] = i
        if _DANGLE.search(t):
            out.append({"i": i, "kind": "incompleta", "message": "Termina en conector colgante"})
        persons = sum(bool(_P.search(t)) for _P in (_YO, _NOS))
        if persons == 1 and len(t) > 120:
            out.append({"i": i, "kind": "persona", "message": "Mezcla primera persona en texto académico"})
    return out[:40]


_DANGLE = re.compile(r"\b(?:pero|aunque|sin embargo|no obstante|porque|pues|ya que|dado que|más|menos)\s*\.?\s*$", re.I)
_YO = re.compile(r"\b(creo|pienso|opino|me gusta|mi opinión)\b", re.I)
_NOS = re.compile(r"\b(nosotros|nuestro)\b", re.I)
