# Mapa de IA — perfil completo del documento — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el mapa de IA sea el perfil real del documento —todos los párrafos medidos, ubicados por fase sobre el eje 0–100— derivado de una única fuente (`perfilIA`), de modo que hero, mapa y lista de hallazgos no puedan contradecirse.

**Architecture:** Un selector puro `construirPerfilIA(paragraphs, elements)` en `src/lib/aiPerfil.ts` consume `reviewResult.paragraphs[]` (score 0–100) y `elements` (para mapear cada párrafo a su H1 vía `seccionesDeElementos`). Un componente de presentación `AiProfile` dibuja una fila por H1 con una pista 0–100 y un punto por párrafo. `AiHierarchy` reemplaza el heatmap y la grilla de capítulos por `AiProfile`, y su hero lee las mismas métricas del perfil. `AiHeatmap`, `AiChapterGrid`, `aiHeatmap.ts` y su test se eliminan.

**Tech Stack:** React 18, TypeScript, Vite 5, Vitest, `@testing-library/react`, Zustand (`useDocStore`), Lucide React, CSS con design tokens (`src/styles/design-system.css`).

**Spec:** docs/superpowers/specs/2026-10-05-mapa-ia-perfil-design.md

---

## Global Constraints

- Cero emojis en UI, botones, toasts, diálogos, comentarios de IA o plantillas. Solo íconos vectoriales SVG de `lucide-react`.
- Solo tokens CSS `var(--...)`. Prohibido hardcodear colores hex en componentes o CSS nuevos.
- Sin cards de contenido.
- Sin barras horizontales.
- Sin listas.
- Icono antes que texto.
- Animaciones sutiles respetando `prefers-reduced-motion`.
- De lo general a lo específico (hero → perfil por fase → párrafo).
- Desplegables cerrados por defecto (el detalle de fase no se abre solo).
- Fuente única `perfilIA`: ninguna vista vuelve a recalcular conteos por su cuenta.
- Bandas alineadas al motor: Baja 0–19 / Media 20–49 / Alta 50–74 / Crítica 75–100.
- Alerta = score ≥ 50 (bandas Alta + Crítica).
- **NO COMMITEAR**: el commit lo hace una IA externa. Ningún paso de este plan incluye `git commit`.

---

## Review Focus

Estas cinco clases de entrada/fallo son las que los tests deben cubrir y dejar fijadas:

1. **Paridad hero↔mapa.** El mismo `PerfilIA` alimenta el hero y el mapa; el conteo de bandas Alta+Crítica del mapa es, por construcción, `enAlerta` del hero.
2. **Nada se pierde.** Todo párrafo de `reviewResult.paragraphs` cae en exactamente una fila y una banda; `suma(porBanda) === total` y no existe la etiqueta "sin medición".
3. **Bordes de banda.** 19/20/49/50/74/75 clasifican en Baja/Media/Media/Alta/Alta/Crítica sin solapamiento.
4. **Escala 0..100.** `AIReviewParagraph.ai_score` se usa directo; un valor 55 es Alta, nunca 55×100. `ElementModel.ai_score` (0..1) no se lee para el perfil.
5. **Fuente única.** El componente `AiProfile` y el hero de `AiHierarchy` consumen `perfilIA`; no re-derivan conteos desde `AuditItem[]`.

---

## Task 1 — Selector puro `perfilIA`

**Files:**
- Create: `src/lib/aiPerfil.ts`
- Test: `src/__tests__/aiPerfil.test.ts`

**Interfaces:**
- Consumes: `ElementModel` (`src/types/index.ts:167`), `AIReviewParagraph` (`src/api/backend.ts:880-889`), `construirJerarquia` / `seccionesDeElementos` / `NodoJerarquia` (`src/lib/jerarquia.ts:419`, `:541`, `:46`).
- Produces:
  - `bandaDe(score: number): IndiceBanda`
  - `construirPerfilIA(paragraphs: readonly AIReviewParagraph[], elements: readonly ElementModel[] | null): PerfilIA`
  - `BANDAS_IA`, `ALERTA_MIN`, `CLAVE_DOC`, tipos `IndiceBanda`, `ParrafoPerfilIA`, `FilaPerfilIA`, `PerfilIA`.

> **Verificado antes de escribir:** `src/lib/jerarquia.ts` exporta `construirJerarquia` (línea 419), `seccionesDeElementos` (línea 541) y `NodoJerarquia` (línea 46), con esas firmas exactas. No hay que corregir el código del selector por ese lado.
>
> **Verificado en el backend:** `AIReviewParagraph.index` es el índice del elemento en `doc_model.elements` (`python/main.py:2934` `for idx, e in enumerate(doc_model.elements)` y `:2974` `"index": idx`). Por eso `elements[p.index]` y `secciones[p.index]` son la posición correcta, y el mapeo del selector es válido.

- [ ] **Paso 1: crear el test que falla** en `src/__tests__/aiPerfil.test.ts` con exactamente este contenido:

```ts
import { describe, it, expect } from 'vitest';
import { construirPerfilIA, bandaDe, BANDAS_IA, CLAVE_DOC } from '../lib/aiPerfil';
import type { AIReviewParagraph } from '../api/backend';
import type { ElementModel } from '../types';

/* Fixtures mínimos: solo los campos que el selector lee. */
const par = (index: number, score: number, text = `párrafo ${index}`): AIReviewParagraph =>
  ({
    element_id: `e${index}`,
    index,
    text,
    ai_score: score,
    ai_category: score >= 50 ? 'HIGH' : score >= 20 ? 'MEDIUM' : 'LOW',
  }) as unknown as AIReviewParagraph;

const h1 = (id: string, text: string): ElementModel =>
  ({ id, type: 'heading', heading_level: 1, text }) as unknown as ElementModel;

const p = (id: string, text: string): ElementModel =>
  ({ id, type: 'paragraph', text }) as unknown as ElementModel;

describe('bandaDe — bordes alineados al motor', () => {
  it('mapea 19/20/49/50/74/75 a las cuatro bandas', () => {
    expect(bandaDe(19)).toBe(0);
    expect(bandaDe(20)).toBe(1);
    expect(bandaDe(49)).toBe(1);
    expect(bandaDe(50)).toBe(2);
    expect(bandaDe(74)).toBe(2);
    expect(bandaDe(75)).toBe(3);
  });

  it('los extremos 0 y 100 caen en la primera y la última banda', () => {
    expect(bandaDe(0)).toBe(0);
    expect(bandaDe(100)).toBe(3);
  });

  it('expone las cuatro bandas con sus rangos', () => {
    expect(BANDAS_IA.map((b) => b.id)).toEqual(['baja', 'media', 'alta', 'critica']);
    expect(BANDAS_IA[0].min).toBe(0);
    expect(BANDAS_IA[3].max).toBe(Infinity);
  });
});

describe('construirPerfilIA — fuente única del perfil', () => {
  const elements = [
    h1('h1-1', 'Introducción'),
    p('p-1', 'uno'),
    p('p-2', 'dos'),
    h1('h1-2', 'Método'),
    p('p-3', 'tres'),
  ];
  const paragraphs = [par(1, 10, 'uno'), par(2, 30, 'dos'), par(4, 70, 'tres')];

  it('agrupa por H1 en orden documental y mapea cada párrafo a su elemento', () => {
    const perfil = construirPerfilIA(paragraphs, elements);
    expect(perfil.filas.map((f) => f.titulo)).toEqual(['Introducción', 'Método']);
    expect(perfil.filas[0].h1Id).toBe('h1-1');
    expect(perfil.filas[0].fase).toBe('introduccion');
    expect(perfil.filas[0].parrafos.map((x) => x.elementId)).toEqual(['p-1', 'p-2']);
    expect(perfil.filas[1].parrafos[0].elementId).toBe('p-3');
  });

  it('cuenta bandas por fila y paridad global', () => {
    const perfil = construirPerfilIA(paragraphs, elements);
    expect(perfil.filas[0].porBanda).toEqual([2, 0, 0, 0]);
    expect(perfil.filas[1].porBanda).toEqual([0, 0, 0, 1]);
    expect(perfil.porBanda.reduce((a, b) => a + b, 0)).toBe(perfil.total);
  });

  it('total no pierde párrafos y deriva alerta y voz humana', () => {
    const perfil = construirPerfilIA(paragraphs, elements);
    expect(perfil.total).toBe(paragraphs.length);
    expect(perfil.enAlerta).toBe(perfil.porBanda[2] + perfil.porBanda[3]);
    expect(perfil.vozHumana).toBe(100 - perfil.rigidezMedia);
    expect(perfil.rigidezMedia).toBe(37);
    expect(perfil.filaMasRigida?.h1Id).toBe('h1-2');
  });

  it('sin H1 devuelve una sola fila «Documento completo»', () => {
    const sinH1 = [p('p-1', 'uno'), p('p-2', 'dos')];
    const perfil = construirPerfilIA([par(0, 10), par(1, 60)], sinH1);
    expect(perfil.filas).toHaveLength(1);
    expect(perfil.filas[0].h1Id).toBe(CLAVE_DOC);
    expect(perfil.filas[0].titulo).toBe('Documento completo');
  });

  it('sin párrafos devuelve el perfil vacío', () => {
    const perfil = construirPerfilIA([], elements);
    expect(perfil).toMatchObject({ filas: [], total: 0, porBanda: [0, 0, 0, 0], enAlerta: 0 });
  });

  it('recorta el excerpt a 90 caracteres y colapsa espacios', () => {
    const perfil = construirPerfilIA([par(1, 10, 'a'.repeat(200))], elements);
    const ex = perfil.filas[0].parrafos[0].excerpt;
    expect(ex.length).toBe(90);
    expect(ex.endsWith('…')).toBe(true);
    const conEspacios = construirPerfilIA([par(1, 10, 'uno   dos   tres')], elements);
    expect(conEspacios.filas[0].parrafos[0].excerpt).toBe('uno dos tres');
  });

  it('usa la escala 0..100 directa: 55 cae en Alta, no multiplicado', () => {
    const perfil = construirPerfilIA([par(1, 55)], elements);
    expect(perfil.filas[0].porBanda).toEqual([0, 0, 1, 0]);
    expect(perfil.filas[0].rigidezMedia).toBe(55);
  });
});
```

- [ ] **Paso 2: correr el test y verlo fallar** (el módulo todavía no existe):

```
node_modules\.bin\vitest.cmd run src/__tests__/aiPerfil.test.ts
```

Esperado: falla al resolver `../lib/aiPerfil`.

- [ ] **Paso 3: crear `src/lib/aiPerfil.ts`** con exactamente este contenido:

```ts
import type { ElementModel } from '../types';
import type { AIReviewParagraph } from '../api/backend';
import { seccionesDeElementos, construirJerarquia, type NodoJerarquia } from './jerarquia';

export const BANDAS_IA = [
  { id: 'baja', label: 'Baja', min: 0, max: 20, color: 'var(--color-text-tertiary)' },
  { id: 'media', label: 'Media', min: 20, max: 50, color: 'var(--color-engine-ia-a40)' },
  { id: 'alta', label: 'Alta', min: 50, max: 75, color: 'var(--color-engine-ia-a65)' },
  { id: 'critica', label: 'Crítica', min: 75, max: Infinity, color: 'var(--color-engine-ia)' },
] as const;

export type IndiceBanda = 0 | 1 | 2 | 3;

/** Banda de severidad de un score 0..100, alineada al motor (LOW<20, MEDIUM>=20, HIGH>=50). */
export function bandaDe(score: number): IndiceBanda {
  if (score < 20) return 0;
  if (score < 50) return 1;
  if (score < 75) return 2;
  return 3;
}

export const ALERTA_MIN = 50;
export const CLAVE_DOC = '__doc__';

export interface ParrafoPerfilIA {
  elementId: string;
  index: number;
  score: number;
  categoria: AIReviewParagraph['ai_category'];
  excerpt: string;
}

export interface FilaPerfilIA {
  h1Id: string;
  titulo: string;
  fase: string | null;
  parrafos: ParrafoPerfilIA[];
  porBanda: [number, number, number, number];
  rigidezMedia: number;
}

export interface PerfilIA {
  filas: FilaPerfilIA[];
  total: number;
  porBanda: [number, number, number, number];
  rigidezMedia: number;
  vozHumana: number;
  enAlerta: number;
  filaMasRigida: FilaPerfilIA | null;
}

const recortar = (t: string, n = 90): string => {
  const s = (t || '').trim().replace(/\s+/g, ' ');
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

export function construirPerfilIA(
  paragraphs: readonly AIReviewParagraph[],
  elements: readonly ElementModel[] | null,
): PerfilIA {
  const vacio: PerfilIA = {
    filas: [], total: 0, porBanda: [0, 0, 0, 0], rigidezMedia: 0, vozHumana: 100, enAlerta: 0, filaMasRigida: null,
  };
  if (!paragraphs || paragraphs.length === 0) return vacio;

  const secciones = elements && elements.length ? seccionesDeElementos(elements) : null;
  const nodoPorTitulo = new Map<string, NodoJerarquia>();
  if (elements && elements.length) {
    for (const n of construirJerarquia(elements)) if (!nodoPorTitulo.has(n.titulo)) nodoPorTitulo.set(n.titulo, n);
  }

  const orden: string[] = [];
  const porClave = new Map<string, { titulo: string; fase: string | null; parrafos: ParrafoPerfilIA[] }>();

  for (const p of paragraphs) {
    const titulo = secciones?.[p.index]?.h1 ?? null;
    const clave = titulo ?? CLAVE_DOC;
    let fila = porClave.get(clave);
    if (!fila) {
      const nodo = titulo ? nodoPorTitulo.get(titulo) : undefined;
      fila = { titulo: titulo ?? 'Documento completo', fase: nodo?.fase ?? null, parrafos: [] };
      porClave.set(clave, fila);
      orden.push(clave);
    }
    fila.parrafos.push({
      elementId: elements?.[p.index]?.id ?? p.element_id,
      index: p.index,
      score: p.ai_score,
      categoria: p.ai_category,
      excerpt: recortar(p.text),
    });
  }

  const filas: FilaPerfilIA[] = orden.map((clave) => {
    const base = porClave.get(clave)!;
    const porBanda: [number, number, number, number] = [0, 0, 0, 0];
    let suma = 0;
    for (const par of base.parrafos) { porBanda[bandaDe(par.score)]++; suma += par.score; }
    return {
      h1Id: clave === CLAVE_DOC ? CLAVE_DOC : (nodoPorTitulo.get(base.titulo)?.id ?? CLAVE_DOC),
      titulo: base.titulo,
      fase: base.fase,
      parrafos: base.parrafos,
      porBanda,
      rigidezMedia: base.parrafos.length ? Math.round(suma / base.parrafos.length) : 0,
    };
  });

  const porBanda: [number, number, number, number] = [0, 0, 0, 0];
  let sumaTotal = 0;
  for (const f of filas) {
    for (let i = 0; i < 4; i++) porBanda[i] += f.porBanda[i];
    sumaTotal += f.parrafos.reduce((a, p) => a + p.score, 0);
  }
  const total = paragraphs.length;
  const rigidezMedia = total ? Math.round(sumaTotal / total) : 0;
  const filaMasRigida = filas.length ? filas.reduce((a, b) => (b.rigidezMedia > a.rigidezMedia ? b : a)) : null;

  return { filas, total, porBanda, rigidezMedia, vozHumana: 100 - rigidezMedia, enAlerta: porBanda[2] + porBanda[3], filaMasRigida };
}
```

- [ ] **Paso 4: correr el test y verlo pasar:**

```
node_modules\.bin\vitest.cmd run src/__tests__/aiPerfil.test.ts
```

Esperado: 10 tests en verde.

- [ ] **Paso 5: verificar tipos del archivo nuevo:**

```
node_modules\.bin\tsc.cmd --noEmit
```

Esperado: sin errores nuevos atribuibles a `src/lib/aiPerfil.ts`.

- [ ] **Verificación: dejar tests en verde; NO commitear.**

---

## Task 2 — Componente `AiProfile` + estilos

**Files:**
- Create: `src/components/review/AiProfile.tsx`
- Create: `src/styles/aiProfile.css`
- Test: `src/__tests__/aiProfile.test.tsx`

**Interfaces:**
- Consumes: `BANDAS_IA`, `bandaDe`, `PerfilIA` de `src/lib/aiPerfil.ts`.
- Produces: `AiProfile({ perfil, activoH1Id, onOpenPhase, onSelectParrafo })` y default export; clases CSS `aip`, `aip-fila`, `aip-titulo`, `aip-pista`, `aip-tick`, `aip-punto`, `aip-badge`, `aip-vacio`.

- [ ] **Paso 1: crear el test que falla** en `src/__tests__/aiProfile.test.tsx`:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiProfile } from '../components/review/AiProfile';
import type { PerfilIA } from '../lib/aiPerfil';

const perfil: PerfilIA = {
  filas: [
    {
      h1Id: 'h1-a',
      titulo: 'Introducción',
      fase: 'introduccion',
      parrafos: [
        { elementId: 'e1', index: 0, score: 10, categoria: 'LOW', excerpt: 'uno' },
        { elementId: 'e2', index: 1, score: 60, categoria: 'HIGH', excerpt: 'dos' },
      ],
      porBanda: [1, 0, 1, 0],
      rigidezMedia: 35,
    },
    {
      h1Id: 'h1-b',
      titulo: 'Método',
      fase: 'metodo',
      parrafos: [{ elementId: 'e3', index: 2, score: 80, categoria: 'HIGH', excerpt: 'tres' }],
      porBanda: [0, 0, 0, 1],
      rigidezMedia: 80,
    },
  ],
  total: 3,
  porBanda: [1, 0, 1, 1],
  rigidezMedia: 50,
  vozHumana: 50,
  enAlerta: 2,
  filaMasRigida: null,
};

const props = { onOpenPhase: vi.fn(), onSelectParrafo: vi.fn() };

describe('AiProfile — perfil por fase', () => {
  it('dibuja un punto por párrafo medido', () => {
    render(<AiProfile perfil={perfil} {...props} />);
    expect(document.querySelectorAll('.aip-punto')).toHaveLength(3);
  });

  it('el title de un punto contiene su score', () => {
    render(<AiProfile perfil={perfil} {...props} />);
    const punto = document.querySelectorAll('.aip-punto')[1] as HTMLElement;
    expect(punto.getAttribute('title')).toContain('60');
  });

  it('click en el título de fase llama onOpenPhase con el h1Id', () => {
    const onOpenPhase = vi.fn();
    render(<AiProfile perfil={perfil} onOpenPhase={onOpenPhase} onSelectParrafo={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Método' }));
    expect(onOpenPhase).toHaveBeenCalledWith('h1-b');
  });

  it('click en un punto llama onSelectParrafo y NO onOpenPhase', () => {
    const onOpenPhase = vi.fn();
    const onSelectParrafo = vi.fn();
    render(<AiProfile perfil={perfil} onOpenPhase={onOpenPhase} onSelectParrafo={onSelectParrafo} />);
    fireEvent.click(document.querySelectorAll('.aip-punto')[1] as HTMLElement);
    expect(onSelectParrafo).toHaveBeenCalledWith('e2');
    expect(onOpenPhase).not.toHaveBeenCalled();
  });

  it('sin filas muestra el estado vacío', () => {
    render(<AiProfile perfil={{ ...perfil, filas: [] }} {...props} />);
    expect(document.querySelector('.aip-vacio')).toBeTruthy();
  });
});
```

- [ ] **Paso 2: correr el test y verlo fallar** (el componente todavía no existe):

```
node_modules\.bin\vitest.cmd run src/__tests__/aiProfile.test.tsx
```

Esperado: falla al resolver `../components/review/AiProfile`.

- [ ] **Paso 3: crear `src/components/review/AiProfile.tsx`:**

```tsx
import React from 'react';
import { BANDAS_IA, bandaDe, type PerfilIA } from '../../lib/aiPerfil';
import '../../styles/aiProfile.css';

export interface AiProfileProps {
  perfil: PerfilIA;
  activoH1Id?: string | null;
  onOpenPhase: (h1Id: string) => void;
  onSelectParrafo: (elementId: string) => void;
}

export function AiProfile({ perfil, activoH1Id, onOpenPhase, onSelectParrafo }: AiProfileProps) {
  if (perfil.filas.length === 0) {
    return <p className="aip-vacio">Sin párrafos medidos todavía.</p>;
  }
  return (
    <div className="aip" role="group" aria-label="Perfil de IA por fase">
      {perfil.filas.map((fila) => {
        const alerta = fila.porBanda[2] + fila.porBanda[3];
        return (
          <div key={fila.h1Id} className={`aip-fila${activoH1Id === fila.h1Id ? ' is-activa' : ''}`}>
            <button type="button" className="aip-titulo" onClick={() => onOpenPhase(fila.h1Id)} title={fila.titulo}>
              {fila.titulo}
            </button>
            <div className="aip-pista">
              {[20, 50, 75].map((t) => <span key={t} className="aip-tick" style={{ left: `${t}%` }} aria-hidden />)}
              {fila.parrafos.map((p) => (
                <button
                  key={`${p.elementId}-${p.index}`}
                  type="button"
                  className="aip-punto"
                  style={{ left: `${p.score}%`, background: BANDAS_IA[bandaDe(p.score)].color }}
                  title={`${fila.titulo} · ${p.score}% · ${p.excerpt}`}
                  aria-label={`Párrafo al ${p.score}% de rigidez en ${fila.titulo}`}
                  onClick={(e) => { e.stopPropagation(); onSelectParrafo(p.elementId); }}
                />
              ))}
            </div>
            <span className={`aip-badge${alerta > 0 ? ' is-alerta' : ''}`} title="Párrafos en Alta o Crítica">
              {alerta || ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default AiProfile;
```

- [ ] **Paso 4: crear `src/styles/aiProfile.css`:**

```css
/* WordAPA7 — perfil de IA por fase: puntos sobre el eje 0–100. Solo tokens. */
.aip {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.aip-fila {
  display: grid;
  grid-template-columns: minmax(140px, 220px) 1fr 40px;
  align-items: center;
  gap: var(--space-3);
  min-height: 22px;
}

.aip-titulo {
  background: transparent;
  border: none;
  padding: 0;
  text-align: left;
  cursor: pointer;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aip-fila.is-activa .aip-titulo {
  color: var(--color-engine-ia);
}

.aip-pista {
  position: relative;
  height: 20px;
  border-bottom: 1px solid var(--color-border-subtle);
}

.aip-tick {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--color-border-subtle);
  pointer-events: none;
}

.aip-punto {
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  padding: 0;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transform: translate(-50%, -50%);
  transition: transform .12s ease, opacity .12s ease;
}

.aip-punto:hover {
  transform: translate(-50%, -50%) scale(1.4);
}

.aip-badge {
  text-align: right;
  font-size: var(--text-xs);
  font-variant-numeric: tabular-nums;
  color: var(--color-text-tertiary);
}

.aip-badge.is-alerta {
  color: var(--color-engine-ia);
  font-weight: 700;
}

.aip-vacio {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-tertiary);
}

@media (prefers-reduced-motion: reduce) {
  .aip-punto {
    transition: none;
  }
}
```

- [ ] **Paso 5: correr el test y verlo pasar:**

```
node_modules\.bin\vitest.cmd run src/__tests__/aiProfile.test.tsx
```

Esperado: 5 tests en verde.

- [ ] **Paso 6: verificar tipos:**

```
node_modules\.bin\tsc.cmd --noEmit
```

Esperado: sin errores nuevos atribuibles a `AiProfile.tsx`.

- [ ] **Verificación: dejar tests en verde; NO commitear.**

---

## Task 3 — Cablear `AiHierarchy` (+ `AiRoom`, `ReviewWorkbench`) y actualizar el test

**Files:**
- Modify: `src/components/review/AiHierarchy.tsx`
- Modify: `src/components/review/AiRoom.tsx`
- Modify: `src/components/review/ReviewWorkbench.tsx`
- Test: `src/__tests__/aiHierarchy.test.tsx`

**Interfaces:**
- Consumes: `construirPerfilIA` y `PerfilIA` (Task 1), `AiProfile` (Task 2), `AIReviewParagraph` (`src/api/backend.ts:880`), `useDocStore.reviewResult` (`src/store/types.ts:288`).
- Produces: `AiHierarchyProps.paragraphs: readonly AIReviewParagraph[]` (prop nueva obligatoria); el cuerpo del mapa renderiza `AiProfile` en lugar de `AiChapterGrid`.

### 3.A — Actualizar el test primero (para verlo fallar)

- [ ] **Paso 1: reemplazar por completo** `src/__tests__/aiHierarchy.test.tsx` con:

```tsx
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiHierarchy } from '../components/review/AiHierarchy';
import type { ElementModel } from '../types';
import type { AuditItem } from '../lib/auditItems';
import type { AIReviewParagraph } from '../api/backend';

const mockElements = [
  {
    id: 'h1-1',
    type: 'heading',
    heading_level: 1,
    text: 'Capítulo 1: Introducción',
  },
  {
    id: 'h2-1',
    type: 'heading',
    heading_level: 2,
    text: '1.1 Contexto General',
  },
  {
    id: 'p-1',
    type: 'paragraph',
    text: 'Este es un párrafo generado artificialmente con patrones típicos de un modelo de lenguaje.',
  },
] as unknown as ElementModel[];

const mockAiItems: AuditItem[] = [
  {
    id: 'ai-1',
    element_id: 'h2-1',
    category: 'ai',
    subtype: 'parrafo_ia',
    severity: 'high',
    summary: 'Fórmula sintética detectada',
    detail: 'Uso de estructuras redundantes típicas de LLM',
    originalText: 'Este es un párrafo generado artificialmente con patrones típicos de un modelo de lenguaje.',
    suggestedText: 'Este párrafo contextualiza la problemática de estudio de manera directa.',
    pageNumber: 2,
    aiScore: 78,
    phase: 'introduccion',
    readOnly: false,
  },
];

/* `index` es el índice del elemento en `elements` (así lo emite el backend). */
const mockParagraphs = [
  { element_id: 'h1-1', index: 0, type: 'heading', text: 'Capítulo 1: Introducción', ai_score: 10, ai_category: 'LOW', findings: [], spelling: [] },
  { element_id: 'h2-1', index: 1, type: 'heading', text: '1.1 Contexto General', ai_score: 78, ai_category: 'HIGH', findings: [], spelling: [] },
  { element_id: 'p-1', index: 2, type: 'paragraph', text: 'Este es un párrafo generado artificialmente con patrones típicos de un modelo de lenguaje.', ai_score: 55, ai_category: 'HIGH', findings: [], spelling: [] },
] as unknown as AIReviewParagraph[];

describe('AiHierarchy — Dashboard y Explorador Jerárquico', () => {
  it('renderiza estado vacío sin documento', () => {
    render(<AiHierarchy elements={null} items={[]} paragraphs={[]} />);
    expect(screen.getByText('Sin documento cargado')).toBeTruthy();
  });

  it('renderiza el macro dashboard con termómetro de voz humana', () => {
    render(<AiHierarchy elements={mockElements} items={mockAiItems} paragraphs={mockParagraphs} />);
    expect(screen.getByText('Voz Autoral Humana')).toBeTruthy();
    expect(screen.getByText('Párrafos en Alerta')).toBeTruthy();
  });

  it('muestra la jerarquía de capítulos H1 y subsecciones', () => {
    render(<AiHierarchy elements={mockElements} items={mockAiItems} paragraphs={mockParagraphs} />);
    expect(screen.getAllByText(/Capítulo 1/).length).toBeGreaterThan(0);
  });

  it('permite copiar la propuesta humana', () => {
    const originalClipboard = navigator.clipboard;
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<AiHierarchy elements={mockElements} items={mockAiItems} paragraphs={mockParagraphs} />);
    fireEvent.click(screen.getByRole('button', { name: /Capítulo 1/ }));
    const copyBtn = screen.getByRole('button', { name: /Copiar/i });
    fireEvent.click(copyBtn);
    expect(writeText).toHaveBeenCalled();

    Object.assign(navigator, { clipboard: originalClipboard });
  });

  it('dispara onApplyParaphrase al presionar Reemplazar en Manuscrito', async () => {
    const onApplyParaphrase = vi.fn().mockResolvedValue(undefined);
    render(
      <AiHierarchy
        elements={mockElements}
        items={mockAiItems}
        paragraphs={mockParagraphs}
        onApplyParaphrase={onApplyParaphrase}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Capítulo 1/ }));
    const applyBtn = screen.getByRole('button', { name: /Reemplazar en Manuscrito/i });
    fireEvent.click(applyBtn);
    expect(onApplyParaphrase).toHaveBeenCalledWith(mockAiItems[0], mockAiItems[0].suggestedText);
  });

  it('el perfil dibuja un punto por párrafo medido', () => {
    render(<AiHierarchy elements={mockElements} items={mockAiItems} paragraphs={mockParagraphs} />);
    expect(document.querySelectorAll('.aip-punto')).toHaveLength(mockParagraphs.length);
  });

  it('el perfil abre la fase al pulsar su título', () => {
    render(<AiHierarchy elements={mockElements} items={mockAiItems} paragraphs={mockParagraphs} />);
    fireEvent.click(screen.getByRole('button', { name: /Capítulo 1: Introducción/ }));
    expect(screen.getByText('‹ Mapa IA')).toBeTruthy();
  });

  it('un punto con hallazgo salta al workbench', () => {
    const onOpenInWorkbench = vi.fn();
    render(
      <AiHierarchy
        elements={mockElements}
        items={mockAiItems}
        paragraphs={mockParagraphs}
        onOpenInWorkbench={onOpenInWorkbench}
      />,
    );
    const puntos = document.querySelectorAll('.aip-punto');
    /* puntos[1] es el párrafo index 1 → element_id 'h2-1', que sí tiene hallazgo. */
    fireEvent.click(puntos[1] as HTMLElement);
    expect(onOpenInWorkbench).toHaveBeenCalledWith(mockAiItems[0]);
  });

  it('el mapa ofrece Siguiente con IA', () => {
    render(<AiHierarchy elements={mockElements} items={mockAiItems} paragraphs={mockParagraphs} />);
    expect(screen.getByRole('button', { name: /Siguiente con IA/i })).toBeTruthy();
  });

  it('el botón de volver del capítulo aislado dice «‹ Mapa IA»', () => {
    render(<AiHierarchy elements={mockElements} items={mockAiItems} paragraphs={mockParagraphs} />);
    fireEvent.click(screen.getByRole('button', { name: /Capítulo 1/ }));
    expect(screen.getByText('‹ Mapa IA')).toBeTruthy();
  });
});
```

- [ ] **Paso 2: correr el test y verlo fallar** (falta la prop `paragraphs` y el mapa sigue siendo el viejo):

```
node_modules\.bin\vitest.cmd run src/__tests__/aiHierarchy.test.tsx
```

Esperado: error de tipos por `paragraphs` no declarada y/o 0 `.aip-punto`.

### 3.B — Editar `AiHierarchy.tsx` (ediciones exactas)

- [ ] **Paso 3: imports** — reemplazar exactamente:

```tsx
import type { ElementModel } from '../../types';
import type { AuditItem } from '../../lib/auditItems';
import { construirJerarquia, type NodoJerarquia } from '../../lib/jerarquia';
import { construirHeatmap } from '../../lib/aiHeatmap';
import { AiHeatmap } from './AiHeatmap';
import { AiChapterGrid } from './AiChapterGrid';
import { AiChapterFocus } from './AiChapterFocus';
```

por:

```tsx
import type { ElementModel } from '../../types';
import type { AuditItem } from '../../lib/auditItems';
import type { AIReviewParagraph } from '../../api/backend';
import { construirJerarquia, type NodoJerarquia } from '../../lib/jerarquia';
import { construirPerfilIA } from '../../lib/aiPerfil';
import { AiProfile } from './AiProfile';
import { AiChapterFocus } from './AiChapterFocus';
```

- [ ] **Paso 4: props** — reemplazar exactamente:

```tsx
export interface AiHierarchyProps {
  elements: readonly ElementModel[] | null;
  items: readonly AuditItem[];
```

por:

```tsx
export interface AiHierarchyProps {
  elements: readonly ElementModel[] | null;
  paragraphs: readonly AIReviewParagraph[];
  items: readonly AuditItem[];
```

- [ ] **Paso 5: destructuring** — reemplazar exactamente:

```tsx
export function AiHierarchy({
  elements,
  items,
```

por:

```tsx
export function AiHierarchy({
  elements,
  paragraphs,
  items,
```

- [ ] **Paso 6: memo del perfil** — reemplazar exactamente el bloque `heatFila/heatMax`:

```tsx
  // Mapa de calor H1 × rango de índice IA (mismo motor que alimenta el hero)
  const { filas: heatFila, max: heatMax } = useMemo(
    () =>
      construirHeatmap(
        chapters.map((c) => ({
          id: c.id,
          titulo: c.title,
          findings: c.subsections.flatMap((s) => s.findings),
        })),
      ),
    [chapters],
  );
```

por:

```tsx
  // Perfil completo del documento (misma fuente que el hero y el mapa)
  const perfil = useMemo(() => construirPerfilIA(paragraphs, elements), [paragraphs, elements]);
```

- [ ] **Paso 7: métricas macro** — reemplazar exactamente:

```tsx
  // Métricas macro
  const totalParagraphsEstimated = useMemo(() => {
    if (!elements) return 0;
    return elements.filter((e) => e.type === 'paragraph' || e.type === 'block_quote').length || 1;
  }, [elements]);

  const flaggedParagraphsCount = aiItems.length;
  const humanIntegrityPct =
    totalParagraphsEstimated > 0
      ? Math.max(0, Math.min(100, Math.round(((totalParagraphsEstimated - flaggedParagraphsCount) / totalParagraphsEstimated) * 100)))
      : 100;
  const syntheticPct = 100 - humanIntegrityPct;

  const criticalPeakChapter = useMemo(() => {
    if (!chapters.length) return null;
    let maxChap = chapters[0];
    for (const ch of chapters) {
      if (ch.iaScore > maxChap.iaScore) maxChap = ch;
    }
    return maxChap;
  }, [chapters]);
```

por:

```tsx
  // Métricas macro: leídas del perfil, sin re-derivar conteos.
  const humanIntegrityPct = perfil.vozHumana;
  const syntheticPct = perfil.rigidezMedia;
  const flaggedParagraphsCount = perfil.enAlerta;
  const totalParagraphsEstimated = perfil.total;
  const criticalPeakChapter = perfil.filaMasRigida;
```

- [ ] **Paso 8: helper `abrirParrafo`** — reemplazar exactamente:

```tsx
  const handleApply = async (finding: AuditItem, proposal: string) => {
    if (busy || !onApplyParaphrase || !proposal.trim()) return;
    await onApplyParaphrase(finding, proposal);
    setAppliedIds((prev) => [...prev, finding.id]);
  };
```

por:

```tsx
  const handleApply = async (finding: AuditItem, proposal: string) => {
    if (busy || !onApplyParaphrase || !proposal.trim()) return;
    await onApplyParaphrase(finding, proposal);
    setAppliedIds((prev) => [...prev, finding.id]);
  };

  /* Un punto del perfil salta al hallazgo de ese párrafo en el workbench.
     Si el párrafo no tiene hallazgo, el clic no tiene destino y no hace nada. */
  const abrirParrafo = (elementId: string) => {
    const it = itemsByElemId.get(elementId)?.[0];
    if (it && onOpenInWorkbench) onOpenInWorkbench(it);
  };
```

- [ ] **Paso 9: chip "pico crítico"** — reemplazar exactamente:

```tsx
            <StatChip
              icon={<TrendingUp size={14} aria-hidden />}
              valor={criticalPeakChapter ? `${criticalPeakChapter.iaScore}%` : '—'}
              etiqueta="pico crítico"
              titulo={
                criticalPeakChapter
                  ? `${criticalPeakChapter.h1Number}: ${criticalPeakChapter.title}`
                  : 'Sin picos de IA'
              }
            />
```

por:

```tsx
            <StatChip
              icon={<TrendingUp size={14} aria-hidden />}
              valor={criticalPeakChapter ? `${criticalPeakChapter.rigidezMedia}%` : '—'}
              etiqueta="pico crítico"
              titulo={criticalPeakChapter ? criticalPeakChapter.titulo : 'Sin picos de IA'}
            />
```

- [ ] **Paso 10: quitar el heatmap** — eliminar exactamente estas dos líneas (y su comentario):

```tsx
        {/* Mapa de calor H1 × rango */}
        <AiHeatmap filas={heatFila} max={heatMax} />

```

- [ ] **Paso 11: montar `AiProfile`** — reemplazar exactamente:

```tsx
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>
          <AiChapterGrid
            chapters={chapters.map((c) => ({
              id: c.id,
              titulo: c.title,
              findings: c.subsections.flatMap((s) => s.findings),
              score: c.iaScore,
            }))}
            onOpen={setCapAbierto}
          />
        </div>
```

por:

```tsx
        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-6)' }}>
          <AiProfile
            perfil={perfil}
            activoH1Id={capAbierto}
            onOpenPhase={setCapAbierto}
            onSelectParrafo={abrirParrafo}
          />
        </div>
```

### 3.C — Editar `AiRoom.tsx` y `ReviewWorkbench.tsx`

- [ ] **Paso 12: `AiRoom.tsx`** — reemplazar exactamente:

```tsx
      <AiHierarchy
        elements={elements}
        items={aiItems}
```

por:

```tsx
      <AiHierarchy
        elements={elements}
        paragraphs={reviewResult?.paragraphs ?? []}
        items={aiItems}
```

- [ ] **Paso 13: `ReviewWorkbench.tsx`, selector del store** — reemplazar exactamente:

```tsx
  const wb = useReviewWorkbench();
  const doc = useDocStore((s) => s.doc);
```

por:

```tsx
  const wb = useReviewWorkbench();
  const doc = useDocStore((s) => s.doc);
  /* Los párrafos medidos por el revisor IA. El perfil del mapa se construye de
     acá, no de los hallazgos: es la fuente única que comparten hero y mapa. */
  const reviewResult = useDocStore((s) => s.reviewResult);
```

- [ ] **Paso 14: `ReviewWorkbench.tsx`, prop del componente** — reemplazar exactamente:

```tsx
          <AiHierarchy
            elements={doc?.elements ?? null}
            items={wb.items}
```

por:

```tsx
          <AiHierarchy
            elements={doc?.elements ?? null}
            paragraphs={reviewResult?.paragraphs ?? []}
            items={wb.items}
```

- [ ] **Paso 15: correr el test y verlo pasar:**

```
node_modules\.bin\vitest.cmd run src/__tests__/aiHierarchy.test.tsx
```

Esperado: 10 tests en verde.

- [ ] **Paso 16: verificar tipos del cableado:**

```
node_modules\.bin\tsc.cmd --noEmit
```

Esperado: sin errores de `paragraphs` ni imports colgando.

- [ ] **Verificación: dejar tests en verde; NO commitear.**

---

## Task 4 — Eliminar el diseño viejo y verificar

**Files:**
- Delete: `src/components/review/AiHeatmap.tsx`
- Delete: `src/components/review/AiChapterGrid.tsx`
- Delete: `src/lib/aiHeatmap.ts`
- Delete: `src/__tests__/aiHeatmap.test.ts`

**Interfaces:**
- Consumes: nada (limpieza).
- Produces: repositorio sin `AiHeatmap` / `AiChapterGrid` / `aiHeatmap` ni la etiqueta "sin medición".

- [ ] **Paso 1: eliminar los cuatro archivos** (usar `git.exe`, nunca `git`):

```
git.exe rm src/components/review/AiHeatmap.tsx src/components/review/AiChapterGrid.tsx src/lib/aiHeatmap.ts src/__tests__/aiHeatmap.test.ts
```

Si algún archivo no estuviera trackeado por git, usar `Remove-Item` para el que falte:

```
Remove-Item src/components/review/AiHeatmap.tsx, src/components/review/AiChapterGrid.tsx, src/lib/aiHeatmap.ts, src/__tests__/aiHeatmap.test.ts -ErrorAction SilentlyContinue
```

- [ ] **Paso 2: verificar que no queden imports colgando:**

```
Select-String -Path src -Pattern "AiHeatmap|AiChapterGrid|aiHeatmap|sin medición" -Recurse
```

Esperado: cero coincidencias. Si aparece alguna, eliminarla antes de continuar.

- [ ] **Paso 3: verificar tipos del repo:**

```
node_modules\.bin\tsc.cmd --noEmit
```

Esperado: sin errores.

- [ ] **Paso 4: correr la suite focalizada:**

```
node_modules\.bin\vitest.cmd run src/__tests__/aiPerfil.test.ts src/__tests__/aiProfile.test.tsx src/__tests__/aiHierarchy.test.tsx
```

Esperado: los tres archivos en verde (10 + 5 + 10 tests).

- [ ] **Paso 5: correr la suite completa:**

```
npm test
```

Esperado: verde, sin referencias a `aiHeatmap` ni a `AiChapterGrid`.

- [ ] **Verificación: dejar tests en verde; NO commitear.**
