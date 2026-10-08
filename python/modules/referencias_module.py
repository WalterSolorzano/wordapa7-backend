"""
WordAPA7 â€” Modulo de Referencias Bibliograficas APA 7

Genera y formatea la seccion de Referencias:
1. Titulo "Referencias" centrado en negrita en pagina nueva.
2. Sangria francesa (hanging indent) de 1.27 cm (0.5 in).
3. Interlineado doble (2.0) sin espacios adicionales.
4. Orden alfabetico por primer autor.
5. Cursiva en titulos de libros, revistas y volumen.
6. DOI content negotiation via Crossref (gratis, sin API key).
"""

import re
import unicodedata
from typing import List, Optional
from urllib.parse import quote

import docx
import httpx
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from generation.style_engine import set_run_font
from models import APARuleSet, ReferenciaModel

# Quita marcadores de lista al inicio ("1.", "(a)", "•"), pero NO debe comerse
# un "(s.f.)." legítimo: la alternativa de letra no matchea si sigue otra letra,
# evitando dejar el residuo "f.)." al recortar "(s." de "(s.f.)".
_REF_PREFIX_RE = re.compile(
    r'^(?:[•○▪–\-*]|\(?\d+[\.\)]|\(?[a-zA-Z][\.\)](?![a-zA-Z]))\s*'
)


def _strip_ref_prefix(text: str) -> str:
    return _REF_PREFIX_RE.sub('', text.strip())


# â”€â”€ DOI Content Negotiation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

DOI_RESOLVER_URL: str = "https://doi.org/"
CROSSREF_ACCEPT_HEADER: str = "text/x-bibliography; style=apa; locale=es-419"


async def resolve_doi(doi_input: str) -> Optional[str]:
    """
    Usa DOI content negotiation â€” GRATIS, sin API key.

    GET https://doi.org/{doi}
    Header: Accept: text/x-bibliography; style=apa; locale=es-419

    Retorna el texto APA 7 formateado directamente desde Crossref.
    Si falla, retorna None para que se use el fallback LLM.
    """
    # Limpiar DOI: remover prefijo "doi:" o "https://doi.org/" si existe
    doi_clean: str = doi_input.strip()
    doi_clean = re.sub(r'^https?://doi\.org/', '', doi_clean)
    doi_clean = re.sub(r'^doi:\s*', '', doi_clean, flags=re.IGNORECASE)
    doi_clean = doi_clean.strip()

    if not doi_clean:
        return None

    url: str = f"{DOI_RESOLVER_URL}{doi_clean}"

    try:
        async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
            resp = await client.get(
                url,
                headers={"Accept": CROSSREF_ACCEPT_HEADER},
            )
            if resp.status_code == 200 and resp.text.strip():
                return resp.text.strip()
            elif resp.status_code == 404:
                print(f"[INFO] DOI no encontrado en Crossref: {doi_clean}")
                return None
            else:
                print(f"[WARN] Crossref devolvio status {resp.status_code} para DOI: {doi_clean}")
                return None
    except httpx.TimeoutException:
        print(f"[WARN] Timeout consultando DOI: {doi_clean}")
        return None
    except Exception as err:
        print(f"[WARN] Error consultando DOI {doi_clean}: {err}")
        return None


import re


def extract_doi_or_isbn(text: str):
    doi_match = re.search(r'(10\.\d{4,9}/[-._;()/:A-Z0-9]+)', text, re.IGNORECASE)
    if doi_match:
        return {"type": "doi", "value": doi_match.group(1)}

    isbn_match = re.search(r'(?:ISBN(?:-1[03])?:? )?(?=[-0-9 ]{13,17})(?:97[89][- ]?)?[0-9]{1,5}[- ]?[0-9]+[- ]?[0-9]+[- ]?[0-9X]', text, re.IGNORECASE)
    if isbn_match:
        isbn_clean = re.sub(r'[^0-9X]', '', isbn_match.group(0).upper())
        if len(isbn_clean) in (10, 13):
            return {"type": "isbn", "value": isbn_clean}
    return None

async def fetch_crossref_metadata(doi: str) -> Optional[dict]:
    url = f"https://api.crossref.org/works/{doi}"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            results = []
            if resp.status_code == 200:
                data = resp.json()["message"]
                authors = []
                for author in data.get("author", []):
                    if "family" in author and "given" in author:
                        authors.append(f"{author['family']}, {author['given'][0]}.")
                    elif "family" in author:
                        authors.append(author["family"])

                author_str = ", & ".join(authors) if authors else "Autor desconocido"
                year = data.get("published-print", {}).get("date-parts", [[None]])[0][0]
                if not year:
                    year = data.get("published-online", {}).get("date-parts", [[None]])[0][0]
                year_str = str(year) if year else "s.f."

                title = data.get("title", [""])[0]
                container_title = data.get("container-title", [""])[0]
                volume = data.get("volume", "")
                issue = data.get("issue", "")
                page = data.get("page", "")

                source_parts = container_title
                if container_title and volume:
                    source_parts += f", {volume}"
                    if issue:
                        source_parts += f"({issue})"
                if container_title and page:
                    source_parts += f", {page}"
                from modules.apa_format import build_apa_segments
                _segs = build_apa_segments({
                    "authors": authors, "year": year_str, "title": title,
                    "source": source_parts, "doi_or_url": doi,
                    "raw_text": "", "tipo": "articulo",
                })
                formatted = "".join(s.text for s in _segs)

                results.append({
                    "author": author_str,
                    "year": year_str,
                    "title": title,
                    "source": container_title,
                    "doi": doi,
                    "volume": volume,
                    "issue": issue,
                    "page": page,
                    "formatted_apa": formatted,
                    "apa_segments": [s.model_dump() for s in _segs],
                    "provider": "crossref",
                })

            return results[0] if results else None
    except Exception as e:
        print(f"[WARN] Error in Crossref search: {e}")
    return None


async def fetch_openalex_metadata(query_or_doi: str) -> Optional[dict]:
    """Busca metadatos en OpenAlex API (abierta, sin API key)."""
    q_clean = query_or_doi.strip()
    if q_clean.startswith("10.") or "doi.org/" in q_clean:
        doi = re.sub(r"^https?://doi\.org/", "", q_clean)
        url = f"https://api.openalex.org/works/https://doi.org/{doi}"
    else:
        url = f"https://api.openalex.org/works?search={quote(q_clean)}&per-page=1"

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url, headers={"User-Agent": "WordAPA7/1.0 (mailto:wordapa7@antigravity.dev)"})
            if resp.status_code != 200:
                return None
            data = resp.json()
            work = data if "display_name" in data else (data.get("results", [{}])[0] if data.get("results") else None)
            if not work or not work.get("display_name"):
                return None

            # Autores
            authors = []
            for auth_m in work.get("authorships", []):
                name = auth_m.get("author", {}).get("display_name", "")
                if name:
                    parts = name.strip().split()
                    if len(parts) >= 2:
                        authors.append(f"{parts[-1]}, {parts[0][0]}.")
                    else:
                        authors.append(name)
            author_str = ", & ".join(authors[:3]) if authors else "Autor desconocido"

            year_str = str(work.get("publication_year") or "s.f.")
            title_str = work.get("display_name", "")
            venue = work.get("primary_location", {}).get("source", {}).get("display_name", "")
            doi_str = work.get("doi", "").replace("https://doi.org/", "")
            pdf_url = work.get("primary_location", {}).get("pdf_url")

            from modules.apa_format import build_apa_segments
            _segs = build_apa_segments({
                "authors": authors, "year": year_str, "title": title_str,
                "source": venue, "doi_or_url": doi_str, "raw_text": "", "tipo": "articulo",
            })
            formatted = "".join(s.text for s in _segs)

            return {
                "author": author_str,
                "year": year_str,
                "title": title_str,
                "source": venue,
                "doi": doi_str,
                "pdf_url": pdf_url,
                "formatted_apa": formatted,
                "apa_segments": [s.model_dump() for s in _segs],
                "provider": "openalex",
            }
    except Exception as e:
        print(f"[WARN] Error in OpenAlex API: {e}")
    return None


async def fetch_semantic_scholar_metadata(query_or_doi: str) -> Optional[dict]:
    """Busca metadatos en Semantic Scholar API."""
    q_clean = query_or_doi.strip()
    url = f"https://api.semanticscholar.org/graph/v1/paper/search?query={quote(q_clean)}&limit=1&fields=title,authors,year,venue,externalIds,openAccessPdf"

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                return None
            data = resp.json()
            papers = data.get("data", [])
            if not papers:
                return None
            paper = papers[0]

            authors = []
            for a in paper.get("authors", []):
                name = a.get("name", "")
                parts = name.strip().split()
                if len(parts) >= 2:
                    authors.append(f"{parts[-1]}, {parts[0][0]}.")
                elif name:
                    authors.append(name)
            author_str = ", & ".join(authors[:3]) if authors else "Autor desconocido"

            year_str = str(paper.get("year") or "s.f.")
            title_str = paper.get("title", "")
            venue = paper.get("venue", "")
            doi_str = paper.get("externalIds", {}).get("DOI", "")
            pdf_info = paper.get("openAccessPdf", {}) or {}
            pdf_url = pdf_info.get("url")

            from modules.apa_format import build_apa_segments
            _segs = build_apa_segments({
                "authors": authors, "year": year_str, "title": title_str,
                "source": venue, "doi_or_url": doi_str, "raw_text": "", "tipo": "articulo",
            })
            formatted = "".join(s.text for s in _segs)

            return {
                "author": author_str,
                "year": year_str,
                "title": title_str,
                "source": venue,
                "doi": doi_str,
                "pdf_url": pdf_url,
                "formatted_apa": formatted,
                "apa_segments": [s.model_dump() for s in _segs],
                "provider": "semantic_scholar",
            }
    except Exception as e:
        print(f"[WARN] Error in Semantic Scholar API: {e}")
    return None


async def search_academic_metadata_cascade(query_or_doi: str, authors: list[str] = [], year: str = "") -> Optional[dict]:
    """Búsqueda proactiva en cascada: Crossref -> OpenAlex -> Semantic Scholar."""
    # 1. Intentar Crossref
    if authors and year:
        res = await search_crossref_by_author_year(authors, year)
        if res:
            return res

    if query_or_doi.startswith("10.") or "doi.org" in query_or_doi:
        res_doi = await fetch_crossref_metadata(query_or_doi)
        if res_doi:
            return res_doi

    # 2. Intentar OpenAlex
    res_oa = await fetch_openalex_metadata(query_or_doi)
    if res_oa:
        return res_oa

    # 3. Intentar Semantic Scholar
    res_ss = await fetch_semantic_scholar_metadata(query_or_doi)
    if res_ss:
        return res_ss

    return None


async def search_crossref_by_author_year(authors: list[str], year: str) -> Optional[dict]:
    """
    Busca en Crossref API por apellido(s) de autor + aÃ±o.
    API gratuita, no requiere key. Retorna el mejor match formateado en APA 7.

    Args:
        authors: lista de apellidos, ej: ["Garcia", "Lopez"]
        year: aÃ±o de publicaciÃ³n, ej: "2023"

    Returns: dict con author, year, title, source, doi, formatted_apa, o None
    """
    query = " ".join(authors) + " " + year
    url = f"https://api.crossref.org/works?query={quote(query)}&rows=5"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url, headers={"User-Agent": "WordAPA7/1.0 (mailto:wordapa7@antigravity.dev)"})
            if resp.status_code != 200:
                return None
            data = resp.json()
            items = data.get("message", {}).get("items", [])
            if not items:
                return None

            results = []
            for item in items:
                # Formatear autores APA 7
                apa_authors = []
                item_authors = item.get("author", [])
                for author in item_authors:
                    family = author.get("family", "")
                    given = author.get("given", "")
                    if family and given:
                        apa_authors.append(f"{family}, {given[0]}.")
                    elif family:
                        apa_authors.append(family)
                if not apa_authors:
                    apa_authors = ["Autor desconocido"]
                author_str = ", & ".join(apa_authors) if len(apa_authors) <= 2 else (
                    ", ".join(apa_authors[:-1]) + ", & " + apa_authors[-1]
                )

                # AÃ±o
                pub_year = item.get("published-print", {}).get("date-parts", [[None]])[0][0]
                if not pub_year:
                    pub_year = item.get("published-online", {}).get("date-parts", [[None]])[0][0]
                if not pub_year:
                    pub_year = item.get("created", {}).get("date-parts", [[None]])[0][0]
                year_str = str(pub_year) if pub_year else year

                # TÃ­tulo
                titles = item.get("title", [])
                title_str = titles[0] if titles else "Sin título"

                # Source
                container = item.get("container-title", [])
                source_str = container[0] if container else ""
                publisher = item.get("publisher", "")
                if not source_str and publisher:
                    source_str = publisher

                # DOI
                doi = item.get("DOI", "")

                # Volume, issue, pages
                volume = item.get("volume", "")
                issue = item.get("issue", "")
                page = item.get("page", "")

                # Formato APA 7 (formateador canónico)
                src = source_str
                if source_str and volume:
                    src += f", {volume}"
                    if issue:
                        src += f"({issue})"
                if source_str and page:
                    src += f", {page}"
                from modules.apa_format import build_apa_segments
                _segs = build_apa_segments({
                    "authors": apa_authors, "year": year_str, "title": title_str,
                    "source": src, "doi_or_url": doi, "raw_text": "", "tipo": "articulo",
                })
                formatted = "".join(s.text for s in _segs)

                # Score de relevancia: el primer autor coincide = alta relevancia
                item_surnames = [a.get("family", "").lower() for a in item_authors]
                query_surnames = [a.lower() for a in authors]
                relevance = "high" if (item_surnames and query_surnames and item_surnames[0] == query_surnames[0]) else "medium"

                results.append({
                    "authors": apa_authors,
                    "year": year_str,
                    "title": title_str,
                    "source": source_str or publisher,
                    "doi": doi,
                    "formatted_apa": formatted,
                    "apa_segments": [s.model_dump() for s in _segs],
                    "relevance": relevance,
                })

            if not results:
                return None

            return {
                "candidates": results,
                "found": True,
                "total_results": data.get("message", {}).get("total-results", len(results)),
            }
    except Exception as e:
        print(f"[WARN] Error searching Crossref: {e}")
    return None


async def fetch_openlibrary_metadata(isbn: str) -> Optional[dict]:
    url = f"https://openlibrary.org/api/books?bibkeys=ISBN:{isbn}&format=json&jscmd=data"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                key = f"ISBN:{isbn}"
                if key in data:
                    book = data[key]
                    authors = [a["name"] for a in book.get("authors", [])]
                    author_str = ", & ".join(authors) if authors else "Autor desconocido"
                    year = book.get("publish_date", "s.f.")
                    title = book.get("title", "")
                    publisher = book.get("publishers", [{"name": ""}])[0].get("name", "")

                    from modules.apa_format import build_apa_segments
                    _segs = build_apa_segments({
                        "authors": authors, "year": year, "title": title,
                        "source": publisher, "doi_or_url": None,
                        "raw_text": "", "tipo": "libro",
                    })
                    formatted = "".join(s.text for s in _segs)

                    return {
                        "author": author_str,
                        "year": year,
                        "title": title,
                        "publisher": publisher,
                        "isbn": isbn,
                        "formatted": formatted,
                        "formatted_apa": formatted,
                        "apa_segments": [s.model_dump() for s in _segs],
                    }
    except Exception as e:
        print(f"[WARN] Error in OpenLibrary API: {e}")
    return None

async def resolve_dois_batch(raw_references: List[str]) -> List[dict]:
    """
    Recibe una lista de referencias en texto libre. Extrae DOIs/ISBNs y
    resuelve los metadatos de forma concurrente usando Crossref u OpenLibrary.
    Retorna lista de diccionarios con los resultados encontrados, manteniendo el Ã­ndice.
    """
    import asyncio

    async def process_ref(idx, text):
        info = extract_doi_or_isbn(text)
        if not info:
            return {"index": idx, "original": text, "resolved": False}

        if info["type"] == "doi":
            metadata = await fetch_crossref_metadata(info["value"])
            if metadata:
                return {"index": idx, "original": text, "resolved": True, "type": "doi", "metadata": metadata}
        elif info["type"] == "isbn":
            metadata = await fetch_openlibrary_metadata(info["value"])
            if metadata:
                return {"index": idx, "original": text, "resolved": True, "type": "isbn", "metadata": metadata}

        return {"index": idx, "original": text, "resolved": False}

    tasks = [process_ref(idx, text) for idx, text in enumerate(raw_references)]
    results = await asyncio.gather(*tasks)
    return list(results)


# â”€â”€ Seccion de Referencias â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _clave_orden_apa(texto: str) -> str:
    """Clave alfabetica APA 7: apellido sin tildes ni iniciales.

    APA 7 ordena letra a letra por el APELLIDO, no por el nombre completo con
    iniciales. "Gutiérrez Pulido, H." y "Gutierrez, J." tienen que caer en el
    mismo lugar, y para eso hay que quitar la tilde: el orden viejo comparaba
    ``authors[0].lower()`` completo, asi que "Gutiérrez" ordenaba DESPUES de
    "Guzman" porque la tilde tiene otro punto de codigo. Las particulas ("de la
    Cruz") se conservan: APA las alfabetiza con el apellido.
    """
    if not texto:
        return ""
    apellido = texto.split(",")[0]
    normal = unicodedata.normalize("NFKD", apellido)
    normal = "".join(c for c in normal if not unicodedata.combining(c)).lower()
    normal = re.sub(r"[^a-z0-9\s]", " ", normal)
    return " ".join(normal.split())


def sort_referencias_alphabetically(references: List[ReferenciaModel]) -> List[ReferenciaModel]:
    """
    Ordena alfabeticamente las referencias por el apellido del primer autor
    o por titulo si no hay autor.
    """
    def get_sort_key(ref: ReferenciaModel) -> str:
        if ref.authors:
            return _clave_orden_apa(ref.authors[0])
        elif ref.title:
            return _clave_orden_apa(ref.title)
        return _clave_orden_apa(ref.raw_text)

    return sorted(references, key=get_sort_key)


def _texto_de_elemento(el) -> str:
    """Texto de un ``<w:p>`` crudo, sin depender de la capa de python-docx."""
    return "".join(t.text or "" for t in el.iter(qn("w:t")))


def _estilo_de_parrafo(el) -> str:
    pPr = el.find(qn("w:pPr"))
    if pPr is None:
        return ""
    pStyle = pPr.find(qn("w:pStyle"))
    if pStyle is None:
        return ""
    return pStyle.get(qn("w:val")) or ""


def _es_titulo_estilado(el) -> bool:
    """True si el estilo del parrafo lo declara un heading de Word."""
    return _estilo_de_parrafo(el).lower().startswith("heading")


def _buscar_seccion_referencias(doc: docx.Document):
    """El parrafo que abre la seccion de Referencias, o ``None`` si no hay.

    Unica fuente de verdad: ``phase_scope.match_phase_exact``. Antes de esto la
    respuesta vivia en cuatro lugares con tres vocabularios distintos, y
    ``format_apa_referencias_section`` no la consultaba a ninguno — se limitaba
    a escribir "Referencias" a mano y append al final, por lo que una tesis
    que ya traia bibliografia salia con dos titulos y un salto de pagina en el
    medio.
    """
    from modules.phase_scope import match_phase_exact

    for p in doc.paragraphs:
        if match_phase_exact(p.text or "") == "referencias":
            return p
    return None


def _purgar_seccion_referencias(doc: docx.Document, header) -> None:
    """Borra el contenido de la seccion, conservando su titulo.

    Se detiene en la primera frontera —un heading de Word, un nombre de fase, o
    una tabla— porque lo que hay despues ya no es bibliografia. Si se pasara de
    largo se llevaria el capitulo siguiente, que es peor que el bug original.
    """
    from modules.phase_scope import match_phase_exact

    a_borrar = []
    el = header._p.getnext()
    while el is not None:
        tag = el.tag.split("}")[-1]
        if tag != "p":
            break  # tabla o seccion: frontera dura, no se toca
        texto = _texto_de_elemento(el)
        if _es_titulo_estilado(el) or match_phase_exact(texto):
            break  # el siguiente capitulo: dejarle su contenido
        a_borrar.append(el)
        el = el.getnext()

    for el in a_borrar:
        el.getparent().remove(el)


def _armar_apa_desde_campos(ref: ReferenciaModel) -> str:
    """Construye la linea APA (texto plano) desde los campos de la referencia.

    Devuelve "" si no hay con que armar una linea.
    """
    from modules.apa_format import format_apa_plain

    if not (ref.authors or ref.title.strip() or ref.source.strip()
            or (ref.doi_or_url or "").strip()):
        return ""

    return format_apa_plain(ref)


def format_apa_referencias_section(
    doc: docx.Document,
    references: List[ReferenciaModel],
    rules: APARuleSet,
) -> None:
    """Inserta o REEMPLAZA la seccion de Referencias, con sangria francesa.

    Antes de crear nada, PREGUNTA si la seccion ya existe. Un documento que ya
    trae su bibliografia —escrita a mano o generada antes— recibia un salto de
    pagina, un segundo titulo "Referencias" y las entradas viejas pegadas a las
    nuevas. La funcion tenia "Referencias" escrito a mano mientras
    `_is_references_section_heading` —que ya sabia contestarlo— estaba a cien
    lineas: cuatro lugares decidiendo lo mismo con tres vocabularios distintos.

    Ahora la unica definicion de "esto es la seccion de Referencias" es
    `phase_scope.match_phase_exact`, y la seccion que se conserva es la que el
    autor escribio: si puso "Bibliografia", sigue diciendo "Bibliografia".
    """
    if not references:
        return

    existing = _buscar_seccion_referencias(doc)
    if existing is not None:
        _purgar_seccion_referencias(doc, existing)
    else:
        # Salto de pagina antes de Referencias
        doc.add_page_break()

    # Titulo Nivel 1 Centrado. Si la seccion YA existia se conserva el titulo del
    # autor: si puso "Bibliografia", el documento sigue diciendo "Bibliografia".
    if existing is not None:
        p_hdr, ancla = None, existing._p
    else:
        p_hdr = doc.add_paragraph()
        p_hdr.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p_hdr.paragraph_format.line_spacing = rules.line_spacing
        p_hdr.paragraph_format.first_line_indent = Inches(0)
        p_hdr.paragraph_format.space_before = Pt(0)
        p_hdr.paragraph_format.space_after = Pt(0)

        r_hdr = p_hdr.add_run("Referencias")
        r_hdr.bold = True
        set_run_font(r_hdr, rules.font_family, rules.font_size_pt)
        r_hdr.font.color.rgb = RGBColor(0, 0, 0)
        ancla = p_hdr._p

    # Ordenar referencias
    sorted_refs = sort_referencias_alphabetically(references)

    for ref in sorted_refs:
        p_ref = doc.add_paragraph()
        # `add_paragraph` deja el parrafo al FINAL del body. Cuando la seccion
        # ya existia hay que devolverlo adentro: se crea y se reubica, que es la
        # unica via que da python-docx para insertar en una posicion.
        if existing is not None:
            ancla.addnext(p_ref._p)
            ancla = p_ref._p
        try:
            p_ref.style = None
        except Exception:
            pass
        p_ref.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p_ref.paragraph_format.line_spacing = rules.line_spacing

        pPr = p_ref._element.find(qn('w:pPr'))
        if pPr is not None:
            numPr = pPr.find(qn('w:numPr'))
            if numPr is not None:
                pPr.remove(numPr)

        # Sangria Francesa (Hanging Indent) 1.27 cm
        p_ref.paragraph_format.left_indent = Inches(0.5)
        p_ref.paragraph_format.first_line_indent = Inches(-0.5)
        p_ref.paragraph_format.space_before = Pt(0)
        p_ref.paragraph_format.space_after = Pt(0)

        # Segmentos: los del modelo, o reconstruidos desde los campos/texto.
        segs = list(ref.apa_segments) if ref.apa_segments else []
        if not segs:
            from modules.apa_format import build_apa_segments
            segs = build_apa_segments(ref)
        if not segs:
            # Fallback: una referencia que solo trae `formatted_apa`/`raw_text`
            # (sin campos estructurados) NO debe desaparecer en silencio.
            plano = (ref.formatted_apa or ref.raw_text or "").strip()
            if plano:
                from models import ApaSegment
                segs = [ApaSegment(text=plano)]
        if not segs:
            continue
        # Seguridad F-06: nunca dejar `[SIGLAS]` en la lista final (APA 7, 9.11).
        from modules.apa_format import recortar_siglas_corporativas
        segs[0].text = recortar_siglas_corporativas(segs[0].text)
        texto = _strip_ref_prefix("".join(s.text for s in segs))
        if not texto.strip():
            continue

        for i, seg in enumerate(segs):
            t = _strip_ref_prefix(seg.text) if i == 0 else seg.text
            if not t:
                continue
            run = p_ref.add_run(t)
            run.bold = False
            run.italic = bool(seg.italic)
            set_run_font(run, rules.font_family, rules.font_size_pt)
            run.font.color.rgb = RGBColor(0, 0, 0)
