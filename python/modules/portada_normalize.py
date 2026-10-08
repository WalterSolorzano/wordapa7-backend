"""Normalización defensiva del campo autor de portada.

Los cuadros de texto de las plantillas originales llegan a veces como UNA
sola línea corrida ("...2023-0366UBr. Walter Noel...Carnet: 2023-0432I...").
Este módulo reintroduce saltos de línea antes de cada título personal y
antes de cada etiqueta "Carnet:", para que los parsers de portada
(portada_module estudiante y portada_uni universitaria) reciban líneas
separadas y puedan reconstruir las columnas correctamente.
"""

from __future__ import annotations

import re

_TITLE_RE = re.compile(r"\s*((?:B[rR]\.|ING\b|Ing\.|LIC\b|Lic\.|SR[Aa]?\.|EST\.)\s*)")
_CARNET_RE = re.compile(r"\s*(Carnet\s*:)", re.IGNORECASE)
_CARNET_ID_RE = re.compile(r"(Carnet\s*:\s*)(\d{4}-\d{2,6})", re.IGNORECASE)
_TAIL_LABEL_RE = re.compile(r"((?:Elaborado|Realizado|Presentado)\s*Por\s*:?)", re.IGNORECASE)


def normalize_author_lines(author: str | None) -> str:
    """Devuelve el campo autor con un autor/carnet por línea."""
    if not author:
        return ""
    text = author.replace("\r\n", "\n").replace("\r", "\n")
    # Salto antes de cada título personal pegado al nombre anterior.
    text = _TITLE_RE.sub(r"\n\1", text)
    # Salto antes de cada "Carnet:" que no arranque línea propia.
    text = _CARNET_RE.sub(r"\n\1", text)
    # Colapsar blancos y líneas vacías.
    lines = [re.sub(r"[ \t]+", " ", ln).strip() for ln in text.split("\n")]
    lines = [ln for ln in lines if ln]

    # Limpiar cada línea Carnet: conservar solo el id (desecha letras basura
    # pegadas tipo "2021-0251U") y separar etiquetas finales corridas
    # ("...0802IElaborado Por:" -> carnet limpio + línea propia).
    cleaned: list[str] = []
    for ln in lines:
        if _CARNET_RE.match(ln):
            m = _CARNET_ID_RE.search(ln)
            if m:
                cleaned.append(f"Carnet: {m.group(2)}")
            else:
                cleaned.append(ln)
            tail = ln[m.end():] if m else ""
            tm = _TAIL_LABEL_RE.search(tail or "")
            if tm:
                rest = tail[tm.end(1):].strip(" :")
                cleaned.append(tm.group(1).title())
                if rest:
                    cleaned.append(rest.title())
        else:
            cleaned.append(ln)
    return "\n".join(cleaned)
