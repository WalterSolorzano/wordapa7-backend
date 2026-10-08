# Motor de Render Híbrido — Fase 2: Endpoint de layout COM en vivo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development (RED→GREEN por task) y superpowers:executing-plans (orden de tasks con ledger) para implementar este plan. Steps usan checkbox (`- [ ]`) para tracking.

**Goal:** El backend pagina la sesión con Word COM bajo demanda (`POST /api/layout/paginate`) y el frontend consume ese corte real: `page_start` por elemento, `line_cuts[]` (offsets exactos de quiebre de página) y dimensiones/márgenes reales. Word es la única autoridad; sin Word el endpoint responde honesto (`available:false`, "Se requiere Microsoft Word") y el canvas conserva su medición DOM como feedback instantáneo.

**Architecture:** (1) servicio `layout_service.paginate_session` — materializa el docx de sesión con el estado actual del modelo (`apply_inplace`), pagina con `COMPageLayoutProvider` (Repaginate + binary search de cortes con rangos colapsados) y mapea párrafos→elementos con la convención índice existente; (2) router nuevo en `routers/pagination.py` (ya registrado en `main.py` — **main.py no se toca**); (3) frontend: coalescer de 1.5s (nunca encadena repaginaciones en vuelo), store `applyLayoutPagination` idempotente con eco `layoutEcho`, `expandByLineCuts` parte los elementos según los cortes Word ANTES de `computePages`, StatusBar muestra el conteo real.

**Tech Stack:** Python 3.11 + pytest (backend), TypeScript + React 18 + vitest con fake timers (frontend).

**Spec:** `docs/superpowers/specs/2026-09-25-motor-rendimiento-design.md` (sección 3.1 Fase 2)

## Global Constraints

- Cero emojis en toda UI; solo iconos `lucide-react`. Mensaje D-a literal: `Se requiere Microsoft Word`.
- Solo design tokens CSS (`var(--...)`); prohibido hex hardcodeado salvo fallback ya existente.
- **`python/main.py` NO se toca** (WIP de sesión paralela; `stash@{0}` intacto). El router nuevo va en `python/routers/pagination.py` que ya está registrado (`main.py:222`).
- **`ElementModel`/`DocumentModel` Pydantic no cambian**: solo se agrega `LayoutPaginateRequest` a `models.py`.
- Endpoint de layout: SOLO `COMPageLayoutProvider` (sin LibreOffice, sin heurístico como autoridad — decisión D-a). Sin Word → `available:false` + razón `Se requiere Microsoft Word`, sin bloquear.
- Word COM lazy: el servicio llama `provider.is_available()` ANTES de materializar; `Visible=False`, `DisplayAlerts=0` ya lo garantiza `_do_paginate`.
- Convención de mapeo párrafo↔elemento = índice directo (misma que `docx_parser.py:1530` y `sessions.py:70`) — con tablas puede desfasar; el clamp de offsets descarta cortes inválidos (peor caso = fallback a medición DOM, **nunca texto perdido**).
- Sin regresiones al cerrar cada task: `pytest python/tests/`, `npx vitest run`, `npx tsc --noEmit`.
- Fix colateral ya en HEAD (barrido por checkpoint 8415213): `UnifiedToolbar.tsx` usa `getApiBase()/addin/sideload-status-v2` y `DocumentAIChat.tsx` usa `getApiBase()/references/import-file` — no reabrir.

## Rulings de diseño (aplicados al escribir el plan)

1. **`paginateLayout` vive en `src/api/layout.ts` (nuevo), NO en `api/backend.ts`**: docenas de tests mockean `../api/backend` con exports nombrados estrictos; meter `paginateLayout` ahí rompería `vi.mock` existentes (`pageGeometry.integration`, `useDocStore.test`, etc.). Módulo aislado → cero tests existentes tocados.
2. **Cortes por binary search sobre rangos colapsados** (`doc.Range(pos,pos).Information(3)`): `Information(3)` sobre rango NO colapsado es ambiguo (start vs end); colapsado = página no ambigua de `pos`.
3. **`with_cuts: bool = False`** en `COMPageLayoutProvider.paginate`/`_do_paginate`: solo el endpoint en vivo paga el costo de los cortes; el upload no cambia.
4. **Idempotencia = guard de eco**: `applyLayoutPagination` solo incrementa `layoutEcho` cuando algo cambió; respuesta idéntica → sin `set` → el efecto del hook no re-agenda → el bucle corta en 2 iteraciones máx.
5. **Fragmentos Word son atómicos en `applyPageFlow`** (`split_chunk !== undefined` → `splittable:false` y no re-slicear): sus cortes ya son exactos; además se borra su altura medida (comparten id → `querySelectorAll` ve >1 nodos → no re-miden y conservarían la altura completa).
6. **`DocumentAIChat.tsx:384` queda fuera de alcance**: `Math.ceil(filteredElements.length / pageSize)` con `pageSize=10` es paginación de la LISTA de sugerencias, no paginación de documento — la spec se equivocó de línea. Rival real = `StatusBar.tsx:41` (`ceil(totalElements/14)`), eliminado en Task 9.

## Review Focus

1. **Bucle infinito de repaginación** — la respuesta muta `doc` → el hook re-agenda → respuesta idéntica → DEBE cortarse: test de idempotencia en `applyLayoutPagination` (2ª aplicación no incrementa `layoutEcho`) + test de hook (respuesta aplicada no re-dispara `paginateLayout`) — Tasks 7-8.
2. **Sin Word (D-a)** — `available:false` con razón `Se requiere Microsoft Word`: servicio no muta nada, store solo prende `wordLayoutUnavailable`, canvas sigue con medición DOM sin crash — tests en Task 2 y Task 7.
3. **Recomposición exacta de texto con cortes Word** — `fragments.join('') === original` byte a byte, offsets fuera de rango descartados, fragmentos no re-sliceados por el flow — tests en Task 6.
4. **Respuesta obsoleta / de otra sesión** — `session_id` distinto al doc activo → ignorada; coalescer con 1 request en vuelo (nunca encadenar) — tests en Tasks 7 y 5.
5. **Portada e indivisibilidad + Nivel 1** — `expandByLineCuts` nunca parte `is_cover_section`/`portada_block`/`heading_level===1`; la suite `pageSplitter.heading1.test.ts` debe seguir verde — tests en Task 6.

---

### Task 1: Modelo + endpoint `POST /api/layout/paginate` (contrato, servicio mockeado)

**Files:**
- Modify: `python/models.py` (agregar `LayoutPaginateRequest` tras `PortadaMapRequest`, línea ~320)
- Modify: `python/routers/pagination.py` (import `HTTPException` + modelo; endpoint nuevo)
- Test: `python/tests/test_layout_paginate.py` (crear)

**Interfaces:**
- Produces: `POST /api/layout/paginate` con body `{"session_id": "..."}` → 404 con `detail: "Sesión no encontrada"` si no existe; 200 con `{session_id, available, provider, reason, total_pages, elements[], line_cuts[], page_setup, elapsed_ms}`.
- Consumed by: frontend `src/api/layout.ts` (Task 4).

- [ ] **Step 1: Escribir tests fallidos**

```python
# python/tests/test_layout_paginate.py
"""FASE 2 — POST /api/layout/paginate: contrato del endpoint y del servicio.

Word se simula (monkeypatch de COMPageLayoutProvider / apply_inplace):
el test nunca toma una instancia COM real.
"""
import sys
import pathlib
import types
import uuid

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fastapi.testclient import TestClient


def _client():
    from main import app
    return TestClient(app)


def test_endpoint_404_sesion_desconocida():
    r = _client().post("/api/layout/paginate",
                       json={"session_id": f"nope-{uuid.uuid4().hex}"})
    assert r.status_code == 404
    assert r.json()["detail"] == "Sesión no encontrada."


def test_endpoint_shape_with_mocked_service(monkeypatch):
    from persistence import session_manager as sm
    monkeypatch.setattr(sm, "load_session_state", lambda sid, st: object())
    from services import layout_service as ls
    monkeypatch.setattr(ls, "paginate_session", lambda doc, sd: {
        "available": True, "provider": "com", "reason": None,
        "total_pages": 7,
        "elements": [{"element_id": "e0", "page_start": 1},
                     {"element_id": "e1", "page_start": 2}],
        "line_cuts": [{"element_id": "e1",
                       "cuts": [{"offset": 120, "page": 2}]}],
        "page_setup": {"width_pt": 612.0, "height_pt": 792.0,
                       "margin_top_pt": 72.0, "margin_bottom_pt": 72.0,
                       "margin_left_pt": 72.0, "margin_right_pt": 72.0},
        "elapsed_ms": 5,
    })
    r = _client().post("/api/layout/paginate", json={"session_id": "abc"})
    assert r.status_code == 200
    data = r.json()
    assert data["session_id"] == "abc"
    assert data["available"] is True and data["total_pages"] == 7
    assert data["elements"][1]["page_start"] == 2
    assert data["line_cuts"][0]["cuts"][0] == {"offset": 120, "page": 2}
    assert data["page_setup"]["width_pt"] == 612.0
```

- [ ] **Step 2: Correr tests, verificar FALLA**

Run: `pytest python/tests/test_layout_paginate.py -v`
Expected: FAIL — test 1: `detail == "Not Found"` (ruta no existe aún); test 2: `status_code == 404`.

- [ ] **Step 3: Implementar modelo + endpoint**

```python
# python/models.py — insertar tras PortadaMapRequest (línea ~320, antes de HealthResponse)
class LayoutPaginateRequest(BaseModel):
    """FASE 2 — repaginación en vivo: Word COM como autoridad de layout."""
    session_id: str
```

```python
# python/routers/pagination.py — cabecera:
from fastapi import APIRouter, File, Form, UploadFile, HTTPException
from models import LayoutPaginateRequest
# ... (el resto de imports existente queda igual)

# endpoint nuevo, tras audit_pagination:
@router.post("/api/layout/paginate")
def layout_paginate(req: LayoutPaginateRequest) -> dict:
    """FASE 2 — Repagina la sesión con Word COM y devuelve el corte real.

    def (no async): el trabajo COM/python-docx es bloqueante; FastAPI lo
    ejecuta en el threadpool y no congela el event loop.
    Sin Word → available=false + "Se requiere Microsoft Word" (D-a).
    """
    from config import STORAGE_DIR
    from persistence.session_manager import load_session_state
    from services.layout_service import paginate_session

    doc = load_session_state(req.session_id, STORAGE_DIR)
    if not doc:
        raise HTTPException(status_code=404, detail="Sesión no encontrada.")
    result = paginate_session(doc, STORAGE_DIR / "sessions" / req.session_id)
    return {**result, "session_id": req.session_id}
```

- [ ] **Step 4: Correr tests, verificar GREEN**

Run: `pytest python/tests/test_layout_paginate.py -v`
Expected: 1 passed + 1 `FAILED`/error en `test_endpoint_shape` (importa `services.layout_service` que aún no existe → ERROR). Eso es correcto: el shape test anticipa el Task 2. **Ruling TDD:** en Task 2 el módulo nace y ambos quedan GREEN. Si prefieres GREEN limpio aquí, crea `python/services/layout_service.py` con un stub `def paginate_session(doc, session_dir): raise NotImplementedError` — el Task 2 lo reemplaza. El stub es aceptado.

- [ ] **Step 5: Commit**

Run: `git add python/models.py python/routers/pagination.py python/tests/test_layout_paginate.py python/services/layout_service.py && git commit -m "feat(layout): endpoint POST /api/layout/paginate (contrato + modelo)"`
Verify: `git log --oneline -1`

---

### Task 2: Servicio `layout_service.paginate_session` (materializa, pagina, mapea)

**Files:**
- Create: `python/services/layout_service.py`
- Test: `python/tests/test_layout_paginate.py` (agregar tests de servicio)

**Interfaces:**
- Produces: `paginate_session(doc, session_dir: Path) -> dict` con claves siempre presentes: `available, provider, reason, total_pages, elements, line_cuts, page_setup, elapsed_ms`.
- `doc` solo se usa con duck typing (`doc.elements` con `.id`/`.text`, `doc.apa_rules`) → los tests usan `SimpleNamespace`.

- [ ] **Step 1: Escribir tests fallidos (agregar al mismo archivo)**

```python
# python/tests/test_layout_paginate.py — agregar:

def _fake_doc():
    return types.SimpleNamespace(
        elements=[
            types.SimpleNamespace(id="e0", text="hola"),
            types.SimpleNamespace(id="e1", text="x" * 300),
        ],
        apa_rules=None,
    )


def _session_dir(tmp_path):
    d = tmp_path / "sessions" / "s1"
    d.mkdir(parents=True)
    (d / "original.docx").write_bytes(b"PK\x03\x04fake")
    return d


def _result(paragraph_pages, paragraph_cuts):
    from parsing.page_layout_provider import PageLayoutResult
    return PageLayoutResult(
        paragraph_pages=paragraph_pages,
        total_pages=7,
        provider_used="com",
        confidence=1.0,
        notes=[],
        paragraph_cuts=paragraph_cuts,
        page_setup={"width_pt": 612.0, "height_pt": 792.0,
                    "margin_top_pt": 72.0, "margin_bottom_pt": 72.0,
                    "margin_left_pt": 72.0, "margin_right_pt": 72.0},
    )


def _patch_provider(monkeypatch, *, available=True, result=None, raises=None):
    from parsing import page_layout_provider as plp

    class FakeProvider:
        def is_available(self):
            return available

        def paginate(self, path, timeout_seconds=30, with_cuts=False):
            assert path.exists()
            if raises:
                raise raises
            assert with_cuts is True
            return result

    monkeypatch.setattr(plp, "COMPageLayoutProvider", FakeProvider)


def _patch_inplace(monkeypatch, *, fail=False):
    from generation import inplace_editor as ie

    def fake(original_path, out_path, doc_model, rules, scopes=None):
        if fail:
            raise RuntimeError("inplace boom")
        out_path.write_bytes(original_path.read_bytes())
        return out_path

    monkeypatch.setattr(ie, "apply_inplace", fake)


def test_service_mapea_pages_y_corts(tmp_path, monkeypatch):
    from services.layout_service import paginate_session
    res = _result([1, 2], [[], [{"offset": 120, "page": 2},
                                {"offset": 9999, "page": 3}]])
    _patch_provider(monkeypatch, result=res)
    _patch_inplace(monkeypatch)
    out = paginate_session(_fake_doc(), _session_dir(tmp_path))
    assert out["available"] is True and out["total_pages"] == 7
    assert out["elements"] == [{"element_id": "e0", "page_start": 1},
                               {"element_id": "e1", "page_start": 2}]
    # offset 9999 > len(text e1)=300 → descartado (clamp defensivo)
    assert out["line_cuts"] == [{"element_id": "e1",
                                 "cuts": [{"offset": 120, "page": 2}]}]
    assert out["page_setup"]["height_pt"] == 792.0
    assert out["elapsed_ms"] >= 0


def test_service_unavailable_sin_word(tmp_path, monkeypatch):
    from services.layout_service import paginate_session
    _patch_provider(monkeypatch, available=False)
    out = paginate_session(_fake_doc(), _session_dir(tmp_path))
    assert out["available"] is False
    assert "Se requiere Microsoft Word" in out["reason"]
    assert out["elements"] == [] and out["total_pages"] is None


def test_service_inplace_fallo_usa_original(tmp_path, monkeypatch):
    from services.layout_service import paginate_session
    res = _result([1, 1], [])
    _patch_provider(monkeypatch, result=res)
    _patch_inplace(monkeypatch, fail=True)
    out = paginate_session(_fake_doc(), _session_dir(tmp_path))
    assert out["available"] is True  # degrada al original, no se rompe


def test_service_excepcion_com_devuelve_unavailable(tmp_path, monkeypatch):
    from services.layout_service import paginate_session
    _patch_provider(monkeypatch, raises=RuntimeError("Word no respondió en 20s"))
    _patch_inplace(monkeypatch)
    out = paginate_session(_fake_doc(), _session_dir(tmp_path))
    assert out["available"] is False
    assert "Word no respondió" in out["reason"]
```

- [ ] **Step 2: Correr tests, verificar FALLA**

Run: `pytest python/tests/test_layout_paginate.py -v`
Expected: los 4 tests nuevos FALLAN con `ModuleNotFoundError: No module named 'services.layout_service'`.

- [ ] **Step 3: Implementar el servicio**

```python
# python/services/layout_service.py
"""FASE 2 — Paginación en vivo de la sesión con Word COM.

Word es la única autoridad de layout (decisión D-a). El flujo es:

1. is_available() ANTES de tocar nada (COM lazy — sin Word no se materializa).
2. Materializa el docx con el estado ACTUAL del modelo vía apply_inplace
   (mismo camino que /api/generate → el corte refleja lo que el usuario ve).
   Si materializar falla, se pagina el original degradando con honestidad.
3. Repaginate + cortes por binary search (page_layout_provider.with_cuts).
4. Mapeo párrafo→elemento por índice (convención de docx_parser/sessions.py)
   con clamp: offsets fuera del rango del texto del elemento se descartan.

Respuesta con claves SIEMPRE presentes: available, provider, reason,
total_pages, elements, line_cuts, page_setup, elapsed_ms.
"""
from __future__ import annotations

import logging
import shutil
import tempfile
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger("wordapa7")

_TIMEOUT_S = 20  # hot path con debounce 1.5s: menos que los 30s del upload


def _unavailable(reason: str, t0: float) -> dict:
    return {
        "available": False,
        "provider": "none",
        "reason": reason,
        "total_pages": None,
        "elements": [],
        "line_cuts": [],
        "page_setup": None,
        "elapsed_ms": int((time.time() - t0) * 1000),
    }


def _element_id(elem: Any) -> str:
    return elem.id if hasattr(elem, "id") else elem.get("id", "")


def _materialize(doc: Any, original: Path, tmp_dir: Path) -> Path:
    """Copia del original con el texto/estado actual del modelo."""
    from generation.inplace_editor import apply_inplace
    rules = getattr(doc, "apa_rules", None)
    out = tmp_dir / "live.docx"
    apply_inplace(original, out, doc, rules, scopes=None)
    return out


def paginate_session(doc: Any, session_dir: Path) -> dict:
    t0 = time.time()

    from parsing.page_layout_provider import COMPageLayoutProvider
    provider = COMPageLayoutProvider()
    if not provider.is_available():
        return _unavailable("Se requiere Microsoft Word", t0)

    original = session_dir / "original.docx"
    if not original.exists():
        return _unavailable("La sesión no tiene original.docx", t0)

    tmp_dir = Path(tempfile.mkdtemp(prefix="apa7-live-"))
    try:
        try:
            src = _materialize(doc, original, tmp_dir)
        except Exception as exc:
            logger.warning(f"[Layout] materialize falló, uso original: {exc}")
            src = original

        result = provider.paginate(src, timeout_seconds=_TIMEOUT_S,
                                   with_cuts=True)

        elements = []
        line_cuts = []
        for i, elem in enumerate(doc.elements):
            eid = _element_id(elem)
            if not eid or i >= len(result.paragraph_pages):
                continue
            elements.append({"element_id": eid,
                             "page_start": int(result.paragraph_pages[i])})
            if i < len(result.paragraph_cuts) and result.paragraph_cuts[i]:
                # Clamp: un offset fuera del texto del elemento = mapeo
                # párrafo↔elemento desfasado (tablas) → descartar ese corte.
                text_len = len(getattr(elem, "text", "") or "")
                cuts = [
                    {"offset": int(c["offset"]), "page": int(c["page"])}
                    for c in result.paragraph_cuts[i]
                    if 0 < int(c["offset"]) < text_len
                ]
                if cuts:
                    line_cuts.append({"element_id": eid, "cuts": cuts})

        out = {
            "available": True,
            "provider": result.provider_used,
            "reason": None,
            "total_pages": int(result.total_pages),
            "elements": elements,
            "line_cuts": line_cuts,
            "page_setup": result.page_setup,
            "elapsed_ms": int((time.time() - t0) * 1000),
        }
        if out["elapsed_ms"] > 5000:
            logger.warning(f"[Layout] paginate lento: {out['elapsed_ms']}ms")
        return out
    except Exception as exc:
        logger.warning(f"[Layout] paginate falló: {exc}")
        return _unavailable(str(exc)[:200], t0)
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
```

- [ ] **Step 4: Correr tests, verificar GREEN**

Run: `pytest python/tests/test_layout_paginate.py -v`
Expected: todos los tests del archivo en GREEN (los 2 del Task 1 + los 4 nuevos).

Nota: `PageLayoutResult` aún no tiene `paragraph_cuts`/`page_setup` → los tests del servicio con `_result(...)` fallarán con `TypeError`. Si es el caso, **adelanta la dataclass** del Task 3 (solo los dos campos con default: `paragraph_cuts: List[List[dict]] = field(default_factory=list)` y `page_setup: Optional[dict] = None`) y deja la lógica de cómputo (`cuts_for_range`, `page_setup_dict`, `with_cuts`) para el Task 3. Ruling TDD permitido: contrato de datos primero, cómputo después.

- [ ] **Step 5: Commit**

Run: `git add python/services/layout_service.py python/tests/test_layout_paginate.py python/parsing/page_layout_provider.py && git commit -m "feat(layout): paginate_session — materializa sesion, pagina con Word COM, mapea cortes"`

---

### Task 3: Cortes de página Word en `page_layout_provider` (binary search + page_setup)

**Files:**
- Modify: `python/parsing/page_layout_provider.py` (dataclass + `paginate(with_cuts=)` + `_do_paginate` + helpers)
- Test: `python/tests/test_page_layout_cuts.py` (crear)

**Interfaces:**
- Produces: `PageLayoutResult.paragraph_cuts: list[list[dict]]` (por párrafo, `{"offset": int, "page": int}` relativos al texto del párrafo) y `PageLayoutResult.page_setup: dict | None` (`width_pt, height_pt, margin_top_pt, margin_bottom_pt, margin_left_pt, margin_right_pt`).
- `cuts_for_range(doc, rng)` y `page_setup_dict(doc)` son funciones de módulo → unit-testeables con fakes COM (sin Word).

- [ ] **Step 1: Escribir tests fallidos**

```python
# python/tests/test_page_layout_cuts.py
"""FASE 2 — cortes de página y page_setup con un doc COM falso (sin Word)."""
import sys
import pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))


class FakeRange:
    def __init__(self, start, end):
        self.Start = start
        self.End = end

    def Information(self, code):
        # Página = posición // 100 + 1 (quiebres artificiales en 100 y 200).
        assert code == 3
        return self.Start // 100 + 1


class FakeDoc:
    def Range(self, a, b):
        return FakeRange(a, b)

    class PageSetup:
        PageWidth = 612.0
        PageHeight = 792.0
        TopMargin = 72.0
        BottomMargin = 72.0
        LeftMargin = 72.0
        RightMargin = 72.0

    PageSetup = PageSetup()


def test_cuts_binary_search_multi_pagina():
    from parsing.page_layout_provider import cuts_for_range
    cuts = cuts_for_range(FakeDoc(), FakeRange(0, 250))
    assert cuts == [{"offset": 100, "page": 2},
                    {"offset": 200, "page": 3}]


def test_cuts_parrafo_no_cruza_devuelve_vacio():
    from parsing.page_layout_provider import cuts_for_range
    assert cuts_for_range(FakeDoc(), FakeRange(0, 50)) == []
    assert cuts_for_range(FakeDoc(), FakeRange(10, 11)) == []


def test_cuts_fallo_com_devuelve_vacio():
    from parsing.page_layout_provider import cuts_for_range

    class Broken:
        Start = 0
        End = 500

        def Information(self, code):
            raise RuntimeError("colgado")

    class BrokenDoc:
        def Range(self, a, b):
            raise RuntimeError("colgado")

    assert cuts_for_range(BrokenDoc(), Broken()) == []


def test_page_setup_dict():
    from parsing.page_layout_provider import page_setup_dict
    assert page_setup_dict(FakeDoc()) == {
        "width_pt": 612.0, "height_pt": 792.0,
        "margin_top_pt": 72.0, "margin_bottom_pt": 72.0,
        "margin_left_pt": 72.0, "margin_right_pt": 72.0,
    }


def test_page_setup_fallo_devuelve_none():
    from parsing.page_layout_provider import page_setup_dict
    assert page_setup_dict(object()) is None
```

- [ ] **Step 2: Correr tests, verificar FALLA**

Run: `pytest python/tests/test_page_layout_cuts.py -v`
Expected: FAIL — `ImportError: cannot import name 'cuts_for_range'` (y `page_setup_dict`).

- [ ] **Step 3: Implementar**

En `python/parsing/page_layout_provider.py`:

```python
# 1) dataclass — agregar campos con default (backward compatible con los
#    constructores de libreoffice/heuristic que no los pasan):
from dataclasses import dataclass, field   # ajustar import existente

@dataclass
class PageLayoutResult:
    paragraph_pages: List[int]
    total_pages: int
    provider_used: str
    confidence: float
    notes: List[str]
    # FASE 2 — cortes de quiebre por párrafo (solo con with_cuts=True):
    paragraph_cuts: List[List[dict]] = field(default_factory=list)
    page_setup: Optional[dict] = None
```

```python
def _page_at(doc: Any, pos: int) -> int:
    """Página que contiene pos. Rango COLAPSADO (a==b): start==end → sin
    ambigüedad (Information(3) sobre rango abierto es start o end según COM)."""
    return int(doc.Range(pos, pos).Information(3))


def cuts_for_range(doc: Any, rng: Any) -> List[dict]:
    """Offsets relativos al párrafo donde Word rompe la página.

    Binary search por quiebre: O(log n) sondas por corte. Rango que no cruza
    → []. Cualquier fallo COM → [] (el canvas cae a medición DOM).
    """
    try:
        a, b = int(rng.Start), int(rng.End)
        if b - a < 2:
            return []
        cur = _page_at(doc, a)
        final = _page_at(doc, b - 1)
        out: List[dict] = []
        pos = a
        guard = 0
        while final > cur and guard < 64:
            guard += 1
            lo, hi = pos + 1, b
            while lo < hi:
                mid = (lo + hi) // 2
                if _page_at(doc, mid) > cur:
                    hi = mid
                else:
                    lo = mid + 1
            nxt = _page_at(doc, lo)
            if nxt <= cur:
                break  # sin progreso (defensa)
            out.append({"offset": int(lo - a), "page": int(nxt)})
            pos, cur = lo, nxt
        return out
    except Exception:
        return []


def page_setup_dict(doc: Any) -> Optional[dict]:
    """Dimensiones/márgenes REALES de Word (puntos)."""
    try:
        ps = doc.PageSetup
        return {
            "width_pt": float(ps.PageWidth),
            "height_pt": float(ps.PageHeight),
            "margin_top_pt": float(ps.TopMargin),
            "margin_bottom_pt": float(ps.BottomMargin),
            "margin_left_pt": float(ps.LeftMargin),
            "margin_right_pt": float(ps.RightMargin),
        }
    except Exception:
        return None
```

En `COMPageLayoutProvider`:

```python
    def paginate(self, docx_path: Path, timeout_seconds: int = 30,
                 with_cuts: bool = False) -> PageLayoutResult:
        try:
            result = self._paginate_with_timeout(docx_path, timeout_seconds,
                                                 with_cuts)
            return result
        finally:
            self._kill_orphan_winword_processes()

    def _paginate_with_timeout(self, docx_path, timeout, with_cuts=False):
        # ... mismo cuerpo, pero:
        future = executor.submit(self._do_paginate, docx_path, with_cuts)
        # ... resto igual

    def _do_paginate(self, docx_path, with_cuts: bool = False) -> PageLayoutResult:
        # ... tras doc.Repaginate() existente:
            paragraph_pages: List[int] = []
            paragraph_cuts: List[List[dict]] = []
            for para in doc.Paragraphs:
                # wdActiveEndPageNumber = 3
                page_num = para.Range.Information(3)
                paragraph_pages.append(int(page_num))
                if with_cuts:
                    paragraph_cuts.append(cuts_for_range(doc, para.Range))
            total_pages = doc.ComputeStatistics(2)  # wdStatisticPages = 2
            page_setup = page_setup_dict(doc)   # barato: 6 propiedades
            # ... logger.info igual
            return PageLayoutResult(
                paragraph_pages=paragraph_pages,
                total_pages=total_pages,
                provider_used="com",
                confidence=1.0,
                notes=[],
                paragraph_cuts=paragraph_cuts,
                page_setup=page_setup,
            )
```

Nota de rendimiento: `with_cuts=True` agrega 2 sondas `Range.Information` por párrafo (detección de cruce) + ~log2(len) por quiebre real. Con 800 párrafos ≈ 0.3-1s extra sobre el Repaginate — aceptado; si el `elapsed_ms` del servicio supera 5s de forma repetida, optimizar (gate por largo de párrafo) como tarea posterior.

- [ ] **Step 4: Correr tests, verificar GREEN**

Run: `pytest python/tests/test_page_layout_cuts.py python/tests/test_layout_paginate.py -v`
Expected: GREEN total (nuevos 5 + servicio/endpoint).

- [ ] **Step 5: Commit**

Run: `git add python/parsing/page_layout_provider.py python/tests/test_page_layout_cuts.py && git commit -m "feat(layout): cortes de pagina Word via binary search + page_setup real"`

---

### Task 4: API client frontend `paginateLayout` (`src/api/layout.ts`)

**Files:**
- Create: `src/api/layout.ts`
- Test: `src/__tests__/layoutPaginateApi.test.ts` (crear)

**Interfaces:**
- Produces:

```ts
export interface WordLineCut { offset: number; page: number }
export interface LayoutElementPage { element_id: string; page_start: number }
export interface LayoutElementCuts { element_id: string; cuts: WordLineCut[] }
export interface LayoutPageSetup {
  width_pt: number; height_pt: number;
  margin_top_pt: number; margin_bottom_pt: number;
  margin_left_pt: number; margin_right_pt: number;
}
export interface LayoutPaginateResult {
  session_id: string;
  available: boolean;
  reason?: string | null;
  provider?: string;
  total_pages?: number | null;
  elements?: LayoutElementPage[];
  line_cuts?: LayoutElementCuts[];
  page_setup?: LayoutPageSetup | null;
  elapsed_ms?: number;
}
export async function paginateLayout(sessionId: string): Promise<LayoutPaginateResult>;
```

- Consumed by: hook `useLayoutRepaginate` (Task 8), store (Task 7 importa el tipo).
- **Ruling:** módulo propio, NO `api/backend.ts` (los `vi.mock('../api/backend')` existentes son estrictos en exports y no deben tocarse).

- [ ] **Step 1: Escribir test fallido**

```ts
// src/__tests__/layoutPaginateApi.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { paginateLayout } from '../api/layout';

describe('paginateLayout (api client)', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('POST /api/layout/paginate con session_id y devuelve el JSON', async () => {
    const payload = { session_id: 's1', available: true, total_pages: 3 };
    fetchMock.mockResolvedValue({ ok: true, json: async () => payload });
    const res = await paginateLayout('s1');
    expect(res).toEqual(payload);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/layout/paginate');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ session_id: 's1' });
  });

  it('HTTP != ok lanza error (el hook lo traga como best-effort)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(paginateLayout('s1')).rejects.toThrow('HTTP 500');
  });
});
```

- [ ] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/layoutPaginateApi.test.ts`
Expected: FAIL — no existe `src/api/layout.ts`.

- [ ] **Step 3: Implementar**

```ts
// src/api/layout.ts
/* WordAPA7 — Fase 2: cliente del endpoint de layout COM en vivo.
 * Módulo aparte de api/backend.ts a propósito: los vi.mock existentes de
 * backend son estrictos en exports; paginateLayout no debe romperlos. */
import { getApiBase } from './http';

export interface WordLineCut { offset: number; page: number }
export interface LayoutElementPage { element_id: string; page_start: number }
export interface LayoutElementCuts { element_id: string; cuts: WordLineCut[] }
export interface LayoutPageSetup {
  width_pt: number; height_pt: number;
  margin_top_pt: number; margin_bottom_pt: number;
  margin_left_pt: number; margin_right_pt: number;
}
export interface LayoutPaginateResult {
  session_id: string;
  available: boolean;
  reason?: string | null;
  provider?: string;
  total_pages?: number | null;
  elements?: LayoutElementPage[];
  line_cuts?: LayoutElementCuts[];
  page_setup?: LayoutPageSetup | null;
  elapsed_ms?: number;
}

/** Repagina la sesión con Word COM (coalescer de 1.5s vive en el hook). */
export async function paginateLayout(sessionId: string): Promise<LayoutPaginateResult> {
  const res = await fetch(`${getApiBase()}/layout/paginate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Correr test, verificar GREEN**

Run: `npx vitest run src/__tests__/layoutPaginateApi.test.ts && npx tsc --noEmit`
Expected: 2 passed; tsc sin errores nuevos.

- [ ] **Step 5: Commit**

Run: `git add src/api/layout.ts src/__tests__/layoutPaginateApi.test.ts && git commit -m "feat(layout): api client paginateLayout (modulo aislado de api/backend)"`

---

### Task 5: Coalescer de repaginación (debounce 1.5s, nunca encadena en vuelo)

**Files:**
- Create: `src/lib/layoutCoalescer.ts`
- Test: `src/__tests__/layoutCoalescer.test.ts` (crear)

**Interfaces:**
- Produces:

```ts
export interface LayoutCoalescer { schedule(): void; dispose(): void }
export interface CoalescerOptions {
  delayMs: number;
  send: () => Promise<void>;
  setTimeoutFn?: typeof setTimeout;   // inyección para fake timers
  clearTimeoutFn?: typeof clearTimeout;
}
export function createLayoutCoalescer(opts: CoalescerOptions): LayoutCoalescer;
```

- Consumed by: `useLayoutRepaginate` (Task 8).
- Comportamiento: N `schedule()` dentro de la ventana → 1 `send`. `schedule()` con `send` en vuelo → `dirty` → al terminar, NUEVA ventana de `delayMs` → 1 `send`. `send` que rechaza no deja `inFlight` colgado. `dispose()` cancela timer pendiente.

- [ ] **Step 1: Escribir test fallido**

```ts
// src/__tests__/layoutCoalescer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLayoutCoalescer } from '../lib/layoutCoalescer';

describe('layoutCoalescer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('N schedules en la ventana → un solo send', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const c = createLayoutCoalescer({ delayMs: 1500, send });
    c.schedule(); c.schedule(); c.schedule();
    await vi.advanceTimersByTimeAsync(1499);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('schedule durante vuelo → dirty, no encadena: un send más tras resolver', async () => {
    let resolveSend!: () => void;
    const send = vi.fn().mockImplementation(
      () => new Promise<void>((r) => { resolveSend = r; }),
    );
    const c = createLayoutCoalescer({ delayMs: 1500, send });
    c.schedule();
    await vi.advanceTimersByTimeAsync(1500);   // send #1 en vuelo
    expect(send).toHaveBeenCalledTimes(1);
    c.schedule(); c.schedule();                 // durante vuelo → dirty
    await vi.advanceTimersByTimeAsync(5000);    // nada: sigue en vuelo
    expect(send).toHaveBeenCalledTimes(1);
    resolveSend();
    await vi.advanceTimersByTimeAsync(1499);    // nueva ventana completa
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);      // 1 sola reposición, sin cadena
  });

  it('send rechazado no deja inFlight colgado', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('red')).mockResolvedValue(undefined);
    const c = createLayoutCoalescer({ delayMs: 100, send });
    c.schedule();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(10);      // flush del catch
    c.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('dispose cancela el timer pendiente', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const c = createLayoutCoalescer({ delayMs: 1500, send });
    c.schedule();
    c.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/layoutCoalescer.test.ts`
Expected: FAIL — no existe `src/lib/layoutCoalescer.ts`.

- [ ] **Step 3: Implementar**

```ts
// src/lib/layoutCoalescer.ts
/**
 * WordAPA7 — Fase 2: coalescer de repaginación.
 *
 * Contrato (spec §3.1): debounce ~1.5s tras la última mutación y NUNCA
 * encadenar repaginaciones en vuelo. Si llegan schedules mientras `send`
 * corre, se marca dirty y, al terminar, se reinicia la ventana COMPLETA
 * de delayMs (pausa de tecleo real, no disparo inmediato).
 */
export interface LayoutCoalescer {
  schedule(): void;
  dispose(): void;
}

export interface CoalescerOptions {
  delayMs: number;
  send: () => Promise<void>;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export function createLayoutCoalescer(opts: CoalescerOptions): LayoutCoalescer {
  // CRÍTICO: resolver setTimeout/clearTimeout en CADA llamada, no en la
  // creación. El singleton se construye al importar el módulo (antes de que
  // los tests instalen fake timers); capturarlos ahí haría que
  // vi.advanceTimersByTimeAsync no disparara nunca el timer real.
  const scheduleTimer = (fn: () => void, ms: number): ReturnType<typeof setTimeout> =>
    opts.setTimeoutFn ? opts.setTimeoutFn(fn, ms) : setTimeout(fn, ms);
  const cancelTimer = (t: ReturnType<typeof setTimeout>): void =>
    opts.clearTimeoutFn ? opts.clearTimeoutFn(t) : clearTimeout(t);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let dirty = false;

  const schedule = (): void => {
    if (inFlight) { dirty = true; return; }
    if (timer) cancelTimer(timer);
    timer = scheduleTimer(() => {
      timer = null;
      void run();
    }, opts.delayMs);
  };

  const run = async (): Promise<void> => {
    inFlight = true;
    try {
      await opts.send();
    } catch {
      // Layout es best-effort: backend caído o sin Word no rompe el ciclo.
    } finally {
      inFlight = false;
    }
    if (dirty) {
      dirty = false;
      schedule();
    }
  };

  const dispose = (): void => {
    if (timer) cancelTimer(timer);
    timer = null;
    dirty = false;
  };

  return { schedule, dispose };
}
```

- [ ] **Step 4: Correr test, verificar GREEN**

Run: `npx vitest run src/__tests__/layoutCoalescer.test.ts`
Expected: 4 passed. (Si el flush de microtasks para, añadir `await Promise.resolve()` tras `advanceTimersByTimeAsync` — no cambiar la semántica.)

- [ ] **Step 5: Commit**

Run: `git add src/lib/layoutCoalescer.ts src/__tests__/layoutCoalescer.test.ts && git commit -m "feat(layout): coalescer repaginacion — debounce 1.5s, 1 request en vuelo"`

---

### Task 6: `expandByLineCuts` + guards de fragmento en `pageSplitter`

**Files:**
- Create: `src/lib/lineCuts.ts`
- Modify: `src/lib/pageSplitter.ts` (2 guards)
- Test: `src/__tests__/lineCuts.test.ts` (crear), `src/__tests__/pageSplitter.test.ts` (agregar 1 test)

**Interfaces:**
- Produces: `expandByLineCuts(elements, cuts): ElementModel[]` — fragmenta según cortes Word ANTES de `computePages`; identidad (`mismo array`) si no hay cortes aplicables; recomposición exacta garantizada.
- Consumed por: `PaperCanvas` (Task 8).

- [ ] **Step 1: Escribir tests fallidos**

```ts
// src/__tests__/lineCuts.test.ts
import { describe, it, expect } from 'vitest';
import { expandByLineCuts, LayoutCutsMap } from '../lib/lineCuts';
import { ElementModel, ElementType } from '../types';

const para = (id: string, text: string): ElementModel =>
  ({ id, type: 'paragraph' as ElementType, text } as unknown as ElementModel);

const H1 = (id: string): ElementModel =>
  ({ id, type: 'heading' as ElementType, heading_level: 1, text: 'Título' } as unknown as ElementModel);

describe('expandByLineCuts (cortes Word)', () => {
  it('recomposición exacta: concat de fragmentos === texto original', () => {
    const text = 'primera parte del parrafo. ' + 'x '.repeat(50) + 'ultima parte.';
    const cuts: LayoutCutsMap = { e1: [{ offset: 30, page: 2 }] };
    const out = expandByLineCuts([para('e1', text)], cuts);
    expect(out.length).toBe(2);
    expect(out.map((e) => e.text).join('')).toBe(text);
  });

  it('page_number por fragmento: primero conserva el original, el resto la página del corte', () => {
    const text = 'a'.repeat(200);
    const el = { ...para('e1', text), page_number: 3 } as ElementModel;
    const cuts: LayoutCutsMap = { e1: [{ offset: 100, page: 5 }] };
    const out = expandByLineCuts([el], cuts);
    expect(out[0].page_number).toBe(3);
    expect(out[1].page_number).toBe(5);
    expect(out[0].split_chunk).toBe(0);
    expect(out[1].split_chunk).toBe(1);
  });

  it('offset fuera de rango y no monótonos se descartan (sin cortes → original)', () => {
    const el = para('e1', 'corto');
    expect(expandByLineCuts([el], { e1: [{ offset: 999, page: 2 }] })).toEqual([el]);
    const text = 'y'.repeat(100);
    const out = expandByLineCuts(
      [para('e2', text)],
      { e2: [{ offset: 40, page: 2 }, { offset: 20, page: 3 }, { offset: 0, page: 4 }] },
    );
    expect(out.length).toBe(2);
    expect(out.map((e) => e.text).join('')).toBe(text);
  });

  it('NUNCA parte portada ni títulos Nivel 1', () => {
    const cover = { ...para('c1', 'portada '.repeat(30)), is_cover_section: true } as ElementModel;
    const h1 = H1('h1');
    const out = expandByLineCuts([cover, h1], {
      c1: [{ offset: 20, page: 2 }],
      h1: [{ offset: 5, page: 2 }],
    });
    expect(out).toEqual([cover, h1]);
  });

  it('tipos no partibles (tabla) no se expanden', () => {
    const table = { ...para('t1', 'celda'), type: 'table' as ElementType } as ElementModel;
    expect(expandByLineCuts([table], { t1: [{ offset: 3, page: 2 }] })).toEqual([table]);
  });

  it('sin cortes → mismo array por referencia (cero costo en render)', () => {
    const els = [para('e1', 'abc')];
    expect(expandByLineCuts(els, {})).toBe(els);
    expect(expandByLineCuts(els, null)).toBe(els);
    const other = expandByLineCuts(els, { zzz: [{ offset: 1, page: 2 }] });
    expect(other).toBe(els);   // corte de un id inexistente → nada que hacer
  });
});
```

Test de guard en `pageSplitter` (agregar a `src/__tests__/pageSplitter.test.ts`, reutilizando helpers `para` y `geom` existentes del archivo):

```ts
  it('fragmentos con split_chunk (cortes Word) son atómicos: el flow no los vuelve a partir', () => {
    // Helpers existentes del archivo: p(id, extra), geom y LH (líneas 12-23).
    const f1 = { ...p('e1', { text: 'abc ' }), split_chunk: 0 } as ElementModel;
    const f2 = { ...p('e1', { text: ' def' }), split_chunk: 1 } as ElementModel;
    // Altura medida STALE (elemento completo antes de expandir): 50 líneas.
    const heights = new Map<string, number>([['e1', LH * 50]]);
    const out = applyPageFlow([[f1, f2]], heights, geom);
    const texts = out.flat().map((e) => e.text);
    expect(texts).toContain('abc ');
    expect(texts).toContain(' def');
  });
```

Sin el guard, `f1` (`splittable`) se parte en fracciones de `'abc '` → los textos quedan troceados (`'abc'`, `' '`), no `'abc '` completo → RED.

- [ ] **Step 2: Correr tests, verificar FALLA**

Run: `npx vitest run src/__tests__/lineCuts.test.ts src/__tests__/pageSplitter.test.ts`
Expected: FAIL — `lineCuts.test.ts` no compila (módulo inexistente); el test de atómico FALLA (sin el guard, flow parte `'abc '` por las 50 líneas medidas).

- [ ] **Step 3: Implementar módulo + guards**

```ts
// src/lib/lineCuts.ts
/**
 * WordAPA7 — Fase 2: expansión de elementos según los cortes de página de
 * Word (line_cuts del endpoint). Se ejecuta ANTES de computePages para que
 * cada fragmento herede su page_number real y Word quede como verdad.
 *
 * Invariante: concat(fragmentos) === texto original, byte a byte (slices
 * contiguos sin snap). Offsets inválidos se descartan (defensa contra el
 * desfase párrafo↔elemento en docs con tablas).
 */
import { ElementModel } from '../types';
import type { WordLineCut } from '../api/layout';

export type LayoutCutsMap = Record<string, WordLineCut[]>;

/** Mismo conjunto que SPLITTABLE_TYPES de pageSplitter. */
const EXPANDABLE = new Set(['paragraph', 'block_quote', 'bullet', 'numbered_list']);

export function expandByLineCuts(
  elements: ElementModel[],
  cuts: LayoutCutsMap | null | undefined,
): ElementModel[] {
  if (!cuts) return elements;

  let out: ElementModel[] | null = null;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    const elCuts = cuts[el.id];

    // Elegibilidad: solo texto continuo; portada y Nivel 1 indivisibles.
    const eligible =
      elCuts && elCuts.length > 0 &&
      EXPANDABLE.has(el.type) &&
      !el.is_cover_section && el.type !== 'portada_block' &&
      !(el.type === 'heading' && el.heading_level === 1);

    if (!eligible) {
      if (out) out.push(el);
      continue;
    }

    const text = el.text || '';
    const bounds: WordLineCut[] = [];
    for (const c of elCuts) {
      const off = Math.floor(c.offset);
      if (!Number.isFinite(off) || off <= 0 || off >= text.length) continue;
      if (bounds.length > 0 && off <= bounds[bounds.length - 1].offset) continue;
      bounds.push({ offset: off, page: Math.max(1, Math.floor(c.page)) });
    }
    if (bounds.length === 0) {
      if (out) out.push(el);
      continue;
    }

    if (!out) out = elements.slice(0, i);
    let prev = 0;
    for (let bi = 0; bi < bounds.length; bi++) {
      out.push({
        ...el,
        text: text.slice(prev, bounds[bi].offset),
        page_number: bi === 0 ? el.page_number : bounds[bi - 1].page,
        split_chunk: bi,
      });
      prev = bounds[bi].offset;
    }
    out.push({
      ...el,
      text: text.slice(prev),
      page_number: bounds[bounds.length - 1].page,
      split_chunk: bounds.length,
    });
  }
  return out ?? elements;
}
```

Guards en `src/lib/pageSplitter.ts`:

```ts
// 1) splittable — dentro del map de items (~línea 99):
      const isCover = !!elem.is_cover_section || elem.type === 'portada_block';
      return {
        elem,
        heightPx: heights.get(elem.id) ?? null,
        // Fragmento ya cortado por Word (split_chunk): atómico — su corte
        // es exacto; volver a partirlo usaría la altura STALE del completo.
        splittable: !isCover && SPLITTABLE_TYPES.has(elem.type)
          && elem.split_chunk === undefined,
      };

// 2) materialize — dentro del map final (~línea 137), tras seen.set:
          if (c.elem.split_chunk !== undefined) return c.elem; // corte Word: texto ya exacto
          if (total === 1) return c.elem;
```

- [ ] **Step 4: Correr tests, verificar GREEN**

Run: `npx vitest run src/__tests__/lineCuts.test.ts src/__tests__/pageSplitter.test.ts src/__tests__/pageSplitter.heading1.test.ts src/__tests__/flowPagination.test.ts && npx tsc --noEmit`
Expected: GREEN en los 4 archivos; tsc limpio. `pageSplitter.heading1.test.ts` debe seguir en GREEN (Review Focus 5).

- [ ] **Step 5: Commit**

Run: `git add src/lib/lineCuts.ts src/lib/pageSplitter.ts src/__tests__/lineCuts.test.ts src/__tests__/pageSplitter.test.ts && git commit -m "feat(layout): expandByLineCuts — fragmentos por cortes Word, atomicos en el flow"`

---

### Task 7: Store `applyLayoutPagination` (idempotente, con eco)

**Files:**
- Modify: `src/store/types.ts` (3 campos + 1 acción en `DocState`)
- Modify: `src/store/slices/documentSlice.ts` (estado inicial + acción)
- Test: `src/__tests__/applyLayoutPagination.test.ts` (crear)

**Interfaces:**
- Produces en `DocState`:

```ts
  /** Fase 2 — verdad COM en vivo: cortes de página por elemento (id → cortes). */
  layoutCuts: Record<string, { offset: number; page: number }[]>;
  /** Eco de aplicación: incrementa SOLO cuando una respuesta cambió algo. El hook compara para no re-agendar. */
  layoutEcho: number;
  /** D-a: la última respuesta informó que no hay Word. */
  wordLayoutUnavailable: boolean;
  applyLayoutPagination: (resp: LayoutPaginateResult) => void;
```

- Consumed by: hook (Task 8), `PaperCanvas` (`layoutCuts`), `StatusBar` (`wordLayoutUnavailable`).

- [ ] **Step 1: Escribir test fallido**

```ts
// src/__tests__/applyLayoutPagination.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDocStore } from '../store/useDocStore';
import type { LayoutPaginateResult } from '../api/layout';

vi.mock('../api/backend', () => ({
  uploadDocxFile: vi.fn(), updateElement: vi.fn(), getApiBase: vi.fn(),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://x'), fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(), explainElement: vi.fn(), suggestCaption: vi.fn(),
}));

const makeDoc = () =>
  ({
    session_id: 's1',
    file_name: 't.docx',
    elements: [
      { id: 'e0', type: 'paragraph', text: 'uno', page_number: 1 },
      { id: 'e1', type: 'paragraph', text: 'dos', page_number: 1 },
    ],
    meta: { page_count: 1 },
    referencias: [],
  }) as any;

const resp = (over: Partial<LayoutPaginateResult> = {}): LayoutPaginateResult => ({
  session_id: 's1',
  available: true,
  provider: 'com',
  total_pages: 4,
  elements: [
    { element_id: 'e0', page_start: 1 },
    { element_id: 'e1', page_start: 3 },
  ],
  line_cuts: [{ element_id: 'e1', cuts: [{ offset: 2, page: 3 }] }],
  ...over,
});

describe('applyLayoutPagination', () => {
  beforeEach(() => {
    useDocStore.setState({ doc: makeDoc(), layoutCuts: {}, layoutEcho: 0, wordLayoutUnavailable: false });
  });

  it('aplica page_number, page_count, cortes y eco', () => {
    useDocStore.getState().applyLayoutPagination(resp());
    const s = useDocStore.getState();
    expect(s.doc!.elements[1].page_number).toBe(3);
    expect(s.doc!.meta.page_count).toBe(4);
    expect(s.layoutCuts['e1']).toEqual([{ offset: 2, page: 3 }]);
    expect(s.layoutEcho).toBe(1);
    expect(s.wordLayoutUnavailable).toBe(false);
  });

  it('idempotente: respuesta idéntica NO incrementa el eco (corta el bucle)', () => {
    const st = useDocStore.getState();
    st.applyLayoutPagination(resp());
    const echo1 = useDocStore.getState().layoutEcho;
    useDocStore.getState().applyLayoutPagination(resp());   // 2ª igual
    expect(useDocStore.getState().layoutEcho).toBe(echo1);
  });

  it('respuesta de OTRA sesión se ignora', () => {
    useDocStore.getState().applyLayoutPagination(resp({ session_id: 'otra' }));
    const s = useDocStore.getState();
    expect(s.doc!.elements[1].page_number).toBe(1);
    expect(s.layoutEcho).toBe(0);
  });

  it('available:false solo prende el aviso D-a (no muta doc)', () => {
    useDocStore.getState().applyLayoutPagination({
      session_id: 's1', available: false, reason: 'Se requiere Microsoft Word',
    });
    const s = useDocStore.getState();
    expect(s.wordLayoutUnavailable).toBe(true);
    expect(s.doc!.elements[1].page_number).toBe(1);
    expect(s.layoutEcho).toBe(0);
  });
});
```

- [ ] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/applyLayoutPagination.test.ts`
Expected: FAIL — `applyLayoutPagination is not a function`.

- [ ] **Step 3: Implementar**

`src/store/types.ts` — importar el tipo y agregar en `DocState` (junto a `citationAuditResult`):

```ts
import type { LayoutPaginateResult } from '../api/layout';

  // ── Fase 2 — Motor de render híbrido: verdad COM en vivo ──
  layoutCuts: Record<string, { offset: number; page: number }[]>;
  layoutEcho: number;
  wordLayoutUnavailable: boolean;
  applyLayoutPagination: (resp: LayoutPaginateResult) => void;
```

`src/store/slices/documentSlice.ts` — estado inicial (junto a `doc: null`):

```ts
  layoutCuts: {},
  layoutEcho: 0,
  wordLayoutUnavailable: false,
```

y la acción (agregar al final del slice, antes del `}` de cierre):

```ts
  applyLayoutPagination: (resp) => {
    const { doc } = get();
    if (!doc || resp.session_id !== doc.session_id) return;   // sesión obsoleta
    if (!resp.available) {
      set({ wordLayoutUnavailable: true });                   // D-a: aviso, sin mutar
      return;
    }

    const pagesById = new Map<string, number>(
      (resp.elements || []).map((e) => [e.element_id, e.page_start]),
    );
    let elementsChanged = false;
    const elements = doc.elements.map((el) => {
      const pn = pagesById.get(el.id);
      if (pn !== undefined && pn !== el.page_number) {
        elementsChanged = true;
        return { ...el, page_number: pn };
      }
      return el;
    });

    const nextCuts: Record<string, { offset: number; page: number }[]> = {};
    for (const c of resp.line_cuts || []) {
      if (c.cuts.length > 0) nextCuts[c.element_id] = c.cuts;
    }
    const cutsChanged =
      JSON.stringify(nextCuts) !== JSON.stringify(get().layoutCuts || {});
    const total = resp.total_pages ?? 0;
    const countChanged = total > 0 && doc.meta.page_count !== total;

    if (!elementsChanged && !cutsChanged && !countChanged) {
      // Respuesta idéntica → nada cambió → SIN layoutEcho → el hook NO
      // re-agenda. Este es el guard que corta el bucle de repaginación.
      if (get().wordLayoutUnavailable) set({ wordLayoutUnavailable: false });
      return;
    }

    set({
      doc: {
        ...doc,
        elements: elementsChanged ? elements : doc.elements,
        meta: countChanged
          ? {
              ...doc.meta,
              page_count: total,
              page_count_exact: true,
              page_layout_provider: resp.provider || 'com',
              page_layout_confidence: 1,
            }
          : doc.meta,
      },
      layoutCuts: nextCuts,
      layoutEcho: (get().layoutEcho || 0) + 1,
      wordLayoutUnavailable: false,
    });
  },
```

- [ ] **Step 4: Correr test, verificar GREEN**

Run: `npx vitest run src/__tests__/applyLayoutPagination.test.ts src/__tests__/useDocStore.test.ts && npx tsc --noEmit`
Expected: GREEN (5 + suite store existente); tsc limpio.

- [ ] **Step 5: Commit**

Run: `git add src/store/types.ts src/store/slices/documentSlice.ts src/__tests__/applyLayoutPagination.test.ts && git commit -m "feat(layout): applyLayoutPagination en store — idempotente con eco anti-bucle"`

---

### Task 8: Hook `useLayoutRepaginate` + cableado en PaperCanvas

**Files:**
- Create: `src/lib/useLayoutRepaginate.ts`
- Modify: `src/components/layout/PaperCanvas.tsx` (hook + expansión + invalidación de alturas)
- Test: `src/__tests__/useLayoutRepaginate.test.ts` (crear), `src/__tests__/layoutCuts.integration.test.tsx` (crear), `src/__tests__/pageGeometry.integration.test.tsx` (agregar mock de `../api/layout`)

**Interfaces:**
- Produces: `useLayoutRepaginate(doc)` — dispara el coalescer (~1.5s) salvo cuando el cambio viene de una respuesta aplicada (eco). `layoutCoalescer` exportado como singleton de módulo.
- PaperCanvas: `expandByLineCuts(doc.elements, layoutCuts)` alimenta `computePages`; se borran las alturas medidas de los ids con cortes; `layoutCuts` se lee del store.

- [ ] **Step 1: Escribir tests fallidos**

```ts
// src/__tests__/useLayoutRepaginate.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { useLayoutRepaginate } from '../lib/useLayoutRepaginate';

const paginateLayout = vi.fn();

vi.mock('../api/layout', () => ({
  paginateLayout: (...args: unknown[]) => paginateLayout(...args),
}));
vi.mock('../api/backend', () => ({
  uploadDocxFile: vi.fn(), updateElement: vi.fn(), getApiBase: vi.fn(),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://x'), fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(), explainElement: vi.fn(), suggestCaption: vi.fn(),
}));

const respOk = {
  session_id: 's1', available: true, provider: 'com', total_pages: 5,
  elements: [{ element_id: 'e0', page_start: 2 }],
  line_cuts: [], page_setup: null, elapsed_ms: 3,
};

describe('useLayoutRepaginate (debounce + eco)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    paginateLayout.mockReset().mockResolvedValue(respOk);
    useDocStore.setState({
      doc: { session_id: 's1', file_name: 't.docx',
             elements: [{ id: 'e0', type: 'paragraph', text: 'hola' } as any],
             meta: { page_count: 1 }, referencias: [] } as any,
      layoutCuts: {}, layoutEcho: 0, wordLayoutUnavailable: false,
    });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('muta el doc → 1 request tras la ventana; respuesta aplicada NO re-agenda', async () => {
    const { result, unmount } = renderHook(() => {
      const doc = useDocStore((s) => s.doc);
      useLayoutRepaginate(doc);
      return useDocStore((s) => s.layoutEcho);
    });

    // 1ª ventana: request
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(paginateLayout).toHaveBeenCalledTimes(1);
    expect(paginateLayout).toHaveBeenCalledWith('s1');

    // respuesta aplicada (layoutEcho 0→1) → el efecto corre pero NO re-agenda
    expect(result.current).toBe(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(4000); });
    expect(paginateLayout).toHaveBeenCalledTimes(1);   // guard de eco

    // edición de usuario (doc nuevo, eco sin cambio) → re-agenda
    await act(async () => {
      useDocStore.setState({
        doc: { ...useDocStore.getState().doc!, elements: [{ id: 'e0', type: 'paragraph', text: 'hola nuevo' } as any] },
      });
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(paginateLayout).toHaveBeenCalledTimes(2);
    unmount();
  });
});
```

```tsx
// src/__tests__/layoutCuts.integration.test.tsx
/** Fase 2: los cortes Word parten el elemento ANTES de computePages →
 *  cada fragmento cae en SU página (pág 2 existe y tiene su trozo). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { PaperCanvas } from '../components/layout/PaperCanvas';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(), resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(), suggestCaption: vi.fn(),
}));
vi.mock('../api/layout', () => ({ paginateLayout: vi.fn().mockResolvedValue({ session_id: 's1', available: false }) }));

describe('cortes Word en el canvas', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: {
        session_id: 's1', file_name: 't.docx', apa_format: 'student',
        elements: [{
          id: 'p1', type: 'paragraph', page_number: 1,
          text: 'AAA'.repeat(60) + 'BBB'.repeat(60),
          alignment: 'left', font_name: 'Times New Roman', font_size: 12,
          is_bold: false, is_italic: false, is_bullet: false,
          left_indent_cm: 0, confidence: 1, is_user_modified: false,
          needs_review: false, auto_applied: false, cita_ids: [],
        }],
        referencias: [], meta: { page_count: 1 },
      } as any,
      layoutCuts: { p1: [{ offset: 180, page: 2 }] },
      layoutEcho: 0, wordLayoutUnavailable: false,
    });
  });

  it('fragmenta en 2 hojas: la 2ª contiene solo el segundo tercio', () => {
    const { container } = render(<PaperCanvas />);
    const pageNodes = container.querySelectorAll('[id^="paper-page-"]');
    expect(pageNodes.length).toBe(2);
    const p1 = pageNodes[0].textContent || '';
    const p2 = pageNodes[1].textContent || '';
    const firstThird = 'AAA'.repeat(60);
    const lastThird = 'BBB'.repeat(60);
    expect(p1).toContain(firstThird.slice(0, 60));
    expect(p2).toContain(lastThird.slice(-60));
    expect(p2).not.toContain(firstThird.slice(0, 60));  // no duplica
    expect(p1).not.toContain(lastThird.slice(-60));
  });
});
```

Además, en `src/__tests__/pageGeometry.integration.test.tsx` agregar tras el mock existente:

```ts
vi.mock('../api/layout', () => ({ paginateLayout: vi.fn() }));
```

- [ ] **Step 2: Correr tests, verificar FALLA**

Run: `npx vitest run src/__tests__/useLayoutRepaginate.test.ts src/__tests__/layoutCuts.integration.test.tsx`
Expected: FAIL — hook módulo inexistente; integración: `pageNodes.length` = 1 (sin expansión).

- [ ] **Step 3: Implementar hook**

```ts
// src/lib/useLayoutRepaginate.ts
/**
 * WordAPA7 — Fase 2: repaginación en vivo.
 *
 * Cualquier mutación del doc agenda un POST /api/layout/paginate ~1.5s
 * después (coalescer compartido: 1 en vuelo, nunca encadenado).
 *
 * Guard de eco: aplicar una respuesta cambia doc + layoutEcho; ESE cambio
 * también re-ejecuta este efecto, y ahí no se re-agenda. Como la respuesta
 * es idempotente (Task 7), el bucle converge en ≤2 iteraciones.
 */
import { useEffect, useRef } from 'react';
import { DocumentModel } from '../types';
import { useDocStore } from '../store/useDocStore';
import { paginateLayout } from '../api/layout';
import { createLayoutCoalescer } from './layoutCoalescer';

async function sendPaginate(): Promise<void> {
  const { doc, applyLayoutPagination } = useDocStore.getState();
  if (!doc || !doc.session_id || doc.elements.length === 0) return;
  try {
    const resp = await paginateLayout(doc.session_id);
    useDocStore.getState().applyLayoutPagination(resp);
  } catch {
    // Best-effort: backend caído o sin Word → el canvas conserva su medición.
  }
}

/** Singleton de módulo: todas las instancias de PaperCanvas comparten 1 flujo. */
export const layoutCoalescer = createLayoutCoalescer({ delayMs: 1500, send: sendPaginate });

export function useLayoutRepaginate(doc: DocumentModel | null): void {
  const layoutEcho = useDocStore((s) => s.layoutEcho);
  const echoRef = useRef(layoutEcho);
  useEffect(() => {
    if (!doc) return;
    if (layoutEcho !== echoRef.current) {
      echoRef.current = layoutEcho;
      return;                       // eco: respuesta ya aplicada → no re-agendar
    }
    layoutCoalescer.schedule();
  }, [doc, layoutEcho]);
}
```

- [ ] **Step 4: Cablear PaperCanvas**

1. Imports (junto al de `pageSplitter`, línea ~14):

```ts
import { expandByLineCuts } from '../../lib/lineCuts';
import { useLayoutRepaginate } from '../../lib/useLayoutRepaginate';
```

2. Suscripción: agregar `layoutCuts` al desestructurado del store donde se obtiene `doc` (~línea 391), y el hook inmediatamente después (¡antes del `if (!doc) return null` de ~856, junto a los demás hooks):

```ts
  const layoutCuts = useDocStore((s) => s.layoutCuts);
  // ...
  useLayoutRepaginate(doc);
```

3. Invalidación de alturas tras llegar cortes (nuevo efecto junto a `measuredRef`, ~línea 424):

```ts
  // ── Fase 2: al llegar cortes Word, los ids se fragmentan (mismo id, >1
  //    nodos → querySelectorAll no re-mide) y conservarían la altura STALE
  //    del elemento COMPLETO. Se borra: el flow usa estimación por trozo o
  //    deja la página intacta (= verdad Word agrupada por page_number).
  const cutsKey = Object.keys(layoutCuts).join(',');
  useEffect(() => {
    const map = measuredRef.current;
    let changed = false;
    for (const id of Object.keys(layoutCuts)) {
      if (map.delete(id)) changed = true;
    }
    if (changed) setMeasureTick((t) => t + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cutsKey]);
```

4. Expansión (~línea 874):

```ts
    // ── Verdad Word: fragmenta por cortes reales ANTES de agrupar páginas ──
    const flowElems = expandByLineCuts(doc.elements, layoutCuts);
    const basePages = computePages(flowElems, Math.max(18, Math.floor((PAGE_H - 96) / 34)));
    const pages = applyPageFlow(basePages, measuredRef.current, geom);
```

(Los `computePages` de scroll en ~776 y ~810 quedan con `doc.elements`: el id compartido por fragmentos igual localiza la página correcta — no tocar.)

- [ ] **Step 5: Correr tests, verificar GREEN**

Run: `npx vitest run src/__tests__/useLayoutRepaginate.test.ts src/__tests__/layoutCuts.integration.test.tsx src/__tests__/pageGeometry.integration.test.tsx src/__tests__/pageSplitter.test.ts src/__tests__/pageSplitter.heading1.test.ts && npx tsc --noEmit`
Expected: GREEN; tsc limpio. Si `pageGeometry.integration` queja por timer abierto, su mock nuevo de `../api/layout` ya lo previene (el hook agenda, el timer real dispara tras 1.5s → `paginateLayout` mockeado → no hay red).

- [ ] **Step 6: Commit**

Run: `git add src/lib/useLayoutRepaginate.ts src/components/layout/PaperCanvas.tsx src/__tests__/useLayoutRepaginate.test.ts src/__tests__/layoutCuts.integration.test.tsx src/__tests__/pageGeometry.integration.test.tsx && git commit -m "feat(layout): hook de repaginacion en vivo + canvas consume cortes Word"`

---

### Task 9: StatusBar — conteo real + aviso D-a (eliminar estimación rival)

**Files:**
- Modify: `src/components/layout/StatusBar.tsx`
- Test: `src/__tests__/statusBar.pages.test.tsx` (crear)

**Interfaces:**
- Produces: `Pág. N` con `doc.meta.page_count` (verdad Word del último layout) o, sin layout aún, `computePages(elements).length` (la MISMA verdad del lienzo). Nunca `ceil(totalElements/14)`. Aviso `Se requiere Microsoft Word` cuando `wordLayoutUnavailable`.

- [ ] **Step 1: Escribir test fallido**

```tsx
// src/__tests__/statusBar.pages.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBar } from '../components/layout/StatusBar';
import { useDocStore } from '../store/useDocStore';

vi.mock('../api/backend', () => ({
  uploadDocxFile: vi.fn(), updateElement: vi.fn(), getApiBase: vi.fn(),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://x'), fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(), explainElement: vi.fn(), suggestCaption: vi.fn(),
}));
vi.mock('../api/layout', () => ({ paginateLayout: vi.fn() }));

const docWith = (pageCount: number, nElements: number) =>
  ({
    session_id: 's1', file_name: 't.docx',
    elements: Array.from({ length: nElements }, (_, i) => ({
      id: `e${i}`, type: 'paragraph', text: `parrafo ${i}`,
    })),
    meta: { page_count: pageCount },
    referencias: [],
  }) as any;

describe('StatusBar — paginación real', () => {
  beforeEach(() => {
    useDocStore.setState({ doc: null, layoutEcho: 0, wordLayoutUnavailable: false });
  });

  it('muestra meta.page_count (verdad Word), no ceil(elements/14)', () => {
    // 30 elementos → la estimación vieja diría 3; el layout real dice 9.
    useDocStore.setState({ doc: docWith(9, 30) });
    render(<StatusBar />);
    expect(screen.getByText(/Pág\.\s*9/)).toBeTruthy();
  });

 it('sin page_count cae al conteo del lienzo (computePages)', () => {
    useDocStore.setState({ doc: docWith(0, 3) });
    render(<StatusBar />);
    // 3 párrafos cortos caben en una hoja → 1
    expect(screen.getByText(/Pág\.\s*1/)).toBeTruthy();
  });

  it('aviso honesto cuando no hay Word (D-a)', () => {
    useDocStore.setState({ doc: docWith(4, 5), wordLayoutUnavailable: true });
    render(<StatusBar />);
    // Los mensajes de warnings viajan en el title del chip (no como texto visible).
    const badge = screen.getByText('1 aviso');
    expect(badge.getAttribute('title')).toContain('Se requiere Microsoft Word');
  });
});
```

- [ ] **Step 2: Correr test, verificar FALLA**

Run: `npx vitest run src/__tests__/statusBar.pages.test.tsx`
Expected: FALLA test 1 (muestra `3` en vez de `9`) y test 3 (sin aviso).

- [ ] **Step 3: Implementar**

En `src/components/layout/StatusBar.tsx`:

```ts
import { computePages } from './PaperCanvas';        // no hay ciclo: PaperCanvas no importa StatusBar
import { ElementModel } from '../../types';

const EMPTY_ELEMENTS: ElementModel[] = [];
```

- En el desestructurado del store (~línea 21): agregar `wordLayoutUnavailable`.
- **ANTES del `if (!doc) return null;` (~línea 31)** — los hooks deben ser incondicionales:

```ts
  // Hooks incondicionales (antes del early return): fallback = mismo computePages del lienzo.
  const elements = doc?.elements ?? EMPTY_ELEMENTS;
  const fallbackPages = React.useMemo(
    () => Math.max(1, computePages(elements).length),
    [elements],
  );
```

- Eliminar `const estimatedPages = Math.max(1, Math.ceil(totalElements / 14));` (línea 41).
- En `warnings` (~línea 43):

```ts
  if (wordLayoutUnavailable) {
    warnings.push('Se requiere Microsoft Word: paginación real no disponible');
  }
```

- Render (~línea 67):

```tsx
          Pág. {doc.meta?.page_count || fallbackPages}
```

- [ ] **Step 4: Correr tests, verificar GREEN**

Run: `npx vitest run src/__tests__/statusBar.pages.test.tsx && npx tsc --noEmit`
Expected: 3 passed; tsc limpio. Verificar que ninguna otra prueba dependía del texto viejo: `npx vitest run src/__tests__` (esperado: solo el fallo conocido `layout.test.tsx`).

- [ ] **Step 5: Commit**

Run: `git add src/components/layout/StatusBar.tsx src/__tests__/statusBar.pages.test.tsx && git commit -m "feat(layout): StatusBar muestra paginacion real Word, elimina estimacion rival /14"`

---

### Task 10: Cierre — verificación completa + documentación

**Files:**
- Modify: `plan-motor-rendimiento.md` (Fase 2 → completada)
- Modify: `.superpowers/sdd/2026-09-25-motor-rendimiento-fase1/progress.md` (o ledger Fase 2 equivalente: crear `.superpowers/sdd/2026-09-25-motor-rendimiento-fase2/progress.md` con los rulings)

- [ ] **Step 1: Suite backend completa**

Run: `pytest python/tests/ -q`
Expected: `518 + nuevos (≥10)` passed, `14 skipped`, 0 failed.

- [ ] **Step 2: Suite frontend completa**

Run: `npx vitest run 2>&1 | Select-String "Test Files|Tests "`
Expected: `1 failed` (SOLO el conocido `layout.test.tsx`, ajeno — lee fuente WIP) `| N passed`; ningún otro fallo.

- [ ] **Step 3: Tipos, build, lint**

```
npx tsc --noEmit        → 0 errores
npx vite build          → ✓ built
npm run lint            → 0 errores (warnings baseline ≤ 495)
```

- [ ] **Step 4: Verificación manual (usuario)**

Backend + dev server levantados (`python python/main.py`, `npm run dev` → http://localhost:5173):
1. Cargar `corpus/doc_01_limpio.docx` → abrir el log del backend y confirmar `[Layout] ... elapsed_ms` de `/api/layout/paginate`.
2. Editar un párrafo largo → sin tocar nada, ~1.5-2s después el `Pág. N` del StatusBar se actualiza al conteo de Word.
3. Si Word no está instalado/COM cae → StatusBar muestra `Se requiere Microsoft Word: paginación real no disponible` y el canvas NO se rompe (conserva medición DOM).

- [ ] **Step 5: Documentación + ledger + commit**

- `plan-motor-rendimiento.md`: Fase 2 `[x]` + nota de lo verificado.
- Ledger Fase 2: rulings (endpoint en `pagination.py` por main.py WIP; `src/api/layout.ts` aislado; `DocumentAIChat:384` fuera de alcance; clamp por desfase tablas; `with_cuts` solo en vivo).
- Run: `git add plan-motor-rendimiento.md docs/superpowers/plans/2026-09-25-motor-rendimiento-fase2.md .superpowers/sdd/ && git commit -m "docs: Fase 2 motor hibrido completada — checklist de verificacion"`

---

## Notas para el ejecutor

- Orden estricto: 1→10. Cada task: test RED verificado en consola → fix → GREEN verificado → commit. Si un test pasa en el primer run (RED no observado), borrar el módulo/producir el estado previo y re-validar (ruling de la Fase 1).
- `python/main.py`, `python/routers/system.py`, `src/App.tsx` y demás archivos WIP de la sesión paralela: NO se tocan, NO se commitean.
- Si `apply_inplace` resulta >3s en documentos grandes, no cambiar el diseño: anotarlo en el ledger (la spec acepta ~1.5s de debounce + cola; Fase 3 refinará el camino de edición).
- Fallback mental: cualquier respuesta `available:false` o error de red ⇒ el estado del canvas queda EXACTAMENTE como en Fase 1 (medición DOM + `page_number` previo). Ese es el contrato de no-regresión.
