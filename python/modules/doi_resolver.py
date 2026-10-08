"""Resolver un DOI o un link a una referencia APA 7.

Resuelve EL hueco que el propio store documentaba: `add_citation` crea una
referencia "fantasma" con `is_draft: True` y el comentario "el usuario podra
completarla/resolver DOI luego". Esto es ese "luego".

De donde sale la metadata: **CrossRef** (`api.crossref.org/works/{doi}`). Es
gratis, no pide key, y devuelve justo los campos que APA 7 necesita: autores,
ano, titulo, container-title, volumen, numero, paginas y el DOI. El `User-Agent`
lleva un mailto porque es el "polite pool" de CrossRef: mas lento para ellos pero
mas estable para nosotros, y es lo que piden.

**Lo que esto NO arregla:** el plagio. De un DOI sale METADATA, que es lo que
necesita APA 7; no sale el TEXTO de la fuente, que es lo que necesita medir
similitud. R-G74 sigue necesitando que el usuario provea el texto. Confundir
las dos cosas es como un detector de plagio que mide contra el titulo del
articulo y da un numero: miente, y miente con la mayor confianza posible.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional
from urllib.parse import unquote

# APA 7 lista hasta 20 autores. Con mas, el primero y "et al.".
_APA_MAX_AUTORES = 20

# El prefijo de resolutor mas comun, mas la forma con prefijo `doi:`.
_DOI_URL = re.compile(
    r"^(?:https?://)?(?:dx\.)?doi\.org/", re.IGNORECASE)
_DOI_PREFIX = re.compile(r"^doi\s*:\s*", re.IGNORECASE)

# Un DOI empieza SIEMPRE por "10." (registro de DOI). Esa es la unica señal
# fiable y es la que evita tratar una URL de cualquier pagina como un DOI.
_DOI_CORE = re.compile(r"^10\.\d{4,9}/\S+$")


def normalize_doi(entrada: str) -> Optional[str]:
    """Saca el DOI crudo de lo que el usuario haya pegado, o `None`.

    Acepta el DOI desnudo, con prefijo `doi:`, y con URL de `doi.org` o
    `dx.doi.org`. Devuelve `None` —no una excepcion— cuando lo que se pegó no
    es un DOI: un link de Google Scholar o de la editorial es una consulta
    legitima que este modulo no sabe responder, y reportarlo como "no es un
    DOI" es mas util que hacer un 404 contra CrossRef.
    """
    if not entrada:
        return None
    texto = entrada.strip()
    if not texto:
        return None
    texto = _DOI_URL.sub("", texto)
    texto = _DOI_PREFIX.sub("", texto)
    texto = unquote(texto).strip()
    # Escribir el DOI con punto o coma final es el error mas comun al pegarlo,
    # y un punto es un caracter valido dentro de un DOI.
    texto = texto.rstrip(".,;")
    return texto if _DOI_CORE.match(texto) else None


def _autores_apa(authors: List[Dict[str, Any]]) -> List[str]:
    """`[{"given": "Ana", "family": "Perez"}]` → `["Perez, A."]`.

    CrossRef trae `sequence` para autores sin `family` ("Organizacion Mundial de
    la Salud"), y a veces `family` sin `given`. Se cubren los dos casos sin
    inventar nada: lo que falte, no se pone.
    """
    out: List[str] = []
    from modules.addin_references_store import APA_ELLIPSIS
    for a in authors or []:
        apellido = (a.get("family") or "").strip()
        nombre = (a.get("given") or a.get("name") or "").strip()
        if not apellido:
            # Autor corporativo: se usa el nombre tal cual.
            if nombre:
                out.append(nombre)
            continue
        iniciales = " ".join(
            f"{p[0].upper()}." for p in re.split(r"[\s-]+", nombre) if p)
        out.append(f"{apellido}, {iniciales}".strip().rstrip(","))
    return out


def crossref_to_reference(work: Dict[str, Any]) -> Dict[str, Any]:
    """Mapea la respuesta de CrossRef a la forma que espera el store.

    El texto APA lo arma `addin_references_store._format_apa_reference`, no
    este modulo: dos formateadores de APA divergen solos, que es exactamente lo
    que pasó con el `BLOOM_VERBS` que tenía verbos duplicados entre niveles.
    """
    from modules.apa_format import format_apa_plain

    autores = _autores_apa(work.get("author") or [])
    if len(autores) > _APA_MAX_AUTORES:
        # APA 7 con 21+ autores: los primeros 19, la elipsis, y el ULTIMO. La
        # elipsis se pide con el sentinel del store, no con la palabra "et al.":
        # esa se comia el "&" del formateador y salia "A., & et al.".
        from modules.addin_references_store import APA_ELLIPSIS
        autores = autores[:19] + [APA_ELLIPSIS, autores[-1]]

    issued = (work.get("issued") or {}).get("date-parts") or []
    anio = str(issued[0][0]) if issued and issued[0] else "s.f."

    titulo = (work.get("title") or [""])[0] or ""
    fuente = (work.get("container-title") or [""])[0] or ""
    doi = (work.get("DOI") or "").strip()

    ref: Dict[str, Any] = {
        "authors": autores,
        "year": anio,
        "title": titulo.strip(),
        "source": fuente.strip(),
        # El DOI CRUDO, no `https://doi.org/...`: el store ya lo convierte y
        # duplicarlo dejaría el link dos veces en la referencia.
        "doi_or_url": doi,
        "raw_text": "",
        "is_draft": False,
    }
    ref["formatted_apa"] = format_apa_plain(ref)
    return ref


def crossref_url(doi: str) -> str:
    return f"https://api.crossref.org/works/{doi}"


_WEB_URL_PATTERN = re.compile(r"^(?:https?://|www\.)\S+$", re.IGNORECASE)


def normalize_web_url(entrada: str) -> Optional[str]:
    """Valida y normaliza una URL web ordinaria."""
    if not entrada:
        return None
    url = entrada.strip().rstrip(".,;)")
    if normalize_doi(url):
        return None
    if _WEB_URL_PATTERN.match(url):
        if url.lower().startswith("www."):
            url = f"https://{url}"
        return url
    return None


async def resolve_web_metadata(url: str) -> Dict[str, Any]:
    """Extrae metadatos APA 7 desde HTML (OpenGraph, meta tags, schema.org, Dublin Core)."""
    from bs4 import BeautifulSoup
    from modules.apa_format import format_apa_plain
    from urllib.parse import urlparse

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 WordAPA7/1.0"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    timeout = 12.0
    import httpx
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code >= 400:
            raise ValueError(f"La página respondió con estado HTTP {resp.status_code}")
        html = resp.text

    soup = BeautifulSoup(html, "html.parser")

    def get_meta(*names: str) -> Optional[str]:
        for n in names:
            tag = (
                soup.find("meta", attrs={"property": n})
                or soup.find("meta", attrs={"name": n})
                or soup.find("meta", attrs={"itemprop": n})
            )
            if tag and tag.get("content"):
                return tag["content"].strip()
        return None

    # Título
    title = (
        get_meta(
            "og:title",
            "twitter:title",
            "citation_title",
            "dc.title",
            "dc.Title",
        )
        or (soup.title.string.strip() if soup.title and soup.title.string else "")
    )
    # Limpiar títulos con nombre del sitio al final (ej: "Mi Noticia - El País")
    if " - " in title:
        parts = title.split(" - ")
        if len(parts[-1].split()) <= 4:
            title = " - ".join(parts[:-1]).strip()
    elif " | " in title:
        parts = title.split(" | ")
        if len(parts[-1].split()) <= 4:
            title = " | ".join(parts[:-1]).strip()

    # Fuente / Sitio
    source = get_meta(
        "og:site_name",
        "citation_journal_title",
        "citation_publisher",
        "dc.publisher",
    )
    if not source:
        netloc = urlparse(url).netloc
        source = netloc.replace("www.", "").capitalize()

    # Autores
    authors: List[str] = []
    author_meta = get_meta(
        "author",
        "article:author",
        "citation_author",
        "dc.creator",
        "dc.contributor",
        "byl",
    )
    if author_meta:
        # Si contiene coma entre palabras ("García, Juan"), separar por coma solo si hay múltiples autores
        # o procesar autor individual con apellido, nombre
        raw_authors = [author_meta] if "," in author_meta and len(author_meta.split(",")) == 2 else re.split(r";| and | y ", author_meta)
        for raw_a in raw_authors:
            clean_a = raw_a.strip()
            if not clean_a or len(clean_a) < 2:
                continue
            if "," in clean_a:
                parts = [p.strip() for p in clean_a.split(",") if p.strip()]
                if len(parts) >= 2:
                    surname, given = parts[0], parts[1]
                    authors.append(f"{surname}, {given[0]}.")
                else:
                    authors.append(clean_a)
            else:
                words = clean_a.split()
                if len(words) >= 2 and not any(p in clean_a.lower() for p in ["redacción", "editorial", "staff", "news"]):
                    authors.append(f"{words[-1]}, {words[0][0]}.")
                else:
                    authors.append(clean_a)

    # Año / Fecha
    date_meta = get_meta(
        "article:published_time",
        "citation_publication_date",
        "citation_date",
        "dc.date",
        "pubdate",
        "date",
        "og:updated_time",
    )
    year = "s.f."
    if date_meta:
        m_y = re.search(r"\b(19\d\d|20\d\d)\b", date_meta)
        if m_y:
            year = m_y.group(1)

    # Validar campos esenciales: una página web sin título es inusable como referencia
    if not title:
        raise ValueError(
            "La página web no contiene título identificable. "
            "Por favor completa los datos manualmente."
        )

    ref: Dict[str, Any] = {
        "authors": authors,
        "year": year,
        "title": title.strip(),
        "source": source.strip() if source else "",
        "doi_or_url": url,
        "raw_text": "",
        "is_draft": False,
    }
    ref["formatted_apa"] = format_apa_plain(ref)
    return ref
