# Rediseño del Estudio de Referencias y Citas APA 7 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar el Paso 4 (`Step5ReferencesWizard.tsx`) en un Estudio Editorial ergonómico con mini-rail de íconos, previsualización de imprenta APA 7 con sangría francesa pura, menciones de manuscrito destacadas con citas tipográficas en comillas grandes y edición bibliográfica flotante bajo demanda.

**Architecture:** Conservar la lógica central de datos en `src/lib/referencias.ts` y las mutaciones en `useDocStore.ts`. Reemplazar el layout abultado de dos columnas y formularios estáticos por un layout tri-panel liviano (Mini-rail 56px + Directorio animado ~380-440px + Canvas Editorial centrado con hoja de papel APA, acciones de copiado y acordeón de menciones). El editor permanente de la ficha se retira del canvas: la edición vive en el `ReferenceEditModal` flotante, abierto bajo demanda.

**Tech Stack:** React 18, TypeScript, Zustand (`useDocStore`), Lucide React, CSS Tokens (`design-system.css`).

**Spec:** Mockup desplegado y validado en `mockup-referencias/index.html`.

## Global Constraints

- Cero emojis en toda la interfaz (usar exclusivamente `lucide-react`).
- **Paleta canónica únicamente** (`src/styles/design-system.css`, claro+oscuro). Prohibido hex/rgba hardcodeado y prohibidos los tokens fantasma que no existen en el sistema (`--primary*`, `--status-*`, `--color-info*`, `--surface-sidebar`, `--surface-base`, `--border-light`, `--border-medium`, `--text-light`).
- **Disciplina de íconos** (ui-ux-pro-max): una sola familia (Lucide); `strokeWidth="var(--icon-stroke)"` (nunca 2 / 2.5 hardcodeado); color por `currentColor` o token; el acento se reserva al estado activo/acción principal; el color semántico sólo cuando codifica un estado real (badge/chip); íconos decorativos llevan `aria-hidden="true"`. Un solo acento visible por superficie.
- **Contraste**: texto normal ≥4.5:1 y no-texto/íconos ≥3:1 en claro **y** oscuro. Botón sólido usa `--color-text-on-accent` sobre `--color-accent`.
- Sangría francesa APA 7 obligatoria en vista previa (`text-indent: calc(var(--space-8) * -1)`, ~1.27 cm).
- Acciones de copiado instantáneo de cita parentética `(Autor, Año)` y narrativa `Autor (Año)`.
- No mutar ni romper `src/__tests__/referencias.test.ts` ni `src/__tests__/referenciasEstaMontada.test.tsx`. Las dos pruebas de formulario de `referenciasPaso4.test.tsx` se ajustan a la nueva ubicación en modal (autorizado).

## Hallazgos y correcciones aplicadas (origen del colorido y la inconsistencia)

El desajuste visual de la fase venía de un set de tokens **paralelo e inexistente**: al no resolverse, ganaba el hex de respaldo hardcodeado, produciendo indigo + esmeralda + ámbar + sky simultáneos y rompiendo el modo oscuro. Mapeo aplicado a tokens canónicos:

| Fantasma (roto) | Canónico (design-system.css) |
|---|---|
| `--primary` | `--color-accent` |
| `--primary-soft` / `--primary-subtle` | `--color-accent-soft` / `--color-accent-a12` |
| `--status-verified` | `--color-success` |
| `--status-verified-bg` | `--color-success-a12` |
| `--status-warning` | `--color-warning` |
| `--status-warning-bg` | `--color-warning-a12` |
| `--color-info` / `--color-info-border` | `--color-accent` |
| `--color-info-soft` | `--color-accent-a12` |
| `--surface-sidebar` / `--surface-base` | `--color-bg-surface` |
| `--border-light` | `--color-border-subtle` |
| `--border-medium` | `--color-border-strong` |
| `--text-light` | `--color-text-tertiary` |
| `rgba(15,23,42,.45)` (scrim) | `--scrim-overlay` |
| `rgba(67,97,238,.20)` (comilla) | `--color-accent-a20` |
| `#ffffff` (texto sobre acento) | `--color-text-on-accent` |
| `strokeWidth={2.5}` / `{2}` | `strokeWidth="var(--icon-stroke)"` |

**Defecto de test corregido:** el rail rotulaba su filtro como *"Verificadas contra DOI/CrossRef"*, y ese "CrossRef" colisionaba con el botón *"DOI o Enlace Web"* del modal de nueva referencia; `referenciasPaso4.test.tsx:321` recibía dos coincidencias y fallaba. El rótulo ahora es sólo **"Verificadas"**.

## Review Focus

- Cita sin autor o con autor corporativo largo: la cita parentética debe formatearse de forma limpia sin arrojar `undefined`.
- Obra huérfana (0 menciones): debe mostrar la tarjeta con borde suave y el botón para copiar la cita para insertar en el texto, sin romper el render.
- Edición en modal: al guardar en el modal, los campos deben sincronizarse inmediatamente en `useDocStore` sin recargas completas.
- Responsive en anchos pequeños (<960px): el canvas centrado y el acordeón de menciones deben acomodarse fluidamente.

---

### Task 1: Componente de Mini-Rail y Filtro por Íconos en Referencias

**Files:**
- Create: `src/components/referencias/ReferenceRailFilter.tsx`
- Test: `src/components/referencias/__tests__/ReferenceRailFilter.test.tsx`

**Interfaces:**
- Consumes: `filter: 'all' | 'verified' | 'issues'`, `counts: { total: number, verified: number, issues: number }`
- Produces: `onSelectFilter(f: 'all' | 'verified' | 'issues'): void`

- [x] **Step 1: Escribir el test fallido para ReferenceRailFilter**
- [x] **Step 2: Verificar que el test falla**
- [x] **Step 3: Implementar ReferenceRailFilter con animaciones y tooltips (íconos neutros, acento sólo en activo)**
- [x] **Step 4: Verificar que el test pasa**
- [x] **Step 5: Commit atómico**

---

### Task 2: Tarjeta de Obra en Directorio con Botón de Edición Flotante (Hover Trigger)

**Files:**
- Create: `src/components/referencias/ReferenceCatalogItem.tsx`
- Test: `src/components/referencias/__tests__/ReferenceCatalogItem.test.tsx`

**Interfaces:**
- Consumes: `reference: ReferenciaModel`, `isSelected: boolean`, `onSelect: () => void`, `onEdit: () => void`
- Produces: Render de autor, año, título con botón `[ Editar ]` animado en hover (Lápiz Lucide, sin emoji).

- [x] **Step 1: Escribir el test fallido para ReferenceCatalogItem**
- [x] **Step 2: Verificar que el test falla**
- [x] **Step 3: Implementar ReferenceCatalogItem con transición CSS en hover y tokens canónicos**
- [x] **Step 4: Verificar que el test pasa**
- [x] **Step 5: Commit atómico**

---

### Task 3: Sección Desplegable de Menciones en Manuscrito con Tipografía Editorial

**Files:**
- Create: `src/components/referencias/ManuscriptMentionsAccordion.tsx`
- Test: `src/components/referencias/__tests__/ManuscriptMentionsAccordion.test.tsx`

**Interfaces:**
- Consumes: `citations: { page: number, p: string, text: string, highlight?: string }[]`, `onJumpToWord: (page: number, p: string) => void`, `onCopyCitation: () => void`
- Produces: Acordeón desplegable con comillas editoriales grandes `“` (token `--color-accent-a20`) y salto a Word.

- [x] **Step 1: Escribir el test fallido para ManuscriptMentionsAccordion**
- [x] **Step 2: Verificar que el test falla**
- [x] **Step 3: Implementar ManuscriptMentionsAccordion con estado abierto/cerrado**
- [x] **Step 4: Verificar que el test pasa**
- [x] **Step 5: Commit atómico**

---

### Task 4: Modal Flotante de Edición Bibliográfica Rápida

**Files:**
- Create: `src/components/referencias/ReferenceEditModal.tsx`
- Test: `src/components/referencias/__tests__/ReferenceEditModal.test.tsx`

**Interfaces:**
- Consumes: `reference: ReferenciaModel | null`, `isOpen: boolean`, `onClose: () => void`, `onSave: (updated: Partial<ReferenciaModel>) => void`
- Produces: Modal flotante limpio para autores, año, título, fuente y DOI (scrim `--scrim-overlay`, superficies por token, dark-aware).

- [x] **Step 1: Escribir el test fallido para ReferenceEditModal**
- [x] **Step 2: Verificar que el test falla**
- [x] **Step 3: Implementar ReferenceEditModal**
- [x] **Step 4: Verificar que el test pasa**
- [x] **Step 5: Commit atómico**

---

### Task 5: Canvas Editorial e Integración Final en `Step5ReferencesWizard.tsx`

**Files:**
- Modify: `src/components/referencias/Step5ReferencesWizard.tsx`
- Modify (contrato autorizado): `src/__tests__/referenciasPaso4.test.tsx`, `src/__tests__/referencias.test.ts`

**Layout objetivo (canvas editorial del mockup):** rail (56px) + directorio (búsqueda + grupos Verificadas / Pendientes / En texto no en biblio) + canvas centrado `max-width: 1040px`:
1. **Hoja APA**: la referencia como sale en la bibliografía (Times New Roman, `line-height 2.0`, sangría francesa) sobre `--paper-white`, con `data-testid="vista-previa-apa"`.
2. **Franja de estado**: chip (`data-testid="chip-estado"`) + marca "Sin citar en el texto" (sólo si la auditoría corrió y es huérfana) + la razón (`porQueDeLaReferencia`), todo bajo `data-testid="estado-referencia"`.
3. **Fila de acciones**: `Copiar parentética` `(Autor, Año)`, `Copiar narrativa` `Autor (Año)` y `Editar ficha` (abre `ReferenceEditModal` sembrado con la referencia seleccionada).
4. **Acordeón de menciones** del manuscrito.

- [x] **Step 0a: Corregir la colisión de rótulo rail/CrossRef que rompía `referenciasPaso4`**
- [x] **Step 0b: Migrar los 4 subcomponentes a la paleta canónica (sin hex, `--icon-stroke`, un acento)**
- [x] **Step 1: Reestructurar el detalle a canvas editorial centrado (hoja APA + franja de estado + acciones + menciones)**
- [x] **Step 2: Retirar el formulario permanente; la edición vive en `ReferenceEditModal` ("Editar ficha" y hover "Editar" del catálogo) reutilizando `handleSaveModalRef`**
- [x] **Step 3: Añadir caja de búsqueda al directorio (filtra por autor/título)**
- [x] **Step 4: Ajustar las dos pruebas de formulario de `referenciasPaso4` para abrir el modal de edición antes de contar campos y de pulsar "Guardar Cambios"**
- [x] **Step 5: Correr suite de referencias (`npm test -- --run referencias`) → 108/108; `tsc --noEmit` limpio; guard `referenciasEstaMontada` verde**
- [x] **Step 6: `graphify update .` y commit final del rediseño**

**Nota de implementación:** la guardia `src/__tests__/referencias.test.ts` verificaba `/<Seccion/` en el wizard (molde del formulario viejo). Como el canvas ya no usa `Seccion` (la hoja es un `<article>` y las menciones un componente propio), esa aserción se reescribió a `/<article/` + `/<EstadoVacio/` en la misma tanda autorizada.
