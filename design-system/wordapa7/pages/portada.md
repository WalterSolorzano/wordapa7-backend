# Portada — overrides del maestro

Fase 1 del wizard (`Step1PortadaWizard` → `CoverCarouselStudio`). Manda sobre
`design-system/wordapa7/MASTER.md` para esta pantalla.

## Selector central FIJO

- **El selector no se mueve; se mueven las plantillas.** No hay marco que se
  corra ni fila que se desplace con `justify-content`. Cada tarjeta se posiciona
  absoluta con su borde izquierdo en el **50%** de la pista y se desplaza con
  `transform: translateX((i - indice) * paso)`. La activa cae en el centro **por
  construcción**, con cualquier número de tarjetas.
- Jerarquía por distancia: activa `scale(1)` + anillo `--color-accent` + sombra
  máxima + `z-index` máximo; vecinas `scale(~0.46)` y lejanas `scale(~0.30)` con
  `rotateY(16deg)` y perspectiva 1200px.
- **Receso = escala + velo.** Las no activas reciben un scrim con
  `background: var(--canvas-bg)` por distancia. **Nunca** `filter: brightness`:
  el papel se queda blanco puro (`AGENTS.md` §1).
- Controles: flechas laterales (fijas), teclado `←` `→` `Inicio` `Fin`, y
  arrastre con umbral de 48px. Con `prefers-reduced-motion` no hay `transform`
  ni transición: el carrusel se vuelve una tira con scroll y los mismos
  controles.

## Tamaño responsivo (sin tope fijo)

El ancho de la tarjeta activa es una **proporción del área real de la fase**,
medida con `ResizeObserver` sobre la caja de la fase (no sobre `window`):

- `porAlto = alto * 0.86 / 1.42` (A4 es la hoja más alargada que se dibuja).
- `porAncho = ancho * 0.55` (deja asomar las vecinas por los costados).
- `ancho = max(240, min(porAlto, porAncho))`.

**No hay tope de 360px.** Antes el ancho estaba acotado a 300–360px y en una
ventana grande la tarjeta quedaba rodeada por un desierto de fondo. El piso de
240px solo evita una miniatura inservible en ventanas chicas; no es un tope.
Fuente: `CoverCarouselStudio.tsx`. El alto de la fila lo deriva
`medidaDeLaMiniatura` (`MiniaturaRealDePortada.tsx`), no una cuenta aparte.

## Rendimiento (`onlyCover`)

- `onlyCover` corta `computePages` a la **página 1** y **no** dispara
  `POST /api/layout/pdf-export`.
- No hay `paginador-de-portada` ni un segundo `<CarruselPortada>` ocultos: el
  carrusel ES la vista previa de la tarjeta activa.
- `PaperCanvas` sigue siendo el único paginador; el Estudio no importa
  `computePages` / `computeRenderedPages` / `applyPageFlow`.

## Invariantes

- `use_original_cover: true` jamás muta la portada del documento.
- La portada original es **indivisible**: `computePages` la agrupa en la
  página 1.
- Cada tarjeta dibuja el diseño **real** a escala (misma pieza que el editor);
  un esqueleto sería el defecto, no la solución.
- Cero emojis; solo tokens; español sin CJK.
