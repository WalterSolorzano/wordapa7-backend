# SDD ledger — plan: docs/superpowers/plans/2026-10-03-estructura-redesign.md

Rama: `feat/motor-render-fase1`. Commit final del rediseño: `16918af`.

Ruling: sin worktree — el estado vivo de la app (intento previo sin commitear) está en el árbol
de trabajo; un worktree desde HEAD lo descartaría. Costo si me equivoco: se trabaja directo
en la rama de feature.

## Tareas

- Task 1: complete (commit `2529715`, tests: `npx vitest run designTokens.test.ts noHardcodedColors.test.ts` → 37/37 pass). Tokens `--font-display`/`--font-editorial`/`--color-secondary`/`--color-ink`/`--color-level-3`; warning recolorado a terracota `#c0562e` (claro) / `#e08a63` (oscuro); fuentes Outfit + JetBrains Mono agregadas a `package.json` y `src/main.tsx`.
- Task 2: complete (commit `412152e`, tests: `estructuraEstaMontada.test.tsx` → rojo confirmado 6 fallan / 4 pasan, contrato nuevo). Guardián reescrito con el contrato de 3 columnas + prosa al tocar.
- Task 3: complete — shell `EscritorioEstructura` (grid 308px | 1fr | 452/760/44px) + `IndiceEstructura` puro (sin toggle documento/mapa) + `NodoIndice` con jerarquía real (Outfit 700 H1 / 500 H2 / 400 H3).
- Task 4: complete — `MapaEstructura` responsive (`data-testid="diagrama-estructura"`, `lv1/lv2/lv3`, aristas animadas, `{n.etiqueta}` dentro de `<text>`), CSS en `src/styles/estructura.css` con `prefers-reduced-motion`.
- Task 5: complete — `LecturaProsaSeccion` 100% tokens, `data-testid="prosa-seccion"` en el raíz, hoja editorial `--font-editorial`, subsecciones visibles aunque no haya párrafos.
- Task 6: complete — `App.tsx` monta `EscritorioEstructura` en `wizardStep === 2`; borrados `EstudioEstructuraView`, `EsqueletoNavegacion`, `DiagramaAnatomicoSVG`, `InspectorActivosSeccion` + sus 4 tests; conservados `DistribucionVolumen`/`MatrizEvidencias`/`ReorganizadorCapitulos` (plegables, cerrados por defecto) en `panel-herramientas`.
- Task 7: complete — suite completa `npx vitest run` → **1709/1709 pass, 170 archivos**; `npm run build` → sin errores TS (solo aviso pre-existente de dynamic-import de `src/api/backend.ts`). Todo commiteado en `16918af`.

## Rulings

- Sin worktree: se trabajó directo en `feat/motor-render-fase1` porque el árbol tenía trabajo vivo sin commitear de otras fases.
- Los 3 módulos de análisis (`DistribucionVolumen`/`MatrizEvidencias`/`ReorganizadorCapitulos`) NO se borran: `suiteEstructuraModular.test.tsx` los exige. Se pliegan y arrancan cerrados para no duplicar títulos en el DOM y no romper `getByText('2. Metodología')`.
- El merge a master quedó bloqueado: master y la rama son líneas frontend divergentes (master NO tiene `src/components/structure/`). Merge local abortado. Cherry-pick de `16918af` abortado (arrastra shell/proyectos/export/rail, no solo estructura). Decisión del usuario: mantener el rediseño en la rama.

## Artefactos

- Spec: `docs/superpowers/specs/2026-10-03-estructura-redesign-design.md`
- Plan: `docs/superpowers/plans/2026-10-03-estructura-redesign.md`
- Mockup: `docs/superpowers/mockups/2026-10-03-estructura-redesign.html`
