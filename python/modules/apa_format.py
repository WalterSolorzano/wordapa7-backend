"""Formateador canónico APA 7 para la línea de referencias.

Única fuente de verdad: la línea se arma como SEGMENTOS tipográficos (texto +
cursiva) para que cada superficie (vista previa, canvas, PDF, DOCX) dibuje
exactamente lo mismo sin recomponer nada. `formatted_apa` es el texto plano
derivado. Nunca se inventa un enlace en un libro sin DOI/URL.
"""
from __future__ import annotations

import re
from typing import Any, List, Optional

APA_ELLIPSIS = "..."

_EDITION_RE = re.compile(
    r"\((?:\d+\.ª?|\d+(?:th|nd|rd|st)|[a-z]+)\s+ed\.\)", re.IGNORECASE
)
_VOLUME_RE = re.compile(r",\s*\d+\s*\(\d+\)")
_DOI_RE = re.compile(r"(?:https?://doi\.org/|doi:\s*)?10\.\d{4,9}/\S+", re.IGNORECASE)
_ACCESSED_RE = re.compile(
    r"[\[(]\s*(?:accessed|consultado|recuperado)(?:\s+[^\])]*)?[\])]", re.IGNORECASE
)
_AVAILABLE_RE = re.compile(r"\bavailable\s*(?:from|at)?\s*:?\s*", re.IGNORECASE)
_RETRIEVAL_RE = re.compile(
    r"\b(?:recuperado|obtenido|disponible|consultado|retrieved)\s+"
    r"(?:el\s+\d{1,2}\s+de\s+[a-záéíóúñ]+\s+de\s+\d{4},?\s+)?"
    r"(?:de|en|from|at)?\s*:?\s*",
    re.IGNORECASE,
)
_SIGLAS_RE = re.compile(r"^([A-ZÁÉÍÓÚÑ][^.\(\n]+?)\s*\[[A-ZÁÉÍÓÚÑ]{2,8}\]")
_TESIS_RE = re.compile(
    r"tesis|tesina|trabajo\s+(?:de|fin)|maestr|doctorado|grado", re.IGNORECASE
)


def _as_dict(ref: Any) -> dict:
    if isinstance(ref, dict):
        return ref
    return {
        "authors": list(getattr(ref, "authors", []) or []),
        "year": getattr(ref, "year", None),
        "title": getattr(ref, "title", "") or "",
        "source": getattr(ref, "source", "") or "",
        "doi_or_url": getattr(ref, "doi_or_url", None),
        "raw_text": getattr(ref, "raw_text", "") or "",
        "tipo": getattr(ref, "tipo", "otro") or "otro",
    }


def _seg(text: str, italic: bool = False):
    from models import ApaSegment
    return ApaSegment(text=text, italic=italic)


def recortar_siglas_corporativas(texto: str) -> str:
    """Quita `[SIGLAS]` pegado a un autor corporativo (APA 7, 9.11)."""
    return _SIGLAS_RE.sub(r"\1", texto or "")


def formatear_autores(authors: List[str]) -> str:
    if not authors:
        return ""
    cleaned: List[str] = []
    for a in authors:
        a = recortar_siglas_corporativas((a or "").strip().rstrip(","))
        if a:
            cleaned.append(a)
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        return cleaned[0]
    if len(cleaned) == 2:
        return f"{cleaned[0]}, & {cleaned[1]}"
    if APA_ELLIPSIS in cleaned:
        return ", ".join(cleaned)
    return ", ".join(cleaned[:-1]) + ", & " + cleaned[-1]


def limpiar_artefactos(texto: str, strip_punct: bool = True) -> str:
    """Elimina artefactos de exportación automática en cualquier posición.

    `strip_punct=False` conserva la puntuación de cierre (p. ej. el punto final
    de una referencia cruda), quitando solo espacios sobrantes.
    """
    if not texto:
        return ""
    t = _ACCESSED_RE.sub(" ", texto)
    t = _AVAILABLE_RE.sub(" ", t)
    t = _RETRIEVAL_RE.sub(" ", t)
    t = re.sub(r"\s+", " ", t).strip()
    if strip_punct:
        t = t.strip(" .,;:")
    return t


def inferir_tipo(ref: Any) -> str:
    d = _as_dict(ref)
    haystack = " ".join([d.get("title") or "", d.get("source") or "", d.get("raw_text") or ""])
    if _TESIS_RE.search(haystack):
        return "tesis"
    source = d.get("source") or ""
    if _VOLUME_RE.search(source):
        return "articulo"
    if _EDITION_RE.search(source) or _EDITION_RE.search(d.get("title") or ""):
        return "libro"
    doi = d.get("doi_or_url") or ""
    if _DOI_RE.search(doi):
        return "articulo"
    if not doi and source:
        return "libro"
    if doi:
        return "web"
    return "otro"


def url_segura(doi_o_url: Optional[str], tipo: str) -> str:
    if not doi_o_url:
        return ""
    v = str(doi_o_url).strip()
    if not v:
        return ""
    low = v.lower()
    if low.startswith("https://"):
        return v
    if low.startswith("http://"):
        return "https://" + v[7:]
    if low.startswith("www."):
        return "https://" + v
    if low.startswith("doi:"):
        return "https://doi.org/" + re.sub(r"^doi:\s*", "", v, flags=re.IGNORECASE)
    if re.match(r"^10\.\d{4,9}/\S+", v):
        return "https://doi.org/" + v
    return "https://doi.org/" + v


def _descripcion_tesis(d: dict) -> str:
    h = " ".join([d.get("title") or "", d.get("raw_text") or "", d.get("source") or ""])
    if re.search(r"maestr", h, re.IGNORECASE):
        return "Tesis de maestría"
    if re.search(r"doctorado|doctoral", h, re.IGNORECASE):
        return "Tesis doctoral"
    if re.search(r"grado|licenciatura|pregrado", h, re.IGNORECASE):
        return "Tesis de grado"
    return "Tesis"


def _institucion(d: dict) -> str:
    src = (d.get("source") or "").strip()
    if src:
        return src
    url = (d.get("doi_or_url") or "").strip()
    m = re.search(r"https?://([^/]+)", url)
    if m:
        return m.group(1).replace("www.", "")
    return ""


def build_apa_segments(ref: Any) -> List[Any]:
    d = _as_dict(ref)
    authors = d.get("authors") or []
    year = (d.get("year") or "").strip() or "s.f."
    title = limpiar_artefactos(d.get("title") or "")
    source = limpiar_artefactos(d.get("source") or "")
    raw = (d.get("raw_text") or "").strip()
    tipo = (d.get("tipo") or "").strip() or "otro"
    if tipo == "otro":
        tipo = inferir_tipo(d)

    # Sin campos estructurados: usar (limpiado) el texto crudo si existe. NO se
    # mira `doi_or_url`: una referencia que solo trae raw_text/formatted_apa y un
    # DOI no debe fabricar "(s.f.). <url>" y perder autor/título.
    if not authors and not title and not source:
        return [_seg(limpiar_artefactos(raw, strip_punct=False))] if raw else []

    author_str = formatear_autores(authors)
    # APA 7: un autor corporativo (sin iniciales) cierra con punto antes del
    # año: "Instituto Nicaragüense de Energía. (2026)." Un autor personal ya
    # termina en punto por su inicial ("García, A."), así que no se duplica.
    if author_str and not author_str.endswith("."):
        author_str = author_str + "."
    prefix = f"{author_str} ({year}). " if author_str else f"({year}). "
    segs: List[Any] = [_seg(prefix)]
    url = url_segura(d.get("doi_or_url"), tipo)
    # Evita duplicar el enlace: si el texto crudo ya lo trae en título/fuente,
    # se quita de ahí porque se agrega como segmento propio más abajo.
    if url:
        for cand in {url, (d.get("doi_or_url") or "").strip()}:
            if cand:
                title = title.replace(cand, "").strip(" .,;:")
                source = source.replace(cand, "").strip(" .,;:")

    if tipo in ("libro", "informe"):
        edition = ""
        m = _EDITION_RE.search(source)
        if m:
            edition = " " + m.group(0)
            source = source.replace(m.group(0), "").strip(" ,")
        if title:
            segs.append(_seg(title, italic=True))
        if edition:
            segs.append(_seg(edition))
        tail = (f". {source}" if source else "") + "."
        segs.append(_seg(tail))
        if url:
            segs.append(_seg(f" {url}"))
        return segs

    if tipo == "articulo":
        if title:
            segs.append(_seg(f"{title}. "))
        if source:
            if "," in source:
                revista, resto = source.split(",", 1)
                segs.append(_seg(revista.strip(), italic=True))
                segs.append(_seg(f",{resto}."))
            else:
                segs.append(_seg(source, italic=True))
                segs.append(_seg("."))
        if url:
            segs.append(_seg(f" {url}"))
        return segs

    if tipo == "tesis":
        if title:
            segs.append(_seg(title, italic=True))
        inst = _institucion(d)
        desc = _descripcion_tesis(d)
        segs.append(_seg(f" [{desc}, {inst}]. " if inst else f" [{desc}]. "))
        if url:
            segs.append(_seg(url))
        return segs

    if tipo == "capitulo":
        if title:
            segs.append(_seg(f"{title}. "))
        if source:
            src = source[3:] if source.lower().startswith("in ") else source
            segs.append(_seg("In "))
            segs.append(_seg(src, italic=True))
            segs.append(_seg("."))
        if url:
            segs.append(_seg(f" {url}"))
        return segs

    if tipo == "web":
        if title:
            segs.append(_seg(title, italic=True))
            segs.append(_seg(". "))
        if source:
            segs.append(_seg(f"{source}."))
        if url:
            segs.append(_seg(f" {url}"))
        return segs

    # otro: replica la salida plana histórica.
    if title:
        segs.append(_seg(f"{title}. "))
    if source:
        segs.append(_seg(f"{source}. "))
    if url:
        segs.append(_seg(url))
    return segs


def format_apa_plain(ref: Any) -> str:
    return "".join(s.text for s in build_apa_segments(ref)).strip()


def normalizar_referencia(ref: Any) -> None:
    """Migra un modelo viejo: infiere tipo, arma segmentos y deriva el plano."""
    if not getattr(ref, "apa_segments", None):
        ref.apa_segments = build_apa_segments(ref)
    if not (ref.formatted_apa or "").strip() and ref.apa_segments:
        ref.formatted_apa = "".join(s.text for s in ref.apa_segments)
    if (ref.tipo or "otro") in ("", "otro"):
        ref.tipo = inferir_tipo(ref)
