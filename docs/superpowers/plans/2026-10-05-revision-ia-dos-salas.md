# Revisión & IA en dos salas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer la fase Paso 5 como una puerta limpia con % combinado 70/30 y dos salas separadas —Sala de Revisión (motores objetivos) y Sala de IA (detector probabilístico)— cada una con patrón dashboard→detalle, sin mezclar jamás sus hallazgos.

**Architecture:** El orquestador `Step5AuditIAWizard` enruta `gate | rev-l0 | rev-l1 | rev-l2 | ai`; la Sala de IA anida su sub-nivel en el orquestador (`L0` dashboard → `L1` detalle → vista previa). Los datos salen de fuentes únicas ya existentes: `reviewItems`/`collectAuditItems` para revisión, `construirPerfilIA` para IA, `objetivosBloom` para objetivos. Todo color es un token; la IA solo se marca para revisar.

**Tech Stack:** React 18 + TypeScript, Vite 5, Zustand (`useDocStore`), Vitest + Testing Library, FastAPI + pytest, `python-docx`. Gráficos con SVG/CSS puro sobre tokens (sin librería nueva).

**Spec:** docs/superpowers/specs/2026-10-05-revision-ia-dos-salas-design.md

## Global Constraints
- CERO emojis: toda cadena de UI usa texto plano o iconos `lucide-react`; los tests de frases lo verifican con regex.
- Solo tokens CSS: prohibido hex/rgb/rgba/hsl en `src/`; los colores nuevos se DECLARAN en `src/styles/design-system.css`.
- La IA es probabilística: solo «Marcar para revisar»; ninguna ruta escribe texto de IA por sí sola.
- La portada se mide pero no se escribe: `readOnly` ⇒ sin botón de aceptar (ni individual ni masivo).
- Sincronización de dos canales: subrayado inline (`ReadingText`) y burbuja (`WhatsAppComment`) leen el mismo `buildCommentContext`.
- El rail cuenta una sola vez desde `lib/auditItems.ts` (`reviewItems`); ninguna sala re-deriva pendientes.
- Un solo umbral de IA: `UMBRAL_IA = 50` en `src/lib/aiPerfil.ts`, espejo de `AI_UMBRAL = 50` en `python/main.py`.
- La fase de un hallazgo es dato del H1 (nunca búsqueda de palabras en el cuerpo).
- Selección de frases de mascota determinista: prohibido `Math.random`.
- `PaperCanvas.computePages` mantiene la portada como bloque indivisible; `use_original_cover` no se muta.

## Review Focus
1. **Doble escala de IA**: un `ai_score` 0–1 tratado como 0–100 (o al revés) muestra «1%» o «8000%»; el único punto de normalización es `construirPerfilIA` + `UMBRAL_IA`.
2. **Denominador de párrafos inconsistente**: si la puerta y REV-L0 llaman `cumplimiento` con conteos de párrafos distintos, los dos % no cuadran; ambos usan `contarParrafos(elements)`.
3. **El rail contradice la pantalla**: si una sala cuenta hallazgos con una lista propia, el punto del rail miente; todo conteo sale de `reviewItems`.
4. **La IA se «acepta»**: si REV-L1 ofrece «Aceptar» sobre `category === 'ai'`, el motor probabilístico escribe texto del autor; la acción se deriva con `accionDeItem`.
5. **La portada se escribe**: si `readOnly`/`phase === 'portada'` no bloquea el botón, se muta la portada original; el bloqueo es por dato, no por texto.

---

### Task 1: `cumplimiento` con denominador de párrafos

**Files:**
- Modify: `src/lib/informeRevision.ts:79-87`
- Modify: `src/hooks/useReviewWorkbench.ts:46,535,901`
- Modify: `src/__tests__/useReviewWorkbench.test.ts:286-293`
- Test: `src/__tests__/informeRevision.test.ts:67-73`

**Interfaces:**
- Consumes: `ElementModel` de `src/types`.
- Produces:
  - `contarParrafos(elements: readonly ElementModel[]): number`
  - `cumplimiento(hallazgos: number, parrafos: number): number`

- [ ] **Step 1: Write the failing test**

Reemplazar el bloque `describe('cumplimiento', ...)` de `src/__tests__/informeRevision.test.ts`:

```ts
import { contarParrafos } from '../lib/informeRevision';

describe('contarParrafos', () => {
  it('cuenta prosa corrida y no títulos, figuras ni tablas', () => {
    const elements = [
      { id: 'h1', type: 'heading', heading_level: 1, text: 'Método' },
      { id: 'p1', type: 'paragraph', heading_level: null, text: 'uno' },
      { id: 'b1', type: 'bullet', heading_level: null, text: 'dos' },
      { id: 'n1', type: 'numbered_list', heading_level: null, text: 'tres' },
      { id: 'img', type: 'image', heading_level: null, text: '' },
    ] as ElementModel[];
    expect(contarParrafos(elements)).toBe(3);
  });
});

describe('cumplimiento', () => {
  it('normaliza por tamaño: 12 hallazgos en 214 párrafos dan 89', () => {
    expect(cumplimiento(12, 214)).toBe(89);
  });

  it('sin hallazgos es 100 y sin párrafos también es 100', () => {
    expect(cumplimiento(0, 214)).toBe(100);
    expect(cumplimiento(5, 0)).toBe(100);
  });

  it('nunca baja de 0 ni pasa de 100', () => {
    expect(cumplimiento(1, 2)).toBe(0);
    expect(cumplimiento(200, 100)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "cumplimiento"` ; Expected: FAIL porque `contarParrafos` no existe y `cumplimiento` recibe un solo argumento.

- [ ] **Step 3: Write minimal implementation**

Reemplazar en `src/lib/informeRevision.ts`:

```ts
/** Párrafos de prosa corrida: el denominador de la calificación. No cuenta
 *  títulos, figuras, tablas ni portada; la revisión se mide sobre el cuerpo. */
export function contarParrafos(elements: readonly ElementModel[]): number {
  let n = 0;
  for (const e of elements) {
    if (e.type === 'paragraph' || e.type === 'bullet' || e.type === 'numbered_list') n += 1;
  }
  return n;
}

/**
 * El porcentaje «LISTO PARA PUBLICAR», normalizado por TAMAÑO. La definición
 * vieja (`100 - total*3`) llegaba a 0 con 34 hallazgos y una tesis real (100+)
 * quedaba muerta. La nueva es la ÚNICA: cada hallazgo pesa 200/párrafos, y sin
 * párrafos no hay nada que descontar (100).
 */
export function cumplimiento(hallazgos: number, parrafos: number): number {
  if (!parrafos || parrafos <= 0) return 100;
  const valor = 100 - 200 * (hallazgos / parrafos);
  return Math.max(0, Math.min(100, Math.round(valor)));
}
```

Y actualizar el consumidor `useReviewWorkbench` para que pase el total de párrafos (si no, no compila con la firma nueva):

En `src/hooks/useReviewWorkbench.ts`, cambiar el import:

```ts
import { contarParrafos, cumplimiento } from '../lib/informeRevision';
```

Y calcular `parrafos` junto a `elements` (después de `const elements = useMemo(...)`, ~línea 535):

```ts
  const parrafos = useMemo(() => contarParrafos(elements), [elements]);
```

Y en el retorno (~línea 901):

```ts
    metrics: {
      total,
      compliance: threeEnginesRan ? cumplimiento(total, parrafos) : null,
    },
```

En `src/__tests__/useReviewWorkbench.test.ts`, actualizar el test del cumplimiento (líneas 286-293):

```ts
  it('con los tres motores ejecutados el cumplimiento sí es un número', () => {
    useDocStore.setState(tresMotores);
    const { result } = renderHook(() => useReviewWorkbench());
    // 1 hallazgo (la ortografía) en 2 párrafos: 100 - 200·(1/2) = 0.
    expect(result.current.items).toHaveLength(1);
    expect(result.current.metrics.compliance).toBe(0);
  });
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "cumplimiento"` ; Expected: PASS (incluye `contarParrafos`). Run: `npm test -- -t "useReviewWorkbench"` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/informeRevision.ts src/hooks/useReviewWorkbench.ts src/__tests__/informeRevision.test.ts src/__tests__/useReviewWorkbench.test.ts
git commit -m "feat(revision): cumplimiento normalizado por tamano"
```

---

### Task 2: Biblioteca `mascotaFrases`

**Files:**
- Create: `src/lib/mascotaFrases.ts`
- Test: `src/__tests__/mascotaFrases.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type BandaRevision = 'solida' | 'buena' | 'media' | 'baja'`
  - `type BandaIA = 'bajo' | 'medio' | 'alto'`
  - `bandaRevision(score: number): BandaRevision`
  - `bandaFraseIA(score: number): BandaIA | null`
  - `colorDeRevision(score: number): string`
  - `frasesRevision`, `frasesIA`
  - `fraseDeRevision(score: number, seed?: string): string`
  - `fraseDeIA(score: number, seed?: string): string`

- [ ] **Step 1: Write the failing test**

`src/__tests__/mascotaFrases.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  bandaRevision, bandaFraseIA, colorDeRevision,
  frasesRevision, frasesIA, fraseDeRevision, fraseDeIA,
} from '../lib/mascotaFrases';

const SIN_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;

describe('bandas de revisión', () => {
  it('corta en 90/80/60', () => {
    expect(bandaRevision(90)).toBe('solida');
    expect(bandaRevision(89)).toBe('buena');
    expect(bandaRevision(80)).toBe('buena');
    expect(bandaRevision(79)).toBe('media');
    expect(bandaRevision(60)).toBe('media');
    expect(bandaRevision(59)).toBe('baja');
  });

  it('colorea por banda con tokens, nunca hex', () => {
    for (const s of [95, 85, 70, 40]) expect(colorDeRevision(s)).toMatch(/^var\(--/);
  });

  it('tiene la frase del spec en cada banda', () => {
    expect(frasesRevision.solida).toContain('Esto está sólido, sigue así.');
    expect(frasesRevision.baja).toContain('Así no lo entregues.');
  });
});

describe('bandas de IA', () => {
  it('corta en 20/50/75 y deja limpio lo que no llega a 20', () => {
    expect(bandaFraseIA(19)).toBeNull();
    expect(bandaFraseIA(20)).toBe('bajo');
    expect(bandaFraseIA(49)).toBe('bajo');
    expect(bandaFraseIA(50)).toBe('medio');
    expect(bandaFraseIA(74)).toBe('medio');
    expect(bandaFraseIA(75)).toBe('alto');
  });

  it('tiene la frase del spec en cada banda', () => {
    expect(frasesIA.bajo).toContain('Hay un poco de IA en tu párrafo.');
    expect(frasesIA.alto).toContain('Lo copiaste tal cual, hermano.');
  });
});

describe('selección determinista y sin emojis', () => {
  it('el mismo seed da la misma frase y ninguno lleva emojis', () => {
    const a = fraseDeRevision(85, 'h1-a');
    const b = fraseDeRevision(85, 'h1-a');
    expect(a).toBe(b);
    expect(a).not.toMatch(SIN_EMOJI);
    expect(fraseDeIA(80, 'p-1')).not.toMatch(SIN_EMOJI);
  });

  it('un score limpio no habla', () => {
    expect(fraseDeIA(10, 'p-1')).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "bandas"` ; Expected: FAIL, `src/lib/mascotaFrases.ts` no existe.

- [ ] **Step 3: Write minimal implementation**

`src/lib/mascotaFrases.ts`:

```ts
/* WordAPA7 — voz de la mascota en las dos salas.
   Determinista por seed (nada de Math.random): la misma sección dice la misma
   frase entre renders, y por eso es testeable. Sin emojis (AGENTS.md §1). */

export type BandaRevision = 'solida' | 'buena' | 'media' | 'baja';
export type BandaIA = 'bajo' | 'medio' | 'alto';

/** Banda de color del % de revisión: verde ≥90 · azul 80–89 · ámbar 60–79 · rojo <60. */
export function bandaRevision(score: number): BandaRevision {
  if (score >= 90) return 'solida';
  if (score >= 80) return 'buena';
  if (score >= 60) return 'media';
  return 'baja';
}

/** Banda de frase de IA, alineada a `BANDAS_IA` (cortes 20/50/75). <20 no habla. */
export function bandaFraseIA(score: number): BandaIA | null {
  if (score >= 75) return 'alto';
  if (score >= 50) return 'medio';
  if (score >= 20) return 'bajo';
  return null;
}

export function colorDeRevision(score: number): string {
  switch (bandaRevision(score)) {
    case 'solida': return 'var(--color-success)';
    case 'buena': return 'var(--color-accent)';
    case 'media': return 'var(--color-warning)';
    default: return 'var(--color-danger)';
  }
}

export const frasesRevision: Record<BandaRevision, readonly string[]> = {
  solida: ['Esto está sólido, sigue así.'],
  buena: ['Vas bien, pero hay tela que cortar.'],
  media: ['Esto pide una pasada en serio.'],
  baja: ['Así no lo entregues.'],
};

export const frasesIA: Record<BandaIA, readonly string[]> = {
  bajo: ['Hay un poco de IA en tu párrafo.'],
  medio: ['Hay un poco de párrafo en tu IA.'],
  alto: ['Lo copiaste tal cual, hermano.'],
};

/** FNV-1a: hash estable de string a índice. Sin azar, sin dependencias. */
function indiceEstable(seed: string, largo: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % Math.max(1, largo);
}

export function fraseDeRevision(score: number, seed = 'doc'): string {
  const lista = frasesRevision[bandaRevision(score)];
  return lista[indiceEstable(seed, lista.length)];
}

export function fraseDeIA(score: number, seed = 'doc'): string {
  const banda = bandaFraseIA(score);
  if (banda === null) return '';
  const lista = frasesIA[banda];
  return lista[indiceEstable(seed, lista.length)];
}
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "mascotaFrases"` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mascotaFrases.ts src/__tests__/mascotaFrases.test.ts
git commit -m "feat(revision): biblioteca determinista de frases de mascota"
```

---

### Task 3: Umbral único de IA

**Files:**
- Modify: `src/lib/aiPerfil.ts:22`
- Modify: `src/lib/auditItems.ts:202-204,256-258`
- Modify: `python/main.py:2948-2951,3001-3002`
- Test: `src/__tests__/aiPerfil.test.ts` (añadir), `python/tests/test_umbral_ia.py` (crear)

**Interfaces:**
- Consumes: `AIReviewParagraph` de `src/api/backend`.
- Produces: `UMBRAL_IA: number` (frontend), `AI_UMBRAL: int` (backend).

- [ ] **Step 1: Write the failing test**

Añadir a `src/__tests__/aiPerfil.test.ts`:

```ts
import { UMBRAL_IA } from '../lib/aiPerfil';

describe('umbral único de IA', () => {
  it('es 50 y coincide con la banda alta', () => {
    expect(UMBRAL_IA).toBe(50);
    expect(bandaDe(UMBRAL_IA)).toBe(2);
  });
});
```

Y crear `python/tests/test_umbral_ia.py`:

```python
"""Un solo umbral de IA: el backend y el frontend no pueden divergir."""
import re
from pathlib import Path


def test_umbral_backend_espeja_frontend():
    raiz = Path(__file__).resolve().parents[2]
    main_py = (raiz / "python" / "main.py").read_text(encoding="utf-8")
    ai_perfil = (raiz / "src" / "lib" / "aiPerfil.ts").read_text(encoding="utf-8")

    backend = re.search(r"^AI_UMBRAL\s*=\s*(\d+)", main_py, re.MULTILINE)
    frontend = re.search(r"export const UMBRAL_IA\s*=\s*(\d+)", ai_perfil)

    assert backend is not None, "main.py debe declarar AI_UMBRAL"
    assert frontend is not None, "aiPerfil.ts debe declarar UMBRAL_IA"
    assert backend.group(1) == frontend.group(1)
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "umbral único"` ; Expected: FAIL, `UMBRAL_IA` no existe. Run: `pytest python/tests/test_umbral_ia.py -q` ; Expected: FAIL, `AI_UMBRAL` no existe.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/aiPerfil.ts`, reemplazar `export const ALERTA_MIN = 50;` por:

```ts
/** Umbral ÚNICO de alerta de IA (0–100), alineado a la banda `alta`. Espejo de
 *  `AI_UMBRAL` en `python/main.py`; `test_umbral_ia.py` falla si divergen. */
export const UMBRAL_IA = 50;
```

En `src/lib/auditItems.ts`, añadir el import y reemplazar el bloque del detector:

```ts
import { UMBRAL_IA } from './aiPerfil';
```

```ts
  // 1. Detector de IA: párrafos medidos por encima del umbral; los que llegan
  //    sin puntuación entran solo por su categoría, sin inventar un número.
  for (const [idx, p] of (reviewResult?.paragraphs || []).entries()) {
    const score = p.ai_score || 0;
    const medido = score > 0;
    const entra = medido
      ? score >= UMBRAL_IA
      : p.ai_category === 'HIGH' || p.ai_category === 'MEDIUM';
    if (!entra) continue;
```

Borrar la línea `export const AI_PARAGRAPH_THRESHOLD = 45;` y su comentario.

En `python/main.py`, añadir la constante antes de `ai_review_endpoint` y usarla:

```python
# Umbral ÚNICO de alerta de IA (0–100), espejo de `UMBRAL_IA` en src/lib/aiPerfil.ts.
AI_UMBRAL = 50


@app.post("/api/ai-review/{session_id}")
async def ai_review_endpoint(session_id: str, request: Request) -> dict:
```

```python
        if ai_score >= AI_UMBRAL:
            flagged += 1
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "umbral único"` ; Expected: PASS. Run: `pytest python/tests/test_umbral_ia.py -q` ; Expected: PASS. Run: `npm test -- -t "useReviewWorkbench"` ; Expected: PASS (el párrafo `ai_score: 0, ai_category: 'HIGH'` sigue entrando).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiPerfil.ts src/lib/auditItems.ts src/__tests__/aiPerfil.test.ts python/main.py python/tests/test_umbral_ia.py
git commit -m "fix(ia): un solo umbral de alerta (50)"
```

---

### Task 4: Personaje humano (señor gordito)

**Files:**
- Create: `src/components/layout/HumanMascot.tsx`
- Modify: `src/styles/design-system.css` (tokens + clases)
- Test: `src/__tests__/humanMascot.test.tsx`

**Interfaces:**
- Consumes: nada.
- Produces: `HumanMascot` con props `{ size?: number }`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/humanMascot.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { HumanMascot } from '../components/layout/HumanMascot';

describe('HumanMascot', () => {
  it('dibuja cuerpo completo: camisa, parche, pelo y zapatos', () => {
    const { container } = render(<HumanMascot size={64} />);
    const svg = container.querySelector('svg.human-mascot');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 64 84');
    expect(container.querySelectorAll('.human-mascot-shoe')).toHaveLength(2);
    expect(container.querySelector('.human-mascot-patch')).not.toBeNull();
    expect(container.querySelector('.human-mascot-hair')).not.toBeNull();
    expect(container.querySelector('.human-mascot-shirt')).not.toBeNull();
  });

  it('ningún color es un literal: todo es var(--token) o none', () => {
    const { container } = render(<HumanMascot />);
    for (const el of Array.from(container.querySelectorAll('svg *'))) {
      for (const attr of ['fill', 'stroke']) {
        const v = el.getAttribute(attr);
        if (v && v !== 'none') expect(v.startsWith('var(--')).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "HumanMascot"` ; Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Write minimal implementation**

En `src/styles/design-system.css`, dentro de `:root`, añadir:

```css
  /* Personaje humano (puerta de Fase 5): piel morena, camisa celeste, pelo
     desordenado, parche en un ojo. Definidos una vez, como toda la paleta. */
  --mascot-skin: #a9714b;
  --mascot-shirt: #8ec9f0;
  --mascot-hair: #241d1a;
  --mascot-pants: #3b4a63;
  --mascot-shoe: #2b2b2b;
  --mascot-ink: var(--text-main);
```

Y junto a `.editorial-mascot`:

```css
.human-mascot { overflow: visible; }
.human-mascot .human-mascot-skin { fill: var(--mascot-skin); stroke: var(--mascot-ink); stroke-width: 1.6; stroke-linejoin: round; }
.human-mascot .human-mascot-shirt { fill: var(--mascot-shirt); stroke: var(--mascot-ink); stroke-width: 1.6; stroke-linejoin: round; }
.human-mascot .human-mascot-seam { fill: none; stroke: var(--mascot-ink); stroke-width: 1.1; stroke-linecap: round; }
.human-mascot .human-mascot-btn { fill: var(--mascot-ink); }
.human-mascot .human-mascot-hair { fill: var(--mascot-hair); stroke: var(--mascot-ink); stroke-width: 1.2; stroke-linejoin: round; }
.human-mascot .human-mascot-strap { stroke: var(--mascot-ink); stroke-width: 2; stroke-linecap: round; }
.human-mascot .human-mascot-patch,
.human-mascot .human-mascot-eye { fill: var(--mascot-ink); }
.human-mascot .human-mascot-pants { fill: var(--mascot-pants); stroke: var(--mascot-ink); stroke-width: 1.6; stroke-linejoin: round; }
.human-mascot .human-mascot-shoe { fill: var(--mascot-shoe); stroke: var(--mascot-ink); stroke-width: 1.5; stroke-linejoin: round; }
.human-mascot .human-mascot-mouth { fill: none; stroke: var(--mascot-hair); stroke-width: 1.6; stroke-linecap: round; }
```

`src/components/layout/HumanMascot.tsx` (el SVG es el del mockup `ui-0-puerta-fase5.html`, con clases en vez de estilos):

```tsx
import React from 'react';

export interface HumanMascotProps {
  size?: number;
}

/** El personaje humano de la puerta de Fase 5: morena, pelo desordenado y
 *  levantado, camisa celeste abierta con botones desabotonados, parche en un
 *  ojo, cuerpo completo con piernas y zapatos. Vive en `components/layout`
 *  como la familia editorial; sus colores son tokens declarados. */
export const HumanMascot: React.FC<HumanMascotProps> = ({ size = 64 }) => (
  <svg
    width={size}
    height={Math.round((size * 84) / 64)}
    viewBox="0 0 64 84"
    className="human-mascot"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    style={{ display: 'block' }}
  >
    <path className="human-mascot-shirt" d="M22 33 C16 36 15 48 18 54" />
    <circle className="human-mascot-skin" cx="18.5" cy="55.5" r="2.7" />
    <path className="human-mascot-shirt" d="M42 33 C48 36 49 48 46 54" />
    <circle className="human-mascot-skin" cx="45.5" cy="55.5" r="2.7" />
    <path className="human-mascot-pants" d="M23 57 L41 57 L41 73 L33.5 73 L32 65 L30.5 73 L23 73 Z" />
    <path className="human-mascot-shoe" d="M22 72.5 h9.5 v3.2 a2.2 2.2 0 0 1 -2.2 2.2 h-5.1 a2.2 2.2 0 0 1 -2.2 -2.2 Z" />
    <path className="human-mascot-shoe" d="M32.5 72.5 h9.5 v3.2 a2.2 2.2 0 0 1 -2.2 2.2 h-5.1 a2.2 2.2 0 0 1 -2.2 -2.2 Z" />
    <path className="human-mascot-shirt" d="M22 32 Q32 28 42 32 L44 56 Q44 58 42 58 L22 58 Q20 58 20 56 Z" />
    <path className="human-mascot-skin" d="M27.5 31 L32 46 L36.5 31 Z" />
    <path className="human-mascot-seam" d="M27.5 31 L31 45" />
    <path className="human-mascot-seam" d="M36.5 31 L33 45" />
    <circle className="human-mascot-btn" cx="30.4" cy="35" r="1.05" />
    <circle className="human-mascot-btn" cx="30.9" cy="40" r="1.05" />
    <circle className="human-mascot-btn" cx="31.3" cy="45" r="1.05" />
    <rect className="human-mascot-skin" x="29.5" y="24" width="5" height="6" rx="2.2" />
    <ellipse className="human-mascot-skin" cx="32" cy="16" rx="10.5" ry="10.5" />
    <path className="human-mascot-hair" d="M21.5 15 C19 4 26 1.5 32 1.5 C38 1.5 45 4 42.5 15 C42 10 39.5 8 37.5 9 C39.5 5 34 3.5 31.5 5 C29 3.5 24.5 5 26.5 9 C24.5 8 22 10 21.5 15 Z" />
    <path className="human-mascot-hair" d="M24 6 C21.5 2.5 24.5 1 27 2.2" />
    <path className="human-mascot-hair" d="M40 6 C42.5 2.5 39.5 1 37 2.2" />
    <path className="human-mascot-hair" d="M31 2 C31.3 0.3 33.7 0.4 33.5 2" />
    <path className="human-mascot-strap" d="M20.5 12.5 L43 11" />
    <ellipse className="human-mascot-patch" cx="27" cy="15" rx="4.6" ry="4.8" />
    <circle className="human-mascot-eye" cx="36.5" cy="15" r="1.6" />
    <path className="human-mascot-mouth" d="M28.5 20.5 H35.5" />
  </svg>
);

export default HumanMascot;
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "HumanMascot"` ; Expected: PASS. Run: `npm test -- -t "tokens"` ; Expected: PASS (`noHardcodedColors` R3 ve los tokens declarados).

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/HumanMascot.tsx src/styles/design-system.css src/__tests__/humanMascot.test.tsx
git commit -m "feat(revision): personaje humano de la puerta de Fase 5"
```

---

### Task 5: Globo de mascota (`MascotaFrase`)

**Files:**
- Create: `src/components/review/MascotaFrase.tsx`
- Test: `src/__tests__/mascotaFrase.test.tsx`

**Interfaces:**
- Consumes: `EditorialMascot`, `MascotKind`, `MascotExpression` (Task existente).
- Produces: `MascotaFrase` con props `{ frase: string; kind?: MascotKind; expression?: MascotExpression; size?: number }`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/mascotaFrase.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MascotaFrase } from '../components/review/MascotaFrase';

describe('MascotaFrase', () => {
  it('muestra la frase junto a la mascota', () => {
    const { container } = render(<MascotaFrase frase="Vas bien." kind="ruler" />);
    expect(screen.getByText('Vas bien.')).toBeTruthy();
    expect(container.querySelector('.editorial-mascot')).not.toBeNull();
  });

  it('sin frase no pinta nada', () => {
    const { container } = render(<MascotaFrase frase="" />);
    expect(container.firstChild).toBeNull();
  });

  it('la frase no lleva emojis', () => {
    render(<MascotaFrase frase="Esto pide una pasada en serio." />);
    expect(screen.getByText('Esto pide una pasada en serio.').textContent)
      .not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "MascotaFrase"` ; Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Write minimal implementation**

`src/components/review/MascotaFrase.tsx`:

```tsx
import React from 'react';
import { EditorialMascot, type MascotExpression, type MascotKind } from '../layout/EditorialMascot';

export interface MascotaFraseProps {
  frase: string;
  kind?: MascotKind;
  expression?: MascotExpression;
  size?: number;
}

/** Mascota + globo con la frase de la banda. La frase la decide `mascotaFrases`;
 *  este componente solo la pinta. Sin frase no ocupa lugar. */
export const MascotaFrase: React.FC<MascotaFraseProps> = ({
  frase,
  kind = 'reference',
  expression = 'neutral',
  size = 56,
}) => {
  if (!frase) return null;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minWidth: 0 }}>
      <EditorialMascot kind={kind} expression={expression} size={size} />
      <p
        role="note"
        style={{
          margin: 0,
          maxWidth: '34ch',
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: 'var(--space-2) var(--space-3)',
          fontSize: 'var(--text-sm)',
          lineHeight: 1.4,
          color: 'var(--color-text-secondary)',
        }}
      >
        {frase}
      </p>
    </div>
  );
};

export default MascotaFrase;
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "MascotaFrase"` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/review/MascotaFrase.tsx src/__tests__/mascotaFrase.test.tsx
git commit -m "feat(revision): globo de mascota reutilizable"
```

---

### Task 6: UI 0 — Puerta de Fase 5 (`ReviewGate`)

**Files:**
- Modify: `src/components/review/ReviewGate.tsx` (reescritura completa)
- Modify: `src/components/wizard/Step5AuditIAWizard.tsx:140-155` (props de la puerta)
- Test: `src/__tests__/reviewGate.test.tsx` (reescritura completa)

**Interfaces:**
- Consumes: `AuditItem`, `ElementModel`, `AIReviewParagraph`, `contarParrafos`, `cumplimiento`, `construirPerfilIA`, `fraseDeRevision`, `colorDeRevision`, `HumanMascot`, `MascotaFrase`.
- Produces: `ReviewGate` con props `{ items: AuditItem[]; elements: readonly ElementModel[]; paragraphs: readonly AIReviewParagraph[]; isScanning: boolean; onScan: () => void; onStartRevision: () => void; onOpenAiRoom: () => void }`.

- [ ] **Step 1: Write the failing test**

Reescribir `src/__tests__/reviewGate.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewGate } from '../components/review/ReviewGate';
import type { AuditItem } from '../lib/auditItems';
import type { AIReviewParagraph } from '../api/backend';

const item = (id: string, category: AuditItem['category']): AuditItem =>
  ({ id, element_id: `e${id}`, category, subtype: 'x', severity: 'medium', summary: 's', detail: '', originalText: '', pageNumber: 1, phase: null, readOnly: false }) as AuditItem;

const par = (index: number, score: number): AIReviewParagraph =>
  ({ element_id: `e${index}`, index, type: 'paragraph', text: 'x', ai_score: score, ai_category: 'MEDIUM', findings: [], spelling: [] }) as AIReviewParagraph;

const el = (id: string): { id: string; type: string; text: string } => ({ id, type: 'paragraph', text: 'x' });

const props = (over = {}) => ({
  items: [item('1', 'style')],
  elements: [el('e1')] as never,
  paragraphs: [par(0, 10)] as never,
  isScanning: false,
  onScan: vi.fn(),
  onStartRevision: vi.fn(),
  onOpenAiRoom: vi.fn(),
  ...over,
});

describe('ReviewGate — puerta limpia 70/30', () => {
  it('combina revisión (70) e IA (30) en un solo % coloreado por banda', () => {
    // 1 hallazgo en 1 párrafo => revisión 0; IA voz humana 90 => 0.7*0 + 0.3*90 = 27
    render(<ReviewGate {...props()} />);
    expect(screen.getByTestId('gate-combinado').textContent).toBe('27%');
  });

  it('tiene dos entradas sin cards y separadas', () => {
    render(<ReviewGate {...props()} />);
    expect(screen.getByText('Empezar revisión')).toBeTruthy();
    expect(screen.getByText('Ver mapa de IA')).toBeTruthy();
    expect(screen.queryByTestId('gate-matrix')).toBeNull();
  });

  it('«Ver mapa de IA» se deshabilita sin párrafos en alerta', () => {
    render(<ReviewGate {...props({ paragraphs: [par(0, 10)] })} />);
    const boton = screen.getByText('Ver mapa de IA').closest('button') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it('las entradas navegan a cada sala', () => {
    const onStartRevision = vi.fn();
    const onOpenAiRoom = vi.fn();
    render(<ReviewGate {...props({ paragraphs: [par(0, 80)], onStartRevision, onOpenAiRoom })} />);
    fireEvent.click(screen.getByText('Empezar revisión'));
    fireEvent.click(screen.getByText('Ver mapa de IA'));
    expect(onStartRevision).toHaveBeenCalled();
    expect(onOpenAiRoom).toHaveBeenCalled();
  });

  it('sin revisión ni análisis muestra el estado vacío', () => {
    render(<ReviewGate {...props({ items: [], paragraphs: [] })} />);
    expect(screen.getByText('Aún no hay una revisión')).toBeTruthy();
  });

  it('«Reanalizar documento» dispara el escaneo', () => {
    const onScan = vi.fn();
    render(<ReviewGate {...props({ paragraphs: [par(0, 80)], onScan })} />);
    fireEvent.click(screen.getByText('Reanalizar documento'));
    expect(onScan).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "ReviewGate"` ; Expected: FAIL: la puerta vieja no tiene `gate-combinado` ni estado vacío con ese texto.

- [ ] **Step 3: Write minimal implementation**

Reescribir `src/components/review/ReviewGate.tsx`:

```tsx
/* WordAPA7 — UI 0: la puerta de Fase 5.
   Un solo % combinado 70/30 (el ÚNICO lugar donde revisión e IA se juntan) y dos
   entradas sin cards. El % de IA sale de `construirPerfilIA`; el de revisión, de
   `cumplimiento(hallazgos, contarParrafos)`. Sin emojis; todo color por token. */
import React, { useMemo } from 'react';
import { CheckCircle2, Sparkles } from 'lucide-react';
import type { AuditItem } from '../../lib/auditItems';
import type { ElementModel } from '../../types';
import type { AIReviewParagraph } from '../../api/backend';
import { contarParrafos, cumplimiento } from '../../lib/informeRevision';
import { construirPerfilIA } from '../../lib/aiPerfil';
import { fraseDeRevision, colorDeRevision } from '../../lib/mascotaFrases';
import { HumanMascot } from '../layout/HumanMascot';

export interface ReviewGateProps {
  items: AuditItem[];
  elements: readonly ElementModel[];
  paragraphs: readonly AIReviewParagraph[];
  isScanning: boolean;
  onScan: () => void;
  onStartRevision: () => void;
  onOpenAiRoom: () => void;
}

export const ReviewGate: React.FC<ReviewGateProps> = ({
  items, elements, paragraphs, isScanning, onScan, onStartRevision, onOpenAiRoom,
}) => {
  const perfil = useMemo(() => construirPerfilIA(paragraphs, elements), [paragraphs, elements]);
  const parrafos = useMemo(() => contarParrafos(elements), [elements]);
  const revisionItems = useMemo(() => items.filter((it) => it.category !== 'ai'), [items]);
  const calificacion = cumplimiento(revisionItems.length, parrafos);
  const ia = perfil.vozHumana;
  const combinado = Math.round(0.7 * calificacion + 0.3 * ia);
  const motores = new Set(revisionItems.map((it) => it.category)).size;

  if (items.length === 0 && paragraphs.length === 0) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 'var(--space-8)' }}>
        <div style={{ textAlign: 'center', maxWidth: '42ch' }}>
          <CheckCircle2 size={32} color="var(--color-accent)" aria-hidden />
          <h2 style={{ margin: 'var(--space-3) 0 0', fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>Aún no hay una revisión</h2>
          <p style={{ margin: 'var(--space-2) 0 var(--space-4)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            Ejecutá el escaneo para medir ortografía, estructura, citas y voz sintética.
          </p>
          <button type="button" onClick={onScan} disabled={isScanning} style={primario}>Analizar documento</button>
        </div>
      </div>
    );
  }

  const color = colorDeRevision(combinado);
  const voz = fraseDeRevision(combinado, 'gate');

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-canvas)' }}>
      <div style={{ maxWidth: '860px', margin: '0 auto', padding: 'clamp(20px, 4vw, 48px)', display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
        <header style={{ textAlign: 'center' }}>
          <div style={eyebrow}>Paso 5 · Revisión &amp; IA</div>
          <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            Revisión e IA se combinan solo aquí. Cada una tiene su propia sala.
          </p>
        </header>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 'var(--space-6)', alignItems: 'center', paddingBottom: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div>
            <div style={eyebrow}>Salud del documento</div>
            <div data-testid="gate-combinado" style={{ fontSize: 'clamp(38px, 6vw, 56px)', fontWeight: 800, lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>
              {combinado}<span style={{ fontSize: 'var(--text-xl)', color: 'var(--color-text-tertiary)' }}>%</span>
            </div>
            <div style={{ marginTop: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', maxWidth: '360px' }}>
              <Barra etiqueta="Revisión · 70%" valor={calificacion} color="var(--color-accent)" />
              <Barra etiqueta="IA · 30%" valor={ia} color="var(--color-engine-ia)" />
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>0,7 · {calificacion} + 0,3 · {ia} = {combinado}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
            <HumanMascot size={64} />
            <p style={{ margin: 0, maxWidth: '20ch', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{voz}</p>
          </div>
        </section>

        <section aria-label="Entradas de revisión e IA" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
          <Entrada
            icono={<CheckCircle2 size={26} aria-hidden />} tono="var(--color-accent)" titulo="Empezar revisión"
            chips={[`${revisionItems.length} por revisar`, `${calificacion}% calificación`, `${motores} motores`]}
            onClick={onStartRevision}
          />
          <Entrada
            icono={<Sparkles size={26} aria-hidden />} tono="var(--color-engine-ia)" titulo="Ver mapa de IA"
            chips={[`${perfil.enAlerta} marcados`, `${perfil.vozHumana}% voz humana`, `${perfil.total} párrafos`]}
            onClick={onOpenAiRoom} disabled={perfil.enAlerta === 0}
            borde
          />
        </section>

        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button type="button" onClick={onScan} disabled={isScanning} style={fantasma}>Reanalizar documento</button>
        </div>
      </div>
    </div>
  );
};

const Barra: React.FC<{ etiqueta: string; valor: number; color: string }> = ({ etiqueta, valor, color }) => (
  <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 40px', alignItems: 'center', gap: 'var(--space-2)', fontSize: 'var(--text-xs)' }}>
    <span style={{ color: 'var(--color-text-secondary)' }}>{etiqueta}</span>
    <span style={{ height: 8, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-surface-alt)', overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${valor}%`, background: color }} />
    </span>
    <span style={{ textAlign: 'right', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{valor}</span>
  </div>
);

const Entrada: React.FC<{
  icono: React.ReactNode; tono: string; titulo: string; chips: string[];
  onClick: () => void; disabled?: boolean; borde?: boolean;
}> = ({ icono, tono, titulo, chips, onClick, disabled, borde }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    style={{
      display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) auto', alignItems: 'center', gap: 'var(--space-4)',
      textAlign: 'left', background: 'transparent', border: 'none', color: 'inherit',
      padding: 'var(--space-4) var(--space-2)', cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.5 : 1, fontFamily: 'inherit',
      borderLeft: borde ? '1px solid var(--color-border-subtle)' : 'none',
      paddingLeft: borde ? 'var(--space-5)' : 'var(--space-2)',
    }}
  >
    <span aria-hidden style={{ width: 52, height: 52, borderRadius: 'var(--radius-md)', display: 'grid', placeItems: 'center', background: 'var(--color-bg-surface-alt)', color: tono }}>{icono}</span>
    <span>
      <span style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{titulo}</span>
      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-1)', marginTop: 'var(--space-2)' }}>
        {chips.map((c) => <span key={c} style={chip}>{c}</span>)}
      </span>
    </span>
    <span aria-hidden style={{ color: tono, fontSize: 'var(--text-xl)' }}>›</span>
  </button>
);

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '1.2px', color: 'var(--color-text-tertiary)' };
const chip: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 600, padding: '2px 8px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-alt)', color: 'var(--color-text-secondary)' };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };

export default ReviewGate;
```

En `Step5AuditIAWizard.tsx`, actualizar el import de la puerta (ya no exporta `FocoRevision`) y definir el foco localmente:

```tsx
import { ReviewGate } from '../review/ReviewGate';
import { reviewItems, type AuditItem, type EngineId } from '../../lib/auditItems';
```

```tsx
/** El foco con el que una sala abre su detalle: un motor y/o una fase. */
type FocoRevision = { phase?: string; engine?: EngineId; motor?: EngineId };
```

Y actualizar el render de la puerta:

```tsx
      <ReviewGate
        items={items}
        elements={elements}
        paragraphs={reviewResult?.paragraphs ?? []}
        isScanning={isScanning}
        onScan={handleScan}
        onStartRevision={() => setPantalla('review')}
        onOpenAiRoom={() => setPantalla('ai')}
      />
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "ReviewGate"` ; Expected: PASS. Run: `npm test -- -t "noHardcodedColors"` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/review/ReviewGate.tsx src/components/wizard/Step5AuditIAWizard.tsx src/__tests__/reviewGate.test.tsx
git commit -m "feat(revision): puerta limpia con % combinado 70/30"
```

---

### Task 7: Sala de IA · IA-L0 (`AiDashboard`)

**Files:**
- Create: `src/components/review/AiDashboard.tsx`
- Modify: `src/components/review/AiRoom.tsx` (reescritura: orquesta L0/L1/preview)
- Test: `src/__tests__/aiDashboard.test.tsx`

**Interfaces:**
- Consumes: `PerfilIA`, `FilaPerfilIA`, `BANDAS_IA`, `bandaDe`, `fraseDeIA`, `MascotaFrase`, `EditorialMascot`.
- Produces: `AiDashboard` con props `{ perfil: PerfilIA; onOpenSection: (h1Id: string) => void; onOpenPreview: () => void; onBack: () => void }`; `AiRoom` con props `{ reviewResult, elements, onMark, onExit }`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/aiDashboard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiDashboard } from '../components/review/AiDashboard';
import type { PerfilIA } from '../lib/aiPerfil';

const par = (elementId: string, score: number): { elementId: string; index: number; score: number; categoria: 'HIGH'; excerpt: string; carril: number; h2Id: null; h2Titulo: null } =>
  ({ elementId, index: 0, score, categoria: 'HIGH', excerpt: 'x', carril: 0, h2Id: null, h2Titulo: null });

const perfil: PerfilIA = {
  filas: [
    { h1Id: 'h1', titulo: 'Marco teórico', fase: 'marco_teorico', porBanda: [1, 1, 1, 1], rigidezMedia: 64, parrafos: [par('p1', 82)] },
    { h1Id: 'h2', titulo: 'Introducción', fase: 'introduccion', porBanda: [2, 1, 1, 0], rigidezMedia: 48, parrafos: [par('p2', 48)] },
  ],
  total: 312, porBanda: [3, 2, 2, 1], rigidezMedia: 22, vozHumana: 78, enAlerta: 3,
  filaMasRigida: null,
};

describe('AiDashboard (IA-L0)', () => {
  it('muestra la voz humana en grande y el riesgo medio', () => {
    render(<AiDashboard perfil={perfil} onOpenSection={vi.fn()} onOpenPreview={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId('ia-voz-humana').textContent).toBe('78%');
    expect(screen.getByText(/riesgo medio de IA/)).toBeTruthy();
  });

  it('toca una fila y entra a su detalle', () => {
    const onOpenSection = vi.fn();
    render(<AiDashboard perfil={perfil} onOpenSection={onOpenSection} onOpenPreview={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Marco teórico'));
    expect(onOpenSection).toHaveBeenCalledWith('h1');
  });

  it('marca FOCO la peor sección y abre la vista previa', () => {
    const onOpenPreview = vi.fn();
    render(<AiDashboard perfil={perfil} onOpenSection={vi.fn()} onOpenPreview={onOpenPreview} onBack={vi.fn()} />);
    expect(screen.getByText('FOCO')).toBeTruthy();
    fireEvent.click(screen.getByText('Ver en documento'));
    expect(onOpenPreview).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "AiDashboard"` ; Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Write minimal implementation**

`src/components/review/AiDashboard.tsx`:

```tsx
/* WordAPA7 — Sala de IA, vista general (IA-L0). 100 % IA: el % de revisión no
   aparece acá. Una sola superficie con divisiones finas, sin cards anidadas. */
import React, { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BANDAS_IA, bandaDe, type FilaPerfilIA, type PerfilIA } from '../../lib/aiPerfil';
import { fraseDeIA } from '../../lib/mascotaFrases';
import { MascotaFrase } from './MascotaFrase';

export interface AiDashboardProps {
  perfil: PerfilIA;
  onOpenSection: (h1Id: string) => void;
  onOpenPreview: () => void;
  onBack: () => void;
}

export const AiDashboard: React.FC<AiDashboardProps> = ({ perfil, onOpenSection, onOpenPreview, onBack }) => {
  const filas = useMemo(
    () => [...perfil.filas].filter((f) => f.parrafos.length > 0).sort((a, b) => b.rigidezMedia - a.rigidezMedia),
    [perfil.filas],
  );
  const peor = filas[0]?.h1Id;

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-canvas)' }}>
      <div style={{ background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', maxWidth: '960px', margin: 'var(--space-5) auto', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>Sala de IA</h2>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Detector probabilístico · solo marcar para revisar, nunca edita</div>
          </div>
          <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Volver</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(280px, .72fr)' }}>
          <div style={{ padding: 'var(--space-5)' }}>
            <div style={eyebrow}>Voz humana del documento</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-2)', margin: 'var(--space-2) 0 var(--space-4)' }}>
              <span data-testid="ia-voz-humana" style={{ fontSize: 'clamp(30px, 5vw, 44px)', fontWeight: 800, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{perfil.vozHumana}%</span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>riesgo medio de IA <b style={{ color: 'var(--color-engine-ia)' }}>{perfil.rigidezMedia}%</b></span>
            </div>
            <div style={eyebrow}>Reparto de párrafos por nivel</div>
            <div style={{ display: 'flex', height: 14, borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)', marginTop: 'var(--space-1)' }}>
              {perfil.porBanda.map((n, i) => (
                <span key={i} style={{ width: `${(n / (perfil.total || 1)) * 100}%`, background: BANDAS_IA[i].color }} title={`${BANDAS_IA[i].label}: ${n}`} />
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
              {BANDAS_IA.map((b, i) => (
                <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <i style={{ width: 9, height: 9, borderRadius: 2, background: b.color, display: 'inline-block' }} />{b.label} · {perfil.porBanda[i]}
                </span>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-5)', marginTop: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'center' }}>
              <Cifra n={perfil.total} k="párrafos" />
              <Cifra n={perfil.enAlerta} k="en alerta" tono="var(--color-engine-ia)" />
              <button type="button" onClick={onOpenPreview} style={{ ...primario, marginLeft: 'auto' }}>Ver en documento</button>
            </div>
          </div>
          <div style={{ padding: 'var(--space-5)', background: 'var(--color-accent-a05)', display: 'grid', placeItems: 'center' }}>
            <MascotaFrase
              frase={perfil.filaMasRigida
                ? `${fraseDeIA(perfil.filaMasRigida.rigidezMedia, perfil.filaMasRigida.h1Id)} El foco está en ${perfil.filaMasRigida.titulo}: ${perfil.filaMasRigida.rigidezMedia}% en ${perfil.filaMasRigida.parrafos.length} párrafos.`
                : fraseDeIA(perfil.rigidezMedia, 'ia')}
              kind="reference" expression="curious"
            />
          </div>
        </div>

        <div style={{ borderTop: '1px solid var(--color-border-subtle)', padding: 'var(--space-4) var(--space-5) var(--space-1)' }}>
          <div style={eyebrow}>Riesgo por sección (H1) · toca una fila para entrar a su detalle</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1.25fr) 130px minmax(120px,1.9fr) 56px', gap: 'var(--space-4)', padding: 'var(--space-2) var(--space-5)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          <div>Sección</div><div>Reparto</div><div>Promedio</div><div style={{ textAlign: 'right' }}>IA</div>
        </div>
        {filas.map((fila: FilaPerfilIA) => (
          <button
            key={fila.h1Id}
            type="button"
            onClick={() => onOpenSection(fila.h1Id)}
            style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1.25fr) 130px minmax(120px,1.9fr) 56px', gap: 'var(--space-4)', alignItems: 'center', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderTop: '1px solid var(--color-border-subtle)', padding: 'var(--space-2) var(--space-5)', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}
          >
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fila.titulo}
              {fila.h1Id === peor && <span style={foco}>FOCO</span>}
              <small style={{ display: 'block', color: 'var(--color-text-secondary)', fontSize: 'var(--text-xs)' }}>{fila.parrafos.length} párrafos · {fila.porBanda[2] + fila.porBanda[3]} en alerta</small>
            </span>
            <span style={{ display: 'flex', height: 12, borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)' }}>
              {fila.porBanda.map((n, i) => (
                <span key={i} style={{ width: `${(n / (fila.parrafos.length || 1)) * 100}%`, background: BANDAS_IA[i].color }} />
              ))}
            </span>
            <span style={{ height: 10, borderRadius: 'var(--radius-full)', background: 'var(--color-bg-surface-alt)', overflow: 'hidden' }}>
              <i style={{ display: 'block', height: '100%', width: `${fila.rigidezMedia}%`, background: 'var(--color-engine-ia)' }} />
            </span>
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700, textAlign: 'right', color: 'var(--color-engine-ia)', fontVariantNumeric: 'tabular-nums' }}>{fila.rigidezMedia}%</span>
          </button>
        ))}
      </div>
    </div>
  );
};

const Cifra: React.FC<{ n: number; k: string; tono?: string }> = ({ n, k, tono }) => (
  <span><span style={{ display: 'block', fontSize: 'var(--text-lg)', fontWeight: 700, color: tono ?? 'var(--color-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{n}</span><span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{k}</span></span>
);

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 };
const foco: React.CSSProperties = { fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-warning)', border: '1px solid var(--color-warning)', borderRadius: 'var(--radius-full)', padding: '0 6px', marginLeft: 6, verticalAlign: 'middle' };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-engine-ia)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };

export default AiDashboard;
```

Reescribir `src/components/review/AiRoom.tsx` como contenedor presentacional de IA-L0. El nivel (L1/preview) vive en el orquestador; así esta tarea no deja estado muerto ni marcadores:

```tsx
import React from 'react';
import type { AIReviewResult } from '../../api/backend';
import type { ElementModel } from '../../types';
import { construirPerfilIA } from '../../lib/aiPerfil';
import { AiDashboard } from './AiDashboard';

export interface AiRoomProps {
  reviewResult: AIReviewResult | null;
  elements: readonly ElementModel[];
  onOpenSection: (h1Id: string) => void;
  onOpenPreview: () => void;
  onExit: () => void;
}

export const AiRoom: React.FC<AiRoomProps> = ({ reviewResult, elements, onOpenSection, onOpenPreview, onExit }) => {
  const perfil = construirPerfilIA(reviewResult?.paragraphs ?? [], elements);
  return (
    <AiDashboard
      perfil={perfil}
      onOpenSection={onOpenSection}
      onOpenPreview={onOpenPreview}
      onBack={onExit}
    />
  );
};

export default AiRoom;
```

En `Step5AuditIAWizard.tsx`, añadir el estado de la Sala de IA y reemplazar el bloque `pantalla === 'ai'`:

```tsx
  const [iaNivel, setIaNivel] = useState<'l0' | 'l1' | 'preview'>('l0');
  const [iaH1, setIaH1] = useState<string | null>(null);
```

```tsx
  if (pantalla === 'ai') {
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <AiRoom
          reviewResult={reviewResult}
          elements={elements}
          onOpenSection={(id) => { setIaH1(id); setIaNivel('l1'); }}
          onOpenPreview={() => setIaNivel('preview')}
          onExit={volverAPuerta}
        />
      </div>
    );
  }
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "AiDashboard"` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/review/AiDashboard.tsx src/components/review/AiRoom.tsx src/components/wizard/Step5AuditIAWizard.tsx src/__tests__/aiDashboard.test.tsx
git commit -m "feat(revision): sala de IA L0 con riesgo por H1"
```

---

### Task 8: Sala de IA · IA-L1 (`AiSectionDetail`)

**Files:**
- Modify: `src/lib/aiPerfil.ts:25-33,109-141` (agregar H2 a `ParrafoPerfilIA`)
- Create: `src/components/review/AiSectionDetail.tsx`
- Modify: `src/components/review/AiRoom.tsx` (cablear L1)
- Test: `src/__tests__/aiSectionDetail.test.tsx`

**Interfaces:**
- Consumes: `FilaPerfilIA`, `AIReviewParagraph.findings`, `bandaDe`, `BANDAS_IA`, `fraseDeIA`, `MascotaFrase`.
- Produces:
  - `ParrafoPerfilIA` con `h2Id: string | null` y `h2Titulo: string | null`.
  - `AiSectionDetail` con props `{ fila: FilaPerfilIA; paragraphs: readonly AIReviewParagraph[]; onBack: () => void; onMark: (elementId: string) => void }`.

- [ ] **Step 1: Write the failing test**

Añadir a `src/__tests__/aiPerfil.test.ts`:

```ts
it('registra el H2 ancestro de cada párrafo', () => {
  const els = [
    h1('h1-1', 'Desarrollo'),
    h1('h2-1', 'Desarrollo del marco'),
    p('p-1', 'uno'),
    h1('h2-2', 'Discusión'),
    p('p-2', 'dos'),
  ].map((e, i) => (i === 1 || i === 3 ? { ...e, type: 'heading', heading_level: 2 } : e));
  const perfil = construirPerfilIA([par(2, 80, 'uno'), par(4, 40, 'dos')], els as never);
  expect(perfil.filas[0].parrafos[0].h2Titulo).toBe('Desarrollo del marco');
  expect(perfil.filas[0].parrafos[1].h2Titulo).toBe('Discusión');
});
```

`src/__tests__/aiSectionDetail.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiSectionDetail } from '../components/review/AiSectionDetail';
import type { FilaPerfilIA } from '../lib/aiPerfil';
import type { AIReviewParagraph } from '../api/backend';

const fila: FilaPerfilIA = {
  h1Id: 'h1', titulo: 'Desarrollo', fase: null, rigidezMedia: 64, porBanda: [0, 0, 1, 1],
  parrafos: [
    { elementId: 'p1', index: 0, score: 82, categoria: 'HIGH', excerpt: 'La transformación digital', carril: 0, h2Id: 'h2a', h2Titulo: 'Marco' },
    { elementId: 'p2', index: 1, score: 54, categoria: 'MEDIUM', excerpt: 'Asimismo', carril: 0, h2Id: 'h2b', h2Titulo: 'Discusión' },
  ],
};
const paragraphs = [
  { element_id: 'p1', index: 0, type: 'paragraph', text: 'La transformación digital ha redefinido', ai_score: 82, ai_category: 'HIGH', findings: [{ phrase: 'La transformación digital', detail: 'Apertura genérica', severity: 'HIGH' }], spelling: [] },
  { element_id: 'p2', index: 1, type: 'paragraph', text: 'Asimismo', ai_score: 54, ai_category: 'MEDIUM', findings: [{ phrase: 'Asimismo', detail: 'Conector formulario', severity: 'MEDIUM' }], spelling: [] },
] as AIReviewParagraph[];

describe('AiSectionDetail (IA-L1)', () => {
  it('lista los párrafos agrupados por H2 y muestra el porqué real', () => {
    render(<AiSectionDetail fila={fila} paragraphs={paragraphs} onBack={vi.fn()} onMark={vi.fn()} />);
    expect(screen.getByText('Marco')).toBeTruthy();
    expect(screen.getByText('Discusión')).toBeTruthy();
    expect(screen.getByText(/Apertura genérica/)).toBeTruthy();
  });

  it('filtra por banda', () => {
    render(<AiSectionDetail fila={fila} paragraphs={paragraphs} onBack={vi.fn()} onMark={vi.fn()} />);
    fireEvent.click(screen.getByText('Medio · 1'));
    expect(screen.queryByText('Párrafo 1')).toBeNull();
    expect(screen.getByText('Párrafo 2')).toBeTruthy();
  });

  it('marca para revisar y nunca ofrece Aceptar', () => {
    const onMark = vi.fn();
    render(<AiSectionDetail fila={fila} paragraphs={paragraphs} onBack={vi.fn()} onMark={onMark} />);
    expect(screen.queryByText('Aceptar')).toBeNull();
    fireEvent.click(screen.getByText('Marcar para revisar'));
    expect(onMark).toHaveBeenCalledWith('p1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "AiSectionDetail"` ; Expected: FAIL, el módulo no existe y `h2Titulo` no está en el tipo.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/aiPerfil.ts`, añadir a `ParrafoPerfilIA`:

```ts
  /** H2 ancestro del párrafo, o `null` si cuelga directo del H1. La lista de
   *  IA-L1 se agrupa por H2; derivarlo en la vista sería una segunda verdad. */
  h2Id: string | null;
  h2Titulo: string | null;
```

Y en `construirPerfilIA`, extender `H1Actual` y la pasada:

```ts
interface H1Actual {
  id: string;
  titulo: string;
  fase: string | null;
  h2Id: string | null;
  h2Titulo: string | null;
}
```

```ts
  for (const el of elPorIndex) {
    if (el.heading_level === 1) {
      const nodo = nodoPorElemento.get(el.id);
      actual = {
        id: nodo?.id ?? el.id,
        titulo: (nodo?.titulo ?? el.text ?? '').trim(),
        fase: nodo?.fase ?? null,
        h2Id: null,
        h2Titulo: null,
      };
      asegurar(actual.id, actual.titulo || 'Sección sin nombre', actual.fase);
    } else if (el.heading_level === 2 && actual) {
      actual = { ...actual, h2Id: el.id, h2Titulo: (el.text ?? '').trim() || null };
    }
    h1DeIndex.push(actual);
  }
```

```ts
    fila.parrafos.push({
      elementId: elPorIndex[p.index]?.id ?? p.element_id,
      index: p.index,
      score: p.ai_score,
      categoria: p.ai_category,
      excerpt: recortar(p.text),
      carril: 0,
      h2Id: h1?.h2Id ?? null,
      h2Titulo: h1?.h2Titulo ?? null,
    });
```

`src/components/review/AiSectionDetail.tsx`:

```tsx
/* WordAPA7 — Sala de IA, detalle de una sección (IA-L1).
   Lista de párrafos agrupada por H2 + detalle. El "por qué" es dato REAL del
   detector (`findings[].detail`), no una frase genérica. Solo marcar. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Copy, RefreshCw } from 'lucide-react';
import type { AIReviewParagraph } from '../../api/backend';
import { BANDAS_IA, bandaDe, type FilaPerfilIA, type IndiceBanda, type ParrafoPerfilIA } from '../../lib/aiPerfil';
import { fraseDeIA } from '../../lib/mascotaFrases';
import { MascotaFrase } from './MascotaFrase';

export interface AiSectionDetailProps {
  fila: FilaPerfilIA;
  paragraphs: readonly AIReviewParagraph[];
  onBack: () => void;
  onMark: (elementId: string) => void;
  /** Propone una reescritura editable. Lo cablea la Task 13; sin él, el botón
   *  no hace nada (no hay motor que inventar). */
  onReformular?: (texto: string) => Promise<string>;
}

const FILTROS: { id: 'todos' | IndiceBanda; label: string }[] = [
  { id: 'todos', label: 'Todos' }, { id: 3, label: 'Alto' }, { id: 2, label: 'Medio' }, { id: 1, label: 'Bajo' },
];

export const AiSectionDetail: React.FC<AiSectionDetailProps> = ({ fila, paragraphs, onBack, onMark, onReformular }) => {
  const [filtro, setFiltro] = useState<'todos' | IndiceBanda>('todos');
  const [abiertos, setAbiertos] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(fila.parrafos[0]?.elementId ?? null);
  const [propuesta, setPropuesta] = useState('');

  const visibles = useMemo(
    () => fila.parrafos.filter((p) => filtro === 'todos' || bandaDe(p.score) === filtro),
    [fila.parrafos, filtro],
  );
  const grupos = useMemo(() => {
    const mapa = new Map<string, { titulo: string; parrafos: ParrafoPerfilIA[] }>();
    for (const p of visibles) {
      const key = p.h2Id ?? '__h1__';
      const g = mapa.get(key) ?? { titulo: p.h2Titulo ?? 'Sin subtítulo', parrafos: [] };
      g.parrafos.push(p);
      mapa.set(key, g);
    }
    return [...mapa.values()].sort((a, b) => Math.max(...b.parrafos.map((p) => p.score)) - Math.max(...a.parrafos.map((p) => p.score)));
  }, [visibles]);

  const parrafo = fila.parrafos.find((p) => p.elementId === sel) ?? visibles[0] ?? null;
  const detalle = parrafo ? paragraphs[parrafo.index] : null;
  const contar = (b: IndiceBanda) => fila.parrafos.filter((p) => bandaDe(p.score) === b).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-bg-canvas)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Sala de IA</button>
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{fila.titulo}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{fila.parrafos.length} párrafos · {fila.porBanda[2] + fila.porBanda[3]} marcados · riesgo medio {fila.rigidezMedia}%</div>
          </div>
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', minHeight: 0 }}>
        <div style={{ borderRight: '1px solid var(--color-border-subtle)', overflowY: 'auto' }}>
          <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', padding: 'var(--space-3) var(--space-4)' }}>
            {FILTROS.map((f) => (
              <button key={String(f.id)} type="button" onClick={() => setFiltro(f.id)} style={chipFiltro(filtro === f.id)}>
                {f.label}{f.id !== 'todos' ? ` · ${contar(f.id)}` : ` · ${fila.parrafos.length}`}
              </button>
            ))}
          </div>
          {grupos.map((g) => {
            const abierto = abiertos.length === 0 || abiertos.includes(g.titulo);
            return (
              <div key={g.titulo}>
                <button type="button" onClick={() => setAbiertos((prev) => (abierto ? prev.filter((t) => t !== g.titulo) : [...prev, g.titulo]))} style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-2) var(--space-4)', background: 'var(--color-bg-surface-alt)', border: 'none', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', fontFamily: 'inherit', color: 'var(--color-text-primary)' }}>
                  <span style={{ flex: 1, fontSize: 'var(--text-sm)', fontWeight: 650, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.titulo}</span>
                  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-engine-ia)' }}>{g.parrafos.length}</span>
                </button>
                {abierto && g.parrafos.map((p) => (
                  <button key={p.elementId} type="button" onClick={() => { setSel(p.elementId); setPropuesta(''); }} style={{ display: 'flex', gap: 'var(--space-2)', width: '100%', textAlign: 'left', padding: 'var(--space-2) var(--space-4)', background: p.elementId === sel ? 'var(--color-accent-a05)' : 'transparent', border: 'none', borderBottom: '1px solid var(--color-border-subtle)', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>
                    <span style={{ width: 4, borderRadius: 'var(--radius-full)', background: BANDAS_IA[bandaDe(p.score)].color, flexShrink: 0 }} />
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-2)' }}>
                        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>Párrafo {p.index + 1}</span>
                        <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-engine-ia)' }}>{p.score}%</span>
                      </span>
                      <span style={{ display: 'block', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.excerpt}</span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        <div style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>
          {parrafo && detalle ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-4)' }}>
                <div>
                  <div style={eyebrow}>Párrafo {parrafo.index + 1} · {parrafo.h2Titulo ?? fila.titulo}</div>
                  <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>categoría <b style={{ color: 'var(--color-engine-ia)' }}>{parrafo.categoria}</b></div>
                </div>
                <MascotaFrase frase={fraseDeIA(parrafo.score, parrafo.elementId)} kind="reference" expression="curious" size={48} />
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800, color: 'var(--color-engine-ia)', fontVariantNumeric: 'tabular-nums' }}>{parrafo.score}%</div>
                  <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>índice de IA</div>
                </div>
              </div>

              <section style={{ marginTop: 'var(--space-5)' }}>
                <div style={eyebrow}>Por qué lo marcamos</div>
                <ul style={{ listStyle: 'none', margin: 'var(--space-2) 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                  {detalle.findings.map((f, i) => (
                    <li key={`${f.phrase}-${i}`} style={{ display: 'flex', gap: 'var(--space-2)', fontSize: 'var(--text-sm)', lineHeight: 1.4, color: 'var(--color-text-primary)' }}>
                      <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-engine-ia)', marginTop: 6, flexShrink: 0 }} />
                      <span>{f.detail}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section style={{ marginTop: 'var(--space-5)' }}>
                <div style={eyebrow}>Texto original</div>
                <p style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-base)', lineHeight: 1.7, color: 'var(--color-text-primary)' }}>
                  {marcarFrases(detalle.text, detalle.findings.map((f) => f.phrase))}
                </p>
              </section>

              <section style={{ marginTop: 'var(--space-5)' }}>
                <div style={eyebrow}>Cómo corregirlo · tu voz de autor</div>
                <textarea
                  value={propuesta}
                  onChange={(e) => setPropuesta(e.target.value)}
                  placeholder="Escribe tu reescritura, o pulsa «Reformular con IA» para una propuesta editable. Nada se aplica solo."
                  style={{ width: '100%', minHeight: 92, marginTop: 'var(--space-2)', fontFamily: 'inherit', fontSize: 'var(--text-sm)', lineHeight: 1.55, color: 'var(--color-text-primary)', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', resize: 'vertical', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    disabled={!onReformular}
                    onClick={async () => { if (onReformular) setPropuesta(await onReformular(detalle.text)); }}
                    style={{ ...fantasma, color: 'var(--color-accent)', borderColor: 'var(--color-accent)', opacity: onReformular ? 1 : 0.5 }}
                  ><RefreshCw size={13} aria-hidden /> Reformular con IA</button>
                  <button type="button" onClick={() => onMark(parrafo.elementId)} style={primario}>Marcar para revisar</button>
                  <button type="button" onClick={() => navigator.clipboard.writeText(propuesta || detalle.text)} style={fantasma}><Copy size={13} aria-hidden /> Copiar</button>
                </div>
              </section>
            </>
          ) : (
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>No hay párrafos con este filtro.</p>
          )}
        </div>
      </div>
    </div>
  );
};

/** Resalta las frases señaladas por el detector. */
function marcarFrases(texto: string, frases: string[]): React.ReactNode[] {
  const utiles = frases.filter((f) => f && texto.toLowerCase().includes(f.toLowerCase()));
  if (utiles.length === 0) return [texto];
  const patron = new RegExp(`(${utiles.map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return texto.split(patron).map((parte, i) =>
    utiles.some((f) => f.toLowerCase() === parte.toLowerCase())
      ? <mark key={i} style={{ background: 'var(--ia-nivel-2)', borderBottom: '2px solid var(--color-engine-ia)', borderRadius: 2, padding: '0 1px' }}>{parte}</mark>
      : <React.Fragment key={i}>{parte}</React.Fragment>,
  );
}

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600, marginBottom: 6 };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-engine-ia)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };
const chipFiltro = (on: boolean): React.CSSProperties => ({ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-full)', border: `1px solid ${on ? 'var(--color-engine-ia)' : 'var(--color-border-subtle)'}`, background: on ? 'var(--ia-nivel-1)' : 'transparent', color: on ? 'var(--color-engine-ia)' : 'var(--color-text-secondary)', cursor: 'pointer' });

export default AiSectionDetail;
```

En `Step5AuditIAWizard.tsx`, montar IA-L1 cuando el nivel de la Sala de IA es `l1`. Añadir el import `import { AiSectionDetail } from '../review/AiSectionDetail';` y, antes del bloque `pantalla === 'ai'`, calcular la fila:

```tsx
  const perfilIA = useMemo(() => construirPerfilIA(reviewResult?.paragraphs ?? [], elements), [reviewResult, elements]);
```

Y dentro del bloque `pantalla === 'ai'`, elegir el nivel:

```tsx
  if (pantalla === 'ai') {
    if (iaNivel === 'l1' && iaH1) {
      const fila = perfilIA.filas.find((f) => f.h1Id === iaH1);
      if (fila) {
        return (
          <div className="revision-phase rev-screen" style={PHASE_WRAP}>
            <AiSectionDetail
              fila={fila}
              paragraphs={reviewResult?.paragraphs ?? []}
              onBack={() => setIaNivel('l0')}
              onMark={(id) => handleMark({ element_id: id } as AuditItem)}
            />
          </div>
        );
      }
    }
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <AiRoom
          reviewResult={reviewResult}
          elements={elements}
          onOpenSection={(id) => { setIaH1(id); setIaNivel('l1'); }}
          onOpenPreview={() => setIaNivel('preview')}
          onExit={volverAPuerta}
        />
      </div>
    );
  }
```

Añadir el import `import { construirPerfilIA } from '../../lib/aiPerfil';` en el orquestador.

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "AiSectionDetail"` ; Expected: PASS. Run: `npm test -- -t "aiPerfil"` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiPerfil.ts src/components/review/AiSectionDetail.tsx src/components/review/AiRoom.tsx src/__tests__/aiSectionDetail.test.tsx src/__tests__/aiPerfil.test.ts
git commit -m "feat(revision): detalle IA-L1 con findings reales"
```

---

### Task 9: Vista previa del documento con manchas

**Files:**
- Modify: `src/lib/aiPerfil.ts` (helper `manchaDe`)
- Modify: `src/components/layout/PaperCanvas.tsx:498` (prop `aiMarks`) y el sitio de fondo del párrafo
- Create: `src/components/review/AiDocumentPreview.tsx`
- Modify: `src/components/review/AiRoom.tsx` (cablear preview)
- Test: `src/__tests__/aiDocumentPreview.test.tsx`

**Interfaces:**
- Consumes: `PaperCanvas`, `bandaDe`, `BANDAS_IA`.
- Produces:
  - `manchaDe(score: number): string`
  - `PaperCanvas` con prop `aiMarks?: ReadonlyMap<string, number>`
  - `AiDocumentPreview` con props `{ paragraphs: readonly AIReviewParagraph[]; onClose: () => void; onOpenParagraph: (elementId: string) => void }`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/aiDocumentPreview.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AiDocumentPreview } from '../components/review/AiDocumentPreview';
import type { AIReviewParagraph } from '../api/backend';

const paragraphs = [
  { element_id: 'p1', index: 0, type: 'paragraph', text: 'uno', ai_score: 82, ai_category: 'HIGH', findings: [], spelling: [] },
] as AIReviewParagraph[];

describe('AiDocumentPreview', () => {
  it('muestra la leyenda de bandas y el toggle', () => {
    render(<AiDocumentPreview paragraphs={paragraphs} onClose={vi.fn()} onOpenParagraph={vi.fn()} />);
    expect(screen.getByText('Mostrar manchas')).toBeTruthy();
    expect(screen.getByText('Baja')).toBeTruthy();
    expect(screen.getByText('Crítica')).toBeTruthy();
  });

  it('cerrar vuelve a IA-L0', () => {
    const onClose = vi.fn();
    render(<AiDocumentPreview paragraphs={paragraphs} onClose={onClose} onOpenParagraph={vi.fn()} />);
    fireEvent.click(screen.getByText(/Cerrar vista previa/));
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "AiDocumentPreview"` ; Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/aiPerfil.ts`, añadir tokens y helper (los tokens se declaran en design-system.css en este mismo paso):

```ts
/** Tinte de mancha por banda (el mockup de vista previa usa la rampa violeta). */
export const IA_MANCHA = [
  'var(--ia-mancha-1)', 'var(--ia-mancha-2)', 'var(--ia-mancha-3)', 'var(--ia-mancha-4)',
] as const;

export function manchaDe(score: number): string {
  return IA_MANCHA[bandaDe(score)];
}
```

En `src/styles/design-system.css`, junto a `--ia-nivel-*`:

```css
  --ia-mancha-1: rgba(124, 58, 237, 0.08);
  --ia-mancha-2: rgba(124, 58, 237, 0.15);
  --ia-mancha-3: rgba(124, 58, 237, 0.24);
  --ia-mancha-4: rgba(124, 58, 237, 0.34);
```

En `src/components/layout/PaperCanvas.tsx`, extender las props del componente (línea 498):

```tsx
export const PaperCanvas: React.FC<{ onElementClick?: (elementId: string, rect: DOMRect, element: any) => void; reviewHighlightIds?: Set<string>; aiMarks?: ReadonlyMap<string, number>; readOnly?: boolean; onlyCover?: boolean }> = ({ onElementClick, reviewHighlightIds, aiMarks, readOnly, onlyCover }) => {
```

Y en el sitio donde el párrafo resuelve su fondo por `reviewHighlightIds?.has(elem.id)` (rama de prosa, ~línea 1769), añadir la mancha como fondo de mayor precedencia:

```tsx
                                : (aiMarks?.has(elem.id)
                                    ? manchaDe(aiMarks.get(elem.id) as number)
                                    : reviewHighlightIds?.has(elem.id) ? 'var(--color-accent-soft)' : (isDocenteElem ? 'var(--surface-subtle)' : 'transparent')),
```

Añadir el import en `PaperCanvas.tsx`: `import { manchaDe } from '../../lib/aiPerfil';`.

`src/components/review/AiDocumentPreview.tsx`:

```tsx
/* WordAPA7 — vista previa del documento «tal cual sale» con manchas de IA.
   Reutiliza el mismo lienzo (`PaperCanvas`) con una capa de manchas encima; solo
   lectura, porque la IA solo se marca para revisar. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { AIReviewParagraph } from '../../api/backend';
import { BANDAS_IA } from '../../lib/aiPerfil';
import { PaperCanvas } from '../layout/PaperCanvas';

export interface AiDocumentPreviewProps {
  paragraphs: readonly AIReviewParagraph[];
  onClose: () => void;
  onOpenParagraph: (elementId: string) => void;
}

export const AiDocumentPreview: React.FC<AiDocumentPreviewProps> = ({ paragraphs, onClose, onOpenParagraph }) => {
  const [mostrar, setMostrar] = useState(true);
  const aiMarks = useMemo(() => {
    const mapa = new Map<string, number>();
    for (const p of paragraphs) if (p.element_id) mapa.set(p.element_id, p.ai_score);
    return mapa;
  }, [paragraphs]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-bg-canvas)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button type="button" onClick={onClose} style={fantasma}><ArrowLeft size={14} aria-hidden /> Cerrar vista previa</button>
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Vista previa del documento</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Formato de salida real · con manchas de IA</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {BANDAS_IA.map((b, i) => (
              <span key={b.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
                <i style={{ width: 12, height: 12, borderRadius: 3, background: `var(--ia-mancha-${i + 1})`, border: '1px solid var(--color-border-subtle)' }} />{b.label}
              </span>
            ))}
          </div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={mostrar} onChange={(e) => setMostrar(e.target.checked)} /> Mostrar manchas
          </label>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto' }} onClick={(e) => {
        const el = (e.target as HTMLElement).closest('[data-element-id]');
        const id = el?.getAttribute('data-element-id');
        if (id && aiMarks.has(id)) onOpenParagraph(id);
      }}>
        <PaperCanvas readOnly aiMarks={mostrar ? aiMarks : undefined} />
      </div>
    </div>
  );
};

const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };

export default AiDocumentPreview;
```

> `PaperCanvas` expone `data-element-id` en cada bloque; si esa marca no existiera, el clic se ancla al elemento más cercano con ese atributo. Verificar en Step 4 que el atributo existe; si no, añadirlo en el mismo sitio donde se pinta el párrafo.

En `Step5AuditIAWizard.tsx`, montar la vista previa cuando `iaNivel === 'preview'`. Añadir el import `import { AiDocumentPreview } from '../review/AiDocumentPreview';` y, dentro del bloque `pantalla === 'ai'`, antes del `return` de `AiRoom`:

```tsx
    if (iaNivel === 'preview') {
      return (
        <div className="revision-phase rev-screen" style={PHASE_WRAP}>
          <AiDocumentPreview
            paragraphs={reviewResult?.paragraphs ?? []}
            onClose={() => setIaNivel('l0')}
            onOpenParagraph={(elementId) => {
              const fila = perfilIA.filas.find((f) => f.parrafos.some((p) => p.elementId === elementId));
              if (fila) { setIaH1(fila.h1Id); setIaNivel('l1'); }
            }}
          />
        </div>
      );
    }
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "AiDocumentPreview"` ; Expected: PASS. Run: `npm test -- -t "paperCanvas"` ; Expected: PASS (sin regresión del lienzo).

- [ ] **Step 5: Commit**

```bash
git add src/lib/aiPerfil.ts src/styles/design-system.css src/components/layout/PaperCanvas.tsx src/components/review/AiDocumentPreview.tsx src/components/review/AiRoom.tsx src/__tests__/aiDocumentPreview.test.tsx
git commit -m "feat(revision): vista previa con manchas de IA sobre el lienzo"
```

---

### Task 10: Sala de Revisión · REV-L0 (`RevisionRoom`)

**Files:**
- Create: `src/lib/revisionResumen.ts`
- Create: `src/components/review/RevisionRoom.tsx`
- Modify: `src/components/wizard/Step5AuditIAWizard.tsx` (pantalla `review` → `RevisionRoom`)
- Test: `src/__tests__/revisionRoom.test.tsx`, `src/__tests__/revisionResumen.test.ts`

**Interfaces:**
- Consumes: `AuditItem`, `ElementModel`, `cumplimiento`, `contarParrafos`, `fasePorElemento`, `objetivosBloom`, `fraseDeRevision`, `colorDeRevision`, `MascotaFrase`.
- Produces:
  - `resumenMotores(items): ResumenMotor[]`
  - `calificacionPorFase(items, elements): CalificacionFase[]`
  - `resumenObjetivos(elements): ResumenObjetivos`
  - `RevisionRoom` con props `{ items, elements, onOpenDetail: (foco: { motor?: EngineId; phase?: string }) => void; onOpenObjetivos: () => void; onBack: () => void }`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/revisionResumen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resumenMotores, calificacionPorFase, resumenObjetivos } from '../lib/revisionResumen';
import type { AuditItem } from '../lib/auditItems';
import type { ElementModel } from '../types';

const item = (id: string, category: AuditItem['category'], phase: string | null, severity: AuditItem['severity'] = 'medium', element_id = 'e'): AuditItem =>
  ({ id, element_id, category, subtype: 'x', severity, summary: '', detail: '', originalText: '', pageNumber: null, phase, readOnly: false }) as AuditItem;

describe('resumenMotores', () => {
  it('cuenta por motor, secciones distintas y mezcla de severidad, sin IA', () => {
    const items = [item('1', 'spelling', 'metodo', 'high'), item('2', 'spelling', 'metodo', 'low', 'e2'), item('3', 'ai', null)];
    const r = resumenMotores(items);
    const ort = r.find((m) => m.motor === 'spelling')!;
    expect(ort.count).toBe(2);
    expect(ort.secciones).toBe(1);
    expect(ort.porSeveridad.high).toBe(1);
    expect(r.some((m) => m.motor === 'ai')).toBe(false);
  });
});

describe('calificacionPorFase', () => {
  it('normaliza por los párrafos de cada fase', () => {
    const elements = [
      { id: 'h', type: 'heading', heading_level: 1, text: 'Método' },
      { id: 'e', type: 'paragraph', heading_level: null, text: 'x' },
    ] as ElementModel[];
    const r = calificacionPorFase([item('1', 'spelling', 'metodo')], elements);
    expect(r[0].phase).toBe('metodo');
    expect(r[0].calificacion).toBe(0); // 1 hallazgo en 1 párrafo
  });
});

describe('resumenObjetivos', () => {
  it('separa general de específicos y cuenta medibles', () => {
    const elements = [
      { id: 'h1', type: 'heading', heading_level: 1, text: 'Objetivos' },
      { id: 'h2g', type: 'heading', heading_level: 2, text: 'Objetivo general' },
      { id: 'g', type: 'paragraph', heading_level: null, text: 'Analizar el impacto de X en Y.' },
      { id: 'h2e', type: 'heading', heading_level: 2, text: 'Objetivos específicos' },
      { id: 'e1', type: 'paragraph', heading_level: null, text: 'Conocer las herramientas.' },
    ] as ElementModel[];
    const r = resumenObjetivos(elements);
    expect(r.general?.verboActual).toBe('analizar');
    expect(r.especificos).toHaveLength(1);
    expect(r.nivelGeneral).toBe(4);
  });
});
```

`src/__tests__/revisionRoom.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionRoom } from '../components/review/RevisionRoom';
import type { AuditItem } from '../lib/auditItems';

const item = (id: string, category: AuditItem['category']): AuditItem =>
  ({ id, element_id: `e${id}`, category, subtype: 'x', severity: 'medium', summary: '', detail: '', originalText: '', pageNumber: 1, phase: null, readOnly: false }) as AuditItem;

describe('RevisionRoom (REV-L0)', () => {
  it('muestra solo la calificación de revisión, sin componente de IA', () => {
    render(<RevisionRoom items={[item('1', 'spelling')]} elements={[] as never} onOpenDetail={vi.fn()} onOpenObjetivos={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByTestId('rev-calificacion')).toBeTruthy();
    expect(screen.queryByTestId('gate-combinado')).toBeNull();
  });

  it('una fila de motor abre REV-L1 filtrada por motor', () => {
    const onOpenDetail = vi.fn();
    render(<RevisionRoom items={[item('1', 'spelling')]} elements={[] as never} onOpenDetail={onOpenDetail} onOpenObjetivos={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Ortografía'));
    expect(onOpenDetail).toHaveBeenCalledWith({ motor: 'spelling' });
  });

  it('el panel Objetivos abre el analizador', () => {
    const onOpenObjetivos = vi.fn();
    render(<RevisionRoom items={[item('1', 'spelling')]} elements={[] as never} onOpenDetail={vi.fn()} onOpenObjetivos={onOpenObjetivos} onBack={vi.fn()} />);
    fireEvent.click(screen.getByText('Analizar objetivos'));
    expect(onOpenObjetivos).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "revisionResumen"` ; Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Write minimal implementation**

`src/lib/revisionResumen.ts`:

```ts
/* WordAPA7 — derivaciones de REV-L0. Puras y fuera del componente: lo que la
   pantalla pinta y lo que el rail cuenta salen de la MISMA lista (`items`). */
import type { ElementModel } from '../types';
import type { AuditItem, EngineId, Severity } from './auditItems';
import { phaseLabel } from './auditItems';
import { cumplimiento, fasePorElemento } from './informeRevision';
import { objetivosBloom, type ObjetivoBloom } from './contentReview';

export interface ResumenMotor {
  motor: EngineId;
  count: number;
  secciones: number;
  porSeveridad: Record<Severity, number>;
}

/** Una fila por motor OBJETIVO con hallazgos. La IA no vive acá. */
export function resumenMotores(items: readonly AuditItem[]): ResumenMotor[] {
  const porMotor = new Map<EngineId, AuditItem[]>();
  for (const it of items) {
    if (it.category === 'ai') continue;
    const arr = porMotor.get(it.category) ?? [];
    arr.push(it);
    porMotor.set(it.category, arr);
  }
  const orden: EngineId[] = ['spelling', 'style', 'structure', 'citations'];
  return orden
    .filter((m) => porMotor.has(m))
    .map((motor) => {
      const propios = porMotor.get(motor)!;
      const porSeveridad: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
      const fases = new Set<string>();
      for (const it of propios) {
        porSeveridad[it.severity] += 1;
        if (it.phase) fases.add(it.phase);
      }
      return { motor, count: propios.length, secciones: fases.size, porSeveridad };
    });
}

/** Las fases que se grafican como columnas: ni portada (bloqueada), ni objetivos
 *  (panel propio), ni referencias (fase propia), ni anexos/sin_fase. */
const FASES_GRAFICO = ['introduccion', 'marco_teorico', 'metodo', 'resultados', 'discusion', 'conclusiones', 'resumen'] as const;

export interface CalificacionFase {
  phase: string;
  label: string;
  hallazgos: number;
  parrafos: number;
  calificacion: number;
}

export function calificacionPorFase(
  items: readonly AuditItem[],
  elements: readonly ElementModel[],
): CalificacionFase[] {
  const faseDe = fasePorElemento(elements, items);
  // Se cuentan TODOS los motores objetivos (incluidas las citas), no solo los
  // cuatro de la matriz de calor: la columna de una fase debe reflejar todo lo
  // que REV-L1 va a mostrar al abrirla.
  const porFase = new Map<string, number>();
  for (const it of items) {
    if (it.category === 'ai') continue;
    const f = it.phase && it.phase !== 'global' ? it.phase : faseDe(it.element_id);
    if (!f) continue;
    porFase.set(f, (porFase.get(f) ?? 0) + 1);
  }
  const parrafosPorFase = new Map<string, number>();
  for (const e of elements) {
    if (e.type !== 'paragraph' && e.type !== 'bullet' && e.type !== 'numbered_list') continue;
    const f = faseDe(e.id);
    if (!f) continue;
    parrafosPorFase.set(f, (parrafosPorFase.get(f) ?? 0) + 1);
  }
  return FASES_GRAFICO
    .filter((phase) => parrafosPorFase.has(phase) || porFase.has(phase))
    .map((phase) => {
      const hallazgos = porFase.get(phase) ?? 0;
      const parrafos = parrafosPorFase.get(phase) ?? 0;
      return { phase, label: phaseLabel(phase), hallazgos, parrafos, calificacion: cumplimiento(hallazgos, parrafos) };
    });
}

export interface ResumenObjetivos {
  general: ObjetivoBloom | null;
  especificos: ObjetivoBloom[];
  medibles: number;
  conVariable: number;
  nivelGeneral: number | null;
  veredicto: string;
}

export function resumenObjetivos(elements: readonly ElementModel[]): ResumenObjetivos {
  const objetivos = objetivosBloom(elements);
  // El general es el que el documento MARCA como general. Si no hay, no se
  // inventa uno con el primero: un específico no es un ancla.
  const general = objetivos.find((o) => o.esGeneral) ?? null;
  const especificos = objetivos.filter((o) => o !== general);
  const esMedible = (o: ObjetivoBloom) => !o.sinVariable && o.nivelActual !== null && !o.tieneDosVerbos;
  const medibles = objetivos.filter(esMedible).length;
  const conVariable = objetivos.filter((o) => !o.sinVariable).length;
  const noCumplen = objetivos.filter((o) => !esMedible(o) || (o.nivelActual ?? 0) < 4).length;
  return {
    general,
    especificos,
    medibles,
    conVariable,
    nivelGeneral: general?.nivelActual ?? null,
    veredicto: `${noCumplen} de ${objetivos.length} objetivos no cumplen el nivel exigido`,
  };
}
```

`src/components/review/RevisionRoom.tsx`:

```tsx
/* WordAPA7 — Sala de Revisión, panorama (REV-L0). Solo navegación: aquí no se
   acepta nada. El % es SOLO revisión; el índice de IA no se mezcla. */
import React, { useMemo } from 'react';
import { ArrowLeft, Lock } from 'lucide-react';
import type { AuditItem, EngineId } from '../../lib/auditItems';
import type { ElementModel } from '../../types';
import { contarParrafos, cumplimiento } from '../../lib/informeRevision';
import { resumenMotores, calificacionPorFase, resumenObjetivos } from '../../lib/revisionResumen';
import { fraseDeRevision, colorDeRevision } from '../../lib/mascotaFrases';
import { MascotaFrase } from './MascotaFrase';
import { ENGINE_META } from '../../hooks/useReviewWorkbench';

export interface RevisionRoomProps {
  items: AuditItem[];
  elements: readonly ElementModel[];
  onOpenDetail: (foco: { motor?: EngineId; phase?: string }) => void;
  onOpenObjetivos: () => void;
  onBack: () => void;
}

export const RevisionRoom: React.FC<RevisionRoomProps> = ({ items, elements, onOpenDetail, onOpenObjetivos, onBack }) => {
  const revision = useMemo(() => items.filter((it) => it.category !== 'ai'), [items]);
  const parrafos = useMemo(() => contarParrafos(elements), [elements]);
  const calificacion = cumplimiento(revision.length, parrafos);
  const motores = useMemo(() => resumenMotores(revision), [revision]);
  const fases = useMemo(() => calificacionPorFase(revision, elements), [revision, elements]);
  const objetivos = useMemo(() => resumenObjetivos(elements), [elements]);
  const peor = [...motores].sort((a, b) => b.count - a.count)[0];

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-canvas)' }}>
      <div style={{ maxWidth: '960px', margin: '0 auto', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', marginTop: 'var(--space-5)', marginBottom: 'var(--space-5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)' }}>Sala de Revisión</h2>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Motores objetivos · aceptar o aceptar todas, nunca borra tu texto</div>
          </div>
          <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Volver</button>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 'var(--space-5)', padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div>
            <div style={eyebrow}>Calificación de revisión</div>
            <div data-testid="rev-calificacion" style={{ fontSize: 'clamp(34px, 5vw, 48px)', fontWeight: 800, lineHeight: 1, color: colorDeRevision(calificacion), fontVariantNumeric: 'tabular-nums' }}>{calificacion}<span style={{ fontSize: 'var(--text-xl)', color: 'var(--color-text-tertiary)' }}>%</span></div>
            <div style={{ marginTop: 'var(--space-3)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
              {revision.length} de {parrafos} párrafos · 100 − 200·({revision.length}/{parrafos}) = {calificacion}. El índice de IA no se mezcla aquí.
            </div>
          </div>
          <MascotaFrase frase={peor ? `${fraseDeRevision(calificacion, 'rev')} Lo que más te baja: ${ENGINE_META[peor.motor].title}, ${peor.count} puntos.` : fraseDeRevision(calificacion, 'rev')} kind="highlighter" expression="worried" />
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={eyebrow}>Motores objetivos · {revision.length} por revisar</div>
          {motores.map((m) => (
            <button key={m.motor} type="button" onClick={() => onOpenDetail({ motor: m.motor })} style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr) 130px 24px', alignItems: 'center', gap: 'var(--space-4)', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderTop: '1px solid var(--color-border-subtle)', padding: 'var(--space-3) var(--space-1)', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>
                <span aria-hidden style={{ width: 26, height: 26, borderRadius: 'var(--radius-sm)', display: 'grid', placeItems: 'center', background: ENGINE_META[m.motor].color, color: 'var(--color-text-on-accent)', fontSize: 'var(--text-xs)', fontWeight: 700 }}>{ENGINE_META[m.motor].title[0]}</span>
                {ENGINE_META[m.motor].title}
              </span>
              <Severidad porSeveridad={m.porSeveridad} total={m.count} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}><b style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-primary)' }}>{m.count}</b> · {m.secciones} secciones</span>
              <span aria-hidden style={{ color: 'var(--color-text-tertiary)', textAlign: 'right' }}>›</span>
            </button>
          ))}
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={eyebrow}>Objetivos · analizador propio (aparte)</div>
          <div style={{ display: 'grid', gridTemplateColumns: '230px minmax(0,1fr)', gap: 'var(--space-5)', border: '1px solid var(--color-accent-a30)', borderRadius: 'var(--radius-lg)', padding: 'var(--space-4)' }}>
            <div style={{ borderRight: '1px solid var(--color-border-subtle)', paddingRight: 'var(--space-4)' }}>
              <div style={{ fontSize: 'clamp(24px, 4vw, 34px)', fontWeight: 800, color: 'var(--color-warning)' }}>{objetivos.nivelGeneral ?? '—'}<small style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}> /6</small></div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-accent)', marginTop: 'var(--space-1)' }}>Bloom · nivel 4 exigido</div>
              <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                <Kpi n={`${objetivos.medibles}/${objetivos.especificos.length + (objetivos.general ? 1 : 0)}`} k="medibles" />
                <Kpi n={`${objetivos.conVariable}`} k="con variable" />
              </div>
              <button type="button" onClick={onOpenObjetivos} style={{ ...primario, marginTop: 'var(--space-4)' }}>Analizar objetivos</button>
            </div>
            <BloomMini objetivos={objetivos.general ? [objetivos.general, ...objetivos.especificos] : objetivos.especificos} />
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 'var(--space-3)', padding: 'var(--space-2) var(--space-3)', border: '1px dashed var(--color-border-subtle)', borderRadius: 'var(--radius-sm)' }}>
            Objetivos no se mezcla con las fases: tiene reglas de método propias (verbo Bloom, medibilidad, jerarquía general/específicos).
          </div>
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={eyebrow}>Fases del documento · calificación por fase (0–10)</div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 'var(--space-3)', height: 180, marginTop: 'var(--space-4)' }}>
            {fases.map((f) => (
              <button key={f.phase} type="button" onClick={() => onOpenDetail({ phase: f.phase })} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', height: '100%', background: 'transparent', border: 'none', cursor: 'pointer', color: 'inherit', fontFamily: 'inherit', padding: 0 }}>
                <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, marginBottom: 4, fontVariantNumeric: 'tabular-nums' }}>{(f.calificacion / 10).toFixed(1)}</span>
                <span style={{ width: '100%', maxWidth: 46, height: `${f.calificacion}%`, borderRadius: 'var(--radius-sm) var(--radius-sm) 0 0', background: colorDeRevision(f.calificacion) }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', marginTop: 4, textAlign: 'center', lineHeight: 1.2 }}>{f.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section style={{ padding: 'var(--space-5)' }}>
          <div style={eyebrow}>Portada</div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3) var(--space-4)', opacity: 0.72 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}><Lock size={13} aria-hidden /> Zona protegida · se mide, no se escribe · sin acciones</span>
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}>Bloqueada</span>
          </div>
        </section>
      </div>
    </div>
  );
};

const Severidad: React.FC<{ porSeveridad: Record<string, number>; total: number }> = ({ porSeveridad, total }) => {
  const orden: [string, string][] = [['critical', 'var(--color-danger)'], ['high', 'var(--color-warning)'], ['medium', 'var(--color-success)'], ['low', 'var(--color-text-tertiary)']];
  return (
    <span style={{ display: 'flex', height: 9, borderRadius: 'var(--radius-full)', overflow: 'hidden', border: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface-alt)' }}>
      {orden.map(([sev, color]) => (
        <i key={sev} style={{ width: `${((porSeveridad[sev] ?? 0) / (total || 1)) * 100}%`, background: color, display: 'block' }} />
      ))}
    </span>
  );
};

const BloomMini: React.FC<{ objetivos: { verboActual: string; nivelActual: number | null; esGeneral: boolean }[] }> = ({ objetivos }) => {
  const NIVELES = ['Recordar', 'Comprender', 'Aplicar', 'Analizar', 'Evaluar', 'Crear'];
  return (
    <div>
      <div style={eyebrow}>Nivel cognitivo de cada objetivo (escala Bloom)</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'var(--space-4)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
        {NIVELES.map((n, i) => <span key={n} style={{ flex: 1, textAlign: 'center' }}>{n}<div style={{ marginTop: 4, height: 8, borderTop: '2px solid var(--color-border-subtle)', position: 'relative' }}>{objetivos.map((o, j) => (o.nivelActual === i + 1 ? <i key={j} title={`${o.verboActual}${o.esGeneral ? ' (general)' : ''}`} style={{ position: 'absolute', top: -7, left: '50%', width: o.esGeneral ? 14 : 10, height: o.esGeneral ? 14 : 10, marginLeft: o.esGeneral ? -7 : -5, borderRadius: '50%', background: o.esGeneral ? 'var(--color-accent)' : 'var(--color-warning)' }} /> : null))}</div></span>)}
      </div>
    </div>
  );
};

const Kpi: React.FC<{ n: string; k: string }> = ({ n, k }) => (
  <span><span style={{ display: 'block', fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{n}</span><span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>{k}</span></span>
);

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };

export default RevisionRoom;
```

En `Step5AuditIAWizard.tsx`, cambiar el estado `pantalla` a `'gate' | 'rev-l0' | 'rev-l1' | 'rev-l2' | 'ai'`, borrar el bloque viejo `if (pantalla === 'review') { ... ReviewWorkbench ... }` y su import `import { ReviewWorkbench } from '../review/ReviewWorkbench';` (si no, la comparación queda fuera del union y el import sin uso rompen el build):

```tsx
type Pantalla = 'gate' | 'rev-l0' | 'rev-l1' | 'rev-l2' | 'ai';
```

Añadir el import `import { RevisionRoom } from '../review/RevisionRoom';`.

```tsx
  if (pantalla === 'rev-l0') {
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <RevisionRoom
          items={items}
          elements={elements}
          onOpenDetail={(foco) => { setFoco(foco); setPantalla('rev-l1'); }}
          onOpenObjetivos={() => setPantalla('rev-l2')}
          onBack={volverAPuerta}
        />
      </div>
    );
  }
```

Y en la puerta, `onStartRevision={() => setPantalla('rev-l0')}`.

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "RevisionRoom"` ; Expected: PASS. Run: `npm test -- -t "revisionResumen"` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/revisionResumen.ts src/components/review/RevisionRoom.tsx src/components/wizard/Step5AuditIAWizard.tsx src/__tests__/revisionRoom.test.tsx src/__tests__/revisionResumen.test.ts
git commit -m "feat(revision): sala de revision L0 con motores, objetivos y fases"
```

---

### Task 11: Sala de Revisión · REV-L1 (`RevisionDetail`)

**Files:**
- Create: `src/components/review/RevisionDetail.tsx`
- Modify: `src/components/wizard/Step5AuditIAWizard.tsx` (render `rev-l1`)
- Test: `src/__tests__/revisionDetail.test.tsx`

**Interfaces:**
- Consumes: `useReviewWorkbench` (`items`, `acceptOne`, `acceptMany`, `markForReview`, `dismiss`, `isApplying`), `accionDeItem`, `rotuloDeSubtipo`, `ReadingText`, `useMarkSourceBase`/`buildMarkSource`, `MascotaFrase`.
- Produces: `RevisionDetail` con props `{ foco: { motor?: EngineId; phase?: string }; onBack: () => void }`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/revisionDetail.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionDetail } from '../components/review/RevisionDetail';
import { useDocStore } from '../store/useDocStore';

const hallazgo = (over = {}) => ({
  element_id: 'e1', start: 0, end: 3, excerpt: 'a evolucionado', kind: 'ortografia',
  severity: 'warn', message: 'Se esperaba «ha»', source: 'local', phase: null, read_only: false, ...over,
});

describe('RevisionDetail (REV-L1)', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: { session_id: 's', elements: [{ id: 'e1', type: 'paragraph', text: 'a evolucionado hacia modelos' }] } as never,
      proofreadFindings: [hallazgo()],
      reviewResult: null,
      citationAuditResult: null,
      dismissedFindingIds: [],
      dismissedCommentIds: [],
    });
  });

  it('ofrece Aceptar y Aceptar todas en un motor objetivo', () => {
    render(<RevisionDetail foco={{ motor: 'spelling' }} onBack={() => {}} />);
    expect(screen.getByText('Aceptar')).toBeTruthy();
    expect(screen.getByText(/Aceptar todas/)).toBeTruthy();
  });

  it('nunca ofrece Aceptar sobre un motor de IA', () => {
    useDocStore.setState({
      proofreadFindings: [hallazgo({ kind: 'muletilla', severity: 'info' })],
    });
    render(<RevisionDetail foco={{ motor: 'ai' }} onBack={() => {}} />);
    expect(screen.queryByText('Aceptar')).toBeNull();
    expect(screen.getByText('Marcar para revisar')).toBeTruthy();
  });

  it('la portada no ofrece botón de aceptar', () => {
    useDocStore.setState({ proofreadFindings: [hallazgo({ kind: 'portada_punto_final', read_only: true, phase: 'portada' })] });
    render(<RevisionDetail foco={{ phase: 'portada' }} onBack={() => {}} />);
    expect(screen.queryByText('Aceptar')).toBeNull();
    expect(screen.getByText(/Solo lectura/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "RevisionDetail"` ; Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Write minimal implementation**

`src/components/review/RevisionDetail.tsx`:

```tsx
/* WordAPA7 — Sala de Revisión, corrección (REV-L1). Texto delante, corrección al
   lado. La acción se deriva de `accionDeItem`: objetivo ⇒ aceptar; IA ⇒ marcar;
   portada (readOnly) ⇒ sin acción. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Check, CheckCheck, Flag } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { useReviewWorkbench, accionDeItem } from '../../hooks/useReviewWorkbench';
import { rotuloDeSubtipo } from '../../lib/rotulos';
import type { EngineId } from '../../lib/auditItems';
import { ReadingText } from './ReadingText';
import { useMarkSourceBase, buildMarkSource } from '../../hooks/useMarkSource';
import { MascotaFrase } from './MascotaFrase';

export interface RevisionDetailProps {
  foco: { motor?: EngineId; phase?: string };
  onBack: () => void;
}

export const RevisionDetail: React.FC<RevisionDetailProps> = ({ foco, onBack }) => {
  const { items, acceptOne, acceptMany, markForReview, isApplying } = useReviewWorkbench();
  const base = useMarkSourceBase();
  const elements = useDocStore((s) => s.doc?.elements ?? []);
  const [sub, setSub] = useState<string | 'todas'>('todas');

  const delFoco = useMemo(
    () => items.filter((it) => (foco.motor ? it.category === foco.motor : true) && (foco.phase ? (it.phase ?? 'global') === foco.phase : true)),
    [items, foco],
  );
  const subtipos = useMemo(() => [...new Set(delFoco.map((it) => it.subtype))], [delFoco]);
  const visibles = sub === 'todas' ? delFoco : delFoco.filter((it) => it.subtype === sub);
  const [idx, setIdx] = useState(0);
  const actual = visibles[Math.min(idx, visibles.length - 1)] ?? null;
  const accion = actual ? accionDeItem(actual) : 'none';
  const motor = foco.motor;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, background: 'var(--color-bg-canvas)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Menú general</button>
          <div>
            <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>{motor ?? foco.phase ?? 'Revisión'}</div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{delFoco.length} puntos · motor objetivo</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => { setSub('todas'); setIdx(0); }} style={chip(sub === 'todas')}>Todas · {delFoco.length}</button>
          {subtipos.map((s) => (
            <button key={s} type="button" onClick={() => { setSub(s); setIdx(0); }} style={chip(sub === s)}>{rotuloDeSubtipo(s)} · {delFoco.filter((it) => it.subtype === s).length}</button>
          ))}
        </div>
      </div>

      {actual ? (
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', minHeight: 0 }}>
          <div style={{ overflowY: 'auto', padding: 'var(--space-5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 'var(--space-3)' }}>
              <span style={eyebrow}>{actual.phase ?? 'Todo el documento'} · {actual.pageNumber ? `página ${actual.pageNumber}` : 'sin página'}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>punto {idx + 1} de {visibles.length}</span>
            </div>
            <p style={{ margin: 0, fontFamily: 'Georgia, "Times New Roman", serif', fontSize: 'var(--text-lg)', lineHeight: 1.85, color: 'var(--color-text-primary)' }}>
              <ReadingText text={actual.originalText || elements.find((e) => e.id === actual.element_id)?.text || ''} source={buildMarkSource(base, elements.find((e) => e.id === actual.element_id))} />
            </p>
          </div>

          <div style={{ overflowY: 'auto', borderLeft: '1px solid var(--color-border-subtle)', padding: 'var(--space-4)', background: 'var(--color-bg-surface-alt)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <span style={eyebrow}>Qué pasa</span>
            <p style={{ margin: 0, fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--color-text-secondary)' }}>{actual.detail || actual.summary}</p>
            {actual.suggestedText && (
              <div style={{ border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)', padding: 'var(--space-3)', background: 'var(--color-bg-surface)' }}>
                <span style={eyebrow}>Propuesta</span>
                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)' }}>{actual.suggestedText}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              {accion === 'accept' && (
                <>
                  <button type="button" disabled={isApplying} onClick={() => acceptOne(actual)} style={exito}><Check size={13} aria-hidden /> Aceptar</button>
                  {visibles.length > 1 && <button type="button" disabled={isApplying} onClick={() => acceptMany(visibles.filter((it) => !it.readOnly))} style={primario}><CheckCheck size={13} aria-hidden /> Aceptar todas ({visibles.filter((it) => !it.readOnly).length})</button>}
                </>
              )}
              {accion === 'mark' && <button type="button" onClick={() => markForReview(actual)} style={primario}><Flag size={13} aria-hidden /> Marcar para revisar</button>}
              {accion === 'none' && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>Solo lectura: la portada se mide, no se escribe.</span>}
            </div>
            <div style={{ marginTop: 'auto' }}>
              <MascotaFrase frase={`Vas bien: ${idx + 1} de ${visibles.length}.`} kind="ruler" expression="neutral" size={44} />
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--color-text-secondary)' }}>No hay hallazgos con este filtro.</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) var(--space-5)', borderTop: '1px solid var(--color-border-subtle)' }}>
        <button type="button" disabled={idx === 0} onClick={() => setIdx((i) => Math.max(0, i - 1))} style={fantasma}>‹ Punto anterior</button>
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>{visibles.length ? idx + 1 : 0} de {visibles.length}</span>
        <button type="button" disabled={idx >= visibles.length - 1} onClick={() => setIdx((i) => Math.min(visibles.length - 1, i + 1))} style={fantasma}>Punto siguiente ›</button>
      </div>
    </div>
  );
};

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 };
const chip = (on: boolean): React.CSSProperties => ({ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '3px 9px', borderRadius: 'var(--radius-full)', border: `1px solid ${on ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`, background: on ? 'var(--color-accent-soft)' : 'transparent', color: on ? 'var(--color-accent)' : 'var(--color-text-secondary)', cursor: 'pointer' });
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-sm)', fontWeight: 700, cursor: 'pointer' };
const exito: React.CSSProperties = { ...primario, background: 'var(--color-success)' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };

export default RevisionDetail;
```

En `Step5AuditIAWizard.tsx`, añadir el render de `rev-l1`:

```tsx
  if (pantalla === 'rev-l1' && foco) {
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <RevisionDetail foco={foco} onBack={() => setPantalla('rev-l0')} />
      </div>
    );
  }
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "RevisionDetail"` ; Expected: PASS. Run: `npm test -- -t "readingText"` ; Expected: PASS (el canal inline no cambia).

- [ ] **Step 5: Commit**

```bash
git add src/components/review/RevisionDetail.tsx src/components/wizard/Step5AuditIAWizard.tsx src/__tests__/revisionDetail.test.tsx
git commit -m "feat(revision): correccion REV-L1 con acciones por motor"
```

---

### Task 12: Analizador de Objetivos (REV-L2) + cableado Bloom

**Files:**
- Modify: `src/lib/contentReview.ts:114-148,150-244` (exportar `separarGeneralDeEspecificos` y `reviewObjectives`)
- Create: `src/components/review/ObjetivosAnalyzer.tsx`
- Modify: `src/components/wizard/Step5AuditIAWizard.tsx` (render `rev-l2`)
- Test: `src/__tests__/objetivosAnalyzer.test.tsx`

**Interfaces:**
- Consumes: `objetivosBloom`, `ObjetivoBloom`, `reviewObjectives`, `separarGeneralDeEspecificos`, `reemplazarVerbo`, `resumenObjetivos`, `MascotaFrase`.
- Produces: `ObjetivosAnalyzer` con props `{ elements: readonly ElementModel[]; onApply: (elementId: string, texto: string) => void; onBack: () => void }`.

- [ ] **Step 1: Write the failing test**

`src/__tests__/objetivosAnalyzer.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ObjetivosAnalyzer } from '../components/review/ObjetivosAnalyzer';
import type { ElementModel } from '../types';

const elements = [
  { id: 'h1', type: 'heading', heading_level: 1, text: 'Objetivos' },
  { id: 'h2g', type: 'heading', heading_level: 2, text: 'Objetivo general' },
  { id: 'g', type: 'paragraph', heading_level: null, text: 'Analizar el impacto de la transformación digital.' },
  { id: 'h2e', type: 'heading', heading_level: 2, text: 'Objetivos específicos' },
  { id: 'e1', type: 'paragraph', heading_level: null, text: 'Conocer las herramientas usadas en el sector público.' },
] as ElementModel[];

describe('ObjetivosAnalyzer (REV-L2)', () => {
  it('muestra el veredicto con jerarquía y la escala Bloom', () => {
    render(<ObjetivosAnalyzer elements={elements} onApply={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText(/objetivos no cumplen el nivel exigido/)).toBeTruthy();
    expect(screen.getByText('Recordar')).toBeTruthy();
    expect(screen.getAllByText('General').length).toBeGreaterThan(0);
    expect(screen.getByText(/nivel del general/)).toBeTruthy();
  });

  it('aplica una alternativa y no escribe por sí sola', () => {
    const onApply = vi.fn();
    render(<ObjetivosAnalyzer elements={elements} onApply={onApply} onBack={vi.fn()} />);
    // «Conocer» es nivel nulo; el propuesto es 4 y las alternativas son nivel 4.
    fireEvent.click(screen.getByText('analizar'));
    fireEvent.click(screen.getByText('Aplicar'));
    expect(onApply).toHaveBeenCalledWith('e1', expect.stringContaining('Analizar'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — Run: `npm test -- -t "ObjetivosAnalyzer"` ; Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Write minimal implementation**

En `src/lib/contentReview.ts`, exportar las dos funciones privadas:

```ts
export function separarGeneralDeEspecificos(
```

```ts
export function reviewObjectives(general: ElementLike[], especificos: ElementLike[]): ContentFinding[] {
```

`src/components/review/ObjetivosAnalyzer.tsx`:

```tsx
/* WordAPA7 — Analizador de objetivos (REV-L2). Único analizador propio: el nivel
   Bloom y la jerarquía general/específicos no se ven párrafo a párrafo. */
import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ElementModel } from '../../types';
import { objetivosBloom, reemplazarVerbo, type ObjetivoBloom } from '../../lib/contentReview';
import { resumenObjetivos } from '../../lib/revisionResumen';
import { MascotaFrase } from './MascotaFrase';

export interface ObjetivosAnalyzerProps {
  elements: readonly ElementModel[];
  onApply: (elementId: string, texto: string) => void;
  onBack: () => void;
}

const NIVELES = ['Recordar', 'Comprender', 'Aplicar', 'Analizar', 'Evaluar', 'Crear'];
const NIVEL_EXIGIDO = 4;

export const ObjetivosAnalyzer: React.FC<ObjetivosAnalyzerProps> = ({ elements, onApply, onBack }) => {
  const resumen = useMemo(() => resumenObjetivos(elements), [elements]);
  const objetivos = useMemo(() => objetivosBloom(elements), [elements]);
  const general = resumen.general;
  const especificos = resumen.especificos;

  return (
    <div style={{ flex: 1, overflowY: 'auto', background: 'var(--color-bg-canvas)' }}>
      <div style={{ maxWidth: '900px', margin: 'var(--space-5) auto', background: 'var(--color-bg-surface)', border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-4) var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button type="button" onClick={onBack} style={fantasma}><ArrowLeft size={14} aria-hidden /> Sala de Revisión</button>
            <div>
              <div style={{ fontSize: 'var(--text-base)', fontWeight: 700, color: 'var(--color-text-primary)' }}>Analizador de objetivos</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{general ? 1 : 0} general · {especificos.length} específicos · nivel Bloom, medibilidad y jerarquía</div>
            </div>
          </div>
        </div>

        <section style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 290px', gap: 'var(--space-5)', padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-warning)' }}>Requiere atención</span>
            <h3 style={{ margin: 'var(--space-2) 0 0', fontSize: 'var(--text-xl)', fontWeight: 750, color: 'var(--color-text-primary)' }}>{resumen.veredicto}</h3>
            <div style={{ display: 'flex', gap: 'var(--space-5)', marginTop: 'var(--space-4)' }}>
              <Stat n={`${general?.nivelActual ?? '—'}/6`} k="nivel del general" />
              <Stat n={`${resumen.medibles}/${objetivos.length}`} k="medibles" tono="var(--color-warning)" />
              <Stat n={`${resumen.conVariable}`} k="con variable" tono="var(--color-warning)" />
            </div>
          </div>
          <MascotaFrase frase={general && general.sinVariable ? '«Conocer» no se puede medir. Ni tú sabes cuándo terminaste.' : 'Cada objetivo, un verbo medible.'} kind="ruler" expression="worried" />
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <EscalaBloom objetivos={objetivos} />
        </section>

        <section style={{ padding: 'var(--space-5)', borderBottom: '1px solid var(--color-border-subtle)' }}>
          <div style={eyebrow}>Objetivo general · ancla del análisis</div>
          {general ? <FilaObjetivo o={general} etiqueta="General" onApply={onApply} /> : <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--text-sm)' }}>No se detectó un objetivo general.</p>}
        </section>

        <section style={{ padding: 'var(--space-5)' }}>
          <div style={{ paddingLeft: 'var(--space-4)', borderLeft: '2px dashed var(--color-accent-a30)' }}>
            <div style={{ ...eyebrow, color: 'var(--color-text-primary)' }}>Objetivos específicos · {especificos.length} <span style={{ textTransform: 'none', fontWeight: 400, color: 'var(--color-text-secondary)' }}>derivan del general · su nivel no debe superarlo</span></div>
            {especificos.map((o, i) => <FilaObjetivo key={o.elementId} o={o} etiqueta={`E${i + 1}`} onApply={onApply} />)}
          </div>
        </section>
      </div>
    </div>
  );
};

const FilaObjetivo: React.FC<{ o: ObjetivoBloom; etiqueta: string; onApply: (id: string, t: string) => void }> = ({ o, etiqueta, onApply }) => {
  const [elegido, setElegido] = useState<string | null>(null);
  const hallazgo = o.sinVariable || o.tieneDosVerbos || o.nivelActual === null || o.nivelActual < NIVEL_EXIGIDO;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 250px', gap: 'var(--space-4)', padding: 'var(--space-3) 0', borderTop: '1px solid var(--color-border-subtle)' }}>
      <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.5, color: 'var(--color-text-primary)' }}>
        <span style={{ fontWeight: 700, marginRight: 6 }}>{etiqueta}</span>{o.texto}
        <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', marginTop: 'var(--space-2)' }}>
          <Tag ok={o.nivelActual !== null && !o.sinVariable} texto={`Nivel ${o.nivelActual ?? '—'}/6`} />
          <Tag ok={!o.sinVariable} texto={o.sinVariable ? 'Sin variable' : 'Declara variable'} />
        </div>
      </div>
      <div style={{ borderLeft: '1px solid var(--color-border-subtle)', paddingLeft: 'var(--space-4)' }}>
        {hallazgo && o.alternativas.length > 0 ? (
          <>
            <span style={eyebrow}>Propuesta</span>
            <div style={{ display: 'flex', gap: 'var(--space-1)', flexWrap: 'wrap', margin: 'var(--space-2) 0' }}>
              {o.alternativas.map((alt) => (
                <button key={alt} type="button" onClick={() => setElegido(alt)} style={{ fontSize: 'var(--text-xs)', padding: '2px 9px', borderRadius: 'var(--radius-full)', border: '1px solid var(--color-accent)', color: elegido === alt ? 'var(--color-text-on-accent)' : 'var(--color-accent)', background: elegido === alt ? 'var(--color-accent)' : 'transparent', cursor: 'pointer' }}>{alt}</button>
              ))}
            </div>
            <button type="button" disabled={!elegido} onClick={() => elegido && onApply(o.elementId, reemplazarVerbo(o.texto, elegido))} style={{ ...primario, opacity: elegido ? 1 : 0.5 }}>Aplicar</button>
          </>
        ) : (
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-success)' }}>Cumple. Sin acciones.</span>
        )}
      </div>
    </div>
  );
};

const EscalaBloom: React.FC<{ objetivos: ObjetivoBloom[] }> = ({ objetivos }) => (
  <div>
    <div style={eyebrow}>Nivel cognitivo (Bloom) por objetivo</div>
    <div style={{ position: 'relative', height: 84, margin: 'var(--space-4) var(--space-4) 0' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 44, height: 2, background: 'var(--color-border-subtle)' }} />
      <div style={{ position: 'absolute', top: 30, bottom: 52, left: `${((NIVEL_EXIGIDO - 1) / 5) * 100}%`, borderLeft: '2px dashed var(--color-accent)', opacity: 0.55 }} />
      {NIVELES.map((n, i) => (
        <span key={n} style={{ position: 'absolute', top: 56, left: `${(i / 5) * 100}%`, transform: 'translateX(-50%)', fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', whiteSpace: 'nowrap' }}>{n}</span>
      ))}
      {objetivos.map((o, j) => (o.nivelActual !== null ? (
        <span key={j} style={{ position: 'absolute', top: 44, left: `${((o.nivelActual - 1) / 5) * 100}%`, transform: 'translate(-50%,-50%)' }}>
          <span style={{ position: 'absolute', bottom: 15, left: '50%', transform: 'translateX(-50%)', fontSize: 'var(--text-xs)', fontWeight: 700, whiteSpace: 'nowrap', color: o.esGeneral ? 'var(--color-accent)' : 'var(--color-warning)' }}>{o.esGeneral ? 'General' : `E${j}`}</span>
          <span style={{ display: 'block', width: o.esGeneral ? 14 : 10, height: o.esGeneral ? 14 : 10, borderRadius: '50%', background: o.esGeneral ? 'var(--color-accent)' : 'var(--color-warning)', border: '2px solid var(--color-bg-surface)' }} />
        </span>
      ) : null))}
    </div>
  </div>
);

const Tag: React.FC<{ ok: boolean; texto: string }> = ({ ok, texto }) => (
  <span style={{ fontSize: 'var(--text-xs)', fontWeight: 600, padding: '1px 6px', borderRadius: 'var(--radius-sm)', border: `1px solid ${ok ? 'var(--color-success-a30)' : 'var(--color-danger-a30)'}`, color: ok ? 'var(--color-success)' : 'var(--color-danger)' }}>{texto}</span>
);

const Stat: React.FC<{ n: string; k: string; tono?: string }> = ({ n, k, tono }) => (
  <span><span style={{ display: 'block', fontSize: 'var(--text-xl)', fontWeight: 750, color: tono ?? 'var(--color-accent)' }}>{n}</span><span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>{k}</span></span>
);

const eyebrow: React.CSSProperties = { fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 };
const primario: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--color-accent)', color: 'var(--color-text-on-accent)', fontSize: 'var(--text-xs)', fontWeight: 700, cursor: 'pointer' };
const fantasma: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border-subtle)', background: 'transparent', color: 'var(--color-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer' };

export default ObjetivosAnalyzer;
```

En `Step5AuditIAWizard.tsx`, añadir el render de `rev-l2` y un helper de aplicación (usa el mismo `updateElementText`):

```tsx
  if (pantalla === 'rev-l2') {
    return (
      <div className="revision-phase rev-screen" style={PHASE_WRAP}>
        <ObjetivosAnalyzer
          elements={elements}
          onApply={async (elementId, texto) => {
            try {
              await updateElementText(elementId, texto);
              showToast('Propuesta de objetivo aplicada', 'success');
            } catch {
              showToast('Error al aplicar la propuesta', 'error');
            }
          }}
          onBack={() => setPantalla('rev-l0')}
        />
      </div>
    );
  }
```

- [ ] **Step 4: Run test to verify it passes** — Run: `npm test -- -t "ObjetivosAnalyzer"` ; Expected: PASS. Run: `npm test -- -t "contentReview"` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/contentReview.ts src/components/review/ObjetivosAnalyzer.tsx src/components/wizard/Step5AuditIAWizard.tsx src/__tests__/objetivosAnalyzer.test.tsx
git commit -m "feat(revision): analizador de objetivos REV-L2 con Bloom"
```

---

### Task 13: Endpoint «Reformular con IA»

**Files:**
- Modify: `python/routers/proofread.py` (nuevo endpoint `POST /api/ai/reformulate`)
- Modify: `src/api/backend.ts` (cliente `reformulateText`)
- Test: `python/tests/test_reformulate.py`

**Interfaces:**
- Consumes: `modules.ai_assistant.rewrite_text_suggestion`.
- Produces:
  - `POST /api/ai/reformulate` con body `{ text: str; api_key?: str; provider_id?: str }` → `{ proposal: str }`.
  - `reformulateText(text: string): Promise<string>` en `src/api/backend.ts`.

- [ ] **Step 1: Write the failing test**

`python/tests/test_reformulate.py`:

```python
"""Reformular con IA: propone una reescritura editable, nunca escribe el doc."""
from fastapi.testclient import TestClient


def test_reformulate_devuelve_propuesta(monkeypatch):
    import main

    async def fake_rewrite(text, instruction, api_key=None, provider_id=None):
        return "Propuesta editable"

    # El endpoint importa la función DENTRO del handler desde `modules.ai_assistant`;
    # se parchea ese módulo, que es el que resuelve el import en runtime.
    import modules.ai_assistant as ai_assistant
    monkeypatch.setattr(ai_assistant, "rewrite_text_suggestion", fake_rewrite)

    client = TestClient(main.app)
    resp = client.post("/api/ai/reformulate", json={"text": "La transformación digital ha redefinido"})
    assert resp.status_code == 200
    assert resp.json()["proposal"] == "Propuesta editable"


def test_reformulate_rechaza_texto_vacio():
    import main

    client = TestClient(main.app)
    resp = client.post("/api/ai/reformulate", json={"text": "   "})
    assert resp.status_code == 400
```

- [ ] **Step 2: Run test to verify it fails** — Run: `pytest python/tests/test_reformulate.py -q` ; Expected: FAIL, 404 (endpoint inexistente).

- [ ] **Step 3: Write minimal implementation**

En `python/routers/proofread.py`, añadir al final:

```python
class ReformulateRequest(BaseModel):
    text: str
    api_key: Optional[str] = None
    provider_id: Optional[str] = None


# Instrucción fija: la persona pide «reformular» y el motor propone una versión
# con voz de autor; nada se aplica solo (la vista la deja editable).
_REFORMULATE_INSTRUCTION = (
    "Reescribe el párrafo en español académico natural, conservando el "
    "significado y las citas, reduciendo las muletillas y la rigidez sintética."
)


@router.post("/api/ai/reformulate")
async def ai_reformulate(req: ReformulateRequest) -> dict:
    """Propone una reescritura editable de un párrafo. No toca el documento."""
    if not (req.text or "").strip():
        raise HTTPException(status_code=400, detail="Texto vacío.")
    from modules.ai_assistant import rewrite_text_suggestion

    try:
        propuesta = await rewrite_text_suggestion(
            req.text, _REFORMULATE_INSTRUCTION, req.api_key, req.provider_id
        )
    except Exception as exc:  # pragma: no cover - depende del proveedor
        raise HTTPException(status_code=502, detail=str(exc))
    return {"proposal": propuesta}
```

Verificar que el router de `proofread.py` está montado en `main.py`; si `router` no está incluido, añadirlo junto a los demás `include_router`.

En `src/api/backend.ts`, añadir:

```ts
/** Reformular con IA: devuelve una propuesta EDITABLE; nunca escribe el doc. */
export async function reformulateText(text: string, apiKey?: string): Promise<string> {
  const res = await fetchWithTrace(`${getApiBase()}/ai/reformulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, api_key: apiKey, provider_id: proveedorElegido() }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Error al reformular con IA');
  }
  const data = await res.json();
  return data.proposal;
}
```

> Nota: ya existía `/api/ai/rewrite` (genérico). Este endpoint es el dedicado a la Sala de IA; su instrucción fija es la del detector. Reutiliza `rewrite_text_suggestion`, no duplica el motor.

Y cablear la prop `onReformular` que Task 8 dejó preparada. En `Step5AuditIAWizard.tsx`, añadir el import `import { reformulateText } from '../../api/backend';` y pasar la prop:

```tsx
            <AiSectionDetail
              fila={fila}
              paragraphs={reviewResult?.paragraphs ?? []}
              onBack={() => setIaNivel('l0')}
              onMark={(id) => handleMark({ element_id: id } as AuditItem)}
              onReformular={(texto) => reformulateText(texto)}
            />
```

- [ ] **Step 4: Run test to verify it passes** — Run: `pytest python/tests/test_reformulate.py -q` ; Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add python/routers/proofread.py python/tests/test_reformulate.py src/api/backend.ts
git commit -m "feat(ia): endpoint Reformular con IA (propuesta editable)"
```

---

### Task 14: Retirar los componentes legados

**Files:**
- Delete (componentes): `src/components/review/AiHierarchy.tsx`, `AiProfile.tsx`, `AiChapterFocus.tsx`, `ReviewWorkbench.tsx`, `ReviewMinimap.tsx`, `EngineGroupCard.tsx`, `FindingDetail.tsx`, `FindingAccordion.tsx`, `BloomPanel.tsx`, `AiMosaic.tsx`, `ReviewStrip.tsx`, `EvaluacionComparador.tsx`
- Delete (lib): `src/lib/aiMosaic.ts`, `src/styles/aiProfile.css`
- Delete (tests dedicados): `src/__tests__/aiHierarchy.test.tsx`, `reviewWorkbench.test.tsx`, `reviewMinimap.test.tsx`, `reviewMinimapKeyboard.test.tsx`, `findingRack.test.tsx`, `findingPhase.test.tsx`, `aiMosaicView.test.tsx`, `mapaEstructura.test.tsx`, `reviewStrip.test.tsx`, `evaluacionComparador.test.tsx`
- Modify: `src/__tests__/suiteEstructuraModular.test.tsx` (si enumera los retirados)

**Interfaces:**
- Consumes: nada.
- Produces: árbol sin los componentes que ninguna sala monta.

- [ ] **Step 1: Confirmar que nadie los importa**

Run: `grep -rn "AiHierarchy\|AiProfile\|AiChapterFocus\|ReviewWorkbench\|ReviewMinimap\|EngineGroupCard\|FindingDetail\|FindingAccordion\|BloomPanel\|AiMosaic\|ReviewStrip\|EvaluacionComparador" src --include=*.tsx --include=*.ts`
Expected: los únicos resultados son los propios archivos a borrar y sus tests dedicados. Si aparece un import vivo desde una sala, **no borrar** ese archivo y anotarlo.

- [ ] **Step 2: Borrar componentes, lib y tests dedicados**

```bash
git rm src/components/review/AiHierarchy.tsx src/components/review/AiProfile.tsx src/components/review/AiChapterFocus.tsx src/components/review/ReviewWorkbench.tsx src/components/review/ReviewMinimap.tsx src/components/review/EngineGroupCard.tsx src/components/review/FindingDetail.tsx src/components/review/FindingAccordion.tsx src/components/review/BloomPanel.tsx src/components/review/AiMosaic.tsx src/components/review/ReviewStrip.tsx src/components/review/EvaluacionComparador.tsx
git rm src/lib/aiMosaic.ts src/styles/aiProfile.css
git rm src/__tests__/aiHierarchy.test.tsx src/__tests__/reviewWorkbench.test.tsx src/__tests__/reviewMinimap.test.tsx src/__tests__/reviewMinimapKeyboard.test.tsx src/__tests__/findingRack.test.tsx src/__tests__/findingPhase.test.tsx src/__tests__/aiMosaicView.test.tsx src/__tests__/mapaEstructura.test.tsx src/__tests__/reviewStrip.test.tsx src/__tests__/evaluacionComparador.test.tsx
```

`useReviewWorkbench.ts` importa el tipo `MinimapMark` de `ReviewMinimap` (borrado). Quitar del hook lo que solo servía al minimapa: el import `import type { MinimapMark } from '../components/review/ReviewMinimap';`, el campo `marks: Map<number, MinimapMark>;` de `ReviewWorkbenchApi`, el `useMemo` que calcula `marks` y la línea `marks,` del retorno. Borrar también el test de `marks` en `src/__tests__/useReviewWorkbench.test.ts` («la marca de la página la tiñe el motor más grave, no el primero que aparece»).

- [ ] **Step 3: Correr la suite y saldar imports rotos**

Run: `npm test -- --reporter=dot`
Expected: los únicos rojos son tests que importan un módulo borrado. Para cada uno: si el test solo probaba el componente retirado, borrar el test; si probaba una regla todavía viva (p. ej. `SEVERITY_RANK`), mover esa aserción al test de la sala que la conserva. Re-ejecutar hasta verde.

- [ ] **Step 4: Verificar que la app compila sin los retirados**

Run: `npm run build`
Expected: build OK. Si falla por un import vivo, restaurar el archivo con `git checkout -- <path>` y anotarlo como dependencia no prevista.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(revision): retirar componentes legados de la fase 5"
```

---

### Task 15: Actualizar `AGENTS.md` (retirar la regla de una sola columna)

**Files:**
- Modify: `AGENTS.md:13-24`

**Interfaces:**
- Consumes: nada.
- Produces: regla vigente de las dos salas.

- [ ] **Step 1: Verificar el estado actual de la regla**

Run: `grep -n "un párrafo a la vez\|tres columnas\|ReviewMinimap\|párrafo a la vez" AGENTS.md`
Expected: dos coincidencias (líneas 14 y 24).

- [ ] **Step 2: Editar la regla de layout**

Reemplazar en `AGENTS.md` la viñeta «Reasignación de Espacio (LAYOUT POR TAREA)» para que diga:

```md
- **Reasignación de Espacio (LAYOUT POR TAREA)**:
  - Vista **Revisión & IA** (`Step5AuditIAWizard.tsx`): son **dos salas separadas** con patrón dashboard→detalle. La **puerta** (`ReviewGate`) combina revisión e IA en un único % 70/30; la **Sala de Revisión** (motores objetivos) y la **Sala de IA** (detector probabilístico) NO mezclan sus hallazgos. Una superficie de nivel N navega al nivel N+1, no lo renderiza dentro.
  - Motores **objetivos** (ortografía, Bloom, estructura, citas) → "Aceptar / Aceptar todas"; motor **probabilístico** (detector de IA) → SOLO "Marcar para revisar", nunca "Aceptar". La portada (`read_only`) no ofrece botón de aceptar.
```

- [ ] **Step 3: Editar la viñeta de ámbitos de fase**

Reemplazar la última viñeta de §1 («La revisión nombra la fase como línea de contexto... un párrafo a la vez») para que diga:

```md
  - La revisión nombra la fase como **línea de contexto** y la deja filtrar por chip. El filtro de fase se intersecta en `visibles` (`useReviewWorkbench.ts`), no en la vista, para que "Siguiente hallazgo" lo respete por construcción. Los conteos de los chips salen de `allPhases` (derivados de los hallazgos completos), nunca de un re-derivado en la tira. El modo de lectura ya no es "un párrafo a la vez": la vista es un dashboard con detalle, y el layout de tres columnas dejó de estar prohibido.
```

- [ ] **Step 4: Verificar que no quedan restos de la regla vieja**

Run: `grep -n "un párrafo a la vez\|NUNCA reintroducir las tres columnas\|párrafo a la vez" AGENTS.md`
Expected: sin coincidencias.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md
git commit -m "docs(agents): retirar la regla de una sola columna y fijar las dos salas"
```

---

## Self-Review

**Spec coverage:**
- UI 0 puerta 70/30, banda de color, personaje humano, dos entradas sin cards, chips, reanalizar, estado vacío → Tasks 4 y 6.
- `cumplimiento` nueva firma y consumidores → Task 1 (consumidores se actualizan en Tasks 10/11 vía `contarParrafos`).
- IA normalizada 0–100 y fuente única (`construirPerfilIA`) → Tasks 3, 6, 7.
- IA-L0 dashboard (voz humana, reparto, tabla H1, mascota) → Task 7.
- IA-L1 detalle (grupos H2, filtros de banda, findings reales, reformular, marcar) → Task 8.
- Vista previa con manchas (reutiliza `PaperCanvas` + capa) → Task 9.
- REV-L0 (calificación sola, motores, Objetivos con Bloom, fases en columnas, portada bloqueada) → Task 10.
- REV-L1 (texto delante/corrección al lado, chips, aceptar/aceptar todas, marcar, portada read-only, dos canales) → Task 11.
- REV-L2 analizador de objetivos + cableado Bloom → Task 12.
- Biblioteca de frases determinista sin emojis → Task 2 (se muestra en Tasks 5/6/7/8/10/11/12).
- Umbral único de IA → Task 3.
- Endpoint Reformular con IA → Task 13.
- Retiro de legados → Task 14.
- `AGENTS.md` → Task 15.

**Spec gaps encontrados (decidir antes de implementar):**
1. **Vocabulario de bandas IA**: el mockup usa «Sin indicios/Bajo/Medio/Alto» y el código `BANDAS_IA` usa «Baja/Media/Alta/Crítica» (spec §5, decisión abierta). El plan usa el vocabulario del CÓDIGO; si el usuario prefiere el del mockup, se renombra `BANDAS_IA` en una tarea propia.
2. **«Confianza media»**: el detector no expone confianza por párrafo (spec §5). El plan OMITE esa cifra y no la inventa; queda pendiente si el usuario la quiere.
3. **Pestaña Referencias**: confirmar que `Step5ReferencesWizard` es el destino vigente y que ningún enlace de REV-L0 apunta a Referencias.
4. **`PaperCanvas` y `data-element-id`**: la vista previa asume que el lienzo expone `data-element-id` por bloque. Si no existe, hay que añadirlo en el mismo paso donde se pinta el párrafo.
5. **`rewrite_text_suggestion` y el proveedor**: el endpoint `/api/ai/reformulate` reutiliza el motor existente; verificar que `execute_with_specialty` respeta `provider_id` con el router actual (hay `test_provider_routing.py`).
6. **Modo oscuro de las manchas**: `--ia-mancha-*` se declara solo en el `:root` claro; si el modo oscuro necesita otro tinte, declararlo en el bloque oscuro de `design-system.css`.
