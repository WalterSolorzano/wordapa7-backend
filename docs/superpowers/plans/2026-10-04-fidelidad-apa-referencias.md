# Fidelidad APA 7 en la Lista de Referencias — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una sola fuente de verdad que arme la línea APA 7 de cada referencia como segmentos tipográficos (texto + cursiva), distinga libro/artículo/capítulo/tesis/web/informe, limpie artefactos de exportación automática y nunca invente un enlace en un libro sin DOI/URL.

**Architecture:** El backend construye `apa_segments` (lista de `{text, italic}`) en `python/modules/apa_format.py` y deriva `formatted_apa` como texto plano. El frontend solo dibuja esos segmentos vía `apaLayout.ts` + `ReferenciaLinea.tsx`; nunca recompone APA. El DOCX escribe un run por segmento. Los datos viejos sin segmentos caen a `formatted_apa`/`raw_text` sin romper.

**Tech Stack:** Python 3.11 / FastAPI / Pydantic v2 / python-docx / pytest+anyio. React 18 / TypeScript / Zustand / Vitest+jsdom / @react-pdf/renderer.

**Spec:** `docs/superpowers/specs/2026-10-04-fidelidad-apa-referencias-design.md`

## Global Constraints

- **Cero emojis** en UI, strings y documentos (solo iconos `lucide-react`).
- **Solo tokens de color** (`var(--…)`); prohibido hex/rgba hardcodeado (lo vigila `noHardcodedColors.test.ts`).
- **React no recompone APA**: el backend es el único autor de la línea.
- **Compatibilidad hacia atrás**: un dato sin `apa_segments` cae a `formatted_apa`/`raw_text` sin romper el render.
- Backend test command: `pytest python/tests/ -q --tb=short`. Frontend: `npm test -- --reporter=dot`.
- Los imports del formateador desde `models.py` van **dentro** del validador (evitar import pesado/circular en el arranque).
- Rutas de router sin prefijo global: el decorador escribe la ruta completa con `/api/…` (igual que `/api/resolve-doi` en `python/routers/references.py`).

## Review Focus

Las cinco clases de entrada que la spec implica pero ningún test directo cubre hoy; cada una recibe su test en la tarea dueña:

1. Referencia importada en estilo Vancouver/IEEE (`Available from:` + `[accessed …]`) → debe salir limpia en todas las superficies y en el DOCX (Task 2, Task 5, Task 7).
2. Libro sin DOI/URL → título en cursiva, termina en `Editorial.`, **jamás** inventa enlace (Task 2, Task 9).
3. Autor corporativo con `[SIGLAS]` → las siglas nunca aparecen en la lista (Task 2, Task 4, Task 5).
4. Dato viejo sin `apa_segments` (sesiones ya persistidas) → renderiza sin crash y sin línea en blanco (Task 3, Task 9, Task 10).
5. Referencia sin autores → prefijo `({año}). …`, sin crash (Task 2).

## File Structure

- **Create** `python/modules/apa_format.py` — formateador canónico (segmentos, reglas por tipo, limpieza, URLs, inferencia).
- **Create** `python/tests/test_apa_format.py`, `python/tests/test_apa_model.py`, `python/tests/test_references_format_endpoint.py`.
- **Modify** `python/models.py` — `ApaSegment`, campos `tipo`/`apa_segments`, validador, `to_csl_json`.
- **Modify** `python/modules/addin_references_store.py` — wrapper + re-export `APA_ELLIPSIS`.
- **Modify** `python/modules/referencias_module.py` — `_armar_apa_desde_campos`, `format_apa_referencias_section` (runs por segmento), `fetch_*`.
- **Modify** `python/modules/doi_resolver.py`, `python/core_server.py`, `python/parsing/bibtex_ris_parser.py`, `python/spec_dsl.py` — productores de `formatted_apa`.
- **Modify** `python/parsing/references_extractor.py` — limpieza de artefactos al extraer.
- **Modify** `python/routers/references.py` — endpoint `POST /api/references/format`.
- **Create** `src/lib/apaLayout.ts`, `src/lib/apaApi.ts`, `src/components/referencias/ReferenciaLinea.tsx`.
- **Create** `src/components/referencias/__tests__/ReferenciaLinea.test.tsx`.
- **Modify** `src/types/index.ts`, `src/types/api-generated.d.ts`, `src/components/referencias/Step5ReferencesWizard.tsx`, `src/components/referencias/ReferenceForm.tsx`, `src/components/referencias/ReferenceEditModal.tsx`, `src/components/layout/PaperCanvas.tsx`, `src/components/layout/ReactPDFPreview.tsx`, `src/__tests__/referenciasEstaMontada.test.tsx`.

---

### Task 1: Contrato de modelo — `ApaSegment`, `tipo`, `apa_segments`

**Files:**
- Modify: `python/models.py` (clase `ReferenciaModel`, hoy `:740-805`)
- Modify: `src/types/index.ts:403-423`, `src/types/api-generated.d.ts:574-589`
- Test: `python/tests/test_apa_model.py` (nuevo)

**Interfaces:**
- Consumes: nada.
- Produces: `ApaSegment(text: str, italic: bool = False)`; `ReferenciaModel.tipo: str = "otro"`; `ReferenciaModel.apa_segments: list[ApaSegment]`; `to_csl_json()` mapea `tipo → CSL type`.

- [ ] **Step 1: Write the failing test**

```python
"""Contrato de ReferenciaModel para APA 7 (tipo + segmentos)."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from models import ApaSegment, ReferenciaModel


def test_apa_segment_defaults():
    s = ApaSegment(text="Hola")
    assert s.text == "Hola"
    assert s.italic is False


def test_referencia_defaults_tipo_otro_sin_segmentos():
    # Referencia totalmente vacía: ni el validador de Task 3 debe poblarla.
    r = ReferenciaModel(id="r1")
    assert r.tipo == "otro"
    assert r.apa_segments == []


def test_csl_type_mapea_libro():
    r = ReferenciaModel(id="r2", authors=["Hirano, H."], year="1995",
                        title="5 Pillars", tipo="libro")
    assert r.to_csl_json()["type"] == "book"


def test_csl_type_mapea_tesis():
    r = ReferenciaModel(id="r3", authors=["Taha, M."], year="2021",
                        title="Diseño", tipo="tesis")
    assert r.to_csl_json()["type"] == "thesis"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_apa_model.py -q --tb=short`
Expected: FAIL con `ImportError: cannot import name 'ApaSegment'`.

- [ ] **Step 3: Write minimal implementation**

En `python/models.py`, **antes** de `class ReferenciaModel`:

```python
class ApaSegment(BaseModel):
    """Un tramo de la línea de referencia con su tipografía.

    La cursiva es un hecho del dato, no del render: el backend decide qué va
    en cursiva (título de libro, nombre de revista) y cada superficie se limita
    a dibujar el segmento como venga.
    """
    text: str
    italic: bool = False
```

Asegurá que el import de Pydantic incluya `model_validator` (para Task 3):

```python
from pydantic import BaseModel, Field, model_validator
```

Dentro de `ReferenciaModel`, después de `fuente_verificacion` (hoy `:771`) y antes de `to_csl_json`:

```python
    # Tipo de fuente APA 7, y la línea ya segmentada. `formatted_apa` sigue
    # existiendo como texto plano derivado (copiar, LaTeX, panel del add-in).
    tipo: str = "otro"  # articulo | libro | capitulo | tesis | web | informe | otro
    apa_segments: list[ApaSegment] = Field(default_factory=list)
```

En `to_csl_json`, reemplazá la línea `"type": "article-journal",` por:

```python
            "type": _CSL_TYPE_BY_TIPO.get(self.tipo or "otro", "article-journal"),
```

y agregá el mapa a nivel de módulo, junto a `ReferenciaModel`:

```python
_CSL_TYPE_BY_TIPO = {
    "articulo": "article-journal",
    "libro": "book",
    "capitulo": "chapter",
    "tesis": "thesis",
    "web": "webpage",
    "informe": "report",
    "otro": "article-journal",  # compatibilidad con la salida anterior
}
```

En `src/types/index.ts:403-423` agregá dentro de `ReferenciaModel`:

```ts
  tipo?: 'articulo' | 'libro' | 'capitulo' | 'tesis' | 'web' | 'informe' | 'otro';
  apa_segments?: { text: string; italic: boolean }[];
```

En `src/types/api-generated.d.ts:574-589` agregá dentro de `ReferenciaModel`:

```ts
  tipo?: string | null
  apa_segments?: Array<ApaSegment>
```

y antes de esa interface:

```ts
export interface ApaSegment {
  text: string
  italic: boolean
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_apa_model.py -q --tb=short`
Expected: PASS (4 tests). Correr también `pytest python/tests/test_csl_json.py -q --tb=short` → PASS.

- [ ] **Step 5: Commit**

```bash
cmd /c "git add python/models.py python/tests/test_apa_model.py src/types/index.ts src/types/api-generated.d.ts"
cmd /c "git commit -m ""feat(apa): ApaSegment, tipo y apa_segments en ReferenciaModel"""
```

---

### Task 2: Formateador canónico `python/modules/apa_format.py`

**Files:**
- Create: `python/modules/apa_format.py`
- Test: `python/tests/test_apa_format.py` (nuevo)

**Interfaces:**
- Consumes: `models.ApaSegment` (import diferido dentro de `_seg`).
- Produces:
  - `APA_ELLIPSIS = "..."`
  - `formatear_autores(authors: list[str]) -> str`
  - `limpiar_artefactos(texto: str) -> str`
  - `recortar_siglas_corporativas(texto: str) -> str`
  - `inferir_tipo(ref) -> str`
  - `url_segura(doi_o_url: str | None, tipo: str) -> str`
  - `build_apa_segments(ref) -> list[ApaSegment]`
  - `format_apa_plain(ref) -> str`
  - `normalizar_referencia(ref) -> None`

- [ ] **Step 1: Write the failing test**

```python
"""Formateador canónico APA 7: segmentos, tipos, limpieza y URLs."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from modules.apa_format import (
    build_apa_segments,
    format_apa_plain,
    inferir_tipo,
    limpiar_artefactos,
    url_segura,
)


def _plain(segs):
    return "".join(s.text for s in segs)


def _ital(segs):
    return "".join(s.text for s in segs if s.italic)


def test_libro_sin_url_cursiva_y_sin_enlace():
    ref = {"authors": ["Hirano, H."], "year": "1995", "title": "5 Pillars of the Visual Workplace",
           "source": "Productivity Press", "doi_or_url": None, "tipo": "libro"}
    segs = build_apa_segments(ref)
    assert _ital(segs) == "5 Pillars of the Visual Workplace"
    assert format_apa_plain(ref) == "Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press."
    assert "http" not in format_apa_plain(ref)
    assert format_apa_plain(ref).endswith(".")


def test_libro_sin_autores_prefijo_anio():
    ref = {"authors": [], "year": "2020", "title": "Manual", "source": "Acme",
           "doi_or_url": None, "tipo": "libro"}
    assert format_apa_plain(ref) == "(2020). Manual. Acme."


def test_tesis_cursiva_etiqueta_e_https():
    ref = {"authors": ["Taha, M."], "year": "2021",
           "title": "Diseño de una planta", "source": "Universitat Politècnica de Catalunya",
           "doi_or_url": "http://upc.edu/tesis/123", "tipo": "tesis"}
    plain = format_apa_plain(ref)
    assert _ital(build_apa_segments(ref)) == "Diseño de una planta"
    assert "[Tesis" in plain and "Universitat Politècnica de Catalunya]" in plain
    assert "https://upc.edu/tesis/123" in plain and "http://" not in plain


def test_autor_corporativo_sin_siglas():
    ref = {"authors": ["Organización Internacional del Trabajo [OIT]"], "year": "2007",
           "title": "Convenio", "source": "OIT", "doi_or_url": None, "tipo": "informe"}
    plain = format_apa_plain(ref)
    assert plain.startswith("Organización Internacional del Trabajo")
    assert "[OIT]" not in plain


def test_articulo_cursiva_antes_de_la_primera_coma():
    ref = {"authors": ["García, A."], "year": "2023", "title": "Estudio",
           "source": "Revista Científica, 45(2), 123-145",
           "doi_or_url": "10.1016/j.edu.2023.01", "tipo": "articulo"}
    segs = build_apa_segments(ref)
    assert _ital(segs) == "Revista Científica"
    assert format_apa_plain(ref) == (
        "García, A. (2023). Estudio. Revista Científica, 45(2), 123-145. "
        "https://doi.org/10.1016/j.edu.2023.01"
    )


def test_web_cursiva_titulo():
    ref = {"authors": ["Pérez, J."], "year": "2021", "title": "Avances en tecnología",
           "source": "TechDaily", "doi_or_url": "https://techdaily.com/art1", "tipo": "web"}
    assert _ital(build_apa_segments(ref)) == "Avances en tecnología"
    assert format_apa_plain(ref) == (
        "Pérez, J. (2021). Avances en tecnología. TechDaily. https://techdaily.com/art1"
    )


def test_limpieza_vancouver():
    sucio = "Available from: https://x.com [accessed 26 Jun 2025]"
    limpio = limpiar_artefactos(sucio)
    assert "Available" not in limpio and "accessed" not in limpio


def test_url_segura_variantes():
    assert url_segura("http://a.com/x", "web") == "https://a.com/x"
    assert url_segura("www.a.com/x", "web") == "https://www.a.com/x"
    assert url_segura("10.1/x", "articulo") == "https://doi.org/10.1/x"
    assert url_segura("doi:10.1/x", "articulo") == "https://doi.org/10.1/x"
    assert url_segura(None, "libro") == ""


def test_inferir_tipo():
    assert inferir_tipo({"title": "Tesis de grado", "source": "", "raw_text": "", "doi_or_url": None}) == "tesis"
    assert inferir_tipo({"title": "X", "source": "Revista, 45(2), 1-2", "raw_text": "", "doi_or_url": None}) == "articulo"
    assert inferir_tipo({"title": "X", "source": "(12th ed.) McGraw", "raw_text": "", "doi_or_url": None}) == "libro"
    assert inferir_tipo({"title": "X", "source": "", "raw_text": "", "doi_or_url": "10.1234/x"}) == "articulo"
    assert inferir_tipo({"title": "X", "source": "McGraw-Hill", "raw_text": "", "doi_or_url": None}) == "libro"
    assert inferir_tipo({"title": "X", "source": "", "raw_text": "", "doi_or_url": "https://a.com"}) == "web"


def test_otro_replica_salida_plana():
    ref = {"authors": ["A, B."], "year": "2000", "title": "T", "source": "S",
           "doi_or_url": "https://x.com", "tipo": "otro"}
    assert format_apa_plain(ref) == "A, B. (2000). T. S. https://x.com"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_apa_format.py -q --tb=short`
Expected: FAIL con `ModuleNotFoundError: No module named 'modules.apa_format'`.

- [ ] **Step 3: Write minimal implementation**

Creá `python/modules/apa_format.py`:

```python
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
_AVAILABLE_RE = re.compile(r"\bavailable\s*(?:from|at|:)\s*", re.IGNORECASE)
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


def limpiar_artefactos(texto: str) -> str:
    """Elimina artefactos de exportación automática en cualquier posición."""
    if not texto:
        return ""
    t = _ACCESSED_RE.sub(" ", texto)
    t = _AVAILABLE_RE.sub(" ", t)
    t = _RETRIEVAL_RE.sub(" ", t)
    t = re.sub(r"\s+", " ", t).strip(" .,;:")
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

    # Sin campos: usar (limpiado) el texto crudo si existe.
    if not authors and not title and not source and not (d.get("doi_or_url") or ""):
        return [_seg(limpiar_artefactos(raw))] if raw else []

    author_str = formatear_autores(authors)
    prefix = f"{author_str} ({year}). " if author_str else f"({year}). "
    segs: List[Any] = [_seg(prefix)]
    url = url_segura(d.get("doi_or_url"), tipo)

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
            segs.append(_seg(f"{title}. " if source else f"{title}."))
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_apa_format.py -q --tb=short`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
cmd /c "git add python/modules/apa_format.py python/tests/test_apa_format.py"
cmd /c "git commit -m ""feat(apa): formateador canonico por segmentos con tipos y limpieza"""
```

---

### Task 3: Migración automática en el validador

**Files:**
- Modify: `python/models.py` (clase `ReferenciaModel`)
- Test: `python/tests/test_apa_model.py` (ampliar)

**Interfaces:**
- Consumes: `modules.apa_format.normalizar_referencia`.
- Produces: `ReferenciaModel` con `tipo`/`apa_segments`/`formatted_apa` autocompletados al construir.

- [ ] **Step 1: Write the failing test**

Agregá al final de `python/tests/test_apa_model.py`:

```python
def test_validador_migra_dato_viejo():
    r = ReferenciaModel(id="r4", authors=["Hirano, H."], year="1995",
                        title="5 Pillars", source="Productivity Press")
    assert r.tipo == "libro"
    assert len(r.apa_segments) >= 2
    assert r.formatted_apa == "Hirano, H. (1995). 5 Pillars. Productivity Press."


def test_validador_no_pisa_formatted_apa_existente():
    r = ReferenciaModel(id="r5", authors=["A, B."], year="2000", title="T",
                        formatted_apa="TEXTO PREVIO DEL USUARIO")
    assert r.formatted_apa == "TEXTO PREVIO DEL USUARIO"


def test_validador_no_rompe_referencia_vacia():
    r = ReferenciaModel(id="r6")
    assert r.apa_segments == []
    assert (r.formatted_apa or "") == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_apa_model.py -q --tb=short`
Expected: FAIL en `test_validador_migra_dato_viejo` (`r.tipo == "otro"`).

- [ ] **Step 3: Write minimal implementation**

Dentro de `ReferenciaModel`, después de `to_csl_json`:

```python
    @model_validator(mode="after")
    def _normalizar_apa(self) -> "ReferenciaModel":
        # Import diferido: evita cargar el formateador (y potenciales ciclos)
        # durante el arranque de Pydantic. Nunca pisa un `apa_segments` ya
        # presente ni un `formatted_apa` ya presente.
        from modules.apa_format import normalizar_referencia
        normalizar_referencia(self)
        return self
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_apa_model.py python/tests/test_csl_json.py -q --tb=short`
Expected: PASS (7 + 4 tests).

- [ ] **Step 5: Commit**

```bash
cmd /c "git add python/models.py python/tests/test_apa_model.py"
cmd /c "git commit -m ""feat(apa): validador migra referencias viejas a segmentos"""
```

---

### Task 4: Rewire `addin_references_store` al formateador canónico

**Files:**
- Modify: `python/modules/addin_references_store.py:257-327` (y `:36-40`)
- Test: existentes `python/tests/test_web_references_parsing.py`, `python/tests/test_doi_resolver.py`

**Interfaces:**
- Consumes: `apa_format.formatear_autores`, `apa_format.format_apa_plain`, `apa_format.APA_ELLIPSIS`.
- Produces: `APA_ELLIPSIS` re-exportado; `_format_authors_apa` delega; `_format_apa_reference` = wrapper de `format_apa_plain`.

- [ ] **Step 1: Write the failing test**

Agregá a `python/tests/test_web_references_parsing.py`:

```python
def test_apa_ellipsis_se_reexporta():
    from modules.addin_references_store import APA_ELLIPSIS
    from modules.apa_format import APA_ELLIPSIS as CANON
    assert APA_ELLIPSIS == CANON == "..."


def test_format_apa_reference_limpia_vancouver():
    ref = {
        "authors": ["Pérez, J."],
        "year": "2021",
        "title": "Avances en robótica. Available from: https://x.com [accessed 26 Jun 2025]",
        "source": "",
        "doi_or_url": "https://x.com",
    }
    out = _format_apa_reference(ref)
    assert "Available" not in out and "accessed" not in out
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_web_references_parsing.py -q --tb=short`
Expected: FAIL (o `asa_ellipsis` mismatch si aún no se movió) — al menos el test de limpieza debe fallar porque el `_format_apa_reference` actual no limpia.

- [ ] **Step 3: Write minimal implementation**

En `python/modules/addin_references_store.py`, reemplazá el bloque `APA_ELLIPSIS = "..."` (hoy `:36-40`) por un re-export:

```python
# La elipsis de APA 7 vive ahora en el formateador canónico; se re-exporta
# para no romper a los consumidores históricos (doi_resolver, tests).
from modules.apa_format import APA_ELLIPSIS  # noqa: F401
_REFS_FILE = _REFS_DIR / "addin_references.json"
```

Conservá `_AUTHORS_RE_LAST_FIRST` (si no se usa, dejala; no es parte del cambio).

Reemplazá el cuerpo de `_format_authors_apa` (hoy `:257-286`) por una delegación:

```python
def _format_authors_apa(authors: List[str]) -> str:
    """Delega en el formateador canónico (una sola regla de autores en el proyecto)."""
    from modules.apa_format import formatear_autores
    return formatear_autores(authors)
```

Reemplazá el cuerpo de `_format_apa_reference` (hoy `:289-327`) por:

```python
def _format_apa_reference(ref: Dict[str, Any]) -> str:
    """Wrapper del formateador canónico: devuelve la línea como texto plano."""
    from modules.apa_format import format_apa_plain
    return format_apa_plain(ref)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_web_references_parsing.py python/tests/test_doi_resolver.py -q --tb=short`
Expected: PASS. Si `test_format_apa_reference_with_web_url` falla por el orden de las URLs, revisá `url_segura` (debe conservar https y www→https).

- [ ] **Step 5: Commit**

```bash
cmd /c "git add python/modules/addin_references_store.py python/tests/test_web_references_parsing.py"
cmd /c "git commit -m ""refactor(apa): store delega en el formateador canonico"""
```

---

### Task 5: Rewire `referencias_module` (campos, DOCX por runs, fetch_*)

**Files:**
- Modify: `python/modules/referencias_module.py:98-261,290-428,539-663`
- Test: `python/tests/test_referencias_docx_runs.py` (nuevo) + `python/tests/test_referencias_section_collision.py`, `python/tests/test_audit_fixes_f01_f10.py`

**Interfaces:**
- Consumes: `apa_format.build_apa_segments`, `apa_format.format_apa_plain`, `apa_format.limpiar_artefactos`, `apa_format.recortar_siglas_corporativas`.
- Produces: `_armar_apa_desde_campos` devuelve plano; `format_apa_referencias_section` escribe un run por segmento con `run.italic`.

- [ ] **Step 1: Write the failing test**

Creá `python/tests/test_referencias_docx_runs.py`:

```python
"""La sección de Referencias del DOCX escribe un run por segmento (cursiva)."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import docx

from models import APARuleSet, ReferenciaModel
from modules.referencias_module import format_apa_referencias_section


def _runs_of_reference(doc):
    for p in doc.paragraphs:
        if p.text.startswith("Hirano"):
            return p.runs
    return []


def test_docx_escribe_run_cursivo():
    ref = ReferenciaModel(
        id="r1", authors=["Hirano, H."], year="1995",
        title="5 Pillars of the Visual Workplace", source="Productivity Press",
        tipo="libro",
    )
    doc = docx.Document()
    format_apa_referencias_section(doc, [ref], APARuleSet())
    runs = _runs_of_reference(doc)
    assert any(r.italic and "5 Pillars" in r.text for r in runs)
    assert any((not r.italic) and "Productivity Press" in r.text for r in runs)
    assert "[OIT]" not in "".join(r.text for r in runs)


def test_docx_corporativo_sin_siglas():
    ref = ReferenciaModel(
        id="r2", authors=["Instituto Nicaragüense de Energía [INE]"], year="2026",
        title="Informe", source="INE", tipo="informe",
    )
    doc = docx.Document()
    format_apa_referencias_section(doc, [ref], APARuleSet())
    texto = "\n".join(p.text for p in doc.paragraphs)
    assert "Instituto Nicaragüense de Energía" in texto
    assert "[INE]" not in texto
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_referencias_docx_runs.py -q --tb=short`
Expected: FAIL en `test_docx_escribe_run_cursivo` (un solo run, sin italic).

- [ ] **Step 3: Write minimal implementation**

Reemplazá `_armar_apa_desde_campos` (hoy `:539-563`) por:

```python
def _armar_apa_desde_campos(ref: ReferenciaModel) -> str:
    """Construye la línea APA (texto plano) desde los campos de la referencia."""
    from modules.apa_format import format_apa_plain
    if not (ref.authors or ref.title.strip() or ref.source.strip()
            or (ref.doi_or_url or "").strip()):
        return ""
    return format_apa_plain(ref)
```

En `format_apa_referencias_section`, reemplazá el bloque de selección de texto y el run único (hoy `:643-663`) por segmentos:

```python
        # Segmentos: los del modelo, o reconstruidos desde los campos/texto.
        segs = list(ref.apa_segments) if ref.apa_segments else []
        if not segs:
            from modules.apa_format import build_apa_segments, recortar_siglas_corporativas
            segs = build_apa_segments(ref)
        if not segs:
            continue
        # Seguridad F-06: nunca dejar `[SIGLAS]` en la lista final.
        from modules.apa_format import recortar_siglas_corporativas
        segs[0].text = recortar_siglas_corporativas(segs[0].text)
        texto = "".join(s.text for s in segs)
        texto = _strip_ref_prefix(texto)
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
```

Retirá el hack `text = re.sub(r'^([A-ZÁÉÍÓÚÑ]...)', ...)` (hoy `:656-658`): su función vive ahora en `recortar_siglas_corporativas`.

En cada `fetch_*`, reemplazá la composición manual de `formatted_apa`/`formatted` por el formateador. Ejemplo para `fetch_crossref_metadata` (hoy `:125-146`): eliminá el acumulador `formatted = ...` y, antes de `results.append`, agregá:

```python
                from modules.apa_format import build_apa_segments
                _seg_ref = {
                    "authors": authors, "year": year_str, "title": title,
                    "source": container_title, "doi_or_url": doi,
                    "raw_text": "", "tipo": "articulo",
                }
```

y en el dict que se agrega, cambiá `"formatted_apa": formatted,` por:

```python
                    "formatted_apa": "".join(s.text for s in build_apa_segments(_seg_ref)),
                    "apa_segments": [s.model_dump() for s in build_apa_segments(_seg_ref)],
```

Aplicá la misma sustitución en `fetch_openalex_metadata` (`:193-206`), `fetch_semantic_scholar_metadata` (`:245-258`), `search_crossref_by_author_year` (`:358-385`) y `fetch_openlibrary_metadata` (`:411-425`, que hoy devuelve clave `"formatted"`; agregá también `"formatted_apa"` con el mismo valor). Para `search_crossref_by_author_year` el `tipo` del segmento es `"articulo"`; para openlibrary, `"libro"` con `source=publisher`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_referencias_docx_runs.py python/tests/test_referencias_section_collision.py python/tests/test_audit_fixes_f01_f10.py -q --tb=short`
Expected: PASS. Si F-06 falla, verificá que `recortar_siglas_corporativas` se aplique al primer segmento.

- [ ] **Step 5: Commit**

```bash
cmd /c "git add python/modules/referencias_module.py python/tests/test_referencias_docx_runs.py"
cmd /c "git commit -m ""feat(apa): DOCX por segmentos y fetch_* via formateador canonico"""
```

---

### Task 6: Rewire productores restantes (core_server, bibtex/RIS, spec_dsl, doi_resolver)

**Files:**
- Modify: `python/core_server.py:195`, `python/parsing/bibtex_ris_parser.py:39-52,106-119,137-138`, `python/spec_dsl.py:296-312`, `python/modules/doi_resolver.py:120,275`
- Test: `python/tests/test_apa_format.py` (ampliar) + existentes

**Interfaces:**
- Consumes: `apa_format.format_apa_plain`, `apa_format.build_apa_segments`.
- Produces: cada productor devuelve `formatted_apa` derivado del canónico.

- [ ] **Step 1: Write the failing test**

Agregá a `python/tests/test_apa_format.py`:

```python
def test_dos_productores_no_divergen():
    """crossref_to_reference y el store deben producir el mismo plano."""
    from modules.apa_format import format_apa_plain
    ref = {"authors": ["Perez, A."], "year": "2024", "title": "Desercion",
           "source": "Revista de Educacion Superior", "doi_or_url": "10.1016/x.1",
           "tipo": "articulo"}
    assert format_apa_plain(ref) == (
        "Perez, A. (2024). Desercion. Revista de Educacion Superior. https://doi.org/10.1016/x.1"
    )
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_apa_format.py::test_dos_productores_no_divergen -q --tb=short`
Expected: PASS si apa_format ya existe — es un test de contrato que viaja con el cambio (si ya pasa, el paso es la migración de los productores).

- [ ] **Step 3: Write minimal implementation**

`python/modules/doi_resolver.py` — reemplazá las dos líneas `ref["formatted_apa"] = _format_apa_reference(ref)` (`:120` y `:275`) por:

```python
    from modules.apa_format import format_apa_plain
    ref["formatted_apa"] = format_apa_plain(ref)
```

(quitá el import local de `_format_apa_reference` en `crossref_to_reference`, `:92`, y el de `APA_ELLIPSIS` sigue viniendo del store, que lo re-exporta).

`python/core_server.py:195` — reemplazá:

```python
            apa = f"{', '.join(a for a in auths if a)} ({year}). {title}. {src}."
```

por:

```python
            from modules.apa_format import format_apa_plain
            apa = format_apa_plain({
                "authors": auths, "year": year, "title": title,
                "source": src, "doi_or_url": doi, "raw_text": "",
            })
```

`python/parsing/bibtex_ris_parser.py` — en BibTeX (`:39-52`), reemplazá el bloque `author_str = ...; formatted = ...` y la normalización de DOI por:

```python
                from modules.apa_format import format_apa_plain
                formatted = format_apa_plain({
                    "authors": authors, "year": str(year) if year else None,
                    "title": title, "source": source, "doi_or_url": doi, "raw_text": "",
                })
```

En RIS (`:106-109`) ídem con las variables de ese bloque. En el fallback RIS (`:137-138`), reemplazá `raw = ...` por:

```python
            from modules.apa_format import format_apa_plain
            raw = format_apa_plain({
                "authors": authors, "year": year, "title": title,
                "source": "", "doi_or_url": None, "raw_text": "",
            })
```

`python/spec_dsl.py:296-312` — cuando `item.apa` venga definido, además de `raw_text=apa`, poblá los segmentos:

```python
                from modules.apa_format import build_apa_segments
                _segs = build_apa_segments({"raw_text": apa, "tipo": "otro"})
                references.append(ReferenciaModel(
                    id=f"spec-ref-{i}-{j}", raw_text=apa, formatted_apa=apa,
                    doi_or_url=item.doi, apa_segments=_segs))
```

(la rama `resolve_doi` sigue igual: `resolve_doi` ya devuelve el plano canónico).

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_apa_format.py python/tests/test_doi_resolver.py python/tests/test_csl_json.py -q --tb=short`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cmd /c "git add python/core_server.py python/parsing/bibtex_ris_parser.py python/spec_dsl.py python/modules/doi_resolver.py python/tests/test_apa_format.py"
cmd /c "git commit -m ""refactor(apa): unificar productores de formatted_apa"""
```

---

### Task 7: Limpieza de artefactos al extraer (`references_extractor`)

**Files:**
- Modify: `python/parsing/references_extractor.py:68-71,129-208`
- Test: `python/tests/test_web_references_parsing.py` (ampliar)

**Interfaces:**
- Consumes: nada nuevo (regex propias).
- Produces: `_parse_single_reference` devuelve `title`/`source` sin `Available from:` ni `[accessed …]`.

- [ ] **Step 1: Write the failing test**

Agregá a `python/tests/test_web_references_parsing.py`:

```python
def test_parse_limpia_available_from_y_accessed_midstring():
    raw = ("ResearchGate. Available from: https://researchgate.net/figure/123 "
           "[accessed 26 Jun 2025]")
    parsed = _parse_single_reference(raw)
    joined = " ".join([parsed.get("title", ""), parsed.get("source", "")])
    assert "Available" not in joined
    assert "[accessed" not in joined and "accessed" not in joined
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_web_references_parsing.py::test_parse_limpia_available_from_y_accessed_midstring -q --tb=short`
Expected: FAIL (`Available`/`accessed` presentes).

- [ ] **Step 3: Write minimal implementation**

En `python/parsing/references_extractor.py`, agregá junto a `_RETRIEVAL_PREFIX` (`:68-71`):

```python
_ACCESSED_BRACKET = re.compile(
    r"[\[(]\s*(?:accessed|consultado|recuperado)(?:\s+[^\])]*)?[\])]", re.IGNORECASE
)
_AVAILABLE_PREFIX = re.compile(
    r"\bavailable\s*(?:from|at|:)\s*", re.IGNORECASE
)
```

En `_parse_single_reference`, junto a la limpieza `_RETRIEVAL_PREFIX` (hoy `:196-199`), agregá antes una pasada global a `text_sin_url` y a cada campo resultante:

```python
    # Limpieza de artefactos de exportación automática en cualquier posición.
    title = _ACCESSED_BRACKET.sub(" ", title)
    source = _ACCESSED_BRACKET.sub(" ", source)
    title = _AVAILABLE_PREFIX.sub(" ", title)
    source = _AVAILABLE_PREFIX.sub(" ", source)
    title = re.sub(r"\s+", " ", title).strip(" .,;:")
    source = re.sub(r"\s+", " ", source).strip(" .,;:")
```

(ubicá estas líneas justo antes del `return` del dict de la referencia, cuando `title` y `source` ya están calculados).

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_web_references_parsing.py -q --tb=short`
Expected: PASS (incluidos los tests previos de `Recuperado el …`).

- [ ] **Step 5: Commit**

```bash
cmd /c "git add python/parsing/references_extractor.py python/tests/test_web_references_parsing.py"
cmd /c "git commit -m ""feat(apa): limpiar Available from/accessed al extraer"""
```

---

### Task 8: Endpoint `POST /api/references/format`

**Files:**
- Modify: `python/routers/references.py`
- Test: `python/tests/test_references_format_endpoint.py` (nuevo)

**Interfaces:**
- Consumes: `models.ReferenciaModel`, `apa_format.build_apa_segments`.
- Produces: `POST /api/references/format` → `{formatted_apa, apa_segments, tipo}`.

- [ ] **Step 1: Write the failing test**

```python
"""El endpoint de reformateo devuelve segmentos y tipo inferido."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from main import app

client = TestClient(app)


def test_format_libro_sin_url():
    r = client.post("/api/references/format", json={
        "authors": ["Hirano, H."], "year": "1995",
        "title": "5 Pillars of the Visual Workplace",
        "source": "Productivity Press",
    })
    assert r.status_code == 200
    data = r.json()
    assert data["tipo"] == "libro"
    assert data["formatted_apa"] == (
        "Hirano, H. (1995). 5 Pillars of the Visual Workplace. Productivity Press."
    )
    assert any(s["italic"] and "5 Pillars" in s["text"] for s in data["apa_segments"])


def test_format_infiere_tipo_si_viene_otro():
    r = client.post("/api/references/format", json={
        "authors": ["Taha, M."], "year": "2021", "title": "Tesis de grado en diseño",
        "source": "Upc.edu", "doi_or_url": "http://upc.edu/t/1",
    })
    assert r.json()["tipo"] == "tesis"
    assert "https://upc.edu/t/1" in r.json()["formatted_apa"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest python/tests/test_references_format_endpoint.py -q --tb=short`
Expected: FAIL con `404` (ruta inexistente).

- [ ] **Step 3: Write minimal implementation**

Al final de `python/routers/references.py`:

```python
class FormatReferenceRequest(BaseModel):
    authors: List[str] = []
    year: Optional[str] = None
    title: str = ""
    source: str = ""
    doi_or_url: Optional[str] = None
    raw_text: str = ""
    tipo: Optional[str] = None


@router.post("/api/references/format")
async def format_reference(req: FormatReferenceRequest) -> Dict[str, Any]:
    """Devuelve la línea APA 7 segmentada. El backend es el único autor.

    Lo consumen los formularios manuales (agregar/editar referencia) para dejar
    de componer APA en TypeScript: lo que la persona ve es lo que el documento
    recibe, con la misma cursiva y la misma limpieza.
    """
    from models import ReferenciaModel
    from modules.apa_format import build_apa_segments, inferir_tipo

    ref = ReferenciaModel(
        id="format", authors=req.authors, year=req.year, title=req.title,
        source=req.source, doi_or_url=req.doi_or_url, raw_text=req.raw_text,
        tipo=req.tipo or "otro",
    )
    segs = build_apa_segments(ref)
    return {
        "formatted_apa": "".join(s.text for s in segs).strip(),
        "apa_segments": [s.model_dump() for s in segs],
        "tipo": inferir_tipo(ref),
    }
```

Agregá `Optional` al import de `typing` (hoy `from typing import Any, Dict, List`):

```python
from typing import Any, Dict, List, Optional
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest python/tests/test_references_format_endpoint.py -q --tb=short`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
cmd /c "git add python/routers/references.py python/tests/test_references_format_endpoint.py"
cmd /c "git commit -m ""feat(apa): endpoint POST /api/references/format"""
```

---

### Task 9: Layout compartido y componente `ReferenciaLinea`

**Files:**
- Create: `src/lib/apaLayout.ts`, `src/components/referencias/ReferenciaLinea.tsx`
- Test: `src/components/referencias/__tests__/ReferenciaLinea.test.tsx` (nuevo)
- Modify: `src/__tests__/referenciasEstaMontada.test.tsx:54-71`

**Interfaces:**
- Consumes: `ReferenciaModel` de `src/types`.
- Produces: `APA_LISTA`, `APA_ENTRADA` (de `apaLayout.ts`); `ReferenciaLinea({ref, as?})`.

- [ ] **Step 1: Write the failing test**

Creá `src/components/referencias/__tests__/ReferenciaLinea.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ReferenciaLinea } from '../ReferenciaLinea';
import type { ReferenciaModel } from '../../../types';

const base: ReferenciaModel = { id: 'r1', authors: ['Hirano, H.'], title: 'X', source: 'Y', raw_text: '' };

describe('ReferenciaLinea', () => {
  it('dibuja cursiva por segmento', () => {
    const ref: ReferenciaModel = {
      ...base,
      apa_segments: [
        { text: 'Hirano, H. (1995). ', italic: false },
        { text: '5 Pillars', italic: true },
        { text: '. Productivity Press.', italic: false },
      ],
    };
    const { container } = render(<ReferenciaLinea ref={ref} />);
    const em = container.querySelector('span[style*="italic"]');
    expect(em?.textContent).toBe('5 Pillars');
  });

  it('cae a formatted_apa sin segmentos', () => {
    const ref: ReferenciaModel = { ...base, formatted_apa: 'TEXTO PLANO' };
    const { container } = render(<ReferenciaLinea ref={ref} />);
    expect(container.textContent).toContain('TEXTO PLANO');
  });

  it('sin emojis', () => {
    const ref: ReferenciaModel = { ...base, formatted_apa: 'A (2020). B.' };
    const { container } = render(<ReferenciaLinea ref={ref} />);
    expect(container.textContent).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
});
```

Modificá `src/__tests__/referenciasEstaMontada.test.tsx:62-70`:

```ts
    expect(NOMBRES).toHaveLength(7);
    expect(NOMBRES.sort()).toEqual([
      'ManuscriptMentionsAccordion',
      'ReferenceCatalogItem',
      'ReferenceEditModal',
      'ReferenceForm',
      'ReferenceRailFilter',
      'ReferenciaLinea',
      'Step5ReferencesWizard'
    ]);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=dot -t "ReferenciaLinea"`
Expected: FAIL (`Cannot find module '../ReferenciaLinea'`).

- [ ] **Step 3: Write minimal implementation**

Creá `src/lib/apaLayout.ts`:

```ts
import type React from 'react';

/** Bloque del listado de referencias: papel, doble espacio, alineado a la izquierda. */
export const APA_LISTA: React.CSSProperties = {
  fontFamily: "'Times New Roman', Times, serif",
  fontSize: '12pt',
  lineHeight: 2,
  textAlign: 'left',
  wordBreak: 'break-word',
  whiteSpace: 'normal',
};

/** Una entrada: sangría francesa 1.27 cm. Nunca se centra ni se justifica. */
export const APA_ENTRADA: React.CSSProperties = {
  margin: 0,
  paddingLeft: '0.5in',
  textIndent: '-0.5in',
};
```

Creá `src/components/referencias/ReferenciaLinea.tsx`:

```tsx
import React from 'react';
import type { ReferenciaModel } from '../../types';
import { APA_ENTRADA } from '../../lib/apaLayout';

/** Dibuja la línea APA desde los segmentos del backend; sin recomponer nada. */
export interface ReferenciaLineaProps extends React.HTMLAttributes<HTMLElement> {
  ref: ReferenciaModel;
  as?: 'p' | 'div';
}

export const ReferenciaLinea: React.FC<ReferenciaLineaProps> = ({
  ref,
  as = 'p',
  style,
  ...rest
}) => {
  const Tag = as;
  const segments = ref.apa_segments && ref.apa_segments.length ? ref.apa_segments : null;
  const plano = (ref.formatted_apa || ref.raw_text || '').trim();
  return (
    <Tag style={{ ...APA_ENTRADA, ...style }} {...rest}>
      {segments
        ? segments.map((s, i) => (
            <span key={i} style={s.italic ? { fontStyle: 'italic' } : undefined}>
              {s.text}
            </span>
          ))
        : <span>{plano}</span>}
    </Tag>
  );
};

export default ReferenciaLinea;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter=dot -t "ReferenciaLinea"` y luego el archivo de montado:
`npm test -- --reporter=dot -t "está montada"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cmd /c "git add src/lib/apaLayout.ts src/components/referencias/ReferenciaLinea.tsx src/components/referencias/__tests__/ReferenciaLinea.test.tsx src/__tests__/referenciasEstaMontada.test.tsx"
cmd /c "git commit -m ""feat(apa): layout compartido y componente ReferenciaLinea"""
```

---

### Task 10: Unificar las superficies de render

**Files:**
- Modify: `src/components/referencias/Step5ReferencesWizard.tsx` (render + estilos), `src/components/layout/PaperCanvas.tsx:2030-2046`, `src/components/layout/ReactPDFPreview.tsx:271-278`
- Test: `src/__tests__/referenciasPaso4.test.tsx` (existente) + `src/__tests__/referenciasEstaMontada.test.tsx`

**Interfaces:**
- Consumes: `ReferenciaLinea`, `APA_LISTA`/`APA_ENTRADA`.
- Produces: las cuatro superficies usan la misma línea; el canvas elimina la composición en render.

- [ ] **Step 1: Write the failing test**

En `src/__tests__/referenciasPaso4.test.tsx`, agregá una aserción de sangría francesa en la vista previa:

```tsx
  it('la vista previa aplica sangría francesa y doble espacio', () => {
    // setUp ya renderiza y selecciona una referencia con formatted_apa.
    const el = screen.getByTestId('vista-previa-apa');
    expect(el.style.textIndent).toBe('-0.5in');
    expect(el.style.paddingLeft).toBe('0.5in');
  });
```

(insertá el bloque dentro del `describe` existente, reutilizando el setup de render de ese archivo).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=dot -t "sangría francesa"`
Expected: FAIL si el contenedor perdió los estilos al mover a `ReferenciaLinea` (o PASS si ya coinciden; ajustar el componente hasta que el test pase).

- [ ] **Step 3: Write minimal implementation**

En `src/components/referencias/Step5ReferencesWizard.tsx`:
- Reemplazá el import de tipos locales por:

```tsx
import { ReferenciaLinea } from './ReferenciaLinea';
import { APA_LISTA } from '../../lib/apaLayout';
```

- Borrá las constantes locales `APA_LISTA`/`APA_ENTRADA` (`:1028-1041`) y todos sus usos.
- En la bibliografía completa (`:709-721`), reemplazá cada `<p style={{ ...APA_ENTRADA }}>…</p>` por:

```tsx
                      <ReferenciaLinea key={refItem.id} ref={refItem} />
```

- En la vista previa (`:804-815`), reemplazá `<div data-testid="vista-previa-apa" style={{ ...APA_LISTA, ...APA_ENTRADA }}>…</div>` por:

```tsx
                <div style={{ ...APA_LISTA }}>
                  {selectedRef && (selectedRef.formatted_apa || selectedRef.raw_text)
                    ? <ReferenciaLinea ref={selectedRef} as="div" data-testid="vista-previa-apa" />
                    : (
                      <div data-testid="vista-previa-apa" style={{ ...APA_ENTRADA }}>
                        <em style={{ color: 'var(--paper-ink)', opacity: 0.55, fontStyle: 'normal' }}>
                          Esta referencia no tiene texto para escribir en el documento.
                        </em>
                      </div>
                    )}
                </div>
```

(para el bloque de estado vacío conservá el mensaje actual; para el caso con datos, `ReferenciaLinea` ya envuelve en `APA_ENTRADA`).

En `src/components/layout/PaperCanvas.tsx`, reemplazá el `<p>` de `:2033-2043` por:

```tsx
                                          <ReferenciaLinea key={ref.id || ri} ref={ref} />
```

y agregá el import:

```tsx
import { ReferenciaLinea } from '../referencias/ReferenciaLinea';
```

En `src/components/layout/ReactPDFPreview.tsx`, reemplazá `:275-277` por:

```tsx
          {debouncedDoc.referencias.map((ref: any) => (
            <Text key={ref.id} style={styles.referenceItem}>
              {(ref.apa_segments && ref.apa_segments.length ? ref.apa_segments : null)
                ? ref.apa_segments.map((s: any, i: number) => (
                    <Text key={i} style={s.italic ? { fontStyle: 'italic' } : undefined}>{s.text}</Text>
                  ))
                : (ref.formatted_apa || ref.raw_text || '')}
            </Text>
          ))}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter=dot`
Expected: PASS (suite completa de frontend). Los tests de `PaperCanvas`/`ReactPDFPreview` que verifican sangría siguen verdes.

- [ ] **Step 5: Commit**

```bash
cmd /c "git add src/components/referencias/Step5ReferencesWizard.tsx src/components/layout/PaperCanvas.tsx src/components/layout/ReactPDFPreview.tsx src/__tests__/referenciasPaso4.test.tsx"
cmd /c "git commit -m ""feat(apa): unificar vista previa, canvas y PDF con ReferenciaLinea"""
```

---

### Task 11: Formularios manuales vía endpoint + selector de tipo

**Files:**
- Create: `src/lib/apaApi.ts`
- Modify: `src/components/referencias/Step5ReferencesWizard.tsx:245-302,963-980`, `src/components/referencias/ReferenceForm.tsx:39-56`, `src/components/referencias/ReferenceEditModal.tsx`, `src/components/referencias/__tests__/ReferenceEditModal.test.tsx`
- Test: `src/components/referencias/__tests__/ReferenceEditModal.test.tsx` (existente, ampliar)

**Interfaces:**
- Consumes: `POST /api/references/format`, `getApiBase`.
- Produces: `formatearReferencia(fields) -> Promise<ApaFormato | null>`; `ReferenceEditModal.onSave` incluye `tipo`.

- [ ] **Step 1: Write the failing test**

Agregá a `src/components/referencias/__tests__/ReferenceEditModal.test.tsx`:

```tsx
  it('guarda el tipo elegido', () => {
    const onSave = vi.fn();
    render(<ReferenceEditModal reference={ref} isOpen onClose={() => {}} onSave={onSave} />);
    fireEvent.change(screen.getByTestId('modal-edit-tipo'), { target: { value: 'libro' } });
    fireEvent.click(screen.getByText('Guardar Cambios'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'libro' }));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --reporter=dot -t "guarda el tipo"`
Expected: FAIL (`modal-edit-tipo` no existe).

- [ ] **Step 3: Write minimal implementation**

Creá `src/lib/apaApi.ts`:

```ts
import { getApiBase } from '../api/http';
import type { ReferenciaModel } from '../types';

export interface ApaFormato {
  formatted_apa: string;
  apa_segments: { text: string; italic: boolean }[];
  tipo: string;
}

/** Pide al backend la línea APA 7 segmentada. Devuelve null si no hay backend. */
export async function formatearReferencia(
  fields: Partial<Pick<ReferenciaModel, 'authors' | 'year' | 'title' | 'source' | 'doi_or_url' | 'raw_text' | 'tipo'>>,
): Promise<ApaFormato | null> {
  try {
    const res = await fetch(`${getApiBase()}/references/format`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    });
    if (!res.ok) return null;
    return (await res.json()) as ApaFormato;
  } catch {
    return null;
  }
}
```

En `ReferenceEditModal.tsx`: agregá estado `tipo` inicializado desde `reference?.tipo || 'otro'`, actualizalo en el `useEffect` de `initial`, incluí `tipo` en el objeto que pasa `handleSubmit` a `onSave`, y agregá el `<select data-testid="modal-edit-tipo">` con las siete opciones (`articulo, libro, capitulo, tesis, web, informe, otro`) y etiquetas en español.

En `Step5ReferencesWizard.handleAddManual` y `handleSaveModalRef`: hacé los handlers `async`, y antes de construir `newRef`/`updated`, agregá:

```tsx
    const formato = await formatearReferencia({
      authors: authorsArr, year: yr, title, source, doi_or_url: doi || undefined,
      tipo: tipoSeleccionado,
    });
    const formatted = formato?.formatted_apa ?? `${authorsArr.join(', ')} (${yr}). ${title}.${source ? ' ' + source : ''}${doi ? ' ' + doi : ''}`;
    const apaSegments = formato?.apa_segments;
```

y en el objeto de la referencia usá `formatted_apa: formatted, raw_text: formatted, apa_segments: apaSegments, tipo: formato?.tipo`;

Traducí el selector local `refType` (`:963-980`) a los valores del contrato: `journal→articulo`, `book→libro`, `thesis→tesis`, `web→web` (guardá `tipoSeleccionado` como string y pasalo a `formatearReferencia`).

En `ReferenceForm.tsx`, hacé `save` async y usá el mismo patrón: `const formato = await formatearReferencia({...}); const formatted = formato?.formatted_apa ?? <fallback plano actual>;` y persistí `apa_segments: formato?.apa_segments, tipo: formato?.tipo`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --reporter=dot`
Expected: PASS (la suite completa). El test de ReferenceEditModal existente que verifica 5 campos sigue verde; el nuevo verifica `tipo`.

- [ ] **Step 5: Commit**

```bash
cmd /c "git add src/lib/apaApi.ts src/components/referencias/Step5ReferencesWizard.tsx src/components/referencias/ReferenceForm.tsx src/components/referencias/ReferenceEditModal.tsx src/components/referencias/__tests__/ReferenceEditModal.test.tsx"
cmd /c "git commit -m ""feat(apa): formularios manuales via endpoint y selector de tipo"""
```

---

### Task 12: Verificación final y regresión completa

**Files:** ninguno (solo verificación).

- [ ] **Step 1: Backend completo**

Run: `pytest python/tests/ -q --tb=short`
Expected: PASS. Prestar atención a `test_references_dedup.py`, `test_references_heading_single_source.py`, `test_placeholders*` (pueden verse afectados por el validador que deriva `formatted_apa`).

- [ ] **Step 2: Frontend completo**

Run: `npm test -- --reporter=dot`
Expected: PASS.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores (los `apa_segments`/`tipo` existen en ambos tipos TS).

- [ ] **Step 4: Verificación manual del caso auditoría**

Con el backend levantado (`python python/main.py`) y `npm run dev`, abrir la vista de Referencias y comprobar:
1. La lista completa tiene sangría francesa y doble espacio, sin centrado irregular.
2. Una referencia de libro no muestra enlace.
3. Un autor corporativo no muestra `[SIGLAS]`.
4. Una referencia Vancouver (`Available from:` / `[accessed]`) aparece limpia.
5. Exportar a Word: la sección Referencias conserva sangría francesa y la cursiva.

- [ ] **Step 5: Commit final (si quedó algún ajuste)**

```bash
cmd /c "git add -A"
cmd /c "git commit -m ""test(apa): verificacion de regresion completa"""
```
