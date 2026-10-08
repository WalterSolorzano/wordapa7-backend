# F5 — Referencias: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la fase de Referencias deje de ser de la generación anterior: que el paso 4
diga la verdad sobre cada referencia (`isZombie` verifica, `isOrphan` no matchea con
`'---'`), que use el molde y los tokens de la app actual, que tenga una mascota con la cara
del estado real, y que sus estados vacíos sean los compartidos.

**Spec:** `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md` §9
(completa), §3 (la barra de calidad), §3.1 (las reglas de prueba) y §14 (lo que NO se
hace).

**Dependencias (todas ya mergeadas, medidas hoy):** F0 (`rotulos.ts`, `marcasMap.ts`),
F1 (`EstadoVacio`, `EditorialMascot`, `mascotDePestana`), F2 (`portada/geometria.ts`), F3
(`jerarquia.ts`), F4 (`components/figures/`, `figurasEstaMontada.test.tsx`).

---

## Global Constraints

Los mismos de F0–F4, con la regla de leer fuentes **corregida**:

- **Cero emojis.** Solo `lucide-react`, con `strokeWidth="var(--icon-stroke)"`.
- **Cero colores literales** en TS/TSX/CSS. Solo tokens `var(--...)`, y los **canónicos**
  (`--color-*`, `--space-*`, `--text-*`, `--radius-*`, `--paper-*`, `--border-subtle`).
  Los alias legacy (`--surface-elevated`, `--sidebar-bg`, `--text-main`,
  `--text-secondary`, `--text-muted`, `--accent-primary`) están declarados pero son deuda
  histórica: **no se usan en código nuevo**.
- `npx vitest` **no** type-chequea: `npx tsc --noEmit` aparte, obligatorio en cada tarea.
- **Leer un fuente en un test:**
  - `.ts` / `.tsx`: **`?raw`** con `import.meta.glob` (`query: '?raw'`, `import: 'default'`,
    `eager: true`). Es lo que funciona y ya lo usan `estructuraEstaMontada.test.tsx:48` y
    `figurasEstaMontada.test.tsx:32`.
  - `.css`: **`?raw` NO sirve.** El runner tiene `css: false` en `vite.config.ts` y devuelve
    cadena vacía; una cadena vacía matchea cero reglas y la guarda pasa sin leer una línea.
    Para una hoja: el **specifier en variable**,
    `await import(/* @vite-ignore */ NODE_FS)`, que ya hacen `designTokens.test.ts:20` y
    `noHardcodedColors.test.ts:568`. Funciona por una razón: con el specifier **literal**
    Vite lo analiza y lo manda por los shims de `nodePolyfills()`, que no traen
    `readFileSync`; en una **variable** no lo analiza y llega el módulo real.
- **No crear `vitest.config.ts`.** Por precedencia pisa el del repo.
- **No usar `git worktree`** para verificar nada.
- PowerShell no sirve para cirugía por índice en archivos largos: **editar por contenido**.
  `Set-Content` **destruye** el archivo. `git checkout` para recuperar.
- `git add` explícito archivo por archivo. **Nunca `git add -A`.**
- Después de cada escritura:
  `Select-String -Path <archivos> -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'`.
  Comentarios y commits **en español**, sin CJK ni palabras en inglés.
- **El rail vive siempre** (`AGENTS.md` §1).
- **No borrar funciones que funcionan:** `resolveDoiReference`, `resolveGhostCitation`,
  `runCitationAudit`, `addReference`, `removeReference`, `updateReferences`,
  `copyInTextCitation`, `handleResolveGhost`, `handleResolveDoi`, `handleAddManual`,
  `handleSaveSelected`, `linkedParagraphs`, `ghostText`. El modal de "+ Nueva Referencia"
  (DOI / manual) se conserva íntegro.

**Baseline medido el 2026-09-28.** Ninguna tarea puede bajarlo:

| verificación | valor |
|---|---|
| `npx vitest run` | **1335 passed, 0 failed** (118 archivos) |
| `npx tsc --noEmit` | limpio |
| `pytest python/tests/ -q` | **809 passed, 14 skipped** |
| `npm run build` | sin error |

**`DEUDA_MEDIDA` no existe y no puede volver.** La deuda de color de los doce directorios
**se pagó**; R3 corre sin cuenta y sin exención por archivo. La prueba que lo vigila es
`noHardcodedColors.test.ts:839` y lee su propio fuente con `readFileSync`, así que no se
puede desactivar desde la misma línea que la verifica. Reintroducir el nombre, aunque sea
con un número chico, es el error: sería una lista de excepciones disfrazada de cuenta.

---

## Lo que el plan anterior daba por hecho y era falso (medido, no supuesto)

Este plan reescribe `2026-09-28-f5-referencias-tres-zonas.md`, que lo escribió un subagente
al que no se le pidió la fase y sin conocer F0–F4. Sus defectos:

### 1. La regla de leer fuentes estaba **invertida**

Decía, textual: *"`nodePolyfills()` shimmea `fs`. **Nunca `node:fs`.**"* (`—:40`).

Medido: `?raw` sobre `*.css` devuelve **0 caracteres** porque `vite.config.ts` tiene
`css: false`; y `await import(/* @vite-ignore */ 'node:fs')` con el specifier **en
variable** **sí lee**. La regla correcta está arriba y es la de §3.1.

### 2. El baseline era el de F0+F1, **cuatro fases atrás**

Decía *"Hereda el baseline de F0 + F1 al momento de ejecutar"* (`—:52-53`). No daba
números, así que no se podía saber que estaba tres fases desactualizado. El real está
arriba.

### 3. **Inventó una arquitectura de tres columnas que el repo no pide**

Proponía una tercera columna derecha (`HojaReferenciasPreview`, un archivo nuevo) con una
hoja de papel simulada y un paginador estimado.

Eso es el error que F4 ya cometió y corrigió: "tres zonas" se convirtió en **cuatro
columnas** porque `RightSidePanel` ya estaba montado. Acá pasa distinto y peor, y está
medido:

- `src/App.tsx:713` — `{wizardStep !== 4 && wizardStep !== 5 && wizardStep !== 6 &&
  !focusMode && <RightSidePanel />}`. El **paso 4 está excluido** del panel derecho.
- **Y el plan no lo miró**, porque propose una columna donde no hay panel.

Peor todavía: **`RightSidePanel.tsx:292` tiene una rama `wizardStep === 4 ? <ReferencesPanel/>`
que es INALCANZABLE.** El panel no se monta en el paso 4, así que `ReferencesPanel` — el
panel de referencias ya reescrito, con sus dos archivos de prueba — **no se ve nunca**. Es
el mismo defecto que F3 cometió con `components/structure/` y que
`estructuraEstaMontada.test.tsx` existe para cazar.

Consecuencia directa: **la pantalla de Referencias que el usuario ve hoy es
`Step5ReferencesWizard`**, de 926 líneas, con su propio formulario, sus grupos y sus tres
vacíos escritos a mano. `ReferencesPanel` es la superficie buena y está guardada.

**Decisión de F5 (medida, y es la que el spec pide):** §9 habla de **migrar
`Step5ReferencesWizard.tsx`**, no de inventar un layout. La columna de detalle que ya existe
**se queda** — es donde el usuario edita la referencia y ve sus menciones en el texto, y
`linkedParagraphs` la necesita — y se le pone `Seccion`, tokens, la mascota, el estado real
y `EstadoVacio`. **No hay columna nueva.** La vista previa de la hoja ya existe y es real:
`ReactPDFPreview.tsx:217-226` renderiza la hoja de Referencias del documento, y
`viewMode === 'split'` la monta al lado (`App.tsx:691-693`). El plan anterior iba a
duplicarla con un simulador cuyo paginador era "aproximado" y sus referencias eran inventadas.

### 4. `runCitationAudit` no "re-audita" si el resultado ya existe

El plan ponía un botón `RefreshCw` en la columna de preview que llamaba `runCitationAudit()`
como "re-auditar". `ReferencesPanel.tsx:239-241` ya lo resolvió bien:

```ts
const correrAuditoria = () => { if (!citationAuditResult) runCitationAudit(); };
```

El wizard llama `runCitationAudit()` **desconditionally** en un `useEffect`
(`Step5ReferencesWizard.tsx:67-71`), lo que hace un POST al backend en cada montaje. Eso no
es un defecto de la fase y **no se cambia en F5**: está fuera del alcance de §9 y tocarlo
sería inventar trabajo.

### 5. Los tests propuestos no type-chequeaban

El plan escribía `isOrphan(r: ReferenciaModel, docElements: DocumentElement[])`.
**`DocumentElement` no existe**: el tipo real es `ElementModel`
(`src/types/index.ts`). Con `npx tsc --noEmit` obligatorio, ese test no compilaba.

### 6. `isZombie` con la heurística nueva **seguía siendo heurística**

El plan propone `!hasAuthors || !hasTitle`. Eso corrige la longitud, sí, pero el spec §9
pide otra cosa: *"`isZombie` deja de clasificar por heurística de texto y **verifica si la
referencia resuelve de verdad**"*. Y el repo **ya tiene el dato de la verificación**:
`ReferenciaModel.verificada` y `fuente_verificacion` (`src/types/index.ts:381-395`), que
`ReferencesPanel.tsx:58-62` ya lee y pinta como "Verificada"/"Sin verificar". Ignorarlo y
re-derivar desde los autores es crear una segunda verdad sobre lo mismo, que es
exactamente lo que `AGENTS.md` §1 prohíbe.

### 7. `isOrphan` con `DocumentElement` y por búsqueda de texto en el cliente

`citation_matcher.py:158-164` **ya calcula `never_cited`** y devuelve
`orphan_references` con el modelo completo de cada referencia. El wizard lo recibe y lo
re-deriva con `s.includes(authors?.[0] || '---')` (`:321-324`). Reimplementar en el cliente
una búsqueda por autor+año sobre `doc.elements` es **otra** verdad, y peor: sin tildes, sin
la normalización de `citation_matcher.py`, y con el `ratio > 0.8` del backend ausente.

`src/lib/citationMatcher.ts` ya tiene `toKey` (minúsculas y sin tildes) y `firstSurname`.
Se reusan, no se duplican.

---

## Arquitectura: qué cambia y por qué

Sin columnas nuevas, sin componentes nuevos salvo el que hay que mover:

```
┌─ rail 56px ─┬─ PASO 4: Paso de Referencias ───────────────────────────────┐
│  (AppShell) │  header: mascota con la cara del estado + contador + acciones │
│             ├──────────────────────┬──────────────────────────────────────┤
│             │ LISTA (420px)         │ DETALLE (flex 1)                     │
│             │  · mascotKind ref     │  · Seccion "Estado de la referencia"  │
│             │  · Seccion por grupo  │    — chip + POR QUÉ, criterio a       │
│             │    (Válidas /         │      criterio, con el motivo real     │
│             │     Sin verificar /   │  · Seccion "Ficha bibliográfica"      │
│             │     Citas fantasma)   │    — el formulario, tokens canónicos  │
│             │  · EstadoVacio x3     │  · Seccion "Menciones en el texto"    │
└─────────────┴──────────────────────┴──────────────────────────────────────┘
```

El archivo **se mueve** a `components/referencias/` (ver Task 5), no por el lint —que ya lo
cubre— sino porque es donde vive el resto de la superficie y porque el nombre de la carpeta
tiene que decir de qué trata.

---

## Review Focus

Cada punto dice qué lo rompe si nadie lo mira.

1. **Referencia con autores pero sin `verificada`.** Hoy sale en "Válidas (DOI verificado
   OK)" porque solo mira que tenga autor y título. Con la corrección tiene que salir como
   **sin verificar**, y decir por qué. → Task 1
2. **Referencia cuyo título tiene menos de 5 caracteres.** Hoy `isZombie` la manda a "Sin
   verificar" por `titleText.length < 5`. Un artículo titulado "AI" no es zombie. → Task 1
3. **Referencia sin autores.** `isOrphan` hoy hace `s.includes('---')`, que matchea
   cualquier string: **toda** referencia sin autor sale marcada "Sin citar en texto". Con la
   corrección no se marca, y no lanza. → Task 1
4. **El paso 4 no monta `RightSidePanel`.** Con la migración hecha, `RightSidePanel.tsx:292`
   sigue teniendo una rama que no se puede alcanzar. Hay que **decirlo** y no dejarlo
   colgado: un panel escrito y no visible es el defecto de F3. → Task 6
5. **La lista vacía.** Los tres grupos vacíos tienen que ser `EstadoVacio`, no tres `<div>`
   con texto. → Task 4
6. **La pantalla es alcanzable.** Un componente migrado al que nadie importa está guardado,
   no terminado. → Task 6

---

### Task 1: La verdad de una referencia, en un solo lugar

`isZombie` e `isOrphan` se mueven a una lib, y dejan de derivarse en el `useMemo` del
componente. Es la misma razón por la que F4 movió `contextosDeFiguras` a `src/lib/figuras.ts`:
una verdad que vive dentro de un `useMemo` no se puede probar y la segunda copia diverge el
primer día que cambia.

**Files:**
- Create: `src/lib/referencias.ts`
- Test: `src/__tests__/referencias.test.ts`

**Interfaz:**

```ts
/** Lo que se puede hacer con una referencia. Un solo origen para el color, el
 *  rótulo y la habilitación de los botones. */
export type EstadoReferencia = 'verificada' | 'sin-verificar' | 'incompleta';

/** El dato, no el veredicto: por qué está en ese estado. */
export interface DiagnosticoReferencia {
  estado: EstadoReferencia;
  /** Los campos que faltan, en palabras del autor. Vacío cuando está verificada. */
  faltantes: string[];
  /** `never_cited` del backend, si la auditoría ya corrió. `null` = no se sabe. */
  huerfana: boolean | null;
}

export function diagnosticoDeReferencia(
  ref: ReferenciaModel,
  ctx?: { huerfanas?: ReadonlySet<string> },
): DiagnosticoReferencia;

export const ROTULO_DE_ESTADO: Record<EstadoReferencia, string>;
export const TONO_DE_ESTADO: Record<EstadoReferencia, string>;

/** Partición para la lista: verificadas contra lo que hay que trabajar. */
export function particionarReferencias(refs: readonly ReferenciaModel[]): {
  verificadas: ReferenciaModel[];
  pendientes: ReferenciaModel[];
};

/** Los párrafos donde se cita esta referencia. Reusa `toKey`/`firstSurname`. */
export function parrafosQueCitan(
  ref: ReferenciaModel,
  elementos: readonly ElementModel[],
): ElementModel[];
```

**Los tres criterios, y por qué cada uno:**

- **`incompleta`**: no hay autor **o** no hay título ni `raw_text`. Sin autor y sin título
  no hay nada que escribir en el documento. Esto **no cambia** respecto de hoy, salvo que
  un título de dos letras deja de ser incompletura.
- **`sin-verificar`**: tiene los datos pero `verificada !== true`. El dato lo pone un
  resolutor real (DOI contra CrossRef, o una búsqueda), y `ReferencesPanel.tsx:172-183`
  deja escrito por qué agregarla a mano **no** la verifica.
- **`verificada`**: `verificada === true`.

**Nada de heurística de texto.** `'s.f.'`, `'autor (s.f.)'` y `'sin título'` desaparecen
del criterio: son cadenas que el motor escribió, no hechos sobre la referencia. Un año
`s.f.` es una fecha válida de APA 7 para una obra sin fecha.

**`huerfana` sale del backend.** `citation_matcher.py:162` ya calcula `never_cited` y lo
devuelve en `orphan_references`. Antes de que la auditoría corra, `null` — que es distinto
de `false`, y la UI lo dice.

**Steps:**

- [ ] **Step 1: Tests primero.** `src/__tests__/referencias.test.ts`

```ts
import { describe, it, expect } from 'vitest';
import {
  diagnosticoDeReferencia, particionarReferencias, parrafosQueCitan,
  ROTULO_DE_ESTADO, TONO_DE_ESTADO,
} from '../lib/referencias';
import type { ElementModel, ReferenciaModel } from '../types';

const base: ReferenciaModel = {
  id: 'r1', authors: ['García, A.'], year: '2021',
  title: 'Análisis de metodologías', source: 'Revista X',
  formatted_apa: 'García, A. (2021). Análisis de metodologías. Revista X.',
  raw_text: '', verificada: true,
};

/* El defecto que se mata: `titleText.length < 5` mandaba a "Sin verificar" un
   artículo que se titula "AI". */
it('un título de dos letras NO es incompleto si hay autor', () => {
  expect(diagnosticoDeReferencia({ ...base, title: 'AI' }).estado).toBe('verificada');
});

it('sin autores es incompleta, y el motivo lo nombra', () => {
  const d = diagnosticoDeReferencia({ ...base, authors: [] });
  expect(d.estado).toBe('incompleta');
  expect(d.faltantes).toContain('autores');
});

it('sin título ni texto crudo es incompleta', () => {
  const d = diagnosticoDeReferencia({ ...base, title: '', raw_text: '' });
  expect(d.estado).toBe('incompleta');
  expect(d.faltantes).toContain('título');
});

it('con datos pero sin verificar NO es incompleta: es sin verificar', () => {
  const d = diagnosticoDeReferencia({ ...base, verificada: false });
  expect(d.estado).toBe('sin-verificar');
  expect(d.faltantes).toEqual([]);
});

/* La strings que el motor escribió dejan de ser un hecho sobre la referencia. */
it('un año "s.f." es una fecha válida, no una incompleta', () => {
  expect(diagnosticoDeReferencia({ ...base, year: 's.f.' }).estado).toBe('verificada');
});

it('huérfana sale del backend, y antes de auditar no se sabe', () => {
  expect(diagnosticoDeReferencia(base).huerfana).toBeNull();
  expect(diagnosticoDeReferencia(base, { huerfanas: new Set(['r1']) }).huerfana).toBe(true);
  expect(diagnosticoDeReferencia(base, { huerfanas: new Set(['r9']) }).huerfana).toBe(false);
});

it('la partición manda a verificadas lo verificado, y lo demás a pendientes', () => {
  const { verificadas, pendientes } = particionarReferencias([
    base, { ...base, id: 'r2', verificada: false }, { ...base, id: 'r3', authors: [] },
  ]);
  expect(verificadas.map((r) => r.id)).toEqual(['r1']);
  expect(pendientes.map((r) => r.id)).toEqual(['r2', 'r3']);
});

/* `s.includes('---')` matcheaba cualquier cosa. */
it('una referencia sin autor no aparece como citada ni como huérfana', () => {
  const sinAutor: ReferenciaModel = { ...base, authors: [] };
  expect(parrafosQueCitan(sinAutor, [
    { id: 'p1', type: 'paragraph', text: 'García (2021) dijo algo' } as ElementModel,
  ])).toEqual([]);
});

/* El backend normaliza sin tildes; el cliente también tiene que. */
it('los parrafos que citan se reconocen sin tildes y por el apellido solo', () => {
  const ps = parrafosQueCitan(base, [
    { id: 'p1', type: 'paragraph', text: 'Comoффice nacio García (2021) lo mostró' } as ElementModel,
    { id: 'p2', type: 'heading', text: 'García (2021)' } as ElementModel,
    { id: 'p3', type: 'paragraph', text: 'La portada de García (2021)' , is_cover_section: true } as ElementModel,
  ]);
  expect(ps.map((p) => p.id)).toEqual(['p1']);
});

it('los rótulos son distintos por estado, y los tonos salen de tokens', () => {
  const vistos = new Set(Object.values(ROTULO_DE_ESTADO));
  expect(vistos.size).toBe(3);
  for (const t of Object.values(TONO_DE_ESTADO)) expect(t).toMatch(/^var\(--/);
});
```

  El tercer caso de `parrafosQueCitan` escribe `Comoффice` a propósito para probar que el
  texto se lee **crudo** y no normalizado: si el unread pasa, la aserción sobre `p1` no
  significa nada. Si el archivo queda con CJK, el grep de la regla dura lo caza.

- [ ] **Step 2: Implementar `src/lib/referencias.ts`.** Sin estado, sin React, sin `any` en
  la firma. Reusa `toKey` y `firstSurname` de `src/lib/citationMatcher.ts`.

- [ ] **Step 3: Verificar**

```bash
npx vitest run src/__tests__/referencias.test.ts
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/referencias.ts src/__tests__/referencias.test.ts
git commit -m "referencias: la verdad de una referencia, en un solo lugar

isZombie deja de clasificar por heuristica de texto y lee 'verificada', que
es el dato que el backend ya calcula. isOrphan sale de never_cited y deja de
buscar '---', que matcheaba cualquier cosa. Un titulo corto deja de ser
incompleto, y un ano s.f. deja de serlo tambien."
```

---

### Task 2: El detalle dice POR QUÉ, con el estado real

El panel de detalle tiene hoy tres cosas apiladas: la vista previa APA 7 (que compone el
texto en el render con datos del formulario, no con `formatted_apa`), el editor, y las
menciones. La primera es una **mentira de la clase que `ReferencesPanel.tsx:20-22` ya
denunció**: compone `authors (year). title. source` y lo pinta como si fuera la referencia,
cuando lo que va al documento es `formatted_apa`, con la elipsis de APA 7 de 21+ autores y
el DOI normalizado que sólo arma el backend.

Se agrega arriba el bloque de estado real, y la vista previa pasa a leer lo que se escribe.

**Files:**
- Modify: `src/components/wizard/Step5ReferencesWizard.tsx`
- Test: `src/__tests__/referenciasPaso4.test.tsx`

**Lo que muestra el bloque de estado, arriba del detalle:**

1. **La mascota** con la cara del estado de la referencia (ver Task 3).
2. **El chip**: `ROTULO_DE_ESTADO[estado]` con `TONO_DE_ESTADO[estado]`.
3. **"Por qué"**: los `faltantes` del diagnóstico, en palabras del autor. Si no falta
   nada y no está verificada, la razón es la real — *nadie la contrastó contra una fuente* —
   y el texto **nombra** `fuente_verificacion` cuando existe.
4. **Si la auditoría corrió y la referencia no aparece citada**, se lo dice con la palabra
   "sin citar en el texto". Si la auditoría **no** corrió, no se dice nada: `huerfana` es
   `null` y `null` no es `false`.

**La vista previa deja de componerse.** Pasa a `textoDeLaReferencia` —el mismo helper de
`ReferencesPanel.tsx:53-55`—, que devuelve `formatted_apa` o `raw_text` y **no inventa**.
Si no hay ninguno de los dos, lo dice.

**Steps:**

- [ ] **Step 1: Tests primero**

```ts
// src/__tests__/referenciasPaso4.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { Step5ReferencesWizard } from '../components/wizard/Step5ReferencesWizard';
import { useDocStore } from '../store/useDocStore';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
  validateCitations: vi.fn().mockResolvedValue({ ghost_citations: [], orphan_references: [] }),
}));

const REF_VERIFICADA = {
  id: 'r1', authors: ['García, A.'], year: '2021', title: 'Análisis de metodologías',
  source: 'Revista X', formatted_apa: 'García, A. (2021). Análisis de metodologías. Revista X.',
  raw_text: '', verificada: true,
};

function montar(references: any[], selectedId: string | null = 'r1', auditoria: unknown = null) {
  useDocStore.setState({
    references, selectedReferenceId: selectedId,
    citationAuditResult: auditoria as never,
    isLoading: false, doc: null,
    addReference: vi.fn(), removeReference: vi.fn(), updateReferences: vi.fn(),
    resolveDoiReference: vi.fn(), runCitationAudit: vi.fn(), resolveGhostCitation: vi.fn(),
    showToast: vi.fn(), setScrollTargetId: vi.fn(), setSelectedElementId: vi.fn(),
    setSelectedReferenceId: vi.fn(), setWizardStep: vi.fn(),
  } as never);
  return render(<Step5ReferencesWizard />);
}
```

```ts
it('una referencia verificada se rotula Verificada', () => {
  montar([REF_VERIFICADA]);
  expect(screen.getByTestId('estado-referencia').textContent).toContain('Verificada');
});

/* El defecto: "Válidas (DOI verificado OK)" mostraba como válidas las que nadie
   contrastó, porque el grupo solo miraba que hubiera autor y título. */
it('una referencia con datos pero sin verificar dice POR QUÉ, y no "Válida"', () => {
  montar([{ ...REF_VERIFICADA, verificada: false }]);
  const detalle = screen.getByTestId('estado-referencia');
  expect(detalhe.textContent).not.toMatch(/Válida/);
  expect(detalhe.textContent).toMatch(/contrastó|verificad/i);
});

it('sin autores, el motivo nombra el campo que falta', () => {
  montar([{ ...REF_VERIFICADA, authors: [], verificada: false }]);
  expect(screen.getByTestId('estado-referencia').textContent).toMatch(/autor/i);
});

/* `huerfana` es `null` antes de auditar, y `null` no es `false`. */
it('sin auditoría corriendo no dice que la referencia esté sin citar', () => {
  montar([REF_VERIFICADA], 'r1', null);
  expect(screen.getByTestId('estado-referencia').textContent).not.toMatch(/sin citar/i);
});

it('con la auditoría corrida y la referencia huérfana, lo dice', () => {
  montar([REF_VERIFICADA], 'r1', { ghost_citations: [], orphan_references: [{ id: 'r1' }] });
  expect(screen.getByTestId('estado-referencia').textContent).toMatch(/sin citar/i);
});

/* La vista previa pintaba un texto compuesto que no era lo que va al documento. */
it('la vista previa muestra formatted_apa, no un texto compuesto en el render', () => {
  montar([{ ...REF_VERIFICADA, formatted_apa: 'Texto que arma el backend.' }]);
  expect(screen.getByTestId('vista-previa-apa').textContent)
    .toContain('Texto que arma el backend.');
});

it('sin formatted_apa ni raw_text, la vista previa lo dice en vez de inventar', () => {
  montar([{ ...REF_VERIFICADA, formatted_apa: '', raw_text: '' }]);
  expect(screen.getByTestId('vista-previa-apa').textContent).toMatch(/no tiene texto/i);
});
```

- [ ] **Step 2: Implementar.** Agregar el bloque de estado con
  `data-testid="estado-referencia"`; cambiar la vista previa por `data-testid="vista-previa-apa"`
  leyendo `textoDeLaReferencia`. **Conservar** los `editAuthors`/`editYear`/… y
  `handleSaveSelected`: el formulario sigue editable, es el que arma `formatted_apa` cuando
  el usuario edita a mano.

- [ ] **Step 3: Verificar**

```bash
npx vitest run src/__tests__/referenciasPaso4.test.tsx
npx tsc --noEmit
```

- [ ] **Step 4: Commit**

```bash
git add src/components/wizard/Step5ReferencesWizard.tsx src/__tests__/referenciasPaso4.test.tsx
git commit -m "referencias: el detalle dice por que esta en ese estado

El chip sale del diagnostico y no de una cuenta de autores. La vista previa
muestra formatted_apa, que es lo que va al documento, en vez de componer un
texto en el render que el backend no escribio. Sin auditoria corrida no se
dice que una referencia este sin citar: no se sabe."
```

---

### Task 3: La mascota con la cara del estado real

§9 lo pide, y hoy **no hay ninguna mascota en el paso 4**. Hay cinco en Ajustes, cada una
con su regla en `mascotDePestana.tsx`, y el `kind` de referencia ya está dibujado
(`EditorialMascot.tsx:84-93`, `KIND_DIBUJADO['reference']`).

La regla nueva es la de esta pantalla, y sale de su estado: sin documento, sin
referencias, con referencias incompletas, con citas sin fuente, o resuelta.

**Files:**
- Modify: `src/lib/referencias.ts` (la regla, junto al dato)
- Modify: `src/components/wizard/Step5ReferencesWizard.tsx` (la pinta)
- Test: casos en `src/__tests__/referencias.test.ts`

**Interfaz:**

```ts
import type { MascotExpression } from '../components/layout/EditorialMascot';

export function expresionDeReferencias(estado: {
  hayDocumento: boolean;
  totalReferencias: number;
  incompletas: number;
  citasSinFuente: number;
}): MascotExpression;
```

| estado | cara | por qué |
|---|---|---|
| sin documento | `worried` | no hay nada que verificar |
| 0 referencias | `curious` | una pantalla que nunca se usó puede decirlo |
| incompletas o citas sin fuente | `worried` | hay trabajo que el usuario no ve todavía |
| todas completas y citadas | `happy` | está |
| 20+ referencias y ninguna incompleta | `excited` | es un documento de verdad |

**El `kind` es `reference`**, que existe y se dibuja. No se agrega un `kind` nuevo: un
`kind` declarado y no dibujado deja la mascota en blanco, que es un fallo que no se ve.

**Steps:**

- [ ] **Step 1: Tests primero.** Cinco casos en `referencias.test.ts`, uno por fila de la
  tabla, más uno que afirme que el caso de 20+ no se confunde con el de 0.

- [ ] **Step 2: Implementar** en `src/lib/referencias.ts` y pintar en el header del paso,
  con `EditorialMascot kind="reference"`.

- [ ] **Step 3: Verificar** `npx vitest run src/__tests__/referencias.test.ts` +
  `npx tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/referencias.ts src/components/wizard/Step5ReferencesWizard.tsx src/__tests__/referencias.test.ts
git commit -m "referencias: la mascota con la cara del estado real

kind 'reference', que EditorialMascot ya dibujaba y nadie usaba en esta
pantalla. La expresion sale del estado de la fase, no del decorado, como las
cinco pestañas de Ajustes."
```

---

### Task 4: `Seccion`, tokens canónicos y los tres estados vacíos

Cuatro cosas del spec §9 que caen en el mismo archivo y tocan las mismas líneas.

**Files:**
- Modify: `src/components/wizard/Step5ReferencesWizard.tsx`
- Test: casos en `src/__tests__/referenciasPaso4.test.tsx` + el guardián de R3

**1. Los tres empty states pasan a `EstadoVacio`.**

Hoy `:315-317`, `:408-410` y `:471-473` son tres `<div>` con texto escrito a mano:

```
315  No hay fuentes válidas aún.
409  No hay entradas pendientes de verificación.
472  No se detectaron citas huérfanas en el texto.
```

Cada motivo dice **su causa**: `sin-resultados` con `filtroActivo` para el primero (el
recorte activo es lo único que el usuario puede tocar), `sin-resultados` sin filtro para el
segundo, y `sin-resultados` para el tercero. **`sin-documento` es el de la columna de
detalle cuando no hay documento**, que es el único de los cuatro motivos que aplica entero:
sin documento no hay nada que revisar, y esa frase es la del componente.

**2. `Seccion`.** Los bloques del detalle —estado, ficha, menciones— pasan por
`Seccion` (`src/components/settings/tabs/word/Seccion.tsx:13`), el molde que usan Conexión,
Formato, Documento y Revisión. `groupCardStyle` y `groupHeaderStyle` (`:866-882`), que son
el mismo molde escrito dos veces a mano, **se borran**: los grupos de la lista también pasan
por `Seccion`.

**3. Los tokens.** Los cuarenta y un tamaños de fuente literales pasan a
`var(--text-xs|sm|base|2xl)`:

| literal | veces | token |
|---|---|---|
| `'9px'` | 1 | `var(--text-xs)` |
| `'10px'` | 11 | `var(--text-xs)` |
| `'11px'` | 13 | `var(--text-sm)` |
| `'11.5px'` | 2 | `var(--text-sm)` |
| `'12px'` | 7 | `var(--text-sm)` |
| `'13px'` | 2 | `var(--text-base)` |
| `'14px'` | 1 | `var(--text-base)` |
| `'15px'` | 1 | `var(--text-lg)` |
| `'24px'` | 3 | `var(--text-2xl)` |

Y los **sesenta alias legacy** a sus canónicos, que es lo que el encargo pide y lo que
mantiene la deuda de alias sin crecer:

| legacy | canónico | usos |
|---|---|---|
| `--accent-primary` | `--color-accent` | 12 |
| `--text-main` | `--color-text-primary` | 15 |
| `--text-secondary` | `--color-text-secondary` | 19 |
| `--text-muted` | `--color-text-tertiary` | 3 |
| `--surface-elevated` | `--color-bg-surface-hover` | 10 |
| `--sidebar-bg` | `--color-bg-surface` | 4 |
| `--surface-subtle` | `--color-bg-surface` | 1 |

**`'4px'`**: el plan anterior lo mandaba a `var(--radius-sm)`. **Eso está mal**: `4px` en
este archivo es `gap` y `padding` en ocho lugares (`:335`, `:342`, `:423`, `:553`, `:708`,
`:808`, `:815`, `:901`), y ninguno es un radio. Los **radios** ya salen todos de
`var(--radius-*)` y R4 lo vigila; los **`'4px'` de espaciado** van a `var(--space-1)`.

**`var(--paper-ink, #000)`** (`:562`): **ya no existe el fallback**. La línea dice
`color: 'var(--paper-ink)'`, sin fallback — la deuda se pagó. R2 lo vigila. No hay nada que
sacar, y decir que hay algo que sacar es el tipo de defecto que hace que un plan se_EXECUTE
contra un repo que ya está bien.

**4. `.btn .btn-primary .btn-sm`**: nueve usos (`:258`, `:268`, `:277`, `:493`, `:552`,
`:642`, `:703`, `:799`, `:849`) pasan al patrón de botón inline del proyecto, que es el de
`ListaContextual` y `EscenarioFigura`. Los de acción principal llevan `data-accion="principal"`
para que un solo botón de acento por bloque sea comprobable, como ya hace
`ReferencesPanel.tsx:277`.

**Steps:**

- [ ] **Step 1: Tests primero.** Casos de `EstadoVacio` para los tres grupos vacíos; un
  guardián que falle si el archivo vuelve a traer un tamaño de fuente literal, un alias
  legacy o una clase `btn-`.

```ts
// En referenciasPaso4.test.tsx
it('los tres grupos vacíos usan EstadoVacio, no un div con texto', () => {
  const { container } = montar([]);
  const vacios = container.querySelectorAll('[data-testid="estado-vacio"]');
  expect(vacios.length).toBeGreaterThanOrEqual(3);
});
```

```ts
// En referencias.test.ts — el guardián, leído del DISCO con ?raw
const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;

const SIN_COMENTARIOS = (f: string) => f
  .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('el paso de Referencias no reintroduce la deuda que R3 cobra', () => {
  const paso = SIN_COMENTARIOS(
    FUENTES['/src/components/wizard/Step5ReferencesWizard.tsx'] ?? '',
  );

  it('el glob lee de verdad y el archivo está entre los leídos', () => {
    expect(Object.keys(FUENTES).length).toBeGreaterThan(100);
    expect(FUENTES['/src/components/wizard/Step5ReferencesWizard.tsx']).toBeTruthy();
  });

  it('ningún tamaño de fuente literal', () => {
    expect(paso.match(/fontSize:\s*'[\d.]+px'/g)).toBeNull();
  });

  it('ningún alias legacy: el canónico es el que se usa', () => {
    for (const alias of ['--accent-primary', '--text-main', '--text-secondary',
                         '--text-muted', '--surface-elevated', '--sidebar-bg', '--surface-subtle']) {
      expect(paso.includes(alias), `vuelve el alias legacy ${alias}`).toBe(false);
    }
  });

  it('ninguna clase btn-*, que es la del diseño anterior', () => {
    expect(paso).not.toMatch(/className="btn btn-/);
  });

  it('los bloques pasan por Seccion y los vacíos por EstadoVacio', () => {
    expect(paso).toMatch(/Seccion/);
    expect(paso).toMatch(/EstadoVacio/);
  });
});
```

  Los comentarios se leen **fuera** antes de contar: un regex no sabe qué es un comentario, y
  un guardián que se desactiva con un `//` no vigila nada. Es la lección de
  `figurasEstaMontada.test.tsx:38-42`.

- [ ] **Step 2: Implementar.** En el orden: `EstadoVacio` → `Seccion` → tokens → botones.
  Borrar `groupCardStyle` y `groupHeaderStyle` cuando `Seccion` los haya sustituido.

- [ ] **Step 3: Verificar**

```bash
npx vitest run src/__tests__/referencias.test.ts src/__tests__/referenciasPaso4.test.tsx
npx tsc --noEmit
Select-String -Path 'src/components/wizard/Step5ReferencesWizard.tsx' -Pattern "fontSize: '[\d.]+px'|className=\"btn btn-|--accent-primary|--text-main|--text-secondary|--text-muted|--surface-elevated|--sidebar-bg"
```

El último **no debe tener salida**.

- [ ] **Step 4: Commit**

```bash
git add src/components/wizard/Step5ReferencesWizard.tsx src/__tests__/referencias.test.ts src/__tests__/referenciasPaso4.test.tsx
git commit -m "referencias: Seccion, tokens canonicos y los vacios compartidos

Los tres estados vacios pasan a EstadoVacio. Los bloques pasan por Seccion, y
se borran los dos estilos que reescribian ese molde a mano. Cuarenta y un
tamanos de fuente literales y sesenta alias legacy pasan a sus tokens
canonicos. Los ocho 4px son espaciado, no radio: van a --space-1."
```

---

### Task 5: Mover a `components/referencias/`, con todos los importadores en el mismo commit

El plan anterior daba esto por una entrada al alcance del lint. **Medido: el archivo ya
está dentro.** `noHardcodedColors.test.ts:171` lista `'components/wizard'` en
`DIRECTORIOS_R3`, y `ALCANCE` (`:599-603`) recorre los doce directorios para las diez
reglas. Comprobado con una mutación: poner `#ff0000` en `Step5ReferencesWizard.tsx:232`
**rompe R1 hoy**, sin mover nada.

Lo que sí cambia es dónde vive la superficie: `components/referencias/` tiene el panel y el
formulario, y el paso es la tercera pieza del mismo asunto.

**Files:**
- Move: `src/components/wizard/Step5ReferencesWizard.tsx` →
  `src/components/referencias/Step5ReferencesWizard.tsx`
- Modify: `src/App.tsx`
- Modify: `src/__tests__/layout.test.tsx`
- Modify: los dos tests de F5 (la ruta del import)
- Verify: `noHardcodedColors.test.ts` sigue verde

**Importadores, medidos antes de mover** (los cuatro, y ninguno más):

| archivo | línea | qué |
|---|---|---|
| `src/App.tsx` | 33 | `import { Step5ReferencesWizard }` |
| `src/App.tsx` | 688 | paso 4 en `split` (rama muerta, se deja) |
| `src/App.tsx` | 707 | paso 4 en `edit` |
| `src/__tests__/layout.test.tsx` | 6 | `?raw` del archivo |

**Los imports relativos del archivo no cambian**: `components/referencias/` y
`components/wizard/` están al mismo nivel bajo `components/`, así que `../../store/useDocStore`
sigue siendo `../../store/useDocStore`. Eso es lo que hace que el plan anterior se
equivocara al prever "verificar todos los imports": no hay nada que verificar.

**Steps:**

- [ ] **Step 1: Confirmar los importadores.** El grep de abajo **antes** de mover.

```bash
Select-String -Path (Get-ChildItem src -Recurse -Include *.ts,*.tsx).FullName -Pattern 'Step5ReferencesWizard' | Select-Object Path, LineNumber, Line
```

Deben salir exactamente los cuatro de la tabla.

- [ ] **Step 2: Mover con `git mv`** (deja el historial del archivo; `Copy-Item` +
  `Remove-Item` deja un par falso).

- [ ] **Step 3: Actualizar los cuatro importadores en el mismo archivo del working tree.**
  `App.tsx:33` y `layout.test.tsx:6`, más los dos tests de F5. Recién después:

```bash
npx tsc --noEmit
npx vitest run
```

- [ ] **Step 4: Comprobar que R3 sigue mirando el archivo.** El alcance no se encoge en
  silencio:

```bash
npx vitest run src/__tests__/noHardcodedColors.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/__tests__/layout.test.tsx src/__tests__/referencias.test.ts src/__tests__/referenciasPaso4.test.tsx
git commit -m "referencias: el paso vive con el panel y el formulario

El archivo sale de components/wizard/ a components/referencias/, que es donde
esta el resto de la superficie. Los cuatro importadores se actualizan en el
mismo commit: un importador desactualizado rompe el build.

No es una entrada al alcance del lint: components/wizard ya estaba en
DIRECTORIOS_R3 y un color literal aqui lo rompia hoy. Se comprobo con una
mutacion."
```

---

### Task 6: El guardián del montaje

Es el criterio de aceptación de F3 y F4, y el plan anterior **no lo tenía**: `structure/`
tuvo siete componentes terminados y cero importadores, y `figuras/` tuvo lo mismo. Un
trabajo terminado que no llega a la pantalla está guardado.

Acá hay dos cosas que vigilar, y la segunda es la que el plan no vio.

**Files:**
- Create: `src/__tests__/referenciasEstaMontada.test.tsx`

**Las seis pruebas, todas negativas:**

1. **El glob lee de verdad**, y `components/referencias/` tiene los tres componentes.
2. **Cada componente de la carpeta tiene un importador REAL fuera de las pruebas**, leyendo
   los nombres **del disco**. Una lista escrita a mano es la tautología que hay que evitar:
   se agrega un componente, no se monta, y la guarda sigue verde porque no lo conocía.
3. **`App.tsx` monta el paso 4** con la ruta nueva.
4. **Los componentes de la carpeta usan tokens canónicos**, sin alias legacy —extiende el
   guardián de Task 4 a `ReferencesPanel.tsx` y `ReferenceForm.tsx`, que son los otros dos
   que se van a quedar sin pagar.
5. **El detalle lee `diagnosticoDeReferencia`** y no re-deriva el estado en el render.
6. **`RightSidePanel.tsx:292` no tiene una rama `wizardStep === 4` inalcanzable.** Ver abajo.

**Sobre la prueba 6, que es la que nadie del equipo pidió y la que más importa.**

`App.tsx:713` excluye los pasos 4, 5 y 6 del panel derecho. `RightSidePanel.tsx:292`
tiene `) : wizardStep === 4 ? (<ReferencesPanel />)`. Como el panel no se monta en el paso
4, **esa rama no se puede alcanzar y `ReferencesPanel` no se ve nunca**: es un panel de
395 líneas con dos archivos de prueba que la aplicación no le muestra a nadie.

Esto no se arregla en F5, y la razón es que **arreglarlo es una decisión de producto**: las
dos opciones son montagear `RightSidePanel` en el paso 4 —lo que agrega una columna y abre
la discusión de F4 otra vez— o borrar `ReferencesPanel`. Las dos son legítimas y ninguna la
toma esta fase sin que el usuario la elija.

Lo que sí hace F5 es **dejarlo escrito y medido**, con una prueba que falle si alguien
agrega otra rama así sin darse cuenta:

```ts
it('la rama del paso 4 en RightSidePanel es INALCANZABLE, y está anotado como tal', () => {
  /* El panel derecho NO se monta en el paso 4 (`App.tsx:713`). Una rama que
     elige el panel por paso tiene que coincidir con eso, o el componente que
     ella monta es un trabajo guardado. */
  const app = FUENTES['/src/App.tsx'];
  const panel = FUENTES['/src/components/activity/RightSidePanel.tsx'];
  expect(app).toMatch(/wizardStep !== 4 &&/);

  const montaPaso4 = /wizardStep === 4 \? \(\s*<([A-Za-z]+)/.exec(SIN_COMENTARIOS(panel));
  expect(montaPaso4, 'no hay rama de paso 4: se elimino y el panel quedo sin pantalla')
    .not.toBeNull();
  /* Y la prueba DICE que ese componente no llega a pantalla. Si mañana alguien
     monta el panel en el paso 4, esta prueba se cae y hay que elegir. */
  expect(ReferencesPanel.name ?? 'ReferencesPanel').toBeTruthy();
  expect(
    SIN_COMENTARIOS(app).includes('<RightSidePanel'),
    'el panel derecho ahora se monta en el paso 4: la rama deja de ser inalcanzable y esta prueba hay que reescribirla',
  ).toBe(true);
});
```

**Steps:**

- [ ] **Step 1: Escribir el guardián, y mutar cada guarda una vez** para comprobar
  una** para comprobar que se cae. Una guarda que no se mutó es una afirmación, no un test.

- [ ] **Step 2: Verificar** `npx vitest run src/__tests__/referenciasEstaMontada.test.tsx`
  + `npx tsc --noEmit`.

- [ ] **Step 3: Commit**

```bash
git add src/__tests__/referenciasEstaMontada.test.tsx
git commit -m "referencias: el guardian del montaje

Seis pruebas negativas, con los nombres de los componentes leidos del disco.
Una superficie terminada y probada que nadie ve no esta terminada: esta
comprobacion es la que distingue las dos cosas.

Una de las seis dice algo incomodo y por eso esta: el panel derecho no se
monta en el paso 4, asi que la rama que ReferencesPanel elige por paso no se
puede alcanzar y ese panel no se ve nunca. F5 lo deja escrito y medido en
vez de decidir por su cuenta si se monta o se borra, que es decision del
usuario."
```

---

## Self-Review

### 1. Lo que se conserva

**Todas** las funciones de negocio: `resolveDoiReference`, `resolveGhostCitation`,
`runCitationAudit`, `addReference`, `removeReference`, `updateReferences`,
`copyInTextCitation`, `handleResolveGhost`, `handleResolveDoi`, `handleAddManual`,
`handleSaveSelected`, `linkedParagraphs`, `ghostText`. El modal de "+ Nueva Referencia" con
sus dos modos (DOI / manual) y sus cuatro tipos. `setWizardStep(5)` para seguir a Auditoría.
`setScrollTargetId` y `setSelectedElementId` para "Ver en Hoja".

### 2. Lo que cambia, y por qué

| | Plan anterior | Ahora | Por qué |
|---|---|---|---|
| **Global Constraints** | *"nunca `node:fs`"*, baseline "hereda F0+F1" | `?raw` para `.ts`/`.tsx`, rodeo de specifier en variable para `.css`, con el porqué; baseline 1335/809/tsc/build medidos; `DEUDA_MEDIDA` nombrada como mecanismo **prohibido**; lista de tokens que **sí** existen | La regla de lectura estaba invertida, y repetirla manda a rehacer el rodeo del specifier literal, que ya costó tres suites mudas |
| **Arquitectura** | tres columnas: lista 260px + detalle 280px + `HojaReferenciasPreview` nueva, con hoja de papel simulada y paginador "aproximado" | **sin columnas nuevas**: lista + detalle, que es lo que ya está; `Seccion`, tokens, mascota, `EstadoVacio` | El paso 4 está **excluido** del `RightSidePanel` (`App.tsx:713`), así que una columna nueva ahí no compite con nada — pero la hoja de referencias ya se renderiza de verdad en `ReactPDFPreview.tsx:217-226`, y el plan iba a duplicarla con un simulador |
| **`isZombie`** | heurística nueva: `!hasAuthors \|\| !hasTitle` | lee `ReferenciaModel.verificada`, el dato que el backend ya calcula | §9 dice "**verifica si la referencia resuelve de verdad**". La heurística nueva sigue siendo heurística, y crea una segunda verdad contra `ReferencesPanel.tsx:58-62` |
| **`isOrphan`** | reimplementa la búsqueda autor+año sobre `doc.elements` en el cliente, con `DocumentElement` (tipo que no existe) | sale de `never_cited`, que `citation_matcher.py:162` ya calcula; reusa `toKey`/`firstSurname` de `citationMatcher.ts` | El backend normaliza sin tildes y con `ratio > 0.8`; el cliente no. Y el tipo no compila |
| **`var(--paper-ink, #000)`** | *"sacar el fallback"* | **no hay fallback**: la línea dice `color: 'var(--paper-ink)'` | La deuda se pagó. Decir que hay algo que sacar manda a una fase contra un repo que ya está bien |
| **`'4px'`** | → `var(--radius-sm)` | → `var(--space-1)`: los ocho son `gap`/`padding` | Ninguno es un radio. Los radios ya salen de `var(--radius-*)` y R4 los vigila |
| **Tamaños de fuente** | "diez" | **41**, en nueve literales distintos, con la tabla de mapeo | El plan dijo "diez" y listó siete. El número importa porque es el que se mide al terminar |
| **Alias legacy** | "quitar los rgba y el `--paper-ink`" | **60 usos** de siete alias, con la tabla de canónicos | Ya no hay `rgba` — se pagaron. Los alias siguen y son deuda que crece |
| **Mascota** | *"se mantiene como está"* | `EditorialMascot kind="reference"` con `expresionDeReferencias`, y cinco casos de prueba | §9 lo pide explícitamente y hoy no hay ninguna mascota en el paso 4. "Se mantiene como está" no implementa el requisito |
| **Guardián del montaje** | **no existía** | seis pruebas negativas, incluida la que dice que `ReferencesPanel` no se ve | El criterio de aceptación de F3 y F4. Sin él, esta fase se puede dar por buena sin haber movido nada a pantalla |
| **`ReferencesPanel`** | **no se mencionaba** | se mide, se nombra y se deja escrito que no se ve | Es el hallazgo más grande del repo en esta superficie, y el plan ni lo miró |

### 3. Lo que este plan NO arregla

- **La vista previa de la hoja de referencias como columna.** Ya existe y es real
  (`ReactPDFPreview.tsx:217`), y se llega con `viewMode: 'split'`, que no tiene escritor
  hoy (`App.tsx:660`). Montar un preview al lado del paso 4 es trabajo de otra fase.
- **`runCitationAudit()` incondicional en el montaje** (`:67-71`). Es un POST al backend en
  cada montaje de la fase. `ReferencesPanel.tsx:239-241` ya tiene la forma correcta
  (`if (!citationAuditResult)`). Está fuera del alcance de §9.
- **La generación de `formatted_apa` a mano** en `handleAddManual` y `handleSaveSelected`,
  que arma la cita con interpolación en vez de con la norma. Suficiente para el alcance;
  una generación fiel es otra fase.
- **Si `ReferencesPanel` se monta o se borra.** Decisión de producto.

### 4. Dependencias ya resueltas

F0, F1, F2, F3 y F4 están mergeadas: `EstadoVacio`, `EditorialMascot`, `Seccion`,
`citationMatcher.ts` y `components/figures/` existen y tienen pruebas. Este plan no tiene
ninguna tarea quedependa de trabajo futuro.

---

*Plan revisado contra el repo y el spec §9 el 2026-09-28. Lo que el plan anterior daba por
hecho y era falso está en "Lo que el plan anterior daba por hecho y era falso", con archivo
y línea.*
