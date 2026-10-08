# Plan — Fase 4: Doble capa PDF en reposo

**Goal:** Tras ~1.5s sin tecleo (mismo gate que Fase 2), backend exporta PDF de sesión (`ExportAsFixedFormat`) → frontend renderiza vía pdf.js **detrás** del texto HTML alineado por página. Al volver a teclear: capa PDF se oculta y HTML manda de nuevo. Alineación HTML↔PDF por offsets de página del layout real (mismo origen de verdad, sin doble predicción).

**Spec:** `docs/superpowers/specs/2026-09-25-motor-rendimiento-design.md` §3.1 Fase 4

**Base:** `feat/motor-render-fase1` (Fase 2 y Fase 3 completadas, 1659 tests en verde)

---

## Global Constraints

- Cero colores literales (hex, rgb, rgba) en TS/TSX. Solo tokens.
- Cero emojis. Solo lucide-react.
- `git add` explícito archivo por archivo. Nunca `git add -A`.
- NO toques `src/components/review/*`, `src/lib/auditItems.ts`, `src/store/slices/uiSlice.ts`.
- TDD: RED → GREEN antes de commitear cada tarea.
- Tests después de cada tarea: `npm test` y `pytest python/tests/`.

---

## Tasks

### Task 1: Endpoint backend `POST /api/layout/pdf-export`

**Produces:** `POST /api/layout/pdf-export` con body `{"session_id": "..."}` → 200 con `{session_id, available, provider, pdf_url, page_count, elapsed_ms}` o 200 con `{available: false, reason}` si Word no está disponible.

**Interface:** El endpoint reutiliza `ExportAsFixedFormat` (ya existe en `post_processor.py:154-163`) y el singleton `word_com_service`. No crea procesos nuevos.

**Tests:**
- `python/tests/test_layout_pdf_export.py` — contrato del endpoint (mock de `word_com_service`).

**Commits:**
1. `feat(layout): endpoint POST /api/layout/pdf-export (contrato + modelo)`

---

### Task 2: Hook frontend `usePdfRestLayer`

**Produces:** Hook `usePdfRestLayer` en `src/lib/usePdfRestLayer.ts` que:
- Escucha mutaciones del doc (mismo trigger que `useLayoutRepaginate`).
- Tras 1.5s sin cambios (mismo gate), llama `POST /api/layout/pdf-export`.
- Guarda el estado: `{ status: 'idle' | 'loading' | 'ready' | 'hidden', pdfUrl, pageCount }`.
- Al detectar una mutación nueva (tecleo), pasa a `hidden` (capa PDF se oculta, HTML manda).
- Expone `restLayerState` para que PaperCanvas sepa cuándo mostrar/ocultar la capa.

**Interface:** Consume `POST /api/layout/pdf-export` (Task 1). PaperCanvas consume `usePdfRestLayer`.

**Tests:**
- `src/__tests__/usePdfRestLayer.test.ts` — estado de reposo, loading, hidden.

**Commits:**
1. `feat(canvas): hook usePdfRestLayer (gate de reposo + estado capa PDF)`

---

### Task 3: Componente `PdfRestLayer`

**Produces:** Componente `PdfRestLayer` en `src/components/layout/PdfRestLayer.tsx` que:
- Recibe `pdfUrl` y `pageCount`.
- Usa pdf.js para renderizar cada página en un `<canvas>`.
- Se posiciona **detrás** del HTML (z-index menor, o `position: absolute` con `opacity` controlado).
- Respeta la alineación por offsets de página del layout real (mismo origen de verdad).
-Cuando `status === 'hidden'`, se desmonta o baja opacidad a 0.

**Interface:** Consume `pdfUrl` y `pageCount` de `usePdfRestLayer` (Task 2). Se integra en PaperCanvas.

**Tests:**
- `src/__tests__/pdfRestLayer.test.tsx` — renderizado, ocultar al teclear.

**Commits:**
1. `feat(canvas): componente PdfRestLayer (render pdf.js detrás del HTML)`

---

### Task 4: Integración en PaperCanvas

**Produces:** `PaperCanvas.tsx` consume `usePdfRestLayer` y renderiza `PdfRestLayer` detrás del texto HTML. La alineación HTML↔PDF usa los mismos `page_start` offsets que Fase 2 (mismo origen de verdad).

**Interface:** Consume `usePdfRestLayer` (Task 2) y `PdfRestLayer` (Task 3). Respeta la geometría existente (`PAGE_W`, `PAGE_H`, `geom.marginPx`).

**Tests:**
- `src/__tests__/pdfRestLayerIntegration.test.tsx` — integración completa: PDF se muestra en reposo, se oculta al teclear.

**Commits:**
1. `feat(canvas): integración PdfRestLayer en PaperCanvas (doble capa)`

---

### Task 5: Limpieza y verificación final

**Produces:** Tests completos pasando, documentación actualizada.

**Interface:** Ninguna nueva.

**Tests:**
- Suite completa: `npm test` + `pytest python/tests/`.

**Commits:**
1. `test(fase4): suite completa en verde`

---

## Pre-flight: shared interfaces

| Task | Produces | Consume | Status |
|------|----------|---------|--------|
| 1 | `POST /api/layout/pdf-export` | `ExportAsFixedFormat`, `word_com_service` | OK |
| 2 | `usePdfRestLayer` hook | Task 1 endpoint | OK |
| 3 | `PdfRestLayer` component | Task 2 hook | OK |
| 4 | PaperCanvas integration | Task 2 + Task 3 | OK |

No hay conflictos entre tasks.
