# Plan — Motor de render/edición híbrido (brainstorming → spec)

Clasificación: **ARQUITECTURAL** (reestructura subsystem de render + edición + fidelidad export).

Checklist (brainstorming):
- [x] Explorar contexto (PaperCanvas, export pipeline, COM)
- [x] Preguntas clarificadoras (una por mensaje)
- [x] Proponer 2-3 enfoques con trade-offs
- [x] Presentar diseño por secciones (aprobación por sección)
- [x] Escribir spec en `docs/superpowers/specs/2026-09-25-motor-rendimiento-design.md` + commit
- [x] Auto-review del spec
- [x] Usuario revisa spec
- [x] Invocar writing-plans

Hallazgos clave (exploración):
- Render: `computePages` heurístico puro (units), cero medición DOM; hoja `overflow:hidden` recorta texto → desborde.
- Paginación real Word ya existe (`page_layout_provider.paragraph_pages` → `elem.page_number`) pero `computePages` no la consume.
- Export: in-place mutate de docx original + Word COM post-proceso (`_apply_apa_styles`, `_enforce_layout`, TOC update, ExportAsFixedFormat PDF). Bug: `inplace_editor.py:143` lee `font_size` en vez de `font_size_pt`.
- COM: singleton `word_com_service.py` (DispatchEx + GIT marshalling), guards triple capa COM→LO→heurístico.
- Edición: textarea overlay, no contentEditable; sin reflow.
- Canvas ignora `margins_cm`, `rules.page_size`, `line_spacing` en headings/tablas.

## Estado por fase (spec §3.1)

- [x] **Fase 1 — Fin del desborde (geometría real)** — completada, commit rama `feat/motor-render-fase1`:
  - `inplace_editor.py` font_size_pt fix (2bf154f)
  - `src/lib/pageGeometry.ts` — Letter 816×1056 / A4 793×1123, márgenes reales (bf3fca6)
  - `computePages` consume `elem.page_number` Word con fallback heurístico (db7a623)
  - `src/lib/flowPagination.ts` — split por líneas, sin pérdida (1bff3f4)
  - Integración: PAGE_W/H + padding geom real + `applyPageFlow` (medición DOM `measuredRef` → parte párrafos que exceden la hoja) (3142931)
  - Verificación: `npx tsc --noEmit` 0 errores · `pytest python/tests/` 518 passed/14 skipped · `npm run lint` 0 errores · `npx vite build` ✓ · `npx vitest run` 159/160 (1 fallo ajeno: `layout.test.tsx` lee RightSidePanel WIP sesión paralela)
- [x] **Fase 2 — `POST /api/layout/paginate`** (COM `Repaginate`, singleton `word_com_service`) + debounce frontend + eliminar estimaciones rivales (StatusBar `/14`, DocumentAIChat). Plan dedicado al entrar.
  - Backend: `LayoutPaginateRequest` modelo + endpoint en `routers/pagination.py` (6a7a327)
  - Servicio `layout_service.paginate_session` — materializa con `apply_inplace`, pagina con `COMPageLayoutProvider(with_cuts=True)`, mapea párrafo→elemento con clamp (6a7a327)
  - `page_layout_provider`: `cuts_for_range` (binary search sobre rangos colapsados) + `page_setup_dict` (6a7a327)
  - Frontend: `src/api/layout.ts` (módulo aislado), `layoutCoalescer` (debounce 1.5s, 1 en vuelo), `expandByLineCuts` + guards `split_chunk` en `pageSplitter` (6a7a327)
  - Store: `applyLayoutPagination` idempotente con eco `layoutEcho` (6a7a327)
  - Hook `useLayoutRepaginate` + PaperCanvas consume `expandByLineCuts` antes de `computePages` (6a7a327)
  - StatusBar: `meta.page_count` real + aviso D-a `Se requiere Microsoft Word` (bb054e7)
  - Verificación: `pytest python/tests/` 1050 passed/14 skipped · `npx vitest run` 1638 passed (9 fallos ajenos: foco/estructura, proyectos F8, tokens rediseño) · `npx tsc --noEmit` 0 errores · `npx vite build` ✓ · `npm run lint` 4 errores ajenos (homeHeroAire, tokensDeclarados)
- [ ] **Fase 3 — Edición inline B1** (contentEditable acotado a párrafo de cuerpo; headings/citas/tablas/imagen conservan panel).
- [ ] **Fase 4 — Doble capa** — PDF en reposo vía pdf.js detrás del HTML (`PDFPreview.tsx` base).
- [ ] **Fase 5 — Paridad export** + guards COM duro (eliminar LibreOffice/heurístico de render/export).
