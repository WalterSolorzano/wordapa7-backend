# F0 — La verdad del dato: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps
> use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que la interfaz deje de mostrar texto que el documento no tiene y
identificadores internos que no le interesan a nadie.

**Architecture:** Hoy existen **dos** tablas de rótulos. `SUBTYPE_LABELS` (30 filas, en un
hook) funciona; `KIND_LABELS` (10 filas, en un slice del store) no, y su `|| f.kind`
escribe el `snake_case` crudo en `localStorage` para que `PaperCanvas` lo pinte sobre el
párrafo. Este plan deja **una sola** tabla, en una hoja sin imports, y agrega al modelo
la capacidad de decir "este elemento no tiene texto" en vez de inventar un texto con
forma de documento.

**Tech Stack:** React 18, TypeScript, Vitest, Zustand, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-09-27-rediseno-superficies-master-design.md` §4.

## Global Constraints

- **Cero emojis.** Solo `lucide-react`, con `strokeWidth="var(--icon-stroke)"`.
- **Cero colores literales** en TS/TSX/CSS. Solo tokens `var(--...)`. Este plan no debería
  necesitar tocar colores; si lo hace, es señal de que estás arreglando otra cosa.
- **Ningún texto de interfaz hardcodeado donde el dato es del documento**, y al revés.
- **Ningún identificador interno visible** en pantalla: ni `snake_case` de motor, ni
  `elem_`, ni `[placeholder]`.
- `npx vitest` **no** type-chequea: `npx tsc --noEmit` aparte, obligatorio en cada tarea.
- **Leer un fuente en un test: `?raw` para `.ts`/`.tsx`; para `.css` NO sirve.** El runner
  tiene `css: false`, así que `import.meta.glob('*.css', { query: '?raw' })` devuelve
  **cadena vacía**: cero caracteres, y una cadena vacía matchea cero reglas, o sea una
  guarda verde y muda. Para una hoja usá el rodeo del **specifier en variable** que ya
  funciona en `designTokens.test.ts` y `noHardcodedColors.test.ts`:
  `await import(/* @vite-ignore */ 'node:fs')`. La razón del rodeo es que con el
  specifier **literal** Vite lo analiza y lo manda por los shims de browser de
  `nodePolyfills()`, que no traen `readFileSync`; en una **variable** no lo analiza y
  llega el módulo real. **Esta regla estaba escrita al revés**: una regla a medias es
  peor que ninguna, porque hace repetir un rodeo que sí funciona.
- **No crees `vitest.config.ts`.** Por precedencia pisa la config del repo.
- PowerShell no sirve para cirugía por índice de array en archivos largos. Editá por
  contenido.
- `git add` explícito archivo por archivo. **Nunca `git add -A`.**
- Después de cada escritura:
  `Select-String -Path <archivos> -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'` y
  arreglalo. Comentarios y mensajes de commit **en español**.

**Baseline al momento de escribir este plan** (no puede bajar):
`npx vitest run` → 1024 passed, 0 failed. `npx tsc --noEmit` → limpio.
`pytest python/tests/ -q` → 766 passed, 14 skipped (esta fase no toca Python).

## Review Focus

Cinco clases de entrada que el spec implica y que es fácil no cubrir. Cada una tiene su
test en la tareaDueña indicada.

1. **Un documento donde todas las figuras ya tienen leyenda.** No debe aparecer ni un
   aviso de "sin texto". El aviso es por hallazgo, no por documento. → Task 2
2. **Una figura cuya leyenda es un punto, o un espacio.** Es texto: tiene que entrar por
   el camino de texto, no por el de "sin texto". La distinción es `caption.trim()`
   vacío o no, no "parece corta". → Task 2
3. **Una regla de fase nueva que el backend emite y el frontend no conoce.** Debe salir
   "Regla de estilo" en pantalla y un `warn` con el `kind` completo en dev, **nunca** el
   `snake_case`. → Task 1
4. **Un `wordapa7_marcas_map` de una versión anterior**, lleno de los rótulos viejos.
   No hay forma de saber cuáles eran, así que no se lee: se descarta. → Task 4
5. **Dos documentos abiertos a la vez.** `localStorage` es compartido, y las marcas son
   por `element_id`, que es un índice posicional. El mapa de un documento no puede
   describir al otro. Es la misma razón por la que el diff de refresco es por contenido y
   no por id. → Task 4

---

### Task 1: Una sola hoja de rótulos

El problema: `SUBTYPE_LABELS` vive dentro de `useReviewWorkbench.ts:193` como `const` sin
exportar, así que el slice del store **no puede alcanzarla** y por eso inventó su propia
tabla. La solución es sacarla a una hoja sin dependencias, donde cualquiera la importe.

**Files:**
- Create: `src/lib/rotulos.ts`
- Modify: `src/hooks/useReviewWorkbench.ts:193-227` (quitar la tabla), `:456-471`
  (mover `rotuloDeSubtipo`)
- Modify: `src/lib/auditItems.ts` (importar, no definir)
- Test: `src/__tests__/rotulos.test.ts`

**Interfaces:**
- Consumes: nada. Es la hoja de la que dependen todas las demás tareas.
- Produces:
  - `export const SUBTYPE_LABELS: Record<string, string>` (las 30 filas actuales, verbatim)
  - `export const ROTULO_GENERICO = 'Otro hallazgo del corrector'`
  - `export function rotuloDeSubtipo(key: string): string`
  - `export function rotuloDeKind(kind: string): string` ← **nueva**, la que usa el store
  - `export const MARCAS_MAP_VERSION = 2`

- [ ] **Step 1: Escribí el test que falla**

`src/__tests__/rotulos.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  rotuloDeKind,
  rotuloDeSubtipo,
  ROTULO_GENERICO,
} from '../lib/rotulos';

describe('rotulos', () => {
  afterEach(() => vi.restoreAllMocks());

  it('una regla de fase que el backend emite y el frontend no conoce no sale cruda', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const etiqueta = rotuloDeKind('regla_de_fase_del_ano_3000');
    expect(etiqueta).toBe(ROTULO_GENERICO);
    // El aviso de dev lleva el kind COMPLETO, para que se pueda agregar la fila.
    expect(warn.mock.calls.flat().join(' ')).toContain('regla_de_fase_del_ano_3000');
  });

  it('un identificador interno jamas sale en pantalla, en ningun caso', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const kind of ['paragraph_words', 'elem_12', 'g11_variacion_oracion', 'snake_case']) {
      const etiqueta = rotuloDeKind(kind);
      expect(etiqueta).not.toContain('_');
      expect(etiqueta).toBe(ROTULO_GENERICO);
    }
  });

  it('una regla que si conoce sale con su nombre, no con el generico', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // `paragraph_words` es el que se ve hoy crudo sobre el parrafo en el lienzo.
    expect(rotuloDeKind('paragraph_words')).toBe('Extensión del párrafo');
  });

  it('rotuloDeSubtipo y rotuloDeKind coinciden para toda regla de PROOFREAD_SPECS', async () => {
    const { PROOFREAD_SPECS } = await import('../lib/auditItems');
    const sinFila: string[] = [];
    for (const kind of Object.keys(PROOFREAD_SPECS)) {
      const spec = PROOFREAD_SPECS[kind];
      // Un kind sin fila en SUBTYPE_LABELS cae al generico: es la fuga de cobertura
      // que hizo que 15 reglas de fase no tuvieran nombre.
      if (rotuloDeSubtipo(spec.subtype) === ROTULO_GENERICO) sinFila.push(kind);
    }
    expect(sinFila).toEqual([]);
  });
});
```

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/rotulos.test.ts`
Expected: FAIL con `Failed to resolve import "../lib/rotulos"`. El módulo no existe.

- [ ] **Step 3: Creá la hoja**

`src/lib/rotulos.ts`. **Copia las 30 filas de `useReviewWorkbench.ts:194-227` textualmente**
(no las reescribas: los acentos y el texto son el contrato de `useReviewWorkbench.test.ts`).

```ts
/**
 * WordAPA7 — la hoja de rótulos. Una sola, y sin imports.
 *
 * Antes había dos: esta tabla y un `KIND_LABELS` de diez filas dentro de
 * `auditSlice.ts`. El backend pasó de diez `kind` a unos treinta, el slice no se
 * enteró, y su `|| f.kind` escribía el `snake_case` crudo en `localStorage` para que
 * `PaperCanvas` lo pintara encima del párrafo. La regla nueva no tenía nombre; la
 * vieja sí, y eran dos verdades.
 *
 * Por eso esto vive acá y no en un hook: un slice del store no puede importar de un
 * hook, y esa imposibilidad fue exactamente lo que produjo la tabla duplicada. Esta hoja
 * no importa nada, así que cualquiera la puede usar.
 */

/** Las filas: el `subtype` que produce `PROOFREAD_SPECS` y el nombre que se lee. */
export const SUBTYPE_LABELS: Record<string, string> = {
  // ... las 30 filas, textuales, de useReviewWorkbench.ts:194-227 ...
};

export const ROTULO_GENERICO = 'Otro hallazgo del corrector';

const avisarFalta = (que: string, clave: string) => {
  if (process.env.NODE_ENV !== 'production') {
    /* Un `warn` y no un `throw`: la regla nueva tiene que verse aunque la tabla no la
       haya alcanzado todavía, y caerse por eso sería peor que mostrarla con un
       nombre feo. El aviso lleva la clave COMPLETA para poder agregar la fila. */
    console.warn(
      `[revisión] ${que} "${clave}" no tiene fila en SUBTYPE_LABELS. ` +
      'Se muestra con el rótulo genérico; agregá la fila.',
    );
  }
};

export function rotuloDeSubtipo(key: string): string {
  const etiqueta = SUBTYPE_LABELS[key];
  if (etiqueta) return etiqueta;
  avisarFalta('el subtipo', key);
  return ROTULO_GENERICO;
}

/**
 * El rótulo de una regla del corrector, a partir de su `kind`.
 *
 * `PROOFREAD_SPECS` ya traduce `kind` a `subtype`; esta función encadena las dos
 * tablas. No vuelve nunca al `kind`: un `snake_case` en pantalla es un dato interno
 * que se leyo como si fuera texto, y eso ya pasó con `paragraph_words`.
 *
 * La dependencia con `auditItems.ts` es perezosa a propósito: `auditItems` importa
 * esta hoja, y al revés daría un ciclo.
 */
export async function rotuloDeKind(kind: string): Promise<string> {
  const { PROOFREAD_SPECS } = await import('./auditItems');
  const spec = PROOFREAD_SPECS[kind];
  if (!spec) {
    avisarFalta('la regla', kind);
    return ROTULO_GENERICO;
  }
  return rotuloDeSubtipo(spec.subtype);
}

/** La versión del `wordapa7_marcas_map`. Al bumped se descarta el mapa viejo. */
export const MARCAS_MAP_VERSION = 2;
```

> **Nota de diseño**: `rotuloDeKind` es `async` porque `PROOFREAD_SPECS` vive en
> `auditItems.ts`, que **ya importa** `phaseLabel` y no importa esta hoja. Si al
> implementar te da un ciclo de ESM, la salida es mover `PROOFREAD_SPECS` a esta misma
> hoja y re-exportarlo desde `auditItems.ts` para no romper los imports existentes.
> Elegí una de las dos y **anotá cuál en el reporte**. No dejes el ciclo.

- [ ] **Step 4: Corré el test y verificá que pasa**

Run: `npx vitest run src/__tests__/rotulos.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Sacá la tabla del hook y dejá que importe**

En `src/hooks/useReviewWorkbench.ts`:
- **Borrá** el bloque `const SUBTYPE_LABELS: Record<string, string> = { ... }`
  (líneas 193-227, el que cierra con `};`) y su comentario de encabezado.
- **Borrá** `const ROTULO_GENERICO = 'Otro hallazgo del corrector';` (línea 456) y el
  cuerpo de `rotuloDeSubtipo` (líneas 458-471), y dejá sólo la re-exportación.
- **Agregá** arriba, con los demás imports:

```ts
import { rotuloDeSubtipo } from '../lib/rotulos';
export { rotuloDeSubtipo, SUBTYPE_LABELS, ROTULO_GENERICO } from '../lib/rotulos';
```

La re-exportación existe porque `rotuloDeSubtipo` está exportado desde ese hook en
`:458` y hay imports que lo usan desde ahí. **Buscá primero**:
`Select-String -Path 'src/**/*' -Pattern 'rotuloDeSubtipo'`. Si nadie lo importa de
adentro del hook, no re-exportes y quedate con el import simple.

- [ ] **Step 6: Verificá que no se rompió nada**

Run: `npx vitest run` && `npx tsc --noEmit`
Expected: 1024 passed (o más), 0 failed. `tsc` limpio.

- [ ] **Step 7: Commiteá**

```bash
git add src/lib/rotulos.ts src/__tests__/rotulos.test.ts src/hooks/useReviewWorkbench.ts
git commit -m "revision: una sola hoja de rotulos, y que el snake_case no llegue

Habia dos tablas. SUBTYPE_LABELS, con treinta filas, vivía dentro de un hook y
funcionaba. KIND_LABELS, con diez, viviancia dentro de un slice del store y no
funcionaba: el backend paso de diez kind a unos treinta, el slice no se entero, y su
|| f.kind escribia el snake_case crudo en localStorage para que PaperCanvas lo pintara
encima del parrafo. Dos verdades, y la vieja era la que se veia.

El slice no puede importar de un hook. Esa imposibilidad es exactamente lo que
produjo la tabla duplicada, asi que la hoja nueva no importa nada y cualquiera la
puede usar. rotuloDeKind encadena PROOFREAD_SPECS y SUBTYPE_LABELS y no vuelve nunca
al kind: un snake_case en pantalla es un dato interno leido como si fuera texto, y
eso ya paso con paragraph_words.

El test que exige que toda regla de PROOFREAD_SPECS tenga fila es el que mide la
cobertura de verdad. Hoy fallaria con quince reglas de fase sin nombre."
```

---

### Task 2: Que el modelo pueda decir "no hay texto"

**Files:**
- Modify: `src/lib/auditItems.ts:23-57` (el tipo `AuditItem`), `:462-491` (las dos ramas)
- Test: `src/__tests__/auditItems.test.ts` (crear si no existe; si existe, sumarle)

**Interfaces:**
- Consumes: nada de Task 1.
- Produces: `AuditItem.sinTexto?: { clase: 'figura' | 'tabla' }`. Cuando está presente,
  `originalText` es `''`.

- [ ] **Step 1: Escribí el test que falla**

```ts
import { describe, it, expect } from 'vitest';
import { collectAuditItems } from '../lib/auditItems';

// Reusa el constructor que el archivo ya tenga para armar un `AuditSources` de
// prueba. Leé las líneas 293-360 primero y usá el mismo shape.
describe('auditItems: elementos sin texto', () => {
  it('una figura sin leyenda no inventa un texto con forma de documento', () => {
    const items = collectAuditItems(/* ... */);
    const figura = items.find((i) => i.sinTexto?.clase === 'figura');
    expect(figura).toBeDefined();
    // El defecto: originalText valia '[Figura sin rotular]' y FindingDetail lo
    // pintaba en un <pre> monoespaciado, y EngineGroupCard lo tachaba.
    expect(figura!.originalText).toBe('');
  });

  it('una figura con leyenda entra por el camino de texto, no por el de sin texto', () => {
    const items = collectAuditItems(/* ... con image_info.caption = 'Figura 1. Flujo' ... */);
    expect(items.find((i) => i.sinTexto?.clase === 'figura')).toBeUndefined();
  });

  it('una leyenda de un punto cuenta como leyenda', () => {
    // Un punto es texto. La distincion es caption.trim() vacio o no, no "es corta".
    const items = collectAuditItems(/* ... con image_info.caption = ' . ' ... */);
    expect(items.find((i) => i.sinTexto?.clase === 'figura')).toBeUndefined();
  });

  it('una tabla sin rotular tambien lo dice, y no inventa', () => {
    const items = collectAuditItems(/* ... tabla sin caption ... */);
    const tabla = items.find((i) => i.sinTexto?.clase === 'tabla');
    expect(tabla?.originalText).toBe('');
  });
});
```

Los cuatro tests con `/* ... */` tienen que llevar el `AuditSources` real. **No los
dejes como están**: leé `auditItems.ts:293-360`, armá el objeto como lo arma el resto del
archivo, y dejá el código completo. Un test con elipsis es peor que ningún test.

- [ ] **Step 2: Corré el test y verificá que falla**

Run: `npx vitest run src/__tests__/auditItems.test.ts`
Expected: FAIL. `sinTexto` no existe en el tipo, y `originalText` vale
`'[Figura sin rotular]'`.

- [ ] **Step 3: Agregá el campo al tipo**

En `src/lib/auditItems.ts`, dentro de `export interface AuditItem` (empieza en `:23`),
agregá:

```ts
  /**
   * Presente cuando el hallazgo apunta a un elemento que no tiene texto: una
   * figura o una tabla sin leyenda. Antes esto se resolvía poniendo
   * `'[Figura sin rotular]'` en `originalText`, y la vista lo pintaba como si
   * fuera una cita del documento —y tachado, que se lee como "el documento tenía
   * esto y se borró". No había nada que borrar.
   *
   * Cuando está presente, `originalText` es `''`. Es un discriminante cerrado a
   * propósito: los tres estados (tiene texto, no tiene texto, todavía no se sabe)
   * no se pueden confundir.
   */
  sinTexto?: { clase: 'figura' | 'tabla' };
```

- [ ] **Step 4: Cambiá las dos ramas**

`auditItems.ts:471` y `:486`. La de la figura pasa de:

```ts
      originalText: '[Figura sin rotular]',
```

a:

```ts
      originalText: '',
      sinTexto: { clase: 'figura' },
```

y la de la tabla, igual con `clase: 'tabla'`.

**La condición no cambia.** Dejalo como `!e.image_info?.caption`: la distinguimos del
test 3, que dice que un punto **sí** cuenta. Si el test 3 falla, el arreglo es
`!(e.image_info?.caption ?? '').trim()`, no cambiar el test.

Ojo: el `suggestedText` genérico de `:472` y `:487` **se queda**. Es una sugerencia de
la IA que el motor proactivo puede pisar, y una sugerencia no es una cita.

- [ ] **Step 5: Corré el test y verificá que pasa**

Run: `npx vitest run src/__tests__/auditItems.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Corré todo y arreglá lo que caiga**

Run: `npx vitest run`
Expected: **`src/__tests__/findingRack.test.tsx` falla.** Su fixture de `:433` fija
`originalText: '[Figura sin rotular]'`, o sea que **consagra el defecto**. Actualizá el
fixture a `originalText: ''` y agregale `sinTexto: { clase: 'figura' }`.

Ese test cayendo es la prueba de que el test estaba fijando lo que no debía. **Decilo en
el mensaje del commit.**

- [ ] **Step 7: Commit**

```bash
git add src/lib/auditItems.ts src/__tests__/auditItems.test.ts src/__tests__/findingRack.test.tsx
git commit -m "revision: el modelo puede decir que no hay texto

El placeholder '[Figura sin rotular]' no venía de Python: lo inventaba
auditItems.ts:471 porque AuditItem.no admitia la ausencia de texto. FindingDetail lo
pintaba en un pre monoespaciado con fondo, y EngineGroupCard lo tachaba, que se lee
como 'el documento tenia esto y se borro'. No habia nada que borrar.

Ahora el modelo lo dice. AuditItem gana sinTexto, y cuando esta presente
originalText es cadena vacia. Tres estados que no se pueden confundir: tiene texto, no
tiene texto, todavia no se sabe.

La distincion de la leyenda es caption.trim() vacio o no. Un punto es texto, y un
test lo deja fijo: si el motor empieza a marcar como 'sin rotular' las leyendas de un
caracter, ese test se cae.

findingRack.test.tsx fijaba el placeholder como dato esperado, o sea que consagraba
el defecto. Actualizado. Que un test se caiga al arreglar un defecto es exactamente lo
que ese test era para."
```

---

### Task 3: Que las vistas respeten `sinTexto`

**Files:**
- Modify: `src/components/review/FindingDetail.tsx:201-203`
- Modify: `src/components/review/EngineGroupCard.tsx:226-240` (verificar, puede no
  necesitar cambio)
- Test: `src/__tests__/findingRack.test.tsx` (sumar casos), `src/__tests__/markSourceParity.test.tsx`

**Interfaces:**
- Consumes: `AuditItem.sinTexto` de Task 2.
- Produces: nada nuevo. Es la capa de vista.

- [ ] **Step 1: Escribí el test que falla**

En `src/__tests__/findingRack.test.tsx`, sumá:

```tsx
it('un hallazgo sobre una figura sin leyenda no muestra un bloque de texto', () => {
  const { container } = montar({ item: item({ originalText: '', sinTexto: { clase: 'figura' } }) });
  // El defecto: se pintaba un <pre> monoespaciado con '[Figura sin rotular]'.
  expect(container.querySelector('pre')).toBeNull();
  expect(container.textContent).toContain('no tiene texto');
});

it('un hallazgo sobre un parrafo normal si muestra el texto', () => {
  const { container } = montar({ item: item({ originalText: 'La muestra fueza' }) });
  expect(container.querySelector('pre')?.textContent).toContain('La muestra fueza');
});
```

Si el helper del archivo se llama distinto a `montar` o `item`, usá el que haya.

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/findingRack.test.tsx -t "sin leyenda"`
Expected: FAIL. `<pre>` existe con el texto vacío.

- [ ] **Step 3: El aviso en `FindingDetail`**

`src/components/review/FindingDetail.tsx:201-203`. Hoy:

```tsx
      <pre style={{ ...monoStyle, backgroundColor: 'var(--severity-critical-tint)' }}>{item.originalText}</pre>
```

Pasa a:

```tsx
      {item.sinTexto ? (
        <p style={{ ...avisoStyle, backgroundColor: 'var(--severity-critical-tint)' }}>
          {item.sinTexto.clase === 'figura'
            ? 'Esta figura todavía no tiene leyenda, así que no hay texto al que aplicar una corrección.'
            : 'Esta tabla todavía no tiene título, así que no hay texto al que aplicar una corrección.'}
        </p>
      ) : (
        <pre style={{ ...monoStyle, backgroundColor: 'var(--severity-critical-tint)' }}>{item.originalText}</pre>
      )}
```

Y **agregá** el estilo, junto a `monoStyle` (que ya existe en el archivo):

```ts
/** El aviso de que no hay texto. Mismo papel que el `pre`, pero dice lo que pasa
 *  en vez de mostrar una cadena que parece una cita y no lo es. */
const avisoStyle: React.CSSProperties = {
  fontSize: 'var(--text-xs)',
  lineHeight: 1.5,
  margin: 0,
  padding: 'var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  fontStyle: 'italic',
};
```

- [ ] **Step 4: Verificá `EngineGroupCard`**

`EngineGroupCard.tsx:226` ya dice `{primero?.originalText && (` — un `originalText`
vacío **ya esconde** el tachado. Con el Task 2, el tachado desaparece solo.

**No toques nada ahí.** Pero **agregá el test que lo prueba**, porque es el bug que el
usuario vio ("sale tachado lo que dice 'sin rotular'"):

```tsx
it('un hallazgo sin texto no se muestra tachado en la fila de subtipo', () => {
  const { container } = montar({ group: subgrupo({ items: [item({ originalText: '', sinTexto: { clase: 'tabla' } })] }) });
  const tachado = Array.from(container.querySelectorAll('*')).find(
    (el) => getComputedStyle(el).textDecoration?.includes('line-through'),
  );
  expect(tachado).toBeUndefined();
});
```

- [ ] **Step 5: Corré todo**

Run: `npx vitest run` && `npx tsc --noEmit`
Expected: todo verde, o sube el conteo.

- [ ] **Step 6: Commit**

```bash
git add src/components/review/FindingDetail.tsx src/components/review/EngineGroupCard.tsx src/__tests__/findingRack.test.tsx
git commit -m "revision: la vista dice que no hay texto en vez de mostrar uno

FindingDetail pintaba el originalText en un pre monoespaciado con fondo, y cuando el
originalText era el placeholder eso se leia como una cita del documento. EngineGroupCard
lo tachaba encima. Los dos juntos decian 'el documento tenia esto y se borro' sobre un
elemento que nunca tuvo texto.

Ahora hay un aviso que dice lo que pasa: la figura no tiene leyenda, y sin leyenda no
hay texto al que aplicar una correccion. El texto en el aviso es el mismo para todos
los motores, porque es una verdad sobre el elemento, no sobre el hallazgo.

EngineGroupCard no hizo falta tocarlo: su guarda primero?.originalText ya esconde el
tachado con la cadena vacia. Le dejo el test que lo prueba, porque es el sintoma que
se vio y no quiero que vuelva por un refactor."
```

---

### Task 4: El mapa de marcas deja de escribir identificadores

**Files:**
- Modify: `src/store/slices/auditSlice.ts:135-157`
- Test: `src/__tests__/marcasMap.test.ts` (crear)

**Interfaces:**
- Consumes: `rotuloDeKind` y `MARCAS_MAP_VERSION` de Task 1.
- Produces: `wordapa7_marcas_map` con forma
  `{ version: number, marcas: Record<string, string> }`. **`PaperCanvas.tsx:795` tiene que
  leer esa forma**, o la fase rompe el lienzo.

- [ ] **Step 1: Escribí el test que falla**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MARCAS_MAP_VERSION } from '../lib/rotulos';

const CLAVE = 'wordapa7_marcas_map';

describe('marcas map', () => {
  beforeEach(() => localStorage.clear());

  it('el mapa que se escribe lleva version, para poder descartar el viejo', () => {
    // Un mapa de la version anterior es una tabla de rotulos viejos que ya no
    // existe, y no hay forma de saber cuales eran. Se descarta.
    localStorage.setItem(CLAVE, JSON.stringify({ elem_1: 'Primera persona' }));
    expect(() => leerMarcas()).not.toThrow();
    expect(leerMarcas()).toEqual({});
  });

  it('el mapa de la version actual se lee', () => {
    const marcas = { elem_1: 'Primera persona gramatical' };
    localStorage.setItem(CLAVE, JSON.stringify({ version: MARCAS_MAP_VERSION, marcas }));
    expect(leerMarcas()).toEqual(marcas);
  });
});
```

`leerMarcas` tiene que ser la función que **tú vas a crear** en el paso 3. **No la
importes de ningún lado todavía**: en el test declarala arriba del `describe` con el
cuerpo que le vas a dar en el paso 3, y en el paso 3 movela al archivo de producción y
importala. Un test que depende de una función que todavía no existe en ningún lado es un
test que documenta la intención, no el comportamiento; dejalo así solo en este paso, y
en el 3 tiene que estar importada.

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/marcasMap.test.ts`
Expected: FAIL, `leerMarcas` no está definida.

- [ ] **Step 3: La versión y el lector**

En `src/store/slices/auditSlice.ts`, **arriba del todo**, después de los imports:

```ts
import { rotuloDeKind, MARCAS_MAP_VERSION } from '../../lib/rotulos';

const CLAVE_MARCAS = 'wordapa7_marcas_map';

/**
 * El mapa de marcas es `version` + `marcas`. La versión está porque el mapa guarda
 * rótulos, no datos: cuando cambia una tabla de rótulos, el mapa viejo pasa a tener
 * textos que el código ya no produce, y no hay forma de saber cuáles eran para
 * traducirlos. Se descarta y se vuelve a escribir.
 *
 * Sin versión, un `localStorage` viejo se leía para siempre y `PaperCanvas` pintaba
 * rótulos que nadie podía cambiar desde la UI.
 */
type MarcasMap = { version: number; marcas: Record<string, string> };

export function leerMarcas(): Record<string, string> {
  try {
    const crudo = localStorage.getItem(CLAVE_MARCAS);
    if (!crudo) return {};
    const leido = JSON.parse(crudo) as Partial<MarcasMap>;
    if (leido?.version !== MARCAS_MAP_VERSION) return {};
    return leido.marcas ?? {};
  } catch {
    return {};
  }
}

async function escribirMarcas(
  entradas: Array<{ element_id: string; kind: string }>,
): Promise<void> {
  const marcas = leerMarcas();
  for (const f of entradas) {
    marcas[f.element_id] = await rotuloDeKind(f.kind);
  }
  localStorage.setItem(CLAVE_MARCAS, JSON.stringify({ version: MARCAS_MAP_VERSION, marcas }));
  window.dispatchEvent(new StorageEvent('storage', { key: CLAVE_MARCAS }));
}
```

- [ ] **Step 4: Reemplazá el bloque inline**

`auditSlice.ts:135-157`. **Borrá** el `KIND_LABELS` completo (`:139-150`) y el
`try { ... } catch { /* noop */ }`, y dejá:

```ts
        // Marcas de transparencia: cada elemento marcado explica su motivo.
        await escribirMarcas((res.findings ?? []) as Array<{ element_id: string; kind: string }>);
```

Dos cosas a verificar antes de aceptar este código:

1. **El tipo de `res.findings`**: si `element_id` es opcional en `ProofreadSource`,
  filtrá los que no lo tengan. Un `undefined` como clave de objeto se convierte en la
  cadena `"undefined"`, y eso es un elemento que no existe pintando su marca.
2. **Si el slice es `async`**: si no lo es, `escribirMarcas` no puede esperarse.
  alternatives: `void escribirMarcas(...)` y el `try/catch` se queda adentro de la
  función (que ya lo tiene). **Elegí una y anotá cuál.**

- [ ] **Step 5: `PaperCanvas` lee la forma nueva**

`src/components/layout/PaperCanvas.tsx:795` hoy hace
`JSON.parse(localStorage.getItem('wordapa7_marcas_map'))` y usa el objeto plano.

**Reemplazalo por un import de `leerMarcas`.** Es el mismo dato con una forma distinta;
si lo dejás, el lienzo lee `undefined` en cada marca y el defecto vuelve en silencio.

```ts
import { leerMarcas } from '../store/slices/auditSlice';
```

y usá `leerMarcas()` en el `useMemo` de `:795`.

> Cuidado con la dirección del import: `PaperCanvas` (layout) importando de
> `store/slices` (store) es aceptable, pero si aparece un ciclo, la salida es mover
> `CLAVE_MARCAS`, `leerMarcas` y `escribirMarcas` a `src/lib/marcasMap.ts` y que los
> dos importen de ahí. **Es la opción más limpia; preferila si el ciclo aparece.**

- [ ] **Step 6: Corré y arreglá**

Run: `npx vitest run` && `npx tsc --noEmit`
Expected: verde. Si `Step5BodyWizard.tsx:44-48` o `RevisionTab.tsx:103,229` leen el mapa
con la forma vieja, **arreglalos también con `leerMarcas`**. Greppeá:
`Select-String -Path 'src/**/*' -Pattern 'wordapa7_marcas_map'`.

- [ ] **Step 7: Commit**

```bash
git add src/store/slices/auditSlice.ts src/lib/marcasMap.ts src/__tests__/marcasMap.test.ts src/components/layout/PaperCanvas.tsx src/components/wizard/Step5BodyWizard.tsx src/components/settings/tabs/RevisionTab.tsx
git commit -m "revision: el mapa de marcas deja de escribir identificadores, y se versiona

El || f.kind de auditSlice escribia el snake_case crudo en localStorage, y PaperCanvas
lo pintaba encima del parrafo. Por ahi salia paragraph_words en el lienzo: KIND_LABELS
tiene diez filas y el backend emite unas treinta, y las veinte que faltaban caian al
crudo.

Los rotulos salen ahora de rotuloDeKind, que encadena PROOFREAD_SPECS y SUBTYPE_LABELS.
KIND_LABELS desaparece.

El mapa ahora lleva version. Antes guardaba rotulos sin version, y cuando cambia una
tabla de rotulos el mapa viejo queda con textos que el codigo ya no produce, sin forma
de saber cuales eran ni de traducirlos. Se descarta. Sin esto, un localStorage de la
version anterior se leia para siempre y el lienzo pintaba rotulos que nadie podia
cambiar desde la UI.

Y leerMarcas vive en un solo lugar, porque el mapa lo leian tres: el lienzo, el
wizard del cuerpo y el interruptor de marcas de la pestaña Revision. Tres formas de
leerlo es tres formas de que una quede vieja."
```

> Si no creaste `src/lib/marcasMap.ts` y lo dejaste todo en `auditSlice.ts`, ajustá la
> línea del `git add` antes de correrla. **No corras un `git add` con rutas que no
> existen.**

---

### Task 5: El guardián

La última tarea es la que impide que esto vuelva. Sin ella, los cuatro trabajos
anteriores son un parche y el próximo `kind` nuevo abre el mismo agujero.

**Files:**
- Modify: `src/__tests__/noSubtipoInternoEnPantalla.test.ts` (ya existe; mirá qué
  cubre antes de tocarlo)
- Create: `src/__tests__/reglasDeFaseConNombre.test.ts`

**Interfaces:**
- Consumes: `PROOFREAD_SPECS` de `src/lib/auditItems.ts`, `RULE_SCOPES` de
  `python/modules/phase_scope.py` (vía el archivo que las exporta al frontend).
- Produces: dos tests que valen como puerta.

- [ ] **Step 1: El test de cobertura de reglas**

`src/__tests__/reglasDeFaseConNombre.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { RULE_SCOPES } from '../lib/fases';  // ajustá la ruta: es donde vive el mapa
import { PROOFREAD_SPECS } from '../lib/auditItems';
import { rotuloDeSubtipo, ROTULO_GENERICO } from '../lib/rotulos';

describe('toda regla de fase tiene nombre legible', () => {
  it('ningun kind de RULE_SCOPES cae al rotulo generico', () => {
    const sinNombre: string[] = [];
    for (const kind of Object.keys(RULE_SCOPES)) {
      const spec = PROOFREAD_SPECS[kind];
      if (!spec) { sinNombre.push(`${kind} (no esta en PROOFREAD_SPECS)`); continue; }
      if (rotuloDeSubtipo(spec.subtype) === ROTULO_GENERICO) sinNombre.push(`${kind} -> ${spec.subtype}`);
    }
    expect(sinNombre).toEqual([]);
  });
});
```

**Leé `python/modules/phase_scope.py` primero** para saber cómo se exporta `RULE_SCOPES`
al frontend, y usá la ruta real. Si no está exportado, agregá el export en el mecanismo
que ya exista; no inventes uno nuevo.

- [ ] **Step 2: Corré y verificá que falla**

Run: `npx vitest run src/__tests__/reglasDeFaseConNombre.test.ts`
Expected: FAIL, con la lista de reglas sin nombre. **Anotá esa lista en el reporte**:
es el número real de cobertura que faltaba.

- [ ] **Step 3: Agregá las filas que falten**

En `src/lib/rotulos.ts`, agregá una fila a `SUBTYPE_LABELS` por cada `kind` que el test
reportó, con el nombre en palabras. Copiá el texto de `phase_scope.py`, que es donde
está escrito en prosa; el `kind` es interno y su nombre no significa nada para el
lector.

- [ ] **Step 4: Corré y verificá que pasa**

Run: `npx vitest run src/__tests__/reglasDeFaseConNombre.test.ts`
Expected: PASS.

- [ ] **Step 5: Extendé el guardián de pantalla**

`src/__tests__/noSubtipoInternoEnPantalla.test.ts` ya existe y vigila que un subtipo
interno no salga en pantalla. **Sumale el caso de `KIND_LABELS` y del `PaperCanvas`**:

```ts
it('el mapa de marcas no puede contener un identificador interno', async () => {
  const fuente = await import('../store/slices/auditSlice?raw');
  // La firma prohibida: el || kind escribe el crudo. Si vuelve, el bug vuelve.
  expect(fuente.default).not.toMatch(/\|\|\s*f\.kind/);
});
```

Y en el mismo archivo, una versión que recorra el mapa real:

```ts
it('ninguna marca escrita por el corrector es un snake_case', () => {
  const marcas = leerMarcas();
  for (const [elementId, etiqueta] of Object.entries(marcas)) {
    expect(etiqueta, `marca de ${elementId}`).not.toMatch(/^[a-z0-9]+(_[a-z0-9]+)+$/);
  }
});
```

- [ ] **Step 6: El guardián de tokens, si hace falta**

No hace falta en esta fase. `noHardcodedColors.test.ts` se extiende en F1.

- [ ] **Step 7: Verificación final de la fase**

Run: `npx vitest run` && `npx tsc --noEmit` && `pytest python/tests/ -q`
Expected: frontend **no baja de 1024 passed, 0 failed**. `tsc` limpio. Python **766
passed, 14 skipped** (esta fase no lo toca; si cambia, es que tocaste Python sin querer).

Run: `Select-String -Path 'src/lib/rotulos.ts','src/store/slices/auditSlice.ts' -Pattern '[\u4e00-\u9fff\uac00-\ud7af\ufffd]'`
Expected: sin salida.

- [ ] **Step 8: Commit**

```bash
git add src/__tests__/reglasDeFaseConNombre.test.ts src/__tests__/noSubtipoInternoEnPantalla.test.ts src/lib/rotulos.ts
git commit -m "revision: un guardián que se cae cuando aparece un kind sin nombre

El test recorre RULE_SCOPES y exige que cada kind tenga fila en PROOFREAD_SPECS y
subtipo con nombre en SUBTYPE_LABELS. Hoy eso falla con la lista de las que faltaban:
anotala en el reporte, es el numero real de cobertura que nunca se midio.

El segundo test lee el fuente de auditSlice y falla si vuelve el || f.kind. Es la
firma del defecto, y un test que la reconoce por texto no necesita que nadie se acuerde
de que existio.

El tercero recorre el mapa de marcas real y falla si alguna etiqueta es un snake_case.
Ese es el sintoma exacto que se vio en el lienzo."
```


---

## Self-Review

**1. Cobertura del spec §4.** Las tres salidas del spec: (a) `originalText` opcional y
`sinTexto` — Task 2; (b) `KIND_LABELS` borrado, `|| f.kind` prohibido, rótulo genérico +
`warn` — Tasks 1 y 4; (c) mapa versionado — Task 4. Las dos salidas que el spec NO pedía
y que agregué acá: el test de cobertura de `RULE_SCOPES` (Task 5) y el guardián de texto
del fuente (Task 5). **La segunda es una decisión mía**: es un test que se ata a la
forma del código, y atarse a la forma es frágil. **Está porque el defecto era
exactamente un operador de fallback**, y es el único modo de vigilarlo sin mirar todos
los `kind`. Si preferís, se saca y queda solo el test de comportamiento. Anotalo.

**2. Placeholders.** Los bloques `/* ... */` de Task 2 son el punto débil del plan: un
test con elipsis no se puede correr. Los dejé así a propósito porque el `shape` de
`AuditSources` lo tiene que leer quien implemente, no yo desde el informe de exploración.
**Es el paso que más conviene hacer bien.** Los tres tests de Task 4 tienen un problema
parecido y resuelto: `leerMarcas` se declara en el test del paso 1 y se mueve a
producción en el paso 3.

**3. Consistencia de tipos.** `sinTexto?: { clase: 'figura' | 'tabla' }` se define una
vez (Task 2) y lo consumen Tasks 3 y 4. `rotuloDeKind` se define en Task 1 y lo consume
Task 4. `MARCAS_MAP_VERSION` se define en Task 1 y se consume en Task 4. `leerMarcas` se
define en Task 4 y lo consumen `PaperCanvas` y Task 5. **No hay dos definiciones de
nada.**

**4. Review Focus.** Los cinco casos tienen test: (1) Task 2 test 2 y Task 2 test 4 con
`sinTexto` ausente; (2) Task 2 test 3, leyenda de un punto; (3) Task 1 test 1, kind
desconocido; (4) Task 4 test 1, mapa de versión anterior; (5) **el quinto no tiene test y
no lo puede tener en esta fase.** Dos documentos abiertos a la vez con marcas que se
pisan es un problema de modelo, no de vista: el mapa es global en `localStorage` y los
`element_id` son posicionales. Arreglarlo es parte de la Fase 2 (`rules` por documento) y
está anotado en `§14` del spec como lo que **no** se hace. **Lo dejo declarado en vez de
prometer un test que no mide nada.**

**5. Lo que este plan no arregla y alguien va a preguntar.** El overlay morado, los
empty states, el minimapa de 4 px y los tokens inexistentes son F1. Este plan solo
cambia **qué dice** la pantalla, no **cómo se ve**. Si alguien espera ver la Revisión
arreglada al terminar F0, va a pensar que la fase falló. **Decilo en el reporte.**
