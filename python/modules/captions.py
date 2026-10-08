"""Contador central de Tablas/Figuras (fuente unica).
Escanea lo existente para CONTINUAR la serie; jamas reinicia."""
from __future__ import annotations

import re
from typing import Dict, List

_TBL = re.compile(r"\btabla\s+(\d{1,2})\b", re.I)
_FIG = re.compile(r"\bfigura\s+(\d{1,2})\b", re.I)


def scan_existing(texts: List[str]) -> Dict[str, int]:
    mt = mf = 0
    for t in texts:
        s = t or ""
        for m in _TBL.finditer(s):
            mt = max(mt, int(m.group(1)))
        for m in _FIG.finditer(s):
            mf = max(mf, int(m.group(1)))
    return {"max_table": mt, "max_figure": mf}


def build_caption(kind: str, n: int) -> List[str]:
    """APA7: label en bold arriba ('Tabla 1'), titulo en cursiva debajo."""
    label = ("Tabla" if kind == "table" else "Figura") + f" {n}"
    return [label]
