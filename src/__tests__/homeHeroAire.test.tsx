/**
 * El hero de Inicio tiene aire, y no se cae si el entorno es pobre.
 *
 * DOS RECLAMOS DISTINTOS DEL USUARIO, Y NO SON EL MISMO:
 *
 *  - "hazlo mas grande tambien eso se ve demasiado pequeno" y "expande un poco
 *    ese contenedor". Eso es de TAMAÑO: el `padding` de seis píxeles con un
 *    cielo de doscientos de alto deja la frase pegada al borde, y el contenedor
 *    se lee como un recorte y no como una escena.
 *  - "que se vea mas cinematografico". Eso no lo arregla agrandar: es
 *    composición, y va en su propia tarea.
 *
 * Y UN DEFECTO REAL QUE NO ESTABA EN EL PLAN. El plan daba por hecho que
 * `prefers-reduced-motion` no existía, y sí: está en `HomeHero.tsx:1023`, dibuja
 * un cuadro y cancela el bucle. Lo que NO tiene es guarda, y
 * `window.matchMedia(...)` se llama sin preguntar si existe. Pasa en jsdom y
 * pasa en WebViews viejos: `matchMedia` no es una API con garantía, y una
 * pantalla decorativa no puede tirar abajo la de Inicio. Esa es la prueba que
 * importa acá, y es la que el plan se habia equivocado de escribir.
 *
 * La de `prefers-reduced-motion` que sí funciona queda como prueba de
 * caracterización, no de TDD: no está fallando nada y no la escribo como si
 * acotara un cambio. Un test que describe comportamiento existente es útil
 * —impide que alguien lo rompa sin darse cuenta— pero no es una prueba de que
 * yo escribí el código.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
/* `?raw` y no `node:fs`: el shim de `nodePolyfills()` de `vite.config.ts`
   deja `fs` sin `readFileSync`, así que leer del disco desde un test revienta
   en el import. */
import fuente from '../components/layout/HomeHero.tsx?raw';
import { HomeHero } from '../components/layout/HomeHero';

const num = (re: RegExp, grupo = 1): number => {
  const m = fuente.match(re);
  expect(m, `no encontré ${re} en el archivo`).toBeTruthy();
  return Number(m![grupo]);
};

/**
 * Los metodos de `CanvasRenderingContext2D` que `HomeHero.tsx` llama, en un solo
 * lugar. La lista vivia partida en los dos mocks del archivo y en los dos
 * faltaban cuatro, asi que el test tiraba al dibujar el primer cuadro.
 *
 * NO es un arreglo del componente: es un contexto falso que se habia quedado
 * corto. Lo que se vigila aca es que el bucle de animacion corra y se cancele,
 * no el dibujo.
 */
const METODOS_DE_CTX = {
  save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
  beginPath: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
  fillRect: vi.fn(), clearRect: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
  arc: vi.fn(), ellipse: vi.fn(), rect: vi.fn(), clip: vi.fn(),
  bezierCurveTo: vi.fn(), strokeRect: vi.fn(),
} as const;

/** Un contexto 2D que responde, para que el componente llegue al final. */
function ctxFalso() {
  const c = {
    /* Los metodos que `HomeHero.tsx` llama de verdad. La lista estaba
       incompleta: faltaban `rect`, `clip`, `bezierCurveTo` y `strokeRect`, y
       el componente los usa desde el commit que redibujo el cielo, asi que el
       mock tiraba `ctx.rect is not a function` al primer cuadro. No es un
       defecto del componente: es un contexto falso que ya no alcanzaba. */
    ...METODOS_DE_CTX,
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  };
  for (const prop of [
    'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap',
    'globalAlpha', 'globalCompositeOperation',
  ]) {
    Object.defineProperty(c, prop, { set: vi.fn(), get: () => '' });
  }
  return c;
}

describe('el hero tiene aire', () => {
  it('el padding vertical no es de seis píxeles', () => {
    /* El reclamo literal: "expande un poco ese contenedor". Seis píxeles arriba
       con el cielo detrás es un borde, no un marco.

       El regex toma los TRES valores del `padding` —arriba, laterales, abajo—
       y exige los dos verticales. Con dos valores (`'6px 0 18px'`) no hay
       lateral y el lateral sería 0, que es un caso distinto: el código ahora
       declara los tres. */
    const m = fuente.match(/padding:\s*'(\d+(?:\.\d+)?)px\s+\S+\s+(\d+(?:\.\d+)?)px'/);
    expect(m, "no encontré el padding del hero con sus tres valores").toBeTruthy();
    const arriba = Number(m![1]);
    const abajo = Number(m![2]);
    expect(arriba).toBeGreaterThanOrEqual(28);
    expect(abajo).toBeGreaterThanOrEqual(arriba - 1);
  });

  it('la frase es más grande que 36px', () => {
    /* "se ve demasiado pequeño". Treinta y seis píxeles es un titular de
       periódico, no una portada. Y agrandar el contenedor sin agrandar la
       frase deja más cielo y el mismo texto, que es un fondo vacío. */
    expect(num(/fontSize:\s*'(\d+(?:\.\d+)?)px',\s*\n?\s*fontWeight/)).toBeGreaterThanOrEqual(40);
  });

  it('la altura reservada sigue al `line-clamp`, con la tipografía nueva', () => {
    /* El `minHeight` fijo de 86px se eligió para 36px de cuerpo. Si la frase
       crece y el alto no, una frase de dos renglones se recorta en silencio y
       la persona cree que la app no cargó. El alto se deriva del clamp y de la
       tipografía, y se comprueba: si alguna vez alguien cambia uno, esta
       prueba obliga a cambiar el otro. */
    const renglones = num(/WebkitLineClamp:\s*(\d+)/);
    const cuerpo = num(/fontSize:\s*'(\d+(?:\.\d+)?)px',\s*\n?\s*fontWeight/);
    const interlineado = num(/lineHeight:\s*([\d.]+)/);
    const alto = num(/minHeight:\s*'(\d+)px'/);
    expect(alto).toBeGreaterThanOrEqual(renglones * cuerpo * interlineado);
  });
});

describe('el hero aguanta un entorno sin matchMedia', () => {
  let raf: unknown;
  let caf: unknown;
  let matchMedia: unknown;
  let getContext: unknown;

  beforeEach(() => {
    raf = window.requestAnimationFrame;
    caf = window.cancelAnimationFrame;
    matchMedia = window.matchMedia;
    getContext = HTMLCanvasElement.prototype.getContext;
    window.requestAnimationFrame = vi.fn(() => 0) as never;
    window.cancelAnimationFrame = vi.fn() as never;
    /* Un contexto QUE SIRVE, a propósito. Con `getContext` devolviendo `null`
       el componente corta en `if (!ctx) return;` y nunca llega a la línea de
       `matchMedia`: la prueba de "no se rompe sin matchMedia" pasaba sin
       tocar esa línea, y una prueba que pasa por un atajo no prueba la cosa que
       dice. El `getContext` en `null` tiene su propia prueba, en
       `homeHeroSol.test.tsx`. */
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctxFalso()) as never;
  });

  afterEach(() => {
    window.requestAnimationFrame = raf as never;
    window.cancelAnimationFrame = caf as never;
    window.matchMedia = matchMedia as never;
    HTMLCanvasElement.prototype.getContext = getContext as never;
  });

  it('monta cuando `matchMedia` NO existe', () => {
    /* El defecto real. `matchMedia` no tiene garantía de estar: no está en el
       jsdom de las pruebas y no está en WebViews viejos. La escena del cielo es
       decorativa, así que si la API falta lo correcto es dibujar el fondo y
       seguir, no romper la pantalla de Inicio — que es donde la persona decide
       si sube su tesis. */
    delete (window as { matchMedia?: unknown }).matchMedia;
    expect(() => render(<HomeHero />)).not.toThrow();
  });

  it('la consulta va envuelta en una guarda de existencia', () => {
    /* Y la guarda tiene que ser explícita, no un `?.` escondido: el
       `matchMedia` original era una llamada desnuda. */
    expect(fuente).toMatch(/typeof window\.matchMedia\s*===?\s*['"]function['"]/);
    expect(fuente).not.toMatch(/if \(window\.matchMedia\(/);
  });
});

describe('el movimiento reducido sigue funcionando (caracterización)', () => {
  it('dibuja un cuadro y cancela el bucle', () => {
    /* No es una prueba de TDD —esto ya estaba— sino una que impide que alguien
       rompa la accesibilidad sin enterarse. */
    const cancelado: number[] = [];
    let pendientes: FrameRequestCallback[] = [];
    const raf0 = window.requestAnimationFrame;
    const caf0 = window.cancelAnimationFrame;
    const mm0 = window.matchMedia;
    const gc0 = HTMLCanvasElement.prototype.getContext;

    window.matchMedia = vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })) as never;
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
      ...METODOS_DE_CTX,
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '',
      globalAlpha: 1, globalCompositeOperation: '',
    })) as never;
    window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
      pendientes.push(cb);
      return pendientes.length;
    }) as never;
    window.cancelAnimationFrame = vi.fn((h: number) => { cancelado.push(h); }) as never;

    const r = render(<HomeHero />);
    // Un cuadro: el callback pendiente se corre una vez.
    const cb = pendientes.shift();
    expect(cb).toBeTruthy();
    cb!(16);
    expect(cancelado.length).toBeGreaterThan(0);
    r.unmount();

    window.requestAnimationFrame = raf0 as never;
    window.cancelAnimationFrame = caf0 as never;
    window.matchMedia = mm0 as never;
    HTMLCanvasElement.prototype.getContext = gc0 as never;
  });
});
