# Capa de rediseño de superficies — diseño

Fecha: 2026-10-04
Estado: propuesto (espera OK)
Precede a: `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md`
(ese megaplan dejó F0–F5; éste es una **capa más**, no su continuación).

## Contexto

Un inventario de las 36 superficies visibles de la app encontró que **ninguna
está libre de deuda**. La deuda no es heterogénea: se repite en cuatro ejes.
Eso es una buena noticia — una sola capa de consistencia arregla casi todo.

## Objetivo

Aplicar **una capa más de rediseño, pantalla por pantalla**, sin re-layout:
que cada superficie use los mismos tokens, la misma tipografía, la misma
profundidad y las mismas piezas, de modo que el programa se vea como **uno
solo** y no como pantallas cosidas.

## Los cuatro ejes

1. **Tokens canónicos.** Eliminar los alias legacy (`--accent-primary`,
   `--text-main`, `--text-secondary`, `--text-muted`, `--sidebar-bg`,
   `--surface-elevated`, `--surface-subtle`, `--canvas-bg`, `--bg-base`,
   `--border-color`, `--app-bg`) y los *fallbacks* hex/rgba inline
   (`var(--x, #4f7cff)`). Solo `--color-*`. Los alias siguen **declarados** en
   `design-system.css` para no romper nada; simplemente dejan de usarse.
2. **Tipografía.** Títulos de interfaz con `--font-display` (Outfit); cuerpo con
   `--font-sans` (Inter); cifras/código con `--font-mono` (JetBrains). Escala
   `--text-xs…3xl`. Nada de `font-size: 15px` suelto.
3. **Profundidad.** Los 10 `zIndex` fuera de escala entran en
   `--z-dropdown/overlay/modal/toast`. Nada por encima de `--z-toast`.
4. **Superficies canónicas.** Todo modal/panel/backdrop pasa por `Modal` /
   `Panel` / `Card` de `src/components/ui/wordapa7.tsx`, y todo backdrop usa
   `--scrim-overlay`.

## Reglas por superficie (ya decididas, no se re-litigan)

- Rail 56px **siempre** visible; el flyout no colapsa por paso.
- Revisión & IA: **un párrafo a la vez**; motores objetivos → Aceptar; detector
  de IA → solo "Marcar para revisar".
- Export: columna única alineada a la **izquierda**; sin resúmenes de hallazgos.
- Portada: carrusel con **selector central fijo** (`pages/portada.md`) y tarjeta
  responsiva al área de la fase.
- Toda transición/animación respeta `prefers-reduced-motion`.

## Invariantes (no negociables)

- Portada original **indivisible**; `use_original_cover` no la muta.
- `--paper-white` blanco puro y `--paper-ink` nítido en **ambos** temas; jamás
  `filter: brightness` sobre el papel.
- Cero emojis; iconos solo de `lucide-react` con `--icon-stroke`.
- `PaperCanvas` es el único paginador; `design-system.css` es la fuente única de
  tokens; no se crea `vitest.config.ts`.
- Ninguna UI afirma algo que el código no hace.

## Aceptación

- 0 alias legacy y 0 hex/rgba en el `.tsx` de UI (excepción **documentada**: el
  arte de canvas de `HomeHero`, que se convierte a tokens con nombre propio).
- 0 `zIndex` fuera de la escala `--z-*`.
- 100% de los modales pasan por `Modal`.
- `npx vitest run` ≥ 1401 verdes · `npx tsc --noEmit` limpio ·
  `pytest -q` ≥ 809 passed/14 skipped · `npm run build` OK.
- Cada fase es **un commit atómico** con su guardián mutado (si el guardián no
  cae al mutar, se investiga antes de seguir).

## Riesgos y mitigación

- **Visual** (bajo): es consistencia, no re-layout. Cambios de color son
  equivalentes (los alias ya resuelven a los mismos `--color-*`).
- **Tests de tokens** (medio): `noHardcodedColors.test.ts` y
  `designTokens.test.ts` vigilan esto. Mitigación: correrlos por fase.
- **Matices intencionales** (bajo): el arte de `HomeHero` se preserva
  convirtiéndolo a tokens, no aplanándolo.
- Mitigación global: fase por fase, tests focalizados, `git restore` inmediato
  ante regresión.
