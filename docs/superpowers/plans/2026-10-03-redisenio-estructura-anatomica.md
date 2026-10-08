# Rediseño Integral de Estructura (Estudio Anatómico APA 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la vieja fase de estructura (pestañas fragmentadas de Índice, Títulos, Cuerpo y paneles residuales) por un Centro de Control Anatómico Unificado e interactivo (SVG nativo con Drag & Drop, línea fantasma, auditoría de binomio APA 7, llamada de figuras en texto, y lectura editorial focalizada sin dropdowns).

**Architecture:** Se eliminan `StructureTabBar` y `Step5BodyWizard` del Paso 2 en `App.tsx`. Se introduce el contenedor principal `EstudioEstructuraView` con layout de 3 columnas (Esqueleto jerárquico de navegación, Diagrama SVG interactivo con Drag & Drop y línea fantasma / Prosa focalizada, y Panel de Activos con chips de nivelación directa y editor de figuras). La lógica de validación académica se desacopla en `academicRules.ts` con TDD.

**Tech Stack:** React 18, TypeScript, Zustand (`useDocStore.ts`), SVG Nativo, `lucide-react`, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-03-redisenio-estructura-anatomica-design.md](file:///c:/Users/--X/.gemini/antigravity/scratch/wordapa7/docs/superpowers/specs/2026-10-03-redisenio-estructura-anatomica-design.md)

## Global Constraints
- Cero emojis en cadenas de UI o código; exclusivamente SVG vectoriales de `lucide-react`.
- Paleta y design tokens puros mediante CSS variables (`var(--accent-primary)`, `var(--text-main)`, `var(--border-subtle)`, `var(--paper-white)`). Prohibidos colores hex hardcodeados.
- Queda prohibido el uso de selectores `<select>` para regular el nivel jerárquico H1-H5.
- Cero dependencias externas pesadas de diagramación (`dagre`, `reactflow`, `cytoscape`); el grafo es SVG nativo procedimental.
- El Paso 2 no debe montar `StructureTabBar` ni `RightSidePanel`.
- Cobertura de tests unitarios aislados con Vitest (`npm test -- -t "..."`).

## Review Focus
1. **Documento sin títulos (solo párrafos planos):** Debe mostrar un estado vacío amigable con sugerencia de crear el primer H1 sin arrojar excepciones en el árbol.
2. **Reordenamiento circular o soltado inválido:** El Drag & Drop debe cancelar la operación si un padre intenta soltarse dentro de su propio hijo subordinado.
3. **Párrafo de encuadre ausente:** Si un H1 salta directo al primer H2 sin prosa intermedia, la advertencia debe activarse limpiamente.
4. **Figuras huérfanas sin mención en prosa:** Debe detectar correctamente si el texto del capítulo carece de referencias explícitas como "Figura N" o "Tabla N".
5. **Regla del Binomio (Subsección solitaria):** Debe advertir si un nodo tiene exactamente un hijo H2 o H3 sin hermano correlativo.

---

### Task 1: Motor Lógico de Reglas Académicas APA 7 (`academicRules.ts`)

**Files:**
- Create: `src/lib/academicRules.ts`
- Test: `src/lib/__tests__/academicRules.test.ts`

**Interfaces:**
- Produces:
  - `auditarBinomio(nodos: NodoJerarquia[]): DiagnosticItem[]`
  - `auditarLlamadasFiguras(capitulo: NodoJerarquia, elementos: ElementModel[]): DiagnosticItem[]`
  - `auditarEncuadre(capitulo: NodoJerarquia, elementos: ElementModel[]): boolean`

- [ ] **Step 1: Write the failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { auditarBinomio, auditarLlamadasFiguras, auditarEncuadre } from '../academicRules';
import type { NodoJerarquia } from '../jerarquia';
import type { ElementModel } from '../../types';

describe('academicRules APA 7', () => {
  it('detecta subsecciones solitarias (regla del binomio)', () => {
    const arbolSolitario: NodoJerarquia[] = [{
      id: 'h1_1',
      titulo: 'Metodología',
      nivel: 1,
      palabras: 500,
      element_id: 'elem_1',
      hijos: [{
        id: 'h2_1',
        titulo: 'Muestra',
        nivel: 2,
        palabras: 200,
        element_id: 'elem_2',
        hijos: []
      }]
    }];
    const hallazgos = auditarBinomio(arbolSolitario);
    expect(hallazgos.length).toBe(1);
    expect(hallazgos[0].id).toBe('h2_1');
    expect(hallazgos[0].mensaje).toContain('subdivisión solitaria');
  });

  it('detecta falta de mención en texto para figuras asociadas', () => {
    const capitulo: NodoJerarquia = {
      id: 'h1_1',
      titulo: 'Resultados',
      nivel: 1,
      palabras: 300,
      element_id: 'elem_1',
      hijos: []
    };
    const elementos: ElementModel[] = [
      { id: 'elem_1', type: 'heading', text: 'Resultados', heading_level: 1 },
      { id: 'elem_2', type: 'paragraph', text: 'Los datos muestran una tendencia creciente en el grupo analizado.' },
      { id: 'elem_3', type: 'image', text: '', image_info: { figure_number: 1, caption: 'Gráfico de dispersión' } }
    ];
    const hallazgos = auditarLlamadasFiguras(capitulo, elementos);
    expect(hallazgos.length).toBe(1);
    expect(hallazgos[0].mensaje).toContain('no tiene llamada explícita');
  });

  it('detecta si un H1 no tiene párrafo de encuadre antes de su primer H2', () => {
    const capitulo: NodoJerarquia = {
      id: 'h1_1',
      titulo: 'Metodología',
      nivel: 1,
      palabras: 200,
      element_id: 'elem_1',
      hijos: [{ id: 'h2_1', titulo: 'Diseño', nivel: 2, palabras: 100, element_id: 'elem_2', hijos: [] }]
    };
    const elementosSinEncuadre: ElementModel[] = [
      { id: 'elem_1', type: 'heading', text: 'Metodología', heading_level: 1 },
      { id: 'elem_2', type: 'heading', text: 'Diseño', heading_level: 2 }
    ];
    expect(auditarEncuadre(capitulo, elementosSinEncuadre)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- -t "academicRules APA 7"`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implement `academicRules.ts`**

```typescript
import type { NodoJerarquia } from './jerarquia';
import type { ElementModel } from '../types';

export interface DiagnosticItem {
  id: string;
  nodoId: string;
  tipo: 'binomio' | 'llamada_figura' | 'encuadre';
  mensaje: string;
  gravedad: 'advertencia' | 'sugerencia';
}

export function auditarBinomio(nodos: readonly NodoJerarquia[]): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  function revisar(n: NodoJerarquia) {
    if (n.hijos.length === 1) {
      items.push({
        id: `binomio_${n.hijos[0].id}`,
        nodoId: n.hijos[0].id,
        tipo: 'binomio',
        mensaje: `APA 7: "${n.hijos[0].titulo}" es una subdivisión solitaria. Requiere al menos dos subsecciones correlativas o integrarse en el nivel superior.`,
        gravedad: 'advertencia',
      });
    }
    n.hijos.forEach(revisar);
  }
  nodos.forEach(revisar);
  return items;
}

export function auditarLlamadasFiguras(
  capitulo: NodoJerarquia,
  elementos: readonly ElementModel[]
): DiagnosticItem[] {
  const items: DiagnosticItem[] = [];
  const idxInicio = elementos.findIndex((e) => e.id === capitulo.element_id);
  if (idxInicio === -1) return items;

  let textoCapitulo = '';
  const figuras: { num: number; id: string }[] = [];

  for (let i = idxInicio + 1; i < elementos.length; i++) {
    const el = elementos[i];
    if (el.type === 'heading' && (el.heading_level || 1) <= capitulo.nivel) break;
    if (el.type === 'paragraph' && el.text) {
      textoCapitulo += ' ' + el.text.toLowerCase();
    } else if (el.type === 'image' && el.image_info?.figure_number) {
      figuras.push({ num: el.image_info.figure_number, id: el.id });
    }
  }

  for (const f of figuras) {
    const mencionRegex = new RegExp(`(figura|fig\\.?)\\s*${f.num}\\b`, 'i');
    if (!mencionRegex.test(textoCapitulo)) {
      items.push({
        id: `llamada_fig_${f.id}`,
        nodoId: capitulo.id,
        tipo: 'llamada_figura',
        mensaje: `La Figura ${f.num} no tiene llamada explícita en el texto ("como se muestra en la Figura ${f.num}").`,
        gravedad: 'advertencia',
      });
    }
  }

  return items;
}

export function auditarEncuadre(
  capitulo: NodoJerarquia,
  elementos: readonly ElementModel[]
): boolean {
  const idxInicio = elementos.findIndex((e) => e.id === capitulo.element_id);
  if (idxInicio === -1) return true;

  for (let i = idxInicio + 1; i < elementos.length; i++) {
    const el = elementos[i];
    if (el.type === 'paragraph' && el.text?.trim()) return true;
    if (el.type === 'heading') return false;
  }
  return true;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- -t "academicRules APA 7"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/academicRules.ts src/lib/__tests__/academicRules.test.ts
git commit -m "feat(structure): add academicRules for APA 7 binomial and figure checks"
```

---

### Task 2: Componente Esqueleto Jerárquico de Navegación (`EsqueletoNavegacion.tsx`)

**Files:**
- Create: `src/components/structure/EsqueletoNavegacion.tsx`
- Test: `src/components/structure/__tests__/EsqueletoNavegacion.test.tsx`

**Diseño y Funcionalidad del Panel Lateral Izquierdo (Esqueleto de Navegación):**
- **Propósito:** Ofrecer navegación limpia y lectura de la arquitectura completa del documento sin saturación ni datos duplicados.
- **Paleta & Tokens:** Fondo `var(--color-bg-surface, #ffffff)`, borde derecho `var(--border-subtle, #e2e8f0)`, texto `var(--text-main)`, acento seleccionado `var(--accent-primary, #0284c7)`.
- **Botones y Controles:**
  1. *Fila de Capítulo/Subsección:* Botón interactivo de lista con indentación visual (`paddingLeft: 8px + nivel * 12px`).
     - Al hacer click: selecciona el nodo activo para sincronizar el diagrama central y el panel derecho.
     - Indicador visual: Badge de nivel `H1`, `H2` o `H3` con contraste nítido y `tabular-nums`.
     - Icono de alerta: `AlertTriangle` discreto en ámbar (`var(--color-warning)`) si la sección tiene observaciones APA 7.
  2. *Tarjeta Inferior de Estado Estructural:* Caja informativa sobria con icono `AlertCircle` que resume si faltan secciones canónicas del formato APA (ej. Conclusiones o Discusión).

---

### Task 5: Panel de Activos y Nivelación Directa Sin Dropdowns (`InspectorActivosSeccion.tsx`)

**Files:**
- Create: `src/components/structure/InspectorActivosSeccion.tsx`
- Test: `src/components/structure/__tests__/InspectorActivosSeccion.test.tsx`

**Diseño y Funcionalidad del Panel Lateral Derecho (Inspector & Activos):**
- **Propósito:** Modificar el nivel jerárquico del capítulo activo, gestionar sus figuras incrustadas y ver diagnósticos académicos en un solo punto, sin duplicar datos del panel izquierdo.
- **Paleta & Tokens:** Fondo `var(--color-bg-surface)`, bordes `var(--border-subtle)`, fondo de tarjetas `var(--color-bg-surface-alt)`.
- **Botones y Controles (100% útiles y justificados):**
  1. *Botonera de Nivelación Directa (Chips H1-H5):*
     - Fila de 5 micro-botones (`[H1] [H2] [H3] [H4] [H5]`).
     - El nivel activo se resalta con `var(--accent-primary)` y texto blanco.
     - Clic en cualquier chip aplica instantáneamente el estilo en Word vía `changeHeadingLevel`.
     - *Por qué es útil:* Elimina el tedioso uso de desplegables `<select>` y permite al usuario ascender o descender encabezados con un solo toque visual.
  2. *Tarjeta de Activo Visual (Figura / Tabla del Capítulo):*
     - Miniatura con icono vectorial `Image` / `Table2`.
     - Título y estado de rotulado APA 7.
     - Botón principal: `🎨 Abrir Estudio de Estilos & Leyenda` (con `Palette` de `lucide-react`).
     - *Por qué es útil:* Rescata el editor de figuras y tablas del documento sin obligar a cambiar de paso ni esconderlo en pestañas perdidas.
  3. *Tarjeta de Auditoría Académica de Prosa:*
     - Bloque sobrio con 3 checks en tiempo real:
       - *Binomio:* Alerta si es una subsección solitaria (`2.1` sin `2.2`).
       - *Llamada en texto:* Verifica que la figura esté citada en la prosa (*"ver Figura 1"*).
       - *Párrafo de encuadre:* Corrobora que no haya salto directo de H1 a H2 sin párrafo introductorio.

- [ ] **Step 5: Commit**

```bash
git add src/components/structure/InspectorActivosSeccion.tsx src/components/structure/__tests__/InspectorActivosSeccion.test.tsx
git commit -m "feat(structure): implement InspectorActivosSeccion with direct level chips"
```

---

### Task 6: Integración Unificada en `App.tsx` y Purga de Residuos (`EstudioEstructuraView.tsx`)

**Files:**
- Create: `src/components/structure/EstudioEstructuraView.tsx`
- Modify: `src/App.tsx:707-756` (reemplazo de `StructureTabBar`, `RightSidePanel` y `EscritorioEstructura` en el Paso 2).
- Test: `src/components/structure/__tests__/EstudioEstructuraView.test.tsx`

**Interfaces:**
- Une las 3 columnas bajo `EstudioEstructuraView` y lo conecta al Zustand store (`useDocStore.ts`) para reordenamiento y mutación de encabezados.

- [ ] **Step 1: Write integration test**

```typescript
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EstudioEstructuraView } from '../EstudioEstructuraView';

describe('EstudioEstructuraView', () => {
  it('renderiza la vista anatómica unificada sin pestañas residuales', () => {
    render(<EstudioEstructuraView />);
    expect(screen.getByText(/Estructura del Documento/i)).toBeDefined();
    expect(screen.getByText(/Diagrama Anatómico/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- -t "EstudioEstructuraView"`
Expected: FAIL.

- [ ] **Step 3: Implement `EstudioEstructuraView.tsx` & clean `App.tsx`**
- Eliminar de `App.tsx` el montaje de `StructureTabBar` y la visualización de `RightSidePanel` en `wizardStep === 2`.
- Montar limpiamente `<EstudioEstructuraView />`.

- [ ] **Step 4: Run targeted tests and full suite**

Run: `npm test -- --reporter=dot`
Expected: Todos los tests en verde (0 regresiones).

- [ ] **Step 5: Commit**

```bash
git add src/components/structure/EstudioEstructuraView.tsx src/App.tsx
git commit -m "feat(structure): integrate unified EstudioEstructuraView and purge legacy tabs"
```
