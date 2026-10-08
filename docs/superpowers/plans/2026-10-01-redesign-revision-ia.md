# Plan de Implementación: Traslado a Producción de Revisión & IA (Paso 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trasladar la arquitectura validada en `ReviewMockupStudio.tsx` a los componentes de producción de la aplicación (`ReviewWorkbench.tsx`, `ReviewStrip.tsx`, `EngineGroupCard.tsx`, nuevo `AiHierarchy.tsx`), con resolución por lotes, navegación capitular H1, mapa jerárquico H1→H2→H3 de IA, tipografía/subrayados académicos según muestra, mascotas editoriales reactivas y cero botones rotos.

**Architecture:** Mantiene el hook puro `useReviewWorkbench.ts` y la capa de efecto `useReviewActions.ts`, reordenando los motores por prioridad estricta (Ortografía → Estructura → Citas → Bloom/Estilo → IA). Sustituye el antiguo `AiMosaic` por `AiHierarchy` (Dashboard macro + drill-down H1→H2→H3 + Split Inspector). Adapta `FocusReadingCard.tsx` con el estilo de subrayado de la muestra (sólido continuo para alertas críticas, punteado para reflexivas).

**Tech Stack:** React 18, TypeScript, Zustand (`useDocStore`), Lucide React (cero emojis), Design Tokens CSS (`design-system.css`), Vitest.

**Spec:** `docs/REDESIGN_REVISION_IA_HANDOFF.md` y `src/components/review/mockup/ReviewMockupStudio.tsx`.

## Global Constraints
- Cero emojis en toda la UI: exclusivamente iconos vectoriales SVG de `lucide-react`.
- Paleta y tokens estrictos: usar únicamente variables CSS (`var(--color-*)`, `var(--radius-*)`). Prohibido hardcodear colores hex o radios numéricos (pasa `noHardcodedColors.test.ts`).
- Orden estricto de motores por prioridad:
  1. `spelling` (Ortografía & Acentuación RAE - acción masiva).
  2. `structure` (Estructura & Títulos APA 7 - rotulación figuras/tablas).
  3. `citations` (Citas & Referencias - resolución de fantasmas).
  4. `style` (Redacción & Bloom - reflexivo guiado).
  5. `ai` (Detección de IA - probabilístico, nunca auto-aplica a ciegas).
- Portada protegida: elementos de portada en solo lectura (`readOnly: true`), sin botón de aplicar ni sugerencias destructivas.
- Sin botones muertos: toda acción en pantalla conecta a su despachador real con cerrojo `isApplying` y feedback toast.

---

### Task 1: Reordenamiento de Prioridad de Motores y Soporte de Acciones por Lote
**Files:**
- Modify: `src/hooks/useReviewWorkbench.ts`
- Modify: `src/hooks/useReviewActions.ts`

- [ ] Paso 1.1: En `src/hooks/useReviewWorkbench.ts`, actualizar `ENGINE_ORDER` al orden estricto de prioridades:
  `['spelling', 'structure', 'citations', 'style', 'ai']`.
- [ ] Paso 1.2: Ajustar `ENGINE_META` para que los títulos, chips y colores utilicen los tokens canónicos.
- [ ] Paso 1.3: En `useReviewActions.ts`, verificar que `acceptMany` y `runGroupAction` soporten la ejecución por lote de `spelling` y `structure` con cerrojo `isApplying` y toast de progreso.
- [ ] Paso 1.4: Ejecutar tests unitarios de acciones de revisión:
  `npm test -- src/__tests__/reviewActionsReadOnly.test.ts`
- [ ] Paso 1.5: Commit de Task 1.

---

### Task 2: Tipografía de Manuscrito y Subrayados Académicos en Tarjeta de Lectura
**Files:**
- Modify: `src/components/review/ReadingText.tsx`
- Modify: `src/components/review/FocusReadingCard.tsx`

- [ ] Paso 2.1: En `ReadingText.tsx`, adaptar el renderizado de marcas inline según la muestra del usuario:
  - Alerta prioritaria/mecánica (`spelling`, `structure`, `citations`): fondo suave `var(--color-accent-a08)` con subrayado sólido continuo `border-bottom: 2px solid var(--color-accent)`.
  - Alerta reflexiva/sintética (`style`, `bloom`, `ai`): fondo suave `var(--color-warning-a08)` o `var(--color-engine-ia-a08)` con subrayado punteado `border-bottom: 2px dashed var(--color-text-secondary)`.
- [ ] Paso 2.2: En `FocusReadingCard.tsx`, ajustar la tipografía y espaciado de lectura editorial (interlineado generoso `1.85`, fuente sans editorial con tokens).
- [ ] Paso 2.3: Integrar la mascota editorial `EditorialMascot` (`kind="highlighter"`, expresión reactiva según cantidad de alertas) en el encabezado de contexto del bloque.
- [ ] Paso 2.4: Ejecutar tests de renderizado de texto:
  `npm test -- src/__tests__/readingText.test.tsx`
- [ ] Paso 2.5: Commit de Task 2.

---

### Task 3: Minimapa Ergonómico Capitular (H1) y Rack de Lotes
**Files:**
- Modify: `src/components/review/ReviewMinimap.tsx`
- Modify: `src/components/review/EngineGroupCard.tsx`
- Modify: `src/components/review/ReviewWorkbench.tsx`

- [ ] Paso 3.1: En `ReviewMinimap.tsx`, estructurar la navegación vertical agrupada por Capítulos/Fases H1 con micro barras de calor (heatbars) y salto directo de página.
- [ ] Paso 3.2: En `EngineGroupCard.tsx`, agregar el botón destacado de `Aplicar corrección masiva` para grupos que tengan `canBatchApply: true` (`spelling` y `structure`), indicando la cantidad de casos en el documento y estado "✓ Resuelto".
- [ ] Paso 3.3: Conectar el botón masivo directamente a `onMassAction(group)` sin re-derivar lógica en la vista.
- [ ] Paso 3.4: Ejecutar tests del minimapa y grupos:
  `npm test -- src/__tests__/reviewMinimap.test.tsx`
- [ ] Paso 3.5: Commit de Task 3.

---

### Task 4: Nuevo Componente de IA Jerárquico (Dashboard Macro + Árbol H1→H2→H3 + Split Inspector)
**Files:**
- Create: `src/components/review/AiHierarchy.tsx`
- Modify: `src/components/review/ReviewWorkbench.tsx`
- Modify: `src/components/review/ReviewStrip.tsx`

- [ ] Paso 4.1: Crear `src/components/review/AiHierarchy.tsx` basado en la arquitectura validada en el mockup:
  - **Macro Dashboard**: Termómetro de integridad global (% voz humana vs sintética), total de párrafos analizados, alertas críticas y capítulo con pico anómalo.
  - **Árbol de navegación interactivo**: lista de capítulos H1; clic en un H1 expande sus subsecciones H2 y H3 con barra de densidad de IA.
  - **Split Inspector quirúrgico**: selector de pastillas de alertas para evitar sobrecarga de texto; comparativa lado a lado (*Original LLM* vs *Propuesta de Autor Humano*); botones `Reemplazar en Manuscrito` (conecta con `updateElementText`) y `Copiar`.
- [ ] Paso 4.2: En `ReviewWorkbench.tsx`, renderizar `<AiHierarchy />` cuando `wb.viewMode === 'ia'`.
- [ ] Paso 4.3: En `ReviewStrip.tsx`, incluir el selector claro de vistas (`Mesa por Lotes` vs `Mapa de IA Jerárquico` vs `Lienzo`).
- [ ] Paso 4.4: Ejecutar tests de tokens y sintaxis:
  `npx vitest run src/__tests__/noHardcodedColors.test.ts`
- [ ] Paso 4.5: Commit de Task 4.

---

### Task 5: Verificación Integral, Mascotas y Cero Errores
**Files:**
- Check: todos los archivos modificados
- Test: suite completa de vitest y validación de tipos

- [ ] Paso 5.1: Ejecutar `npx tsc --noEmit` para verificar tipado estricto en toda la aplicación.
- [ ] Paso 5.2: Ejecutar `npx vitest run src/__tests__/noHardcodedColors.test.ts` para verificar cero colores hex y uso 100% de design tokens.
- [ ] Paso 5.3: Probar manualmente los flujos en `http://localhost:5173/` (cambio de vistas, aplicación masiva, navegación capitular, drill-down de IA).
- [ ] Paso 5.4: Actualizar grafo de Graphify con `graphify update .`.
- [ ] Paso 5.5: Commit final y cierre.
