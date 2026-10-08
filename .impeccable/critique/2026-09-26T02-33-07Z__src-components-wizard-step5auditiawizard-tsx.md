---
target: vistas Revisión & IA y exportación (Step5AuditIAWizard + ExportView)
total_score: 26
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 2
target_identity: "file:C:\\Users\\--X\\.gemini\\antigravity\\scratch\\wordapa7\\src\\components\\wizard\\Step5AuditIAWizard.tsx"
target_fingerprint: "sha256:21b7c53225e0f2cd36486fa612003a5d1c3ca4f43bc52b5ffc1c1ca7d2c12d01"
target_path: "C:\\Users\\--X\\.gemini\\antigravity\\scratch\\wordapa7\\src\\components\\wizard\\Step5AuditIAWizard.tsx"
timestamp: 2026-09-26T02-33-07Z
slug: src-components-wizard-step5auditiawizard-tsx
---
# Crítica de diseño — Vista "Revisión & IA" + Pantalla final de exportación

## Design Health Score

| # | Heurística | Score | Problema clave |
|---|-----------|-------|----------------|
| 1 | Visibilidad del estado del sistema | 2 | `aiGlobalScore` default 8% y cumplimiento 100% *antes de* escanear; `Promise.allSettled` hace que el toast "Auditoría integral completada" salga aunque los 3 motores fallen |
| 2 | Match sistema / mundo real | 3 | Vocabulario académico excelente; tooltips "Ocultación anterior" (debía ser "Ocurrencia"), "Arreglar Todo" rompe el tono sobrio |
| 3 | Control y libertad del usuario | 2 | "Aceptar todas" muta `updateElementText` sin undo; `markedIds` solo agrega — no se puede desmarcar |
| 4 | Consistencia y estándares | 3 | Gramática de certeza sólido/fantasma ejemplar; conviven `--color-accent-soft` y `--accent-primary` + hex hardcodeados |
| 5 | Prevención de errores | 2 | Edits en lote sin confirmación; el friction de citas fantasma se salta con "Descargar igual" a un clic |
| 6 | Reconocimiento sobre memoria | 3 | Contadores `×N`, chips, `1/5` ayudan; estado marcado/descartado vive solo en memoria del componente |
| 7 | Flexibilidad y eficiencia | 3 | Ctrl+S y "Siguiente hallazgo" existen; sin atajo para siguiente/aceptar, sin roving focus en minimapa |
| 8 | Estética y diseño minimalista | 3 | Export limpio; en revisión dos barras de igual peso + HUD de 3 stats compiten |
| 9 | Recuperación de errores | 2 | Toasts genéricos sin detalle; fallo de lote muestra solo conteo agregado |
| 10 | Ayuda y documentación | 3 | Buenos tooltips y subtítulos de motor; sin hints de atajos ni guía de primera ejecución |
| **Total** | | **26/40** | **Acceptable (65%)** |

## Design Specificity Verdict

**Evaluación LLM**: Específico de este producto — taxonomía de motores ("Citas Fantasma & Huérfanas", "Objetivos de Bloom", "Tildes diacríticas", "Figura/Tabla sin rotular APA 7"), copy en español académico, fricción citas→Crossref, Track Changes, "Copiar PDF para WhatsApp", hoja Times New Roman: una SaaS genérica no produciría esto. Excepción: la pantalla de exportación ("Exportación Rápida / Tu archivo está listo") es copy SaaS boilerplate.

**Escaneo determinista**: `impeccable detect` exit 0, 4 hallazgos advisory: `design-system-font-size` ×3 (`DownloadSuccessOverlay.tsx:62,80,98` — `fontSize: 11px` fuera del ramp de DESIGN.md), `design-system-radius` ×1 (`ReviewMinimap.tsx:72` — `borderRadius: 1px` fuera de la escala `rounded`). `Step5AuditIAWizard`, `StepRail`, `ExportView`: limpios.

**Overlays visuales**: NO disponible — `Error: [browser.disconnected] No desktop browser is connected to this session`. Sin overlay confiable; señal fallback: Vite sirvió en `localhost:5173` y ambas vistas están gating en `if (!doc) return null` (`ExportView.tsx:152`).

## Overall Impression

La arquitectura espacial funciona: el salto densidad-máxima → columna mínima ejecuta bien la regla peak-end, y la gramática de certeza (sólido = objetivo, fantasma = probabilístico) es rara y honesta. Lo que no funciona: la promesa central de la vista de revisión —resaltado inline en el documento— solo se cumple para encabezados, y toda la interacción de hallazgos es mouse-only. La oportunidad más grande: hacer que el resaltado y el teclado funcionen antes que nada más.

## What's Working

1. **Acciones por certeza**: el motor IA solo explica y marca ("Marcar para revisar" con tooltip "el motor solo indica probabilidad"), nunca "Aceptar". Interfaz que admite su propia incertidumbre.
2. **Agrupación motor → subtipo con `×N`**: un solo grupo crítico abierto por defecto antifatiga correcto para cientos de hallazgos.
3. **Auto-colapso de `StepRail` a 56px en paso 5** (`StepRail.tsx:31-41`): "el espacio sigue la tarea", implementado limpio con restauración al salir.

## Priority Issues

**[P0] `reviewHighlightIds` nunca llega a los párrafos.**
- **Por qué importa**: PaperCanvas consume el prop solo en la rama de encabezados (`PaperCanvas.tsx:2038`); párrafos, listas, imágenes y tablas lo ignoran. La mayoría de hallazgos (IA, ortografía, citas) produce **cero** resaltado inline — la promesa central de la pantalla.
- **Fix**: añadir `backgroundColor: reviewHighlightIds?.has(elem.id) ? 'var(--color-accent-soft)' : 'transparent'` en las ramas `<p>`/item y en las raíces de imagen/tabla.
- **Suggested command**: `harden`

**[P0] Navegación primaria invisible para teclado.**
- **Por qué importa**: cabeceras de grupo (`Step5:999`) y filas de subtipo (`Step5:1119`) son `<div onClick>` sin `role`/`tabIndex`/`aria-expanded`; el minimapa inyecta 300+ botones de 2px sin roving tabindex; el overlay se auto-oculta a 8s soltando el foco. Flujo de hallazgos = mouse-only.
- **Fix**: cabeceras a `<button aria-expanded>`; minimapa con navegación por flechas y targets ≥4px; cancelar el timer de 8s si el foco está dentro.
- **Suggested command**: `harden`

**[P1] Estado fabricado + fallos silenciados.**
- **Por qué importa**: `aiGlobalScore = … || 0.08` y `apaComplianceScore = Math.max(70,…)` inventan números pre-scan; `allSettled` ramifica catch como código muerto — fallo total hace toast de éxito.
- **Fix**: mostrar "—" / "Sin analizar" hasta tener datos reales; inspeccionar resultados de `allSettled` y toast por motor fallido.
- **Suggested command**: `clarify`

**[P1] Violaciones de tokens y doble namespace de color.**
- **Por qué importa**: `color: '#ffffff'` (`Step5:899,1021,1418`), tintes `rgba(220,38,38,0.12)`, `ICON_PALETTES` con hex muerto, split `--color-accent` vs `--accent-primary` — rompe regla innegociable de AGENTS.md.
- **Fix**: `var(--accent-primary)`, `var(--color-danger)` al 12% vía token `--severity-critical-soft`; borrar `ICON_PALETTES`/`summaryItemStyle`/`iconBox` muertos.
- **Suggested command**: `colorize`

**[P2] Minimap y badges pagan con otro algoritmo de paginación que el lienzo.**
- **Por qué importa**: `elementPageMap` usa heurística de 1800 chars (`Step5:171-185`) mientras `computePages` gobierna canvas y `goToPage` — en tesis largas las marcas caen mal y "Pág. 47" ≠ "Página 47 de N".
- **Fix**: derivar el mapa invirtiendo `pages`: `pages.findIndex(p => p.some(e => e.id === id)) + 1`.
- **Suggested command**: `layout`

## Persona Red Flags

- **Sam (accesibilidad)**: Tabular por la vista de revisión salta toda cabecera de motor y toda fila de subtipo — workflow de hallazgos 100% mouse. El minimapa añade ~300 paradas de tab de 2px. Contraste del badge de chip inactivo casi invisible.
- **Riley (stress tester)**: Documento de 240 páginas — `elementPageMap` agrupa marcas al inicio mientras el canvas dice otra cosa; "Aceptar todas" itera `acceptOne` en serie con un solo spinner, sin progreso ni cancelación; recargar pierde `dismissedItemIds` y reaparece todo.
- **Alex (power user)**: Marca un párrafo y no puede desmarcarlo (botón queda `disabled`); ningún atajo para aceptar-siguiente; refrescar revierte aceptados y descartados.

## Minor Observations

- Typos de tooltip: "Ocultación anterior/siguiente" → "Ocurrencia".
- Detector advisory: `fontSize: 11px` ×3 en `DownloadSuccessOverlay` (fuera del ramp); `borderRadius: 1px` en `ReviewMinimap` (fuera de `rounded`).
- `ExportView.tsx:17` — import `resolveAssetUrl` pegado a la línea anterior (`;import`).
- Listener Ctrl+S sin dep array, se re-registra en cada render.
- Una línea del overlay no trunca: `file_name` largo rompe la regla ≤50ch.
- "Revisión & Calidad IA" (header) vs "Revisión & IA" (StepRail) — mismo screen, dos nombres.

## Questions to Consider

- Si "marcar" es el único verbo del motor IA, ¿qué artefacto produce un "Marcado"? Si nada persiste, ¿no es un delete con pasos extra?
- ¿Por qué la pantalla de export dice "listo para descargar" *antes* de que corra la exportación y anuncia éxito en `onMount`?
- ¿Vale 19px de pantalla permanentes un minimapa cuyas marcas se calculan con una paginación que el canvas no usa?
- ¿Qué impide leer "Cumplimiento APA 100%" pre-scan como "mi tesis está perfecta" y exportar a ciegas?
