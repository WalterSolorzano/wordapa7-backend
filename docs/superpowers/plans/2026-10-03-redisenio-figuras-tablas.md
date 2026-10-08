# Rediseño Integral de Figuras, Tablas y Ecuaciones (Taller Gráfico APA 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la vieja pantalla de Figuras y Tablas (Paso 3) por un Taller Gráfico Editorial con micro-rail vertical de iconos, centro amplio en tipografía serif de libro académico (`Charter`/`Garamond`), controles directos de rotación/reemplazo/escala y panel por pestañas técnicas (Formato, Texto, Estilo, Calidad) con contrastes en azul marino y líneas divisorias de 1px sin saturación de tarjetas.

**Architecture:** Se desacopla el paso 3 en 4 componentes especializados: `RailTipoActivos` (rail vertical a la izquierda), `GaleriaActivosColumna` (lista con miniaturas reales), `LienzoEditorialActivo` (centro con prosa de contexto, imagen y sugerencia IA integrada) e `InspectorActivoTabs` (panel derecho con las 4 pestañas técnicas de `ImageEditPanel` reorganizadas limpiamente). Todos se orquestan bajo `TallerFigurasView.tsx`, reemplazando `Step3FiguresTablesWizard.tsx`.

**Tech Stack:** React 18, TypeScript, Zustand (`useDocStore.ts`), Lucide React, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-03-redisenio-figuras-tablas-design.md](file:///c:/Users/--X/.gemini/antigravity/scratch/wordapa7/docs/superpowers/specs/2026-10-03-redisenio-figuras-tablas-design.md)

## Global Constraints
- Cero emojis en UI o código; exclusivamente iconos vectoriales SVG de `lucide-react`.
- Paleta con contraste en azul marino (`#0f172a`, `#1e293b`), líneas divisorias nítidas de 1px (`var(--border-subtle)` / `--border-contrast`), sin tarjetas abultadas ni sombras excesivas.
- Tipografía editorial académica en el centro (`Charter`, `Cormorant Garamond`, `Baskerville`, `serif`).
- Conservación íntegra de los motores existentes (`updateElementImage`, `setTableStyle`, `suggestCaption`, rotación, presets).
- Cobertura de tests unitarios con Vitest (`npm test -- -t "..."`).

---

### Task 1: Micro-Rail Vertical de Tipos de Activos (`RailTipoActivos.tsx`)

**Files:**
- Create: `src/components/figures/RailTipoActivos.tsx`
- Test: `src/components/figures/__tests__/RailTipoActivos.test.tsx`

**Interfaces:**
- Consumes: `tipoActivo: 'image' | 'table' | 'equation'`, `conteos: { image: number; table: number; equation: number }`, `onTipoChange: (tipo: 'image' | 'table' | 'equation') => void`
- Produces: Micro-rail vertical compacto a la extrema izquierda con iconos SVG (`Image`, `Table2`, `Pi`), badges de conteo y contraste azul marino.

- [ ] **Step 1: Write failing test**

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RailTipoActivos } from '../RailTipoActivos';

describe('RailTipoActivos', () => {
  it('renderiza botones verticales para figuras, tablas y ecuaciones con conteos', () => {
    const onTipoChange = vi.fn();
    render(
      <RailTipoActivos
        tipoActivo="image"
        conteos={{ image: 4, table: 2, equation: 1 }}
        onTipoChange={onTipoChange}
      />
    );

    const btnTablas = screen.getByRole('button', { name: /tablas/i });
    expect(btnTablas).toBeDefined();
    expect(screen.getByText('4')).toBeDefined();
    fireEvent.click(btnTablas);
    expect(onTipoChange).toHaveBeenCalledWith('table');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- -t "RailTipoActivos"`
Expected: FAIL.

- [ ] **Step 3: Implement `RailTipoActivos.tsx`**

```tsx
import React from 'react';
import { Image, Table2, Pi } from 'lucide-react';
import type { TipoFigura } from '../../lib/figuras';

interface Props {
  tipoActivo: TipoFigura;
  conteos: { image: number; table: number; equation: number };
  onTipoChange: (tipo: TipoFigura) => void;
}

export const RailTipoActivos: React.FC<Props> = ({ tipoActivo, conteos, onTipoChange }) => {
  const items: Array<{ id: TipoFigura; label: string; icon: React.FC<{ size?: number }>; count: number }> = [
    { id: 'image', label: 'Figuras', icon: Image, count: conteos.image },
    { id: 'table', label: 'Tablas', icon: Table2, count: conteos.table },
    { id: 'equation', label: 'Ecuaciones', icon: Pi, count: conteos.equation },
  ];

  return (
    <aside
      aria-label="Selector de tipos de activos"
      style={{
        width: '52px',
        backgroundColor: '#0f172a',
        borderRight: '1px solid #1e293b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '12px 0',
        gap: '8px',
        flexShrink: 0,
      }}
    >
      {items.map((item) => {
        const activo = tipoActivo === item.id;
        const Icon = item.icon;

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onTipoChange(item.id)}
            title={`${item.label} (${item.count})`}
            aria-label={`${item.label} (${item.count})`}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '6px',
              border: activo ? '1px solid #38bdf8' : '1px solid transparent',
              backgroundColor: activo ? '#1e293b' : 'transparent',
              color: activo ? '#38bdf8' : '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <Icon size={18} />
            <span
              style={{
                position: 'absolute',
                top: '2px',
                right: '2px',
                fontSize: '8px',
                fontWeight: 700,
                backgroundColor: activo ? '#0284c7' : '#334155',
                color: '#ffffff',
                borderRadius: '6px',
                padding: '0 3px',
                lineHeight: '11px',
              }}
            >
              {item.count}
            </span>
          </button>
        );
      })}
    </aside>
  );
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- -t "RailTipoActivos"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/figures/RailTipoActivos.tsx src/components/figures/__tests__/RailTipoActivos.test.tsx
git commit -m "feat(figures): create RailTipoActivos vertical selector with navy contrast"
```

---

### Task 2: Galería Lateral de Activos con Miniaturas Reales (`GaleriaActivosColumna.tsx`)

**Files:**
- Create: `src/components/figures/GaleriaActivosColumna.tsx`
- Test: `src/components/figures/__tests__/GaleriaActivosColumna.test.tsx`

**Interfaces:**
- Consumes: `contextos: ContextoFigura[]`, `indiceActivo: number | null`, `onSelectIndice: (idx: number) => void`
- Produces: Lista de activos con miniaturas reales (52x42px), rótulo, estado de leyenda y capítulo contenedor.

- [ ] **Step 1: Write failing test**

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GaleriaActivosColumna } from '../GaleriaActivosColumna';
import type { ContextoFigura } from '../../../lib/figuras';

describe('GaleriaActivosColumna', () => {
  it('renderiza la lista de figuras con miniaturas y emite selección al hacer click', () => {
    const onSelect = vi.fn();
    const contextos: ContextoFigura[] = [{
      id: 'elem_1',
      indice: 1,
      tipo: 'image',
      numero: 1,
      rotulo: 'Figura 1',
      leyenda: 'Flujograma de muestreo',
      tieneLeyenda: true,
      anchoCm: 14.5,
      altoCm: 9.0,
      seccion: '2. Metodología',
      h1: 'Metodología',
      h2: null,
      parrafoAnterior: '',
      parrafoPosterior: '',
      posicionEnSeccion: 1,
      totalEnSeccion: 1,
      posicionEnTipo: 1,
      totalEnTipo: 1,
    }];

    render(
      <GaleriaActivosColumna
        contextos={contextos}
        indiceActivo={1}
        onSelectIndice={onSelect}
      />
    );

    expect(screen.getByText('Figura 1')).toBeDefined();
    expect(screen.getByText(/Flujograma de muestreo/i)).toBeDefined();
    fireEvent.click(screen.getByText('Figura 1'));
    expect(onSelect).toHaveBeenCalledWith(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- -t "GaleriaActivosColumna"`
Expected: FAIL.

- [ ] **Step 3: Implement `GaleriaActivosColumna.tsx`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- -t "GaleriaActivosColumna"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/figures/GaleriaActivosColumna.tsx src/components/figures/__tests__/GaleriaActivosColumna.test.tsx
git commit -m "feat(figures): implement GaleriaActivosColumna with real thumbnail previews"
```

---

### Task 3: Lienzo Editorial Amplio de Activos (`LienzoEditorialActivo.tsx`)

**Files:**
- Create: `src/components/figures/LienzoEditorialActivo.tsx`
- Test: `src/components/figures/__tests__/LienzoEditorialActivo.test.tsx`

**Interfaces:**
- Consumes: `contexto: ContextoFigura | null`, `onRotate: () => void`, `onReplaceImage: () => void`, `onApplyCaption: (text: string) => void`, `onSuggestCaption: () => Promise<string | undefined>`
- Produces: Visor central en tipografía serif de libro (`Charter`/`Garamond`), imagen a escala real en cm, botones directos de rotar/reemplazar y caja inferior de sugerencia IA en 1 clic.

- [ ] **Step 1: Write failing test**

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LienzoEditorialActivo } from '../LienzoEditorialActivo';
import type { ContextoFigura } from '../../../lib/figuras';

describe('LienzoEditorialActivo', () => {
  it('renderiza la prosa previa, la figura con rotación directa y la sugerencia de IA', () => {
    const onRotate = vi.fn();
    const contexto: ContextoFigura = {
      id: 'elem_1',
      indice: 1,
      tipo: 'image',
      numero: 1,
      rotulo: 'Figura 1',
      leyenda: 'Flujograma experimental',
      tieneLeyenda: true,
      anchoCm: 14.5,
      altoCm: 9.0,
      seccion: '2. Metodología',
      h1: 'Metodología',
      h2: null,
      parrafoAnterior: 'El procedimiento experimental se describe a continuación:',
      parrafoPosterior: 'Tras este paso se cuantificaron las muestras.',
      posicionEnSeccion: 1,
      totalEnSeccion: 1,
      posicionEnTipo: 1,
      totalEnTipo: 1,
    };

    render(
      <LienzoEditorialActivo
        contexto={contexto}
        onRotate={onRotate}
        onReplaceImage={vi.fn()}
        onApplyCaption={vi.fn()}
        onSuggestCaption={vi.fn()}
      />
    );

    expect(screen.getByText(/El procedimiento experimental se describe/i)).toBeDefined();
    expect(screen.getByText('Figura 1')).toBeDefined();
    const btnRotar = screen.getByRole('button', { name: /Rotar 90°/i });
    fireEvent.click(btnRotar);
    expect(onRotate).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- -t "LienzoEditorialActivo"`
Expected: FAIL.

- [ ] **Step 3: Implement `LienzoEditorialActivo.tsx`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- -t "LienzoEditorialActivo"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/figures/LienzoEditorialActivo.tsx src/components/figures/__tests__/LienzoEditorialActivo.test.tsx
git commit -m "feat(figures): create LienzoEditorialActivo with book-grade serif typography"
```

---

### Task 4: Inspector Técnico por Pestañas Sin Cards Saturadas (`InspectorActivoTabs.tsx`)

**Files:**
- Create: `src/components/figures/InspectorActivoTabs.tsx`
- Test: `src/components/figures/__tests__/InspectorActivoTabs.test.tsx`

**Interfaces:**
- Consumes: `elem: ElementModel`, `totalFiguras: number`, `onUpdateImage: (id: string, patch: any) => void`, `onApplyToAll: () => void`
- Produces: 4 pestañas limpias (`Formato`, `Texto`, `Estilo`, `Calidad`) organizando dimensiones en cm, presets APA 7 y diagnósticos sin tarjetas abultadas.

- [ ] **Step 1: Write failing test**

```typescript
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InspectorActivoTabs } from '../InspectorActivoTabs';
import type { ElementModel } from '../../../types';

describe('InspectorActivoTabs', () => {
  it('permite conmutar entre las 4 pestañas y modificar dimensiones', () => {
    const elem: ElementModel = {
      id: 'img_1',
      type: 'image',
      image_info: {
        width_cm: 14.5,
        height_cm: 9.0,
        alignment: 'center',
        caption: 'Figura de prueba',
      }
    };

    render(
      <InspectorActivoTabs
        elem={elem}
        totalFiguras={4}
        onUpdateImage={vi.fn()}
        onApplyToAll={vi.fn()}
      />
    );

    expect(screen.getByRole('tab', { name: /Formato/i })).toBeDefined();
    const tabEstilo = screen.getByRole('tab', { name: /Estilo/i });
    fireEvent.click(tabEstilo);
    expect(screen.getByText(/APA Estándar/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- -t "InspectorActivoTabs"`
Expected: FAIL.

- [ ] **Step 3: Implement `InspectorActivoTabs.tsx`**

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- -t "InspectorActivoTabs"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/figures/InspectorActivoTabs.tsx src/components/figures/__tests__/InspectorActivoTabs.test.tsx
git commit -m "feat(figures): implement InspectorActivoTabs without bloated cards"
```

---

### Task 5: Integración en `TallerFigurasView.tsx` y Conexión con `App.tsx`

**Files:**
- Create: `src/components/figures/TallerFigurasView.tsx`
- Modify: `src/App.tsx:713` y `src/App.tsx:747` (sustitución de `Step3FiguresTablesWizard` por `TallerFigurasView`).
- Test: `src/components/figures/__tests__/TallerFigurasView.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TallerFigurasView } from '../TallerFigurasView';

describe('TallerFigurasView', () => {
  it('orquesta el rail vertical, la galería, el lienzo editorial y el inspector', () => {
    render(<TallerFigurasView />);
    expect(screen.getByText(/Taller de Activos Gráficos/i)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- -t "TallerFigurasView"`
Expected: FAIL.

- [ ] **Step 3: Implement `TallerFigurasView.tsx` & clean `App.tsx`**

- [ ] **Step 4: Run full figures test suite**

Run: `npm test -- -t "RailTipoActivos|GaleriaActivosColumna|LienzoEditorialActivo|InspectorActivoTabs|TallerFigurasView"`
Expected: PASS (todos los tests en verde).

- [ ] **Step 5: Commit**

```bash
git add src/components/figures/TallerFigurasView.tsx src/components/figures/__tests__/TallerFigurasView.test.tsx src/App.tsx
git commit -m "feat(figures): integrate unified TallerFigurasView into step 3"
```
