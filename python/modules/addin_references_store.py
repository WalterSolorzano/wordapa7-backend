"""
WordAPA7 — Store local de referencias para el Word Add-in (Asistente en Vivo)

Persiste las citas/referencias que el asistente extrae automáticamente del
documento abierto en Word, de modo que sobreviven entre sesiones y se integran
con la bibliografía que construye el Add-in.

El almacenamiento es un archivo JSON simple dentro de STORAGE_DIR (AppData en
producción), para no depender de una base SQL y poder viajar con el instalador.

Operaciones:
  - add_citation(citation)         → deduplica por (autores normalizados + año)
  - list_references()               → referencias ordenadas alfabéticamente
  - save_reference(reference)       → guarda una referencia manual/edi­ada
  - delete_reference(reference_id)
  - clear()
  - build_bibliography_text()       → texto APA 7 listo para insertar
"""

from __future__ import annotations

import json
import re
import threading
import unicodedata
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from config import STORAGE_DIR

# ── RUTA DEL STORE ────────────────────────────────────────────────────────────

_REFS_DIR = STORAGE_DIR / "references"
# La elipsis de APA 7 vive en el formateador canónico; se re-exporta para no
# romper a los consumidores históricos (doi_resolver, tests).
from modules.apa_format import APA_ELLIPSIS  # noqa: F401
_REFS_FILE = _REFS_DIR / "addin_references.json"

_LOCK = threading.Lock()


# ── UTILIDADES ────────────────────────────────────────────────────────────────

def _ensure_store() -> None:
    """Crea el directorio y el archivo JSON si no existen."""
    _REFS_DIR.mkdir(parents=True, exist_ok=True)
    if not _REFS_FILE.exists():
        _REFS_FILE.write_text(
            json.dumps({"references": [], "citations": [], "updated_at": ""}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )


def _load() -> Dict[str, Any]:
    _ensure_store()
    try:
        return json.loads(_REFS_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"references": [], "citations": [], "updated_at": ""}


def _save(data: Dict[str, Any]) -> None:
    _ensure_store()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    _REFS_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_surname_key(author: str) -> str:
    """Normaliza un apellido: minúsculas, sin tildes, sin espacios extra."""
    if not author:
        return ""
    surname = author.split(",")[0].strip().lower()
    nfkd = unicodedata.normalize("NFKD", surname)
    return "".join(c for c in nfkd if not unicodedata.combining(c)).strip()


def citation_key(authors: List[str], year: Optional[str]) -> str:
    """Clave de deduplicación: apellido normalizado + año."""
    first = normalize_surname_key(authors[0]) if authors else ""
    return f"{first}|{year or 's.f.'}"


def normalize_title_key(title: Optional[str]) -> str:
    """Normaliza un título para deduplicación: minúsculas, solo alfanumérico, prefijo 40."""
    if not title:
        return ""
    return re.sub(r"[^a-z0-9]", "", title.lower())[:40]


def _ref_base_key(key: Optional[str]) -> str:
    """Parte base (apellido|año) de una clave; ignora el sufijo de título."""
    parts = str(key or "").split("|")
    return "|".join(parts[:2])


# ── CITAS (in-text) ───────────────────────────────────────────────────────────

def add_citation(
    raw_text: str,
    authors: List[str],
    year: Optional[str],
    citation_type: str = "parentetica",
    page: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Registra una cita detectada en el documento. Deduplica por
    (autores + año). Si la cita ya existía, no la duplica pero actualiza
    el contador de ocurrencias.

    Retorna la cita registrada (existente o nueva).
    """
    with _LOCK:
        data = _load()
        citations: List[Dict[str, Any]] = data.setdefault("citations", [])

        key = citation_key(authors, year)
        existing = next((c for c in citations if c.get("key") == key), None)
        if existing:
            existing["occurrences"] = existing.get("occurrences", 1) + 1
            existing["last_seen"] = datetime.now(timezone.utc).isoformat()
            _save(data)
            return existing

        entry: Dict[str, Any] = {
            "id": f"cit_{uuid.uuid4().hex[:10]}",
            "key": key,
            "raw_text": raw_text,
            "authors": authors,
            "year": year,
            "page": page,
            "citation_type": citation_type,
            "occurrences": 1,
            "first_seen": datetime.now(timezone.utc).isoformat(),
            "last_seen": datetime.now(timezone.utc).isoformat(),
        }
        citations.append(entry)

        # Auto-crear una referencia "fantasma" (draft) para que aparezca en la
        # bibliografía sugerida. El usuario podrá completarla/resolver DOI luego.
        # La clave incluye el prefijo de título/raw_text normalizado para NO
        # colapsar dos obras DISTINTAS del mismo autor y año.
        references: List[Dict[str, Any]] = data.setdefault("references", [])
        ghost_key = f"{key}|{normalize_title_key(raw_text)}"
        if not any(r.get("key") == ghost_key for r in references):
            references.append({
                "id": f"ref_{uuid.uuid4().hex[:10]}",
                "key": ghost_key,
                "authors": authors,
                "year": year,
                "title": "",
                "source": "",
                "doi_or_url": None,
                "raw_text": "",
                "formatted_apa": _draft_apa(authors, year, page),
                "is_draft": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            })

        _save(data)
        return entry


# ── REFERENCIAS ───────────────────────────────────────────────────────────────

def list_references() -> List[Dict[str, Any]]:
    with _LOCK:
        data = _load()
        refs = data.get("references", [])
        return sorted(refs, key=lambda r: normalize_surname_key(", ".join(r.get("authors", []))) or r.get("title", "").lower())


def save_reference(reference: Dict[str, Any]) -> Dict[str, Any]:
    """Crea o actualiza una referencia. Si trae 'id', actualiza; si no, crea."""
    with _LOCK:
        data = _load()
        references: List[Dict[str, Any]] = data.setdefault("references", [])

        ref_id = reference.get("id")
        if ref_id:
            existing = next((r for r in references if r.get("id") == ref_id), None)
            if existing:
                existing.update(reference)
                existing["is_draft"] = False
                existing["formatted_apa"] = _format_apa_reference(existing)
                _save(data)
                return existing

        authors = reference.get("authors") or []
        base_key = citation_key(authors, reference.get("year"))
        title_norm = normalize_title_key(reference.get("title"))

        # Deduplicación: si ya existe una referencia (completa o borrador) del
        # mismo autor/año con el mismo título normalizado, ACTUALIZAR en vez de
        # duplicar la entrada bibliográfica.
        existing_match = None
        for r in references:
            if _ref_base_key(r.get("key")) != base_key:
                continue
            if normalize_title_key(r.get("title")) == title_norm:
                existing_match = r
                break
            if title_norm and r.get("is_draft") and not (r.get("title") or "").strip():
                existing_match = r
                break

        if existing_match is not None:
            preserved_id = existing_match.get("id")
            existing_match.update(reference)
            existing_match["id"] = preserved_id or f"ref_{uuid.uuid4().hex[:10]}"
            existing_match["key"] = citation_key(existing_match.get("authors") or [], existing_match.get("year"))
            existing_match["is_draft"] = False
            existing_match["formatted_apa"] = _format_apa_reference(existing_match)
            _save(data)
            return existing_match

        new_ref = {
            "id": ref_id or f"ref_{uuid.uuid4().hex[:10]}",
            "key": base_key,
            "authors": authors,
            "year": reference.get("year"),
            "title": reference.get("title", "") or "",
            "source": reference.get("source", "") or "",
            "doi_or_url": reference.get("doi_or_url"),
            "raw_text": reference.get("raw_text", "") or "",
            "formatted_apa": _format_apa_reference(reference),
            "is_draft": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        references.append(new_ref)
        _save(data)
        return new_ref


def delete_reference(reference_id: str) -> bool:
    with _LOCK:
        data = _load()
        references: List[Dict[str, Any]] = data.get("references", [])
        before = len(references)
        data["references"] = [r for r in references if r.get("id") != reference_id]
        _save(data)
        return len(data["references"]) < before


def clear() -> None:
    with _LOCK:
        _save({"references": [], "citations": [], "updated_at": ""})


# ── FORMATEO APA 7 ────────────────────────────────────────────────────────────

_AUTHORS_RE_LAST_FIRST = re.compile(r"^\s*([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóún]+)*)\s*,\s*([A-ZÁÉÍÓÚÑ])",)


def _format_authors_apa(authors: List[str]) -> str:
    """Delega en el formateador canónico (una sola regla de autores en el proyecto)."""
    from modules.apa_format import formatear_autores
    return formatear_autores(authors)


def _format_apa_reference(ref: Dict[str, Any]) -> str:
    """Wrapper del formateador canónico: devuelve la línea como texto plano."""
    from modules.apa_format import format_apa_plain
    return format_apa_plain(ref)


def _draft_apa(authors: List[str], year: Optional[str], page: Optional[str]) -> str:
    """Texto APA 7 mínimo para una cita recién extraída (draft)."""
    author_str = _format_authors_apa(authors) or "[Autor]"
    y = year or "s.f."
    note = f" (p. {page})" if page else ""
    return f"{author_str} ({y}). [Completar título y fuente].{note}"


# ── BIBLIOGRAFÍA ──────────────────────────────────────────────────────────────

def build_bibliography_text() -> str:
    """
    Construye la sección de Referencias en texto plano, ordenada alfabéticamente,
    lista para que el Add-in la inserte al final del documento.
    """
    refs = list_references()
    lines: List[str] = []
    for r in refs:
        text = (r.get("formatted_apa") or "").strip()
        if not text:
            text = _format_apa_reference(r)
        if text:
            draft = " (borrador)" if r.get("is_draft") else ""
            lines.append(f"{text}{draft}")
    return "\n".join(lines)


def bibliography_summary() -> Dict[str, Any]:
    refs = list_references()
    return {
        "total": len(refs),
        "drafts": sum(1 for r in refs if r.get("is_draft")),
        "complete": sum(1 for r in refs if not r.get("is_draft")),
        "references": refs,
    }
