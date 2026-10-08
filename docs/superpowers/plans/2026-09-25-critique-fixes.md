# Plan — Fixes de la crítica de diseño (Revisión & IA + Exportación)

Fuente: `.impeccable/critique/2026-09-26T02-33-07Z__src-components-wizard-step5auditiawizard-tsx.md`
(Design Health Score 26/40 — 2 P0, 2 P1, 1 P2, 4 advisories + menores).

## Global Constraints

- **Cero emojis** en toda UI; iconos solo `lucide-react`.
- **Solo design tokens CSS**: prohibido hex/rgba literales en TSX. Tokens nuevos se definen en `src/styles/design-system.css` con `var(--token)`.
- Copy en español, tono sobrio/académico del producto.
- Verificación obligatoria antes de reportar DONE: `npx tsc --noEmit` exit 0, `npm test` (164 tests) verde, `npm run build` exit 0.
- Un commit convencional por tarea (`fix|refactor|test(scope): …`).
- El implementador NUNCA despacha subagentes ni revisores.
- Sin dependencias nuevas. Sin tocar archivos fuera del alcance de la tarea.
- Estado actual del repo: rama `feat/motor-render-fase1`, HEAD base `c73e590`.

## Task 1 — [P0] Resaltado inline real en párrafos/listas/imágenes/tablas

**Problema:** `reviewHighlightIds` solo se consume en la rama de encabezados de
`src/components/layout/PaperCanvas.tsx` (~línea 2038). Párrafos, items de lista,
imágenes y tablas lo ignoran → la mayoría de hallazgos (IA, ortografía, citas)
no produce resaltado en el documento.

**Cambio:**
- En las ramas de render de párrafo (`<p>`), item de lista, contenedor de
  imagen y contenedor de tabla, añadir
  `backgroundColor: reviewHighlightIds?.has(elem.id) ? 'var(--color-accent-soft)' : 'transparent'`
  (ajustar al nombre real del token de acento suave existente).
- Preservar el comportamiento actual de encabezados. Unicidad de marca: no
  duplicar estilos; si el highlight es idéntico en 5 ramas, extraer helper
  `reviewHighlightStyle(id)` en el mismo archivo.

**Aceptación:** con `reviewHighlightIds` poblado, cualquier tipo de elemento
resaltado muestra el fondo; sin el prop, render idéntico al actual; sin regresión
de perf (lookup de Set, sin cálculos por render).

## Task 2 — [P0] Accesibilidad de teclado en la vista de revisión

**Problema:** interacción de hallazgos 100% mouse.

**Cambios:**
1. `src/components/wizard/Step5AuditIAWizard.tsx`: cabeceras de grupo de motor
   (~línea 999) y filas de subtipo (~línea 1119) son `<div onClick>`. Convertir
   a `<button>` reales con `aria-expanded` (cabeceras) y, si la fila colapsa,
   igual en fila; focus visible nativo; sin `div` con `role` inventado.
2. `src/components/wizard/ReviewMinimap.tsx`: implementar navegación con
   flechas ←/→ (roving tabindex: UNA parada de tab para todo el minimapa,
   `aria-label` descriptivo); el área de click efectiva ≥4px aunque el mark
   visual siga de 1-2px (pseudo-elemento o padding, sin cambiar el layout de
   19px).
3. `src/components/layout/DownloadSuccessOverlay.tsx`: el auto-hide de 8s
   libera el foco. Cancelar/pausar el timer mientras el foco esté dentro del
   overlay (listener `focusin`/`focusout`), reanudar al salir.

**Aceptación:** con teclado se puede expandir/colapsar grupos, activar filas de
subtipo, navegar el minimapa con flechas y mantener foco en el overlay más de
8s. `tsc`/`test`/`build` verdes.

## Task 3 — [P1] Estado honesto + errores por motor + copy

**Problema:** métricas fabricadas pre-scan y fallos silenciados.

**Cambios en `src/components/wizard/Step5AuditIAWizard.tsx` (+ store si apara):**
1. Defaults inventados: `aiGlobalScore || 0.08` y
   `apaComplianceScore = Math.max(70, …)` → mostrar "—" / "Sin analizar"
   cuando no hay datos de un scan real (definir "sin datos" = aún no corrió el
   motor o el último resultado fue fallido). NO inventar 8% ni 100%.
2. `handleScanAll` usa `Promise.allSettled` con ramas catch muertas → revisar
   cada resultado: si algún motor falló, toast de error/aviso nombrando el
   motor fallido; éxito solo si todos OK.
3. Tooltips "Ocultación anterior/siguiente" → "Ocurrencia anterior/siguiente".
4. Unificar nombre de pantalla: header "Revisión & Calidad IA" vs StepRail
   "Revisión & IA" → un solo nombre (usar "Revisión & IA").

**Aceptación:** sin porcentajes falsos pre-scan; fallo de motor produce aviso
con nombre del motor; copy corregido; tests verdes.

## Task 4 — [P1] Design tokens: eliminar hex/rgba hardcodeados y namespace dual

**Problema:** viola regla innegociable de AGENTS.md.

**Cambios en `src/components/wizard/Step5AuditIAWizard.tsx` (+ CSS si hace falta):**
1. `color: '#ffffff'` (~líneas 899, 1021, 1418) → token adecuado
   (p. ej. `var(--color-text-on-accent)`; verificar nombre real en
   design-system.css, si no existe crearlo derivado del token primario).
2. Tintes de severidad `rgba(220,38,38,0.12)` (y similares si los hay) →
   nuevo token `--severity-critical-soft` en `src/styles/design-system.css`
   (definir con `color-mix` o el rgba exacto SOLO ahí, nunca en TSX).
3. Borrar código muerto: `ICON_PALETTES`, `summaryItemStyle`, `iconBox` (tras
   verificar 0 usos).
4. Unificar `--color-accent` vs `--accent-primary`: auditar apariciones en el
   archivo; elegir UN namespace canónico (el que ya domine en
   design-system.css) y migrar las apariciones de esta vista. Si la
   migración toca otros archivos, limitar a alias en CSS, no reescribir otros
   componentes.

**Aceptación:** `grep` de hex/rgba en Step5AuditIAWizard.tsx = 0 literales de
color; tokens definidos una sola vez en design-system.css; visual sin cambio
de color efectivo; tests verdes.

## Task 5 — [P2] Unificar paginación del minimapa/badges con `computePages`

**Problema:** `elementPageMap` (heurística 1800 chars, ~líneas 171-185 de
Step5AuditIAWizard) usa otro algoritmo que `computePages` → marcas y badge
"Pág. X" pueden contradecir al lienzo.

**Cambio:** derivar el mapa del paginador real:
`pages.findIndex(p => p.some(e => e.id === elemId)) + 1` con `pages =
computePages(...)` (mismo origen que PaperCanvas/goToPage). Mantener fallback
para elementos no paginados = página 1 o descartarlos, decisión documentada
en el código.

**Aceptación:** para cualquier elemento, la página del minimapa, el badge y el
scroll de `goToPage` coinciden; sin doble cómputo por render (useMemo sobre
`pages`); tests verdes.

## Task 6 — Batch: advisories del detector + menores

1. `src/components/layout/DownloadSuccessOverlay.tsx` líneas 62, 80, 98:
   `fontSize: 11px` fuera del ramp de DESIGN.md → usar 12px (body) o el token
   existente más cercano del ramp tipográfico.
2. `src/components/wizard/ReviewMinimap.tsx:72`: `borderRadius: 1px` fuera de
   la escala `rounded` → `var(--radius-sm)`/`4px` de la escala, o si 1px es
   deliberado (mark de 2px de ancho) usar `var(--radius-full)` equivalente —
   justificar en el reporte.
3. `src/components/export/ExportView.tsx:17`: import pegado (`;import`) →
   newline.
4. `Step5AuditIAWizard.tsx`: listener Ctrl+S sin dep array → estabilizar
   (deps `[doc…]` o ref) para no re-registrar por render.
5. `DownloadSuccessOverlay.tsx`: línea de descripción sin truncar → aplicar
   clamp de 1 línea (ellipsis) para `file_name` largo, manteniendo ≤50ch.
6. `Step5AuditIAWizard.tsx`: "Marcar para revisar" es unidireccional
   (`markedIds` solo agrega) → hacer toggle: si ya está marcado, el botón
   permite desmarcar (mismo estilo fantasma, texto "Desmarcar").

**Aceptación:** detector `impeccable detect` sobre los 5 archivos → 0
hallazgos advisory; fixes 3-6 verificados en código; tests verdes.

## Deferred (no en este plan — parked en ledger)

- Progreso/cancelación de "Aceptar todas" (feature nueva).
- Persistencia de markedIds/dismissedItemIds (requiere store persist).
- Contraste de badge de chip inactivo (revisar tras Task 4 con tokens unificados).
