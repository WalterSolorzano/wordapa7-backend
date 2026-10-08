"""
WordAPA7 — Parser de archivos BibTeX (.bib) y RIS (.ris) para Zotero / Mendeley.
"""

from __future__ import annotations

import uuid
from typing import List, Optional
from models import ReferenciaModel

try:
    import bibtexparser
except ImportError:
    bibtexparser = None

try:
    import rispy
except ImportError:
    rispy = None


def parse_bibtex_text(content: str) -> List[ReferenciaModel]:
    """Parsea una cadena BibTeX y la convierte en lista de ReferenciaModel."""
    refs: List[ReferenciaModel] = []
    if not content or not content.strip():
        return refs

    if bibtexparser:
        try:
            bib_db = bibtexparser.loads(content)
            for entry in bib_db.entries:
                raw_author = entry.get("author", "")
                authors = [a.strip() for a in raw_author.split(" and ") if a.strip()]
                year = entry.get("year")
                title = entry.get("title", "").strip("{}")
                source = entry.get("journal") or entry.get("booktitle") or entry.get("publisher") or ""
                doi = entry.get("doi") or entry.get("url")

                # Reconstruir raw_text formateado (formateador canónico)
                from modules.apa_format import format_apa_plain
                formatted = format_apa_plain({
                    "authors": authors, "year": str(year) if year else None,
                    "title": title, "source": source, "doi_or_url": doi, "raw_text": "",
                })

                refs.append(ReferenciaModel(
                    id=f"ref-bib-{uuid.uuid4().hex[:8]}",
                    authors=authors,
                    year=str(year) if year else None,
                    title=title,
                    source=source,
                    doi_or_url=doi,
                    raw_text=formatted,
                    formatted_apa=formatted,
                ))
            return refs
        except Exception as e:
            print(f"[WARN] Error parseando BibTeX con bibtexparser: {e}")

    # Fallback básico regex si no estuviera bibtexparser
    import re
    entries = re.split(r"@\w+\s*\{", content)
    for block in entries[1:]:
        title_m = re.search(r'title\s*=\s*[\"{](.*?)[\"}]', block, re.I)
        author_m = re.search(r'author\s*=\s*[\"{](.*?)[\"}]', block, re.I)
        year_m = re.search(r'year\s*=\s*[\"{]?(\d{4})[\"}]?', block, re.I)
        title = title_m.group(1) if title_m else ""
        author = author_m.group(1) if author_m else ""
        year = year_m.group(1) if year_m else None
        if title or author:
            from modules.apa_format import format_apa_plain
            raw = format_apa_plain({
                "authors": [a.strip() for a in author.split(" and ") if a.strip()],
                "year": year, "title": title, "source": "", "doi_or_url": None,
                "raw_text": "",
            })
            refs.append(ReferenciaModel(
                id=f"ref-bib-{uuid.uuid4().hex[:8]}",
                authors=[a.strip() for a in author.split(" and ") if a.strip()],
                year=year,
                title=title,
                raw_text=raw,
            ))
    return refs


def parse_ris_text(content: str) -> List[ReferenciaModel]:
    """Parsea una cadena RIS (EndNote / Zotero / Mendeley) a ReferenciaModel."""
    refs: List[ReferenciaModel] = []
    if not content or not content.strip():
        return refs

    if rispy:
        try:
            entries = rispy.loads(content)
            for entry in entries:
                authors = entry.get("authors") or entry.get("first_authors") or []
                year = entry.get("year") or entry.get("publication_year")
                title = entry.get("primary_title") or entry.get("title") or ""
                source = entry.get("secondary_title") or entry.get("journal_name") or entry.get("publisher") or ""
                doi = entry.get("doi") or entry.get("url")

                from modules.apa_format import format_apa_plain
                formatted = format_apa_plain({
                    "authors": authors, "year": str(year) if year else None,
                    "title": title, "source": source, "doi_or_url": doi, "raw_text": "",
                })

                refs.append(ReferenciaModel(
                    id=f"ref-ris-{uuid.uuid4().hex[:8]}",
                    authors=authors,
                    year=str(year) if year else None,
                    title=title,
                    source=source,
                    doi_or_url=doi,
                    raw_text=formatted,
                    formatted_apa=formatted,
                ))
            return refs
        except Exception as e:
            print(f"[WARN] Error parseando RIS con rispy: {e}")

    # Fallback básico RIS
    import re
    blocks = re.split(r"ER\s*-\s*", content)
    for block in blocks:
        if not block.strip():
            continue
        authors = re.findall(r"^AU\s*-\s*(.*)$", block, re.M)
        title_m = re.search(r"^(?:TI|T1)\s*-\s*(.*)$", block, re.M)
        year_m = re.search(r"^(?:PY|Y1)\s*-\s*(\d{4})", block, re.M)
        title = title_m.group(1).strip() if title_m else ""
        year = year_m.group(1) if year_m else None
        if title or authors:
            from modules.apa_format import format_apa_plain
            raw = format_apa_plain({
                "authors": authors, "year": year, "title": title,
                "source": "", "doi_or_url": None, "raw_text": "",
            })
            refs.append(ReferenciaModel(
                id=f"ref-ris-{uuid.uuid4().hex[:8]}",
                authors=authors,
                year=year,
                title=title,
                raw_text=raw,
            ))
    return refs
