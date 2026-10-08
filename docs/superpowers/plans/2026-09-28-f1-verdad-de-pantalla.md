# F1 — Verdad de pantalla: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la pantalla diga la verdad sobre su propio estado, deje de pintar el fondo
del documento de morado, y tenga un token para todo lo que hoy no lo tiene.

**Architecture:** Tres problemas de fondo. (a) `LoadingTips` es un `position: fixed` a
pantalla completa con `zIndex: 9999` inline y una paleta horaria escrita a mano en un
`.tsx`, morada a partir de las 18:00. (b) Cuatro tokens se usan y no existen
(`--accent-soft`, `--surface-bg`, `--surface-alt`, y `--surface-hover` como alias roto), y
el lint no los caza porque seis directorios están fuera de su alcance. (c) No existe
`EstadoVacio`, y el mensaje de "sin hallazgos" vive dentro del rack, que desaparece bajo
1180 px.

**Tech Stack:** React 18, TypeScript, Vitest, jsdom, `lucide-react`, tokens CSS.

**Spec:** `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md` §5.

## Global Constraints

Los mismos de F0, íntegros:

- **Cero emojis.** Solo `lucide-react`, con `strokeWidth="var(--icon-stroke)"`.
- **Cero colores literales** en TS/TSX/CSS. Solo tokens `var(--...)`. **Esta fase es la
  que más toca esto**: los tokens que faltan se declaran, no se hardcodean.
- `npx vitest` **no** type-chequea: `npx tsc --noEmit` aparte, obligatorio.
- **Leer un fuente en un test: `?raw` para `.ts`/`.tsx`; para `.css` NO sirve.** El runner
  tiene `css: false` y devuelve **cadena vacía** para una hoja, así que un glob con
  `*.css` es una guarda verde y muda. Para el CSS usá el rodeo del **specifier en
  variable** que ya funciona en `designTokens.test.ts` y `noHardcodedColors.test.ts`.
  **Esta regla estaba escrita al revés**: una regla a medias es peor que ninguna,
  porque hace repetir un rodeo que sí funciona.
- **No crees `vitest.config.ts`.**
- PowerShell no sirve para cirugía por índice de array en archivos largos.
- `git add` explícito archivo por archivo. **Nunca `git add -A`.**
- Después de cada escritura: `Select-String -Path <archivos> -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'`.
  Comentarios y commits **en español**.
- **Los dos themes.** Todo token nuevo se declara en `:root` **y** en
  `:root[data-theme="dark"]`. Un token en un solo theme es un bug en el otro.

**Baseline**: `npx vitest run` → 1024 passed, 0 failed. `npx tsc --noEmit` → limpio.
`pytest python/tests/ -q` → 766 passed, 14 skipped (esta fase no toca Python).

**⚠️ Tarea 0 es obligatoria y va primero.** Es la investigación en vivo, y el resto de la
fase depende de ella.

## Review Focus

1. **La ventana angosta, con hallazgos y sin ellos.** El mensaje de "sin hallazgos" hoy
   vive dentro del rack, que no se renderiza bajo 1180 px. Con la ventana angosta no
   aparece **nada**, y el usuario ve una pantalla vacía sin explicación. → Task 4
2. **El overlay de carga en tema oscuro.** Si el fondo del overlay se resuelve como
   token y el token no está declarado para oscuro, en oscuro es transparente o
   heredado. Un overlay que en claro tapa y en oscuro no, es peor que uno que siempre
   tapa. → Task 2
3. **Una tarea de 180 ms con el overlay abierto.** `MIN_DISPLAY_MS = 3500` obliga a ver
   la pantalla 3.3 s de más. Con la barra de proyectos subiendo 20 archivos en serie
   (§11 del spec) eso son 70 s de pantalla fija. → Task 2
4. **Un token usado sin fallback.** `var(--surface-bg, #ffffff)` tapa el defecto: se ve
   bien en claro y mal donde el token no existe. Los usos con fallback son los
   peligrosos, porque parecen funcionar. → Task 3
5. **El rail y su flyout, que viven siempre.** Ninguna tarea de esta fase puede montarlos
  condicionalmente ni deprimirlos: AGENTS.md §1 los declara permanentes. Un arreglo de
  superposición que los monte condicionalmente es un arreglo que rompe el diseño. → Task 5

---

### Task 0: Reproducir el morado antes de tocar nada

El spec lo dejó explícito: `scanAll` (`useReviewWorkbench.ts:796-854`) usa `isScanning`
local y **no** pone `isLoading`, así que el camino real que dispara el overlay todavía no
está identificado. **No se escribe código antes de cerrar esto.**

**Files:** ninguno. Es investigación.

- [ ] **Step 1: Levantá la app y reproducilo**

`npm run dev` (el backend en `python/`, y el frontend). Con la app abierta:

1. Abrí un documento.
2. Apretá el botón de escanear de Revisión.
3. Anotá: ¿aparece el overlay morado? ¿cuánto tiempo? ¿qué dice?

Repetí con un documento **sin** figuras, y después con uno **con** muchas. El color
depende de la hora (`LoadingTips.tsx:377-380`): si es de noche o de tarde, el overlay es
morado; si es de mañana, es ámbar o azul. **Anotá la hora de la reproducción**, porque
si lo viste a otra hora el bug es el mismo pero la evidencia cambia.

- [ ] **Step 2: Identificá el disparador real**

En `src/components/layout/LoadingTips.tsx:558`, el overlay se monta con `isLoading` **o**
`!isBackendReady`. Si el morado aparece durante el escaneo y `isLoading` no se puso:

- Buscá quién pone `isLoading` en la vicinity: `Select-String -Path 'src/**/*' -Pattern 'setLoading|isLoading: true'`.
- Si hay un **cuarto** disparador (además de `uploadFile`, `openSession`, `approveElements`,
  `exportDocx`, `exportPdf` que ya están en `documentSlice`), **anotalo con su archivo y
  línea en el reporte de la fase.** Es un hallazgo que cambia el alcance de Task 2.

- [ ] **Step 3: Anotá el resultado en el reporte**

Tres outcomes posibles:

| Lo que encontres | Qué hacés |
|---|---|
| El disparador es `isLoading` de `documentSlice` | Seguí con Task 2 tal cual está. |
| El disparador es un cuarto que no conocíamos | Sumalo a Task 2 con su archivo y línea. |
| El morado **no** aparece en el escaneo | **Pará y decílo.** Significa que el bug es otro, y Task 2 se reduce al problema del `MIN_DISPLAY_MS` y del `zIndex`. No la reescribas sin saber qué estás arreglando. |

**El reporte de esta fase tiene que arrancar con este resultado.** Es el supuesto 1 del
spec y es el único que quedaba abierto.

---

### Task 1: Los tokens que no existen

**Files:**
- Modify: `src/styles/design-system.css` (declaraciones, dos themes)
- Modify: los 5 usos: `src/styles/fluent.css:994`, `src/components/auditor/DesignAuditor.tsx:178`,
  `src/components/project/MergeDocumentsModal.tsx:55`, `src/components/project/ProjectImagesDrawer.tsx:31,73,108`,
  `src/components/layout/ProjectTabs.tsx:121`
- Modify: `src/__tests__/noHardcodedColors.test.ts` (`DIRECTORIOS` y `ARCHIVOS`, `:133-149`;
  y la regla de tokens, `:500-518`)
- Test: `src/__tests__/noHardcodedColors.test.ts` (extendido), `src/__tests__/tokensDeclarados.test.ts` (nuevo)

**Interfaces:**
- Produces: los tokens que los usos de abajo necesitan, ya declarados en los dos themes.
  La Fase 2 los usa para la portada; la Fase 5, para Referencias.

- [ ] **Step 1: Escribí el test que falla**

`src/__tests__/tokensDeclarados.test.ts` (nuevo). La regla nueva: **todo `var(--x)` sin
fallback en `src/**` tiene que estar declarado en `design-system.css`.** Esta regla sola
caza los cuatro tokens fantasma, y es la que impide que aparezca un quinto.

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';   // <-- NO. Leé el paso 2 antes de escribir esto.
```

> **Importante.** El test tiene que leer los fuentes de `src/**` y **el CSS**, y cada uno
> se lee con una técnica distinta. Esta fase lo tenía al revés y por eso costó tres
> suites enteras que nunca se colectaban.
>
> **Los `.ts`/`.tsx`: `import.meta.glob` con `?raw`.** Ahí funciona:
>
> ```ts
> const fuentes = import.meta.glob('/src/**/*.{ts,tsx}', {
>   query: '?raw', import: 'default', eager: true,
> }) as Record<string, string>;
> ```
>
> **El `.css`: `import.meta.glob` con `?raw` NO sirve.** El runner tiene `css: false`, así
> que un glob con `*.css` devuelve **cadena vacía**: cero caracteres. Una cadena vacía
> matchea cero reglas y `Math.max(...[])` da `NaN`, así que la regla pasaba sin haber
> leído una línea —verde falso, que es peor que no tener regla—. Para la hoja usá el
> rodeo del **specifier en variable**:
>
> ```ts
> const NODE_FS = 'node:fs';
> const NODE_PATH = 'node:path';
> const NODE_URL = 'node:url';
> const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
> ```
>
> Y el rodeo funciona por una razón que hay que entender, no memorizar: con el specifier
> **literal** Vite puede analizarlo y lo manda por los shims de browser de
> `nodePolyfills()`, que no traen `readFileSync`; en una **variable** no lo analiza y
> llega el módulo real. Ya lo hacen `designTokens.test.ts:20-27` y
> `noHardcodedColors.test.ts` — **leé esos dos archivos y copiá el patrón exacto**, no lo
> inventes.

El cuerpo del test:

```ts
const CSS = fuentes['/src/styles/design-system.css'];

// Solo se declaran los bloques :root, no los usages.
const declarados = new Set<string>();
for (const m of CSS.matchAll(/^\s*(--[\w-]+)\s*:/gm)) declarados.add(m[1]);

// Un var(--x, fallback) se resuelve solo: no necesita declaracion.
const usosSinFallback: string[] = [];
for (const [ruta, fuente] of Object.entries(fuentes)) {
  if (ruta.endsWith('design-system.css')) continue;
  for (const m of fuente.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    if (!declarados.has(m[1])) usosSinFallback.push(`${ruta} usa ${m[1]}`);
  }
}
expect(usosSinFallback).toEqual([]);
```

Este test **falla hoy** con al menos `--accent-soft`, `--surface-bg` y `--surface-alt`.

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/tokensDeclarados.test.ts`
Expected: FAIL con la lista de tokens sin declarar. **Anotá la lista completa en el
reporte**: puede haber más de los tres conocidos, y son todos reales.

- [ ] **Step 3: Decidí qué hacer con cada token, uno por uno**

**No declares un cuarto nombre.** Ya existen los canónicos; lo que falta son alias. La
tabla de decisión:

| Token que se usa | Ya existe | Qué hacés |
|---|---|---|
| `--accent-soft` | `--color-accent-soft` (alias `--word-blue-light`) | **Renombrá los 2 usos** a `--color-accent-soft`. No declares `--accent-soft`. |
| `--surface-bg` | `--color-bg-surface` | **Renombrá los 3 usos.** Uno de ellos tiene fallback (`ProjectFolderModal.tsx:106`) — **sacá el fallback**, que es lo que tapaba el defecto. |
| `--surface-alt` | `--color-bg-surface-subtle` | **Renombrá los 2 usos** a `--color-bg-surface-subtle`. |
| `--surface-hover` (`design-system.css:1589`) | `--color-bg-surface-hover` | **Renombrá el uso.** Es un `var()` seco de un token que ningún `:root` declara. |
| **lo que aparezca en el paso 2 y no esté en esta tabla** | — | **No lo declares todavía.** Anotalo en el reporte y preguntá. Declarar un token por un uso que nadie más va a usar es deuda. |

- [ ] **Step 4: Declará en los dos themes solo lo que de verdad haga falta**

Si el paso 3 no dejó ningún token nuevo, **no toques `design-system.css` para esto**. Si
dejó alguno, va en `:root` **y** en `:root[data-theme="dark"]`, con el mismo nombre y un
valor coherente con la escala de cada theme.

- [ ] **Step 5: Extendé el alcance de R3**

`src/__tests__/noHardcodedColors.test.ts`. En `:133-149`, sumá a `DIRECTORIOS`:
`components/auditor`, `components/project`, `components/layout`, `components/upload`,
`components/wizard`, `components/inspector`, `components/export`.

**Copiá el estilo de los comentarios que ya están en `:70-101`**: cada directorio que
entra lleva un comentario que explica por qué entra. Un directorio nuevo sin comentario
rompe la convención del archivo.

Esta extensión **va a sacar más offenders de los que esperás**: `Step3FiguresTablesWizard.tsx:272-273,389,459,465`
tiene `rgba(250,173,20,0.06)`, `'#ffffff'` y `rgba(79,124,255,0.35)`; y
`ProjectFolderModal.tsx:93,268` tiene un backdrop y un `'#fff'`. Todos se van a token.
**Es el punto de la fase**, no un efecto colateral: la razón por la que nadie los vio es
que el lint no los miraba.

- [ ] **Step 6: Corré y verificá**

Run: `npx vitest run src/__tests__/tokensDeclarados.test.ts src/__tests__/noHardcodedColors.test.ts`
Expected: ambos PASS.

Run: `npx vitest run` && `npx tsc --noEmit`
Expected: no baja de 1024, 0 failed. `tsc` limpio.

- [ ] **Step 7: Commit**

```bash
git add src/styles/design-system.css src/styles/fluent.css src/components/auditor/DesignAuditor.tsx src/components/project/MergeDocumentsModal.tsx src/components/project/ProjectImagesDrawer.tsx src/components/layout/ProjectTabs.tsx src/components/layout/ProjectFolderModal.tsx src/__tests__/noHardcodedColors.test.ts src/__tests__/tokensDeclarados.test.ts
git commit -m "tokens: los que se usaban sin existir, y un lint que mira a todas partes

--accent-soft, --surface-bg y --surface-alt se usaban y no estaban declarados en ningun
:root. El color caia al valor inicial del navegador y se veia en tema claro con el
azul de --word-blue, que por casualidad era el tono correcto, asi que nadie lo notaba.
--surface-bg era peor: tres usos, y uno con fallback var(--surface-bg, #ffffff), que es
exactamente el patron que tapa el defecto. Se ve bien en claro y mal en oscuro.

Ninguno se declara. Los canonicos ya existen y lo que falta son alias: los usos van a
--color-accent-soft, --color-bg-surface y --color-bg-surface-subtle.

El test nuevo recorre todos los var(--x) sin fallback de src/** y exige que esten
declarados en design-system.css. Caza los tres yARINGPreviene el cuarto. Ignora los var
con fallback a proposito: esos se resuelven solos, y la regla es solo sobre los secos.

Y R3 ahora recorre seis directorios mas: auditor, project, layout, upload, wizard,
inspector, export. Seis carpetas de las que nadie estaba mirando, y por eso los rgba
duros de Step3FiguresTablesWizard y el fondo del modal de proyecto pasaban impunes."
```

> Corregí `yARING` a `y,` antes de commitear. **Revisá el mensaje antes de correrlo.**

---

### Task 2: El overlay de carga deja de tapar la app

**Files:**
- Modify: `src/components/layout/LoadingTips.tsx` (`:353` comentario, `:355-483` el
  canvas, `:506` el `MIN_DISPLAY_MS`, `:678` y `:718` los estilos inline)
- Modify: `src/styles/design-system.css:1335-1343` (`.loading-tips-fullscreen`)
- Test: `src/__tests__/loadingTips.test.tsx` (crear)

> ### ⚠️ HALLAZGO QUE CAMBIA ESTA TAREA — leelo antes de ejecutar
>
> El `zIndex: 9999` con `position: fixed; inset: 0; width: 100vw; height: 100vh`
> **no está commiteado**. Salió de la sesión que se interrumpió, y está en el árbol
> de trabajo sin commitear. La versión commiteada de `LoadingTips.tsx:678` y `:718`
> dice `position: 'relative'`.
>
> Traducción: **el overlay que se comió la app es un cambio sin commitear, no código
> del repo.** El usuario revisó la app con ese cambio puesto, así que el síntoma es
> real, pero la causa está a medio camino y hay que decidir qué se hace con él antes de
> "arreglarlo":
>
> - **El cambio sin commitear empeora dos cosas y mejora una.** Empeora: convierte un
>   overlay en flujo (`relative`) en una capa a pantalla completa con `zIndex: 9999`
>   inline, que pisa el `z-index: 200` de su propia clase y tapa rail, flyout y
>   workbench. Mejora: **saca el `setTimeout(..., 250)`** (`:573-592`), que hoy obliga a
>   esperar un cuarto de segundo antes de mostrar nada.
> - **Antes de escribir código, preguntá al usuario** si ese cambio se commitea o se
>   descarta. Si se descarta, el `zIndex: 9999` desaparece solo y esta tarea se reduce a
>   la paleta, al `MIN_DISPLAY_MS` y a la prop `que`. **No lo reviertas sin preguntar:**
>   es trabajo de otra sesión y el usuario la vió funcionando en pantalla.
> - **Sea lo que se decida, la paleta horaria con hex queda.** Eso sí está en el
>   archivo commiteado y es la causa del morado. Los pasos 3 y 5 de abajo van igual.


**Interfaces:**
- Consumes: el resultado de Task 0.
- Produces: `LoadingTips` acepta una prop `que?: string` para decir **qué** está
  pasando. La consume la Fase 7 cuando suba N archivos.

- [ ] **Step 1: Escribí el test que falla**

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { LoadingTips } from '../components/layout/LoadingTips';

describe('LoadingTips', () => {
  beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it('el overlay no se monta con un z-index inline que pisa la escala del proyecto', () => {
    // El defecto: style={{ zIndex: 9999 }} inline, que gana al z-index: 200 de la
    // clase y tapa el rail, el flyout y el workbench.
    const { container } = render(<LoadingTips activo={true} />);
    const capa = container.querySelector('[data-testid="carga-capa"]');
    expect(capa).toBeTruthy();
    expect((capa as HTMLElement).style.zIndex).toBe('');
  });

  it('dice QUE esta pasando, no solo que algo pasa', () => {
    render(<LoadingTips activo={true} que="Escaneando el documento" />);
    expect(screen.getByText('Escaneando el documento')).toBeTruthy();
  });

  it('una tarea corta no deja el overlay puesto tres segundos y medio', async () => {
    // El defecto: MIN_DISPLAY_MS = 3500, asi que una tarea de 180 ms se queda
    // 3.3 s extra en pantalla.
    render(<LoadingTips activo={true} que="Subiendo" />);
    expect(screen.getByTestId('carga-capa')).toBeTruthy();
    await waitFor(() => expect(screen.queryByTestId('carga-capa')).toBeNull(), { timeout: 1200 });
  });
});
```

**Ajustá los nombres de prop a los que `LoadingTips` use hoy.** Leé `LoadingTips.tsx:486-510`
primero: si lee `isLoading` del store en vez de recibir props, **esa refactorización es
parte de la tarea** y hay que hacerla primero. Un componente que lee `isLoading` del store
no se puede testear sin montar el store entero.

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/loadingTips.test.tsx`
Expected: FAIL en los tres.

- [ ] **Step 3: La paleta fuera del `.tsx`**

`LoadingTips.tsx:375-381` tiene tres paletas horarias con hex literales. **Borra la
variación por hora** y traela a `design-system.css` como tokens, en los dos themes:

```css
/* La carga no es decoracion: es la capa que tapa la app mientras trabaja. Por eso
   es del color del canvas y no de una paleta propia, y por eso vive en un token y
   no en un array de hex dentro del componente. */
:root {
  --carga-fondo: var(--color-bg-canvas);
  --carga-velo: var(--scrim-overlay);
  --carga-tinta: var(--color-text-primary);
}
:root[data-theme="dark"] {
  --carga-fondo: var(--color-bg-canvas);
  --carga-velo: var(--scrim-overlay);
  --carga-tinta: var(--color-text-primary);
}
```

Los cuatro tokens del bloque `--carga-*` **heredan** de tokens que ya existen, así que los
dos themes son el mismo valor. Eso es intencional y correcto: **el overlay no tiene
identidad de color propia.** Un overlay con color propio es una segunda paleta que
mantener, y ya se viu lo que cuesta.

Después, `AmbientCanvas` (`:355-483`) pasa a tomar esos tokens en vez de la paleta del
array. Si el canvas de partículas sigue necesitando colores propios, **se queda como
está y se documenta como la única excepción**, pero el **fondo** sale del token.

- [ ] **Step 4: El `zIndex`**

`LoadingTips.tsx:678` y `:718`: sacá `zIndex: 9999` del inline. La capa pasa a la clase
`.loading-tips-fullscreen` de `design-system.css:1335-1343`, y su `z-index` sube en la
escala del proyecto **por debajo del rail y del flyout**, no por encima.

Revisá la escala en `design-system.css` (hay `--z-dropdown: 100`). El overlay tiene que
estar **por debajo de `--z-dropdown`**, para que el flyout del rail se siga viendo sobre
la carga. Hoy está en 9999 y el flyout desaparece detrás.

- [ ] **Step 5: `MIN_DISPLAY_MS` y la prop `que`**

`LoadingTips.tsx:506`: `MIN_DISPLAY_MS = 3500` → **`350`**. La razón de que existiera era
evitar el parpadeo de una carga instantánea; 350 ms alcanza para eso y no castiga a la
tarea real. **El test del paso 1 mide que una tarea corta no deja la pantalla puesta**,
así que si esto no baja, el test falla.

Agregá la prop `que?: string` y renderizala. Es lo que la Fase 7 va a necesitar para
decir "Subiendo capítulo-3.docx (3 de 20)" en vez de un spinner mudo.

- [ ] **Step 6: El disparador, si Task 0 encontró un cuarto**

Si Task 0 dio un cuarto disparador, sumalo acá con su archivo y línea, y agregale un
test que afirme que pone el overlay.

- [ ] **Step 7: Corré y verificá**

Run: `npx vitest run` && `npx tsc --noEmit` && `npm run build`
Expected: no baja de 1024, 0 failed. `tsc` limpio. Build sin error.

- [ ] **Step 8: Commit**

```bash
git add src/components/layout/LoadingTips.tsx src/styles/design-system.css src/__tests__/loadingTips.test.tsx
git commit -m "carga: deja de tapar la app, y su fondo es un token

LoadingTips era un position fixed a pantalla completa con zIndex 9999 en el estilo en
linea. Ese numero gana al z-index de la clase y tapa el rail, el flyout y el workbench:
no era un overlay de carga, era un fondo. Ahora la capa vive en la clase y su z-index
esta por debajo de --z-dropdown, asi que el flyout del rail se sigue viendo encima.

La paleta horaria se va. Tres paletas con hex literales dentro del .tsx, y la de la
tarde y la noche es morada. El comentario decia que no eran tokens de UI porque eran
una capa de dibujo pura, y ese comentario era el error: es el fondo que se ve durante
la carga. El fondo ahora sale de --carga-fondo, que hereda de --color-bg-canvas, y no
tiene color propio en ningun theme. Un overlay con paleta propia es una segunda paleta
que mantener, y ya se vio lo que cuesta.

MIN_DISPLAY_MS baja de 3500 a 350. Con la barra de proyectos subiendo veinte archivos
en serie, eran setenta segundos de pantalla fija en total.
"
```

> Completá el mensaje con **el resultado de Task 0** en la primera línea, si encontró un
> cuarto disparador. Si no lo encontró, decilo en el mensaje: es un dato del reporte.

---

### Task 3: Un estado vacío que sobreviva a cualquier layout

**Files:**
- Create: `src/components/shared/EstadoVacio.tsx`
- Modify: `src/components/review/ReviewWorkbench.tsx:220-238` y `:309-320`
- Modify: `src/components/review/FocusReadingCard.tsx:52-53` y `:118`
- Test: `src/__tests__/estadoVacio.test.tsx` (crear), `src/__tests__/reviewWorkbench.test.tsx` (extender)

**Interfaces:**
- Produces:
  ```ts
  export type MotivoVacio = 'sin-documento' | 'sin-motor' | 'sin-resultados' | 'sin-seleccion';
  export function EstadoVacio(props: { motivo: MotivoVacio; accion?: React.ReactNode }): JSX.Element;
  ```
  La consume la Fase 5 (Referencias) y la Fase 4 (Figuras).

- [ ] **Step 1: Escribí el test que falla**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EstadoVacio } from '../components/shared/EstadoVacio';

describe('EstadoVacio', () => {
  it('cada motivo dice algo distinto, y ninguno es un texto generico', () => {
    for (const motivo of ['sin-documento', 'sin-motor', 'sin-resultados', 'sin-seleccion'] as const) {
      const { unmount } = render(<EstadoVacio motivo={motivo} />);
      const texto = screen.getByTestId('estado-vacio').textContent ?? '';
      expect(texto.trim().length, `motivo ${motivo} sin texto`).toBeGreaterThan(20);
      unmount();
    }
  });

  it('el motivo de sin-documento dice que abra un documento, no que revise', () => {
    render(<EstadoVacio motivo="sin-documento" />);
    expect(screen.getByTestId('estado-vacio').textContent).toMatch(/documento/i);
  });
});
```

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/estadoVacio.test.tsx`
Expected: FAIL, el módulo no existe.

- [ ] **Step 3: El componente**

`src/components/shared/EstadoVacio.tsx`. Cuatro variantes, con la forma del proyecto: un
ícono de `lucide-react` con `strokeWidth="var(--icon-stroke)"`, un título, una línea de
explicación que **diga la causa**, y `accion` opcional. **Cero colores literales**:
`var(--color-text-primary)`, `var(--color-text-secondary)`, `var(--color-text-tertiary)`,
`var(--color-bg-surface)`, `var(--border-subtle)`.

Los cuatro textos:

- `sin-documento`: no hay nada abierto. Dice que abra un `.docx` o que cree uno.
- `sin-motor`: hay documento pero ningún motor corrió. Dice que espere o que lo dispare.
- `sin-resultados`: hay hallazgos pero el filtro no deja ninguno. Dice que quite el
  filtro **y cuál es**, no un "no hay resultados" pelado.
- `sin-seleccion`: hay elementos y ninguno está elegido. Dice la acción disponible, **no
  la posición del panel**, que es lo que hoy hace `FocusReadingCard.tsx:118`.

- [ ] **Step 4: Montarlo FUERA de lo que se puede esconder**

`ReviewWorkbench.tsx`. Hoy el mensaje de "sin hallazgos" está en `:309-320`, dentro del
`<aside>` del rack, que solo se renderiza si `rackVisible` (`:241`). Con la ventana bajo
1180 px **no hay mensaje y no hay rack**.

Sacá ese bloque de dentro del `<aside>` y montá `EstadoVacio` **en la grilla principal**
(`:169-180`), que sí se renderiza siempre. El rack deja de ser el dueño del estado vacío
de la pantalla de la que es parte.

`ReviewWorkbench.tsx:220-238` (el mensaje de "sin documento") se **reemplaza** por
`<EstadoVacio motivo="sin-documento" />`, no por un texto nuevo.

- [ ] **Step 5: El texto de `FocusReadingCard`**

`FocusReadingCard.tsx:118`: hoy dice "Elige uno en el panel de la derecha o pulsa
'Siguiente hallazgo'". **El rack está a la derecha, pero en ventana angosta no existe.**
Y `FocusReadingCard` **no es** el componente del estado vacío: es la tarjeta de lectura
del hallazgo seleccionado. Dejale su propio texto, y que no nombre una posición que
puede no haber.

`:52-53`: `pagina = 'Sin selección'` y `seccion = ''`. Cuando `item` es null, **esas dos
líneas no deberían renderizarse**. Que el componente no renderice la línea de contexto
cuando no hay nada que contexto.

- [ ] **Step 6: El test del caso difícil**

En `src/__tests__/reviewWorkbench.test.tsx`, sumá el test que cierra el Review Focus #1:

```tsx
it('con la ventana angosta y sin hallazgos, el mensaje sigue en pantalla', async () => {
  // El defecto: el mensaje vivia dentro del rack, y el rack no se renderiza bajo
  // 1180 px. Con la ventana angosta no habia ni mensaje ni rack.
  Object.defineProperty(window, 'innerWidth', { value: 900, configurable: true, writable: true });
  const { container } = montarSinDocumento();
  expect(container.textContent).toMatch(/documento/i);
  expect(container.textContent).not.toBe('');
});
```

**Usá el helper de montaje que el archivo ya tenga.** Si el archivo no tiene uno para
"sin documento", armalo con el mismo patrón de los demás tests del archivo.

- [ ] **Step 7: Corré y verificá**

Run: `npx vitest run` && `npx tsc --noEmit`
Expected: no baja de 1024, 0 failed. `tsc` limpio.

- [ ] **Step 8: Commit**

```bash
git add src/components/shared/EstadoVacio.tsx src/components/review/ReviewWorkbench.tsx src/components/review/FocusReadingCard.tsx src/__tests__/estadoVacio.test.tsx src/__tests__/reviewWorkbench.test.tsx
git commit -m "vacio: un estado vacio que sobrevive a que el layout se esconda

El mensaje de 'sin hallazgos' vivia dentro del aside del rack, que solo se renderiza
si rackVisible. Con la ventana bajo 1180 pixeles el rack no existe, y con el no existia
el mensaje: pantalla vacia sin explicacion. Un estado vacio que depende de que un panel
esté abierto no es un estado vacio.

EstadoVacio tiene cuatro motivos, cada uno con su causa dicha en palabras, y se monta en
la grilla principal, que siempre esta.

FocusReadingCard decia 'elige uno en el panel de la derecha'. El rack esta a la derecha,
pero en angosto no hay rack. Un texto que nombra una posicion que puede no existir es un
texto que miente. Ahora dice la accion disponible.

Y pagina y seccion deja de ser 'Sin seleccion' y cadena vacia cuando no hay item: si no
hay contexto, no se renderiza la linea de contexto."
```

---

### Task 4: El minimapa que se puede leer

**Files:**
- Create: `src/components/review/MinimapaPaginas.tsx` (o **mover** el archivo, ver nota)
- Move: `src/components/wizard/ReviewMinimap.tsx` → `src/components/review/ReviewMinimap.tsx`
- Modify: `src/hooks/useReviewWorkbench.ts:168-174` (`ENGINE_META`, tokens canónicos)
- Modify: los importadores del archivo viejo
- Test: `src/__tests__/reviewMinimap.test.tsx` (crear), `useReviewWorkbench.test.ts` (imports)

**Interfaces:**
- Consumes: `ENGINE_META` y `marks` de `useReviewWorkbench`.
- Produces: nada nuevo para fases siguientes. Es la fase 1.4 del spec.

> **Sobre la mudanza de carpeta.** El spec la pide porque `components/wizard/` **está
> fuera del alcance de R3**, y el archivo es de `components/review/`. Hacela, **pero en
> el mismo commit que actualiza los imports**, y buscá todos los importadores primero:
>
> ```bash
> Select-String -Path 'src/**/*' -Pattern 'ReviewMinimap'
> ```
>
> `src/__tests__/useReviewWorkbench.test.ts` lo importa desde la ruta vieja — el spec lo
> anota en `§13.1`. Si ese import no se actualiza en este commit, **el build falla**.
> `src/__tests__/railPending.test.ts` también depende de `marks`: verificá.

- [ ] **Step 1: Escribí el test que falla**

```tsx
describe('ReviewMinimap', () => {
  it('cada pagina tiene un nombre accesible, no solo un color', () => {
    // El defecto: un boton de 4px de alto en una columna de 19px, sin texto. El
    // El color era lo unico que distinguia una pagina de otra.
    const { container } = montar({ paginas: 3 });
    for (const b of Array.from(container.querySelectorAll('button'))) {
      expect((b.textContent ?? '').trim().length).toBeGreaterThan(0);
      expect(b.getAttribute('aria-label')).toBeTruthy();
    }
  });

  it('el color nunca es el unico portador del significado', () => {
    const { container } = montar({ paginas: 2, motores: ['spelling', 'citations'] });
    // El motor dominante se nombra en el texto o en el aria-label del boton.
    const etiquetas = Array.from(container.querySelectorAll('button'))
      .map((b) => `${b.textContent} ${b.getAttribute('aria-label')}`).join(' ');
    expect(etiquetas.toLowerCase()).toMatch(/ortograf|cita/);
  });
});
```

Usá los helpers de montaje del archivo que ya exista, o armá uno con el store. **No
dejes elipsis.**

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/reviewMinimap.test.tsx`
Expected: FAIL.

- [ ] **Step 3: La forma nueva**

`ReviewMinimap.tsx`. Cambios:

- **Ancho 19 px → 44 px.** Es lo que hace falta para que un número entre.
- **`minHeight: 4px` → `6px`** como mínimo, y el número de página dentro.
- **Tokens legacy → canónicos.** `--sidebar-bg` → `--color-bg-surface-subtle`,
  `--text-secondary` → `--color-text-secondary`, `--border-subtle` y `--accent-primary`
  → sus canónicos. Un token legacy es un token que nadie sabe si existe.
- **En tema claro, los niveles bajos dejan de ser invisibles.** Hoy usan
  `--border-subtle`, que sobre `--sidebar-bg` no se ve. Usá un token con contraste
  suficiente en claro, y verificá en los **dos** themes.
- **Cada botón lleva su número de página en el texto y su motor dominante en el
  `aria-label` y en el `title`.** El color sigue estando, pero deja de ser el único
  portador de la información.
- **Si no entra, desaparece.** Con la ventana más angosta que 44 px, el componente
  devuelve `null` y su función queda en el flyout del rail. No queda una columna
  ilegible.
- **`ReviewMinimap` sale de `components/wizard/`.** Actualizá los imports en el mismo
  commit.

- [ ] **Step 4: `ENGINE_META` a tokens canónicos**

`useReviewWorkbench.ts:168-174`. Ya son tokens, pero verificá que sean los canónicos
`--color-*` y no los alias. Si alguno es legacy, cambialo acá.

- [ ] **Step 5: Corré y verificá**

Run: `npx vitest run` && `npx tsc --noEmit` && `npm run build`
Expected: no baja de 1024, 0 failed. `tsc` limpio. **El build es el que verifica que no
quedó ningún import apuntando a la ruta vieja.**

- [ ] **Step 6: Commit**

```bash
git add src/components/review/ReviewMinimap.tsx src/components/wizard/ReviewMinimap.tsx src/hooks/useReviewWorkbench.ts src/__tests__/reviewMinimap.test.tsx src/__tests__/useReviewWorkbench.test.ts
git commit -m "revision: el minimapa pasa de 19 pixeles de 4 a 44 pixeles con nombre

No estaba hardcodeado. El color salia de ENGINE_META, que son tokens, y eso no es un
defecto. El defecto era otro: una columna de 19 pixeles con un boton de 4 pixeles de
alto, sin texto, sin leyenda, y con --border-subtle sobre --sidebar-bg en tema claro,
sin texto, sin leyenda, y con `--border-subtle` sobre `--sidebar-bg` en tema claro,

Ahora cada pagina tiene su numero y el motor dominante en el texto y en el aria-label.
El color sigue ahi, pero ya no es lo unico que dice cual es cual. Y los tokens pasan a
los canonicos: --sidebar-bg y --accent-primary son alias legacy, y un alias es un token
que nadie sabe si existe.

Con la ventana mas angosta que 44 pixeles el componente desaparece y su funcion queda
en el flyout del rail. Una columna ilegible es peor que ninguna columna.

Y el archivo sale de components/wizard, que estaba fuera del alcance del lint de
colores, a components/review, que no. Los imports de los tests se actualizan en este
mismo commit, que es donde se rompia el build."
```

> está bien, pero la línea que quedó con `—` debe decir `— que es exactamente lo que se vio`.

---

### Task 5: La regla que impide que vuelva

**Files:**
- Create: `src/__tests__/elRailNoSeEsconde.test.tsx`
- Test: `src/__tests__/noHardcodedColors.test.ts` (extendido por Task 1)

**Interfaces:**
- Consumes: todo lo de Tasks 1-4.

- [ ] **Step 1: El test del rail**

Cierra el Review Focus #5. El rail y su flyout son **permanentes** por `AGENTS.md` §1, y
cualquier arreglo de superposición que los monte condicionalmente está rompiendo el
diseño.

```tsx
it('el rail y su flyout existen siempre, en cualquier paso', () => {
  for (const paso of [1, 2, 3, 4, 5, 6]) {
    const { unmount } = montarEnPaso(paso);
    expect(screen.getByTestId('rail-iconos')).toBeTruthy();
    unmount();
  }
});

it('el overlay de carga no tapa el rail', async () => {
  const { container } = montarEnPaso(5);
  // Con la carga prendida, el rail sigue siendo alcanzable.
  expect(container.querySelector('[data-testid="rail-iconos"]')).toBeTruthy();
});
```

`montarEnPaso` hay que armarlo: leé `src/__tests__/railItems.test.ts` y
`src/__tests__/iconRail.test.tsx`, que ya montan el rail, y **reusá su patrón**.

- [ ] **Step 2: El test de la escala de capas**

```ts
it('ningun z-index en el repo pasa de la escala declarada', async () => {
  const fuentes = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const css = fuentes['/src/styles/design-system.css'];
  const escala = [...css.matchAll(/--z-[\w-]+:\s*(\d+)/g)].map((m) => Number(m[1]));
  const techo = Math.max(...escala);
  const ofensores: string[] = [];
  for (const [ruta, fuente] of Object.entries(fuentes)) {
    for (const m of fuente.matchAll(/zIndex:\s*(\d{3,})/g)) {
      if (Number(m[1]) > techo) ofensores.push(`${ruta} usa zIndex ${m[1]}, la escala llega a ${techo}`);
    }
  }
  expect(ofensores).toEqual([]);
});
```
Este test es general: cualquier `zIndex` de tres o más dígitos fuera de la escala es una
capa que se va a comer algo. El de `LoadingTips` era uno; el próximo también va a serlo.

- [ ] **Step 3: Corré y verificá**

Run: `npx vitest run` && `npx tsc --noEmit` && `npm run build`
Expected: no baja de 1024, 0 failed.

- [ ] **Step 4: Commit**

```bash
git add src/__tests__/elRailNoSeEsconde.test.tsx
git commit -m "tests: dos guardias para lo que esta fase acaba de arreglar

El rail y su flyout son permanentes por AGENTS.md, y cualquier arreglo de superposicion
que los monte condicionalmente esta rompiendo el diseño sin que nadie lo note hasta que
falta un icono. Un test que los monta en los seis pasos.

El segundo mira cualquier zIndex de tres o mas digitos en src/** y lo compara con el
techo de la escala declarada en design-system.css. El 9999 de LoadingTips es lo que
caza. El proximo capa que se come la pantalla va a ser un numero redondito, y asi se
ve.
"
```

---

## Self-Review

**1. Cobertura del spec §5.** Las cuatro salidas: (a) el overlay de carga — Tasks 0 y 2;
(b) tokens — Task 1, más la extensión de R3; (c) empty states — Task 3; (d) el minimapa —
Task 4. El guardián de capas es una quinta, mía.

**2. Lo que este plan no arregla.** Los cuadrados de color que el usuario menciona
**no son hardcodeados**, así que "arreglarlos" era cambiar su presentación, no su color.
Si esperaba verlos de otro color, esta fase no es la que lo resuelve: es la que los hace
legibles. **Decilo en el reporte de la fase.**

**3. Placeholders.** Los tests de esta fase tienen menos elipsis que los de F0, pero
Task 0 no tiene ninguno y es investigación pura: **su resultado es el input de Task 2.**
Si Task 0 dice "el morado no aparece en el escaneo", Task 2 se reduce y hay que replanear
esa parte antes de ejecutarla. **No ejecutes Task 2 sin el resultado de Task 0 en la
mano.**

**4. Review Focus.** Los cinco tienen test: (1) Task 3 paso 6, ventana angosta; (2) Task 1
paso 4, los dos themes; (3) Task 2 paso 5, `MIN_DISPLAY_MS`; (4) Task 1 paso 1, el test
ignora a propósito los `var` con fallback y el paso 3 saca el de
`ProjectFolderModal.tsx:106`; (5) Task 5 paso 1, el rail.

**5. Lo que hay que mirar al leer este plan.** Los helpers de montaje de los tests de
Task 4 y Task 5 **no existen**: hay que armarlos reusando el patrón de
`railItems.test.ts` e `iconRail.test.tsx`, que ya montan el rail. El `git add` de la
Task 1 puede listar archivos que el implementador no haya tocado. **Un plan con helpers
pendientes no es un plan que se pueda correr sin leerlo.**

**6. Orden.** Task 0 antes que nada. Task 1 antes que 2, 3 y 4, porque toca
`design-system.css` y las tres lo necesitan. Task 2 y Task 4 se pisan en
`design-system.css`: **van en commits distintos, y el de Task 4 no vuelve a tocar los
tokens que declaró Task 1.** Si R3 falla al extender los directorios, es un token que
Task 1 no declaró: **volvé a Task 1**, no lo parchees acá.

**7. El hallazgo de la Task 2 es lo más importante del plan y no estaba en el spec.**
El spec (§2.2) presenta el `position: fixed` y el `zIndex: 9999` como si fueran código
del repo. **No lo son: son un cambio sin commitear de la sesión que se interrumpió.**
La versión commiteada de `LoadingTips.tsx:678` y `:718` dice `position: 'relative'`.
Eso cambia el alcance de la fase, y por eso la Task 2 arranca pidiendo una decisión al
usuario antes de escribir nada. **El spec debería decir lo mismo en `§2.2`; queda como
corrección pendiente del documento maestro.**

