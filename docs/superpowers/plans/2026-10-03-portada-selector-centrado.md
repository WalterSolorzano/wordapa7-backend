# Portada: selector centrado y preview sin fallos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hacer que el carrusel de portada tenga un selector central inmóvil con la activa resaltada y las demás atenuadas, y que la previsualización deje de tardar/fallar cortando el cálculo a la página 1 y quitando los montajes ocultos.

**Architecture:** Dos frentes independientes. (1) Rendimiento: `onlyCover` corta de verdad la paginación (`firstPageOnly` en `computePages`/`computeRenderedPages`) y desactiva medición DOM, repaginado COM y export PDF en las miniaturas; se eliminan los montajes ocultos. (2) Superficie: el track del carrusel pasa de fila flex con `justify-content:center` + `translateX` de la fila a tarjetas posicionadas de forma absoluta alrededor de un centro fijo (`left:50%` + `marginLeft` negativo + `translateX` por tarjeta), con escala y `rotateY` por distancia y scrim (`--canvas-bg`) en las no activas. Se conserva `prefers-reduced-motion` como strip con scroll.

**Tech Stack:** React 18, TypeScript, Vite 5, Zustand, Vitest + @testing-library/react, lucide-react.

**Spec:** `docs/superpowers/specs/2026-10-03-portada-selector-centrado-design.md`

## Global Constraints

- Cero emojis: solo `lucide-react` con `strokeWidth="var(--icon-stroke)"`.
- Cero colores literales (nada de hex/rgba): solo tokens CSS. El papel usa `var(--paper-white)` y `var(--paper-ink)` en ambos temas.
- El scrim es una capa (`var(--canvas-bg)`) sobre la hoja; nunca `filter: brightness`, nunca cambia el fondo del papel.
- La portada original es indivisible y `use_original_cover` no se muta.
- `PaperCanvas` es el único paginador; el Estudio de portada no importa `computePages`/`computeRenderedPages`/`applyPageFlow`/`usePageIndex`.
- Cada tarjeta del carrusel renderiza el DISEÑO REAL; prohibido volver a placeholders/esqueletos.
- Cadena de alto intacta (`height:100%`, `minHeight:0`); no crear `vitest.config.ts`.
- `git add` archivo por archivo (nunca `git add -A`).
- Comandos de test focalizados con `-t` / ruta; suite completa solo en la verificación final.

## Review Focus

- Documento **sin** `is_cover_section`/`portada_block`: `firstPageOnly` debe devolver una única página no vacía con el primer tramo del cuerpo.
- Documento con **paginación Word** (`page_number`): `firstPageOnly` devuelve solo la primera página.
- `anchoMiniatura` en extremos (320 / 560): el alto de la fila y las escalas no producen recortes ni NaN.
- `prefers-reduced-motion`: las tarjetas vuelven al flujo, sin `transform`, con la pista en `overflowX:auto`.
- Modo activo `custom` (o índice fuera de rango): la medida de la miniatura activa no es NaN/Infinity.

---

### Task 1: `onlyCover` corta la paginación a la página 1 y no dispara red

**Files:**
- Modify: `src/components/layout/PaperCanvas.tsx` (L308, L322, L348-352, L359, L408-463, L499, L732, L773, L822-825, L864)
- Test: `src/__tests__/computePages.test.ts` (añadir un `describe`)

**Interfaces:**
- Consumes: nada previo.
- Produces:
  - `computePages(elements: ElementModel[], maxUnits = 14, firstPageOnly = false): ElementModel[][]`
  - `RenderedPagesInput` gana `firstPageOnly?: boolean`.
  - `computeRenderedPages` respeta `firstPageOnly`.

- [ ] **Step 1: Escribir el test que falla**

Añadir al final de `src/__tests__/computePages.test.ts`:

```ts
describe('computePages con firstPageOnly (miniatura onlyCover)', () => {
  it('con portada, firstPageOnly devuelve SOLO la portada', () => {
    const els = [
      p('cover', { is_cover_section: true, page_number: 1 }),
      ...Array.from({ length: 40 }, (_, i) => p(`b${i}`, { page_number: 2 + i })),
    ];
    const full = computePages(els, 14);
    expect(full.length).toBeGreaterThan(1);

    const only = computePages(els, 14, true);
    expect(only).toHaveLength(1);
    expect(only[0].map((e) => e.id)).toEqual(['cover']);
  });

  it('sin portada y con paginación Word, devuelve la primera página del cuerpo', () => {
    const els = [
      p('a', { page_number: 1 }),
      p('b', { page_number: 2 }),
      p('c', { page_number: 3 }),
    ];
    const only = computePages(els, 14, true);
    expect(only).toHaveLength(1);
    expect(only[0].map((e) => e.id)).toEqual(['a']);
  });

  it('sin portada y sin page_number, devuelve una sola página no vacía', () => {
    const els = Array.from({ length: 60 }, (_, i) =>
      p(`e${i}`, { text: 'una linea'.repeat(20) }));
    const only = computePages(els, 14, true);
    expect(only).toHaveLength(1);
    expect(only[0].length).toBeGreaterThan(0);
  });

  it('sin firstPageOnly el resultado no cambia', () => {
    const els = Array.from({ length: 60 }, (_, i) =>
      p(`e${i}`, { text: 'una linea'.repeat(20) }));
    expect(computePages(els, 14, false).length).toBe(computePages(els, 14).length);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/__tests__/computePages.test.ts -t "firstPageOnly"`
Expected: FAIL — `only` tiene más de una página / no existe el tercer parámetro.

- [ ] **Step 3: Implementar `firstPageOnly` en `computePages`**

`src/components/layout/PaperCanvas.tsx` L308:

```ts
export const computePages = (elements: ElementModel[], maxUnits = 14, firstPageOnly = false): ElementModel[][] => {
```

Tras el cierre del `elements.forEach` (después de L322), insertar:

```ts
  // ── Primer corte: la miniatura `onlyCover` solo necesita la página 1.
  //    Con portada, la 1 ES la portada y el cuerpo no se toca.
  if (firstPageOnly && coverElements.length > 0) return [coverElements];
```

En la rama de paginación Word (L348-352), reemplazar:

```ts
    if (coverElements.length > 0) {
      return [...pages, ...nonEmpty];
    }
    return nonEmpty.length > 0 ? nonEmpty : [[]];
```

por:

```ts
    if (coverElements.length > 0) {
      return firstPageOnly ? [pages[0]] : [...pages, ...nonEmpty];
    }
    if (firstPageOnly) return [nonEmpty[0] ?? []];
    return nonEmpty.length > 0 ? nonEmpty : [[]];
```

En la rama heurística, primera línea dentro de `bodyElements.forEach` (L359):

```ts
  bodyElements.forEach((elem) => {
    if (firstPageOnly && pages.length > 0) return;
    let units = 1;
```

- [ ] **Step 4: Propagar `firstPageOnly` en `computeRenderedPages`**

En `RenderedPagesInput` (L408-416) añadir:

```ts
  /** `onlyCover`: devolver solo la página 1 (miniaturas de portada). */
  firstPageOnly?: boolean;
```

En la firma y el `return` (L434-462):

```ts
export const computeRenderedPages = ({
  elements,
  rules,
  apaFormat,
  heights,
  firstPageOnly,
}: RenderedPagesInput): { geom: PageGeometry; pages: ElementModel[][] } => {
```

```ts
    pages: applyPageFlow(computePages(elements, maxUnits, firstPageOnly), heights ?? new Map(), geom),
```

- [ ] **Step 5: Desactivar medición y red en `onlyCover`**

Efecto de medición (L499): `if (!doc) return;` → `if (!doc || onlyCover) return;`

Efecto de selección (L732): `if (selectedElementId && doc) {` → `if (selectedElementId && doc && !onlyCover) {`
y sus deps (L768): `}, [selectedElementId, doc, rules]);` → `}, [selectedElementId, doc, rules, onlyCover]);`

Efecto de scroll a referencias (L773): `if (scrollTargetId && doc) {` → `if (scrollTargetId && doc && !onlyCover) {`
y sus deps (L804): `}, [scrollTargetId, doc, rules]);` → `}, [scrollTargetId, doc, rules, onlyCover]);`

Hooks (L822-825):

```ts
  // ── Fase 2: repaginación en vivo con Word COM ──
  useLayoutRepaginate(onlyCover ? null : doc);

  // ── Fase 4: capa PDF en reposo ──
  const { restLayerState, notifyMutation } = usePdfRestLayer(onlyCover ? null : (doc?.session_id ?? null));
```

Call site del render (L864-869): añadir la bandera:

```ts
  const { geom, pages } = computeRenderedPages({
    elements: flowElems,
    rules,
    apaFormat: doc.apa_format,
    heights: measuredRef.current,
    firstPageOnly: !!onlyCover,
  });
```

- [ ] **Step 6: Verificar que pasa**

Run: `npx vitest run src/__tests__/computePages.test.ts src/__tests__/usePageIndex.test.ts`
Expected: PASS (los tests existentes de paginación no cambian con `firstPageOnly` ausente).

- [ ] **Step 7: Commit**

```bash
git add src/components/layout/PaperCanvas.tsx src/__tests__/computePages.test.ts
git commit -m "perf(portada): onlyCover corta la paginacion a la pagina 1 y no dispara red"
```

---

### Task 2: Quitar los montajes ocultos del Estudio

**Files:**
- Modify: `src/components/wizard/CoverCarouselStudio.tsx` (L274-278, L328-337)
- Modify: `src/components/wizard/portada/CarruselPortada.tsx` (L214, inicialización del índice)
- Test: `src/__tests__/coverStudioChrome.test.tsx` (L250-260, L284-296)

**Interfaces:**
- Consumes: nada nuevo.
- Produces: el índice inicial de `CarruselPortada` sale de `modoActivo`, así que el carrusel puede desmontarse al entrar al editor y volver sin perder la tarjeta.

- [ ] **Step 1: Actualizar los tests que fijan los montajes ocultos**

En `src/__tests__/coverStudioChrome.test.tsx`, reemplazar el test de L250-260:

```tsx
  it('el carrusel y su vista previa comparten la columna del centro', () => {
    portada();
    render(<CoverCarouselStudio />);
    const centro = screen.getByTestId('cover-carousel');
    expect(centro.contains(screen.getByTestId('cover-model-track'))).toBe(true);
    // La preview del carrusel ES la tarjeta activa: no hay un segundo paginador
    // oculto. Un paginador escondido era una instancia pesada por nada.
    expect(within(centro).queryByTestId('paginador-de-portada')).toBeNull();
  });
```

Y el test de L284-296:

```tsx
  it('la columna del centro reparte el alto entre la pista y la vista previa', () => {
    portada();
    render(<CoverCarouselStudio />);
    const centro = screen.getByTestId('cover-carousel');
    expect(centro.style.display).toBe('flex');
    expect(centro.style.flexDirection).toBe('column');
    expect(centro.style.minHeight).toBe('0px');
  });
```

- [ ] **Step 2: Verificar que fallan los tests viejos (o que ya no compilan las aserciones)**

Run: `npx vitest run src/__tests__/coverStudioChrome.test.tsx`
Expected: FAIL en el test de L250 y L284 (todavía existe `paginador-de-portada`).

- [ ] **Step 3: Eliminar el paginador oculto y el carrusel oculto**

En `src/components/wizard/CoverCarouselStudio.tsx` borrar el bloque L274-278:

```tsx
              {/* El paginador de la portada vive en `PaperCanvas` y en ningún otro
                  lado: acá se monta oculto para que exista en el árbol. */}
              <div data-testid="paginador-de-portada" style={{ flex: 1, minHeight: 0, display: 'none' }}>
                <PaperCanvas onlyCover />
              </div>
```

Y borrar el bloque L328-337:

```tsx
              {/* El carrusel sigue montado (oculto) para que el editor pueda volver
                  sin perder el índice elegido. */}
              <div style={{ display: 'none' }}>
                <CarruselPortada
                  modoActivo={currentMode}
                  hoja={hojaDeLaSesion}
                  onSelect={(id) => selectMode(id as CoverMode)}
                  onUpload={abrirSelector}
                />
              </div>
```

No borrar el `<PaperCanvas onlyCover />` de L324: ese es la preview visible del editor y se queda.

- [ ] **Step 4: Medir el contenedor real de la fase para el ancho activo**

Hoy `anchoCalculado` sale de `window.innerHeight - 200` (L60-74), una conjetura que no mira la caja de la fase. Reemplazar ese efecto por uno que mida el contenedor con `ResizeObserver` (con guarda para jsdom, que no lo trae):

```tsx
  // Ancho de la tarjeta activa, medido sobre la CAJA REAL de la fase (no sobre
  // `window`): así el carrusel ocupa el espacio que tiene, no el que supone.
  const faseRef = useRef<HTMLDivElement>(null);
  const [anchoCalculado, setAnchoCalculado] = useState<number>(320);

  useEffect(() => {
    const el = faseRef.current;
    if (!el) return;
    const calcular = () => {
      const alto = el.clientHeight;
      const ancho = el.clientWidth;
      // Activa alrededor de 320: se ajusta al alto útil y deja que las vecinas
      // se asomen por los lados. La hoja de portada ronda proporción 1.32 a 1.
      const porAlto = Math.round((alto - 180) / 1.32);
      const porAncho = Math.round(ancho * 0.4);
      const optimo = Math.min(360, Math.max(300, Math.min(porAlto, porAncho)));
      setAnchoCalculado(optimo);
    };
    calcular();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(calcular);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
```

Y poner `ref={faseRef}` en la caja `data-testid="cover-carousel"` (L232). Con esto la columna del centro se mide sola y no depende de un número de `window`.

- [ ] **Step 5: Inicializar el índice del carrusel desde `modoActivo`**

En `src/components/wizard/portada/CarruselPortada.tsx`, reemplazar L214:

```ts
  const [indice, setIndice] = useState(0);
```

por:

```ts
  // El índice nace en el modo activo, no en 0: al volver al carrusel desde el
  // editor (que ahora lo desmonta) la tarjeta elegida no parpadea desde la primera.
  const [indice, setIndice] = useState(() => {
    const i = DISENOS_DE_PORTADA.findIndex((d) => d.id === modo);
    return i >= 0 ? i : 0;
  });
```

- [ ] **Step 6: Verificar**

Run: `npx vitest run src/__tests__/coverStudioChrome.test.tsx src/__tests__/carruselPortada.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/wizard/CoverCarouselStudio.tsx src/components/wizard/portada/CarruselPortada.tsx src/__tests__/coverStudioChrome.test.tsx
git commit -m "perf(portada): quitar paginador y carrusel ocultos del Estudio"
```

---

### Task 3: Extraer `medidaDeLaMiniatura` (DRY para el alto de la fila)

**Files:**
- Modify: `src/components/wizard/portada/MiniaturaRealDePortada.tsx` (L32-63)
- Test: `src/__tests__/medidaMiniatura.test.ts` (nuevo)

**Interfaces:**
- Consumes: `getPageGeometry` (`src/lib/pageGeometry`), `medidaDeLaHoja` y `ANCHO_HOJA_PX` (ya importados).
- Produces: `medidaDeLaMiniatura(diseno: string, hoja: Hoja, reglas: unknown): { ancho: number; alto: number }` — el ancho/alto del diseño REAL en su unidad; lo usan la miniatura y el alto de la fila del carrusel.

- [ ] **Step 1: Escribir el test que falla**

Crear `src/__tests__/medidaMiniatura.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { medidaDeLaMiniatura } from '../components/wizard/portada/MiniaturaRealDePortada';

describe('medidaDeLaMiniatura', () => {
  it('A4 es más alto que carta para la plantilla UNI', () => {
    const a4 = medidaDeLaMiniatura('uni', 'a4', { page_size: 'a4' });
    const carta = medidaDeLaMiniatura('uni', 'carta', { page_size: 'carta' });
    expect(a4.alto).toBeGreaterThan(carta.alto);
  });

  it('la tarjeta custom (acción) no rompe: usa la hoja', () => {
    const medida = medidaDeLaMiniatura('custom', 'carta', undefined);
    expect(Number.isFinite(medida.alto)).toBe(true);
    expect(medida.alto).toBeGreaterThan(0);
  });

  it('original usa la geometría del documento', () => {
    const medida = medidaDeLaMiniatura('original', 'carta', {
      page_size: 'carta', margins_cm: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 },
      font_size_pt: 12, line_spacing: 2,
    });
    expect(medida.ancho).toBeGreaterThan(0);
    expect(medida.alto).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run src/__tests__/medidaMiniatura.test.ts`
Expected: FAIL — `medidaDeLaMiniatura` no existe.

- [ ] **Step 3: Exportar el helper y usarlo dentro del componente**

En `src/components/wizard/portada/MiniaturaRealDePortada.tsx`, antes de `export const MiniaturaRealDePortada` (L39), añadir:

```tsx
/** El ancho y el alto del diseño REAL, en su unidad de verdad.
 *
 *  Lo comparten la miniatura (que lo dibuja) y el carrusel (que reserva el
 *  alto de la fila): una sola cuenta, o el alto de la fila miente. */
export function medidaDeLaMiniatura(
  diseno: string,
  hoja: Hoja,
  reglas: { margins_cm?: unknown; font_size_pt?: number; line_spacing?: number; page_size?: unknown } | undefined,
): { ancho: number; alto: number } {
  if (diseno === 'original') {
    const g = getPageGeometry({
      margins_cm: (reglas as any)?.margins_cm,
      font_size_pt: reglas?.font_size_pt,
      line_spacing: reglas?.line_spacing,
      page_size: (reglas as any)?.page_size,
    });
    return { ancho: Math.round(g.pageW), alto: Math.round(g.pageH) };
  }
  const m = medidaDeLaHoja(hoja, ANCHO_HOJA_PX);
  return { ancho: ANCHO_HOJA_PX, alto: m.altoPx };
}
```

Reemplazar el `useMemo` del componente (L49-61) por una llamada al helper:

```tsx
  const medida = useMemo(
    () => medidaDeLaMiniatura(diseno, hoja, reglas),
    [diseno, hoja, reglas],
  );
```

- [ ] **Step 4: Verificar**

Run: `npx vitest run src/__tests__/medidaMiniatura.test.ts src/__tests__/carruselPortada.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/wizard/portada/MiniaturaRealDePortada.tsx src/__tests__/medidaMiniatura.test.ts
git commit -m "refactor(portada): extraer medidaDeLaMiniatura para el alto de la fila"
```

---

### Task 4: Carrusel con selector central fijo, jerarquía y scrim

**Files:**
- Modify: `src/components/wizard/portada/CarruselPortada.tsx` (L32, L110-119, L172-176, L203, L267-274, L363-433)
- Test: `src/__tests__/carruselPortada.test.tsx` (L62-67, L131-158)

**Interfaces:**
- Consumes: `medidaDeLaMiniatura` (Task 3).
- Produces: cada tarjeta se posiciona por su distancia a la activa; su `transform` es `translateX((i−indice)·paso) scale(escala) [rotateY(grados)]`; el scrim lleva `data-testid="scrim-<id>"`.

- [ ] **Step 1: Reescribir el test del centrado y añadir el de jerarquía**

En `src/__tests__/carruselPortada.test.tsx`, reemplazar el test L131-158 por:

```tsx
  it('la tarjeta activa queda siempre centrada y las demás se reparten alrededor', () => {
    /* El centro es FIJO: cada tarjeta se corre `(i - índice) * paso`. La activa
       tiene corrimiento 0 sin importar el índice, y las demás son simétricas. */
    montarCarrusel();
    const corrimiento = (id: string): number => {
      const m = /translateX\((-?[\d.]+)px\)/.exec(tarjeta(id).style.transform);
      return m ? Number(m[1]) : NaN;
    };

    // Índice inicial 0: 'original' al centro.
    expect(corrimiento('original')).toBeCloseTo(0, 5);
    const paso = Math.abs(corrimiento('apa7'));
    expect(paso).toBeGreaterThan(0);
    expect(corrimiento('uni')).toBeCloseTo(2 * paso, 5);
    expect(corrimiento('pro')).toBeCloseTo(3 * paso, 5);

    // Avanzar al centro (índice 2): 'uni' al centro y simetría.
    fireEvent.click(screen.getByLabelText(/siguiente diseño/i));
    fireEvent.click(screen.getByLabelText(/siguiente diseño/i));
    expect(corrimiento('uni')).toBeCloseTo(0, 5);
    expect(corrimiento('original')).toBeCloseTo(-2 * paso, 5);
    expect(corrimiento('custom')).toBeCloseTo(2 * paso, 5);
    expect(miniatura('uni').getAttribute('aria-current')).toBe('true');
  });

  it('la activa se resalta con escala 1 y las demás con escala menor y scrim', () => {
    montarCarrusel();
    expect(tarjeta('original').style.transform).toContain('scale(1)');
    expect(tarjeta('original').style.transform).not.toContain('rotateY');
    expect(tarjeta('apa7').style.transform).toMatch(/scale\(0\.\d+\)/);
    expect(tarjeta('apa7').style.transform).toContain('rotateY');

    // El scrim está SOLO en las no activas, y es la capa del canvas, no un filtro.
    expect(tarjeta('original').querySelector('[data-testid="scrim-original"]')).toBeNull();
    const scrim = tarjeta('apa7').querySelector('[data-testid="scrim-apa7"]') as HTMLElement;
    expect(scrim).toBeTruthy();
    expect(scrim.style.backgroundColor).toBe('var(--canvas-bg)');
  });
```

Añadir, después del test de jerarquía, el de los anchos extremos:

```tsx
  it('con ancho 320 y 560 la fila reserva un alto finito', () => {
    /* El alto de la fila sale de la miniatura activa: si la cuenta fallara,
       quedaría NaN/Infinity y las tarjetas absolutas se recortarían. */
    for (const ancho of [320, 560]) {
      useDocStore.setState({
        portada: { ...defaultPortada },
        acta: { ...defaultActa },
        doc: null,
      } as never);
      const { unmount } = render(<CarruselPortada anchoMiniatura={ancho} />);
      const alto = Number.parseFloat(fila().style.height);
      expect(Number.isFinite(alto)).toBe(true);
      expect(alto).toBeGreaterThan(0);
      unmount();
    }
  });
```

Eliminar el helper `desplazamientoDeLaFila` (L64-67), que queda sin uso. Conservar `fila()` (lo usa el test de reduced-motion y el de anchos extremos).

- [ ] **Step 2: Verificar que fallan**

Run: `npx vitest run src/__tests__/carruselPortada.test.tsx`
Expected: FAIL — hoy la fila entera se traduce; las tarjetas no tienen `translateX` propio ni scrim con testid.

- [ ] **Step 3: Ampliar constantes y escala**

En `src/components/wizard/portada/CarruselPortada.tsx`, tras `SEPARACION_PX` (L119) añadir:

```ts
/** Escala de las vecinas inmediatas y de las que quedan lejos.
 *  Bajadas desde el mockup: en 0.58/0.42 el fondo pesaba demasiado y competía
 *  con la activa. 0.46/0.30 deja una sola protagonista. */
const ESCALA_VECINA = 0.46;
const ESCALA_LEJANA = 0.30;
/** Grados de `rotateY` de una vecina (efecto coverflow). */
const ROTACION_VECINA_DEG = 16;
/** Alto reservado debajo de la hoja para el rótulo (título + subtítulo). */
const ALTO_ETIQUETA_PX = 72;
```

Reemplazar `escalaDeLaTarjeta` (L172-176):

```ts
function escalaDeLaTarjeta(distancia: number): number {
  if (distancia === 0) return 1;
  return distancia <= VECINAS_POR_LADO ? ESCALA_VECINA : ESCALA_LEJANA;
}
```

Import (L32):

```ts
import { MiniaturaRealDePortada, medidaDeLaMiniatura } from './MiniaturaRealDePortada';
```

- [ ] **Step 4: Calcular el alto de la fila desde la miniatura activa**

Tras `const acta = useDocStore((s) => s.acta);` (L204) añadir:

```ts
  const reglas = useDocStore((s) => s.rules);
```

Tras `const mascotaActual = ...` (L274) añadir:

```ts
  const medidaActiva = medidaDeLaMiniatura(disenoActual.id, hoja, reglas);
  const escalaActiva = anchoEfectivo / medidaActiva.ancho;
  const altoDeLaTarjeta = medidaActiva.alto * escalaActiva + ALTO_ETIQUETA_PX;
```

- [ ] **Step 5: Posicionar la fila y las tarjetas alrededor del centro**

Para que el carrusel **ocupe el área de la fase** (y no flote con aire muerto), la raíz, el escenario y la pista crecen:

- Raíz (L284): `style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: '100%', alignItems: 'center', flex: 1, minHeight: 0, justifyContent: 'center' }}`.
- Escenario (L318): `style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center', flex: 1, minHeight: 0 }}`.
- Pista (L350-361): añadir `display: 'flex', alignItems: 'center', justifyContent: 'center'` (la fila se centra vertical en el alto disponible; en reducido el scroll horizontal sigue).

Reemplazar el estilo de la fila (L365-375) por:

```tsx
            style={
              reducido
                ? { display: 'flex', alignItems: 'center', gap: SEPARACION_PX }
                : { position: 'relative', width: '100%', height: altoDeLaTarjeta, perspective: '1200px' }
            }
```

Dentro del `map`, tras `const isHovered = ...` (L380) añadir:

```tsx
              const dir = i - indice;
              const escala = escalaDeLaTarjeta(distancia);
              const rotacion = dir === 0 ? 0 : (dir > 0 ? 1 : -1) * ROTACION_VECINA_DEG;
```

Reemplazar el bloque `style` de la tarjeta (L392-417) por:

```tsx
                  style={{
                    ...(reducido
                      ? { position: 'relative' as const, flex: '0 0 auto', width: anchoEfectivo }
                      : {
                          position: 'absolute' as const,
                          top: 0,
                          left: '50%',
                          marginLeft: -anchoEfectivo / 2,
                          width: anchoEfectivo,
                        }),
                    borderRadius: 'var(--radius-lg)',
                    cursor: 'pointer',
                    background: activa ? 'var(--color-bg-surface)' : 'var(--color-bg-surface-alt)',
                    opacity: activa ? 1 : isHovered ? 0.88 : 0.68,
                    border: activa
                      ? '2px solid var(--accent-primary)'
                      : isHovered
                        ? '1px solid var(--accent-primary)'
                        : '1px solid var(--border-subtle)',
                    boxShadow: activa
                      ? '0 24px 48px var(--shadow-card), 0 0 0 1px var(--accent-primary), 0 0 24px var(--color-accent-soft)'
                      : isHovered
                        ? '0 10px 24px var(--shadow-card), 0 0 0 1px var(--border-subtle)'
                        : 'var(--shadow-sm)',
                    transform: reducido
                      ? undefined
                      : `translateX(${dir * paso}px) scale(${escala})${dir === 0 ? '' : ` rotateY(${rotacion}deg)`}`,
                    transformOrigin: 'center center',
                    transition: reducido
                      ? undefined
                      : 'transform 300ms cubic-bezier(0.22, 1, 0.36, 1), box-shadow 200ms ease, border-color 200ms ease, opacity 200ms ease',
                    display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 12px',
                    zIndex: activa ? 30 : Math.max(1, 20 - distancia * 5),
                    boxSizing: 'border-box',
                  }}
```

Reemplazar el scrim (L419-433) por:

```tsx
                  {!activa && (
                    <div
                      data-testid={`scrim-${d.id}`}
                      aria-hidden="true"
                      style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 'var(--radius-lg)',
                        backgroundColor: 'var(--canvas-bg)',
                        opacity: isHovered ? 0.12 : Math.min(0.5, 0.24 + distancia * 0.08),
                        pointerEvents: 'none',
                        transition: 'opacity 200ms ease',
                        zIndex: 5,
                      }}
                    />
                  )}
```

- [ ] **Step 6: Verificar toda la superficie**

Run: `npx vitest run src/__tests__/carruselPortada.test.tsx src/__tests__/portadaNoMiente.test.ts src/__tests__/coverStudioChrome.test.tsx`
Expected: PASS — incluido el test de `prefers-reduced-motion` (tarjetas en flujo, `transform === ''`, pista `overflowX:auto`) y el de "ninguna tarjeta usa brightness" + `[data-papel]` en `var(--paper-white)`.

- [ ] **Step 7: Commit**

```bash
git add src/components/wizard/portada/CarruselPortada.tsx src/__tests__/carruselPortada.test.tsx
git commit -m "feat(portada): selector central fijo con jerarquia y scrim en el carrusel"
```

---

### Task 5: Verificación final

**Files:**
- No cambia código; verifica el conjunto.

- [ ] **Step 1: Suite completa**

Run: `npx vitest run --reporter=dot`
Expected: PASS, sin regresiones respecto al baseline.

- [ ] **Step 2: Tipos**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: build OK.

- [ ] **Step 4: Mutation check de las aserciones nuevas**

Romper a propósito una aserción nueva (por ejemplo, cambiar `scale(${escala})` por `scale(1)` o quitar el `if (firstPageOnly && coverElements.length > 0)`) y comprobar que el test correspondiente FALLA. Restaurar con `git restore` el archivo tocado. Esto confirma que los tests muerden (spec maestro §3).
