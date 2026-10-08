# Rediseño del Carrusel de Portada: selector centrado y preview sin fallos

**Fecha:** 2026-10-03
**Estado:** Aprobado en conversación — pendiente de revisión escrita
**Ámbito:** Superficie "Portada" (Estudio de portada)
**Tipo:** Cambio arquitectural acotado (toca invariantes testeadas y el motor de paginación compartido)

---

## 1. Problema e intención

Al abrir el Estudio de portada, la previsualización **no carga o tarda mucho**, y el carrusel arranca de izquierda a derecha en vez de quedarse centrado. El usuario quiere:

1. Un **selector inmóvil al centro**. Lo que se mueve son las plantillas hacia ese selector.
2. La plantilla **seleccionada, mucho más grande y resaltada**; las demás **oscururecidas / con poca relevancia**.
3. Que la **previsualización sea fiable y rápida** ("¿tienes alguna idea para dejar de fallar?").
4. **Calidad** por encima de la solución mínima.

### Causa raíz confirmada (diagnóstico)

La lentitud no es una excepción: es **trabajo multiplicado**.

- Al abrir el Estudio se montan **5 instancias pesadas** simultáneas: `original`→`PaperCanvas`, `apa7`/`pro`→`APACoverEditor`, `uni`→`UNICoverPreview`; más un `<PaperCanvas onlyCover>` **oculto** en `paginador-de-portada`; más, en vista editor, un `<CarruselPortada>` **oculto** con otro set. Total: **2×`PaperCanvas` + 2×`APACoverEditor` + 1×`UNICoverPreview`**, y 7+ cuando `use_original_cover:false`.
- **`onlyCover` no ahorra nada**: `computeRenderedPages` calcula TODAS las páginas y solo al render hace `pages.slice(0, 1)`.
- `PaperCanvas` se suscribe al **store entero**, así que cualquier cambio re-renderiza las 5 miniaturas y los ocultos.
- Por instancia se repiten: medición DOM sin deps de efecto, `computeRenderedPages` en cada render + 2 efectos, `useLayoutRepaginate`, y un `POST /api/layout/pdf-export` **por instancia** (incluido el oculto, sin coalescer).

El costo es **O(n del documento) × instancias**. De ahí "tarda mucho" y, con documentos grandes, parece que "falla".

---

## 2. Restricciones (invariantes que NO se tocan)

- **Portada original protegida e indivisible:** `use_original_cover` jamás muta la portada del documento; `computePages` agrupa la portada en la página 1 sin partirla.
- **Fondo de la hoja intocable:** `--paper-white` es blanco puro y `--paper-ink` tinta nítida en ambos temas. Un oscurecimiento es una **capa (scrim) sobre** la hoja, nunca un cambio del papel.
- **Cada tarjeta renderiza el diseño REAL.** El esqueleto es el defecto (spec maestro §6.4); prohibido degradar a placeholders.
- **Cero emojis** (solo `lucide-react`, `strokeWidth="var(--icon-stroke)"`), **cero colores literales** (solo tokens), español sin CJK.
- **`PaperCanvas` sigue siendo el único paginador.** El Estudio no importa `computePages`/`computeRenderedPages`/`applyPageFlow`.
- **Cadena de alto intacta** (`height:100%`/`minHeight:0`) y `design-system.css` como fuente de tokens.
- No crear `vitest.config.ts`. `git add` archivo por archivo.

---

## 3. Diseño

### 3.1 Superficie: carrusel de centro fijo (coverflow)

- **Slot central inmóvil.** Un marco guía fijo (tokens, sin emoji) marca el centro del track. Las plantillas se deslizan hacia él; el marco no se mueve.
- **Posicionamiento por construcción.** Cada tarjeta: `position:absolute; left:50%` y
  `transform: translate(-50%, 0) translateX((i − indice) · paso) scale(escala)`.
  El centro **no depende** de `justify-content` ni del número de tarjetas. Elimina el "arranca de izquierda".
- **Jerarquía visual por distancia:**
  - Activa: `scale 1`, anillo `--accent-primary`, sombra, `z-index` máximo.
  - Vecinas (dist ≤ 2): escala intermedia (~0.55 / 0.42) con `perspective` + `rotateY` atenuado.
  - Receso: **scrim** con overlay `--canvas-bg` (opacidad por distancia), nunca `filter: brightness`.
- **Controles:** flechas izq/der (ya existen y se conservan), teclado (`←/→/Home/End`), arrastre con umbral. `prefers-reduced-motion` → sin transform, strip con `overflowX:auto`.
- El conteo de tarjetas y los testids existentes se conservan (`carrusel`, `cover-model-track`, `tarjetas`, `miniatura-<id>`, etc.).

### 3.2 Motor de preview: curar la causa, no el síntoma

1. **`onlyCover` que sí corta.** `computePages` gana el parámetro `firstPageOnly` (default `false`). Con `onlyCover=true`, `computeRenderedPages` devuelve solo la página 1. Es correcto porque `applyPageFlow` procesa cada página base de forma independiente.
2. **Quitar montajes ocultos.** Se elimina el `<PaperCanvas onlyCover>` de `paginador-de-portada` y el `<CarruselPortada>` oculto de la vista editor. La paginación de la portada sigue existiendo: la tarjeta `original` monta su propio `PaperCanvas onlyCover`.
3. **Miniatura liviana.** En modo `onlyCover`, `PaperCanvas` se salta la medición DOM (que solo sirve al flujo de edición) y llama `useLayoutRepaginate(null)` y `usePdfRestLayer(null)`; la miniatura no dispara paginado COM ni export PDF.
4. **Sin tocar la suscripción global del store** en este cambio (esa optimización es de otro alcance y de mayor riesgo).

### 3.3 Qué NO cambia

La portada original, el editor APA, `UNICoverPreview`, el resto del `PaperCanvas` en edición, y `rules` por documento.

---

## 4. Archivos afectados

| Archivo | Cambio |
|---|---|
| `src/components/wizard/portada/CarruselPortada.tsx` | Reescritura del track a posicionamiento absoluto; scrim por distancia; `perspective`/`rotateY`; conservar testids, teclado, arrastre y reduced-motion |
| `src/components/wizard/portada/MiniaturaRealDePortada.tsx` | Pasar flags para que `PaperCanvas onlyCover` sea liviano |
| `src/components/layout/PaperCanvas.tsx` | `onlyCover` corta el cálculo a página 1; gating de medición y de `useLayoutRepaginate`/`usePdfRestLayer` |
| `src/components/wizard/CoverCarouselStudio.tsx` | Quitar montajes ocultos (`paginador-de-portada`, carrusel oculto del editor) |
| `src/lib/pageSplitter.ts` | (Si aplica) soporte de `firstPageOnly` en `computePages` |
| `src/__tests__/carruselPortada.test.tsx` | Actualizar: la fila ya no se centra con `justify-content`; verificar offsets por tarjeta |
| `src/__tests__/coverStudioChrome.test.tsx` | Actualizar: ya no existe `paginador-de-portada` con canvas |

---

## 5. Estrategia de pruebas

- **Unitarias de superficie:** tarjeta activa en escala 1 / anillo; centro fijo; offsets simétricos por índice; scrim presente en no-activas; ningún `filter: brightness`.
- **Invariantes:** cada `[data-papel]` sigue `var(--paper-white)`; las 5 miniaturas siguen siendo diseños reales; la portada original no se muta.
- **Rendimiento (`onlyCover`):** con un documento grande, `onlyCover` no recorre el cuerpo (la página devuelta es solo la 1); no se dispara `POST /api/layout/pdf-export` desde miniaturas.
- **Accesibilidad/movimiento:** teclado, umbral de arrastre, `prefers-reduced-motion` → strip.
- Comandos: `npx vitest run`, `npx tsc --noEmit`, `npm run build`. Mutation testing a las aserciones nuevas.

---

## 6. Fuera de alcance

- Optimizar la suscripción global al store en `PaperCanvas` (mejora futura, riesgo mayor).
- Rediseño del editor APA o de `UNICoverPreview`.
- Persistencia/`rules` por documento.

---

## 7. Riesgo

**Bajo-medio.** La parte de rendimiento es aditiva (`firstPageOnly` con default `false`), no cambia el editor. La parte visual está confinada al carrusel. Los dos tests que se actualizan fijan el *mecanismo viejo*, no el comportamiento observable.
