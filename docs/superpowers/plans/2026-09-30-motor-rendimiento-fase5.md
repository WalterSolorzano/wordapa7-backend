# Plan — Fase 5: Fidelidad de export + guards COM duro

**Spec:** `docs/superpowers/specs/2026-09-25-motor-rendimiento-design.md` sección 3.1 Fase 5
**Fecha:** 2026-09-30
**Rama:** `feat/motor-render-fase1`

## Objetivo

Cerrar el motor híbrido con:
1. Paridad canvas ↔ docx exportado (mismos inputs → mismos outputs)
2. Guards D-a duros: sin Word → error claro, sin fallback LO/heurístico en rutas de render/export
3. Tests de paridad y regresión

## Tareas

### T1 — Guard D-a en `doc_converter.get_active_engine` (RED → GREEN)

**Archivo:** `python/services/doc_converter.py`

**Cambio:**
- Eliminar fallback LibreOffice de `get_active_engine()`
- Si `FORCE_ENGINE=LO` → retornar "NONE" (no LO)
- Si no hay COM → retornar "NONE"
- Eliminar rama `elif engine == "LO"` de `process_and_convert()`
- Si `engine == "NONE"` → retornar `(False, None)` con warning

**Tests RED:**
- `test_get_active_engine_no_com_returns_none` — sin COM → "NONE"
- `test_get_active_engine_force_lo_returns_none` — FORCE_ENGINE=LO → "NONE"
- `test_process_and_convert_no_engine_returns_false` — sin motor → `(False, None)`

---

### T2 — Guard D-a en `page_layout_provider.get_page_layout_provider` (RED → GREEN)

**Archivo:** `python/parsing/page_layout_provider.py`

**Cambio:**
- `get_page_layout_provider()` retorna `COMPageLayoutProvider` o `None`
- Eliminar fallback a `LibreOfficePageLayoutProvider` y `HeuristicPageLayoutProvider`
- Si no hay COM → retornar `None`

**Tests RED:**
- `test_get_page_layout_provider_no_com_returns_none` — sin COM → `None`
- `test_get_page_layout_provider_com_available` — con COM → `COMPageLayoutProvider`

---

### T3 — Guard D-a en rutas de render/export de `main.py` (RED → GREEN)

**Archivo:** `python/main.py`

**Cambio:**
- En `/api/generate` y `/api/export-pdf`: si `doc_converter.get_active_engine() != "COM"` → `HTTPException(503, "Se requiere Microsoft Word")`
- Eliminar fallback LO en `/api/export-pdf` (líneas 1748-1754)
- Eliminar fallback `process_and_convert` en `/api/export-pdf` (líneas 1757-1767)

**Tests RED:**
- `test_generate_no_com_returns_503` — sin COM → 503
- `test_export_pdf_no_com_returns_503` — sin COM → 503

---

### T4 — Tests de paridad canvas ↔ docx (GREEN)

**Archivo:** `python/tests/test_parity_canvas_docx.py`

**Tests:**
- `test_parity_margins_cm` — mismo `margins_cm` → mismo padding en canvas y docx
- `test_parity_page_size` — mismo `page_size` → mismas dimensiones en canvas y docx
- `test_parity_line_spacing` — mismo `line_spacing` → mismo espaciado en canvas y docx
- `test_parity_font_size_pt` — mismo `font_size_pt` → mismo tamaño en canvas y docx

---

### T5 — Tests de regresión para guards D-a (GREEN)

**Archivo:** `python/tests/test_guards_com.py`

**Tests:**
- `test_no_libreoffice_fallback_in_doc_converter` — `process_and_convert` nunca usa LO
- `test_no_heuristic_fallback_in_page_layout` — `get_page_layout_provider` nunca retorna heurístico
- `test_layout_service_no_com_returns_unavailable` — `paginate_session` sin COM → `available: False`

---

## Restricciones

- Cero colores literales (hex, rgb, rgba) en TS/TSX
- Cero emojis
- `git add` explícito archivo por archivo
- No romper guards existentes
- NO tocar `src/components/review/*`, `src/lib/auditItems.ts`, `src/store/slices/uiSlice.ts`

## Criterios de aceptación

- [ ] T1-T3: guards D-a en su lugar, tests en verde
- [ ] T4: tests de paridad pasando
- [ ] T5: tests de regresión pasando
- [ ] Suite completa: 1659+ tests pasando
- [ ] Commits por tarea
