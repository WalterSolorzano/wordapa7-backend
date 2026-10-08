/**
 * El cielo de Inicio no tiene personajes de dibujos.
 *
 * El usuario miró la pantalla de Inicio y dijo "se ve demasiado de niño". La
 * causa concreta está en `HomeHero.tsx`: `drawCartoonSun` le dibuja DOS OJOS y
 * una SONRISA al sol, y sus propios comentarios llaman "12 chunky spiky rays" a
 * doce púas gruesas de punta redonda. Al lado hay un ovni, un globo aerostático,
 * un avión de papel y un rayo. Eso no es un registro de cine: es un personaje.
 *
 * Estas pruebas miran la SALIDA, no los nombres de las funciones: una carita son
 * dos óvalos, y eso se puede comprobar sobre un contexto 2D falso. Renombrar
 * `drawCartoonSun` a `drawSolCinematico` no arregla nada por sí solo —por eso
 * el test falla contra el código viejo aunque la función se llame como se llame.
 *
 * Y hay dos trampas en esta clase de prueba, las dos pisadas al escribir esto:
 *
 *   1. Si `requestAnimationFrame` no ejecuta su callback, el bucle no corre, el
 *      cielo no se dibuja, no hay óvalos, y "el sol no tiene cara" PASA sobre
 *      una pantalla en blanco. Aquí el rAF se guarda en una lista y las pruebas
 *      lo avanzan a mano, más una guarda que falla si el bucle no arrancó.
 *   2. `getSlot(new Date().getHours())` decide qué se dibuja. Sin fijar la hora,
 *      la prueba pasa a las tres de la mañana (no hay sol) y falla a la una de la
 *      tarde. Acá la hora es mediodía, siempre.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import { HomeHero } from '../components/layout/HomeHero';

/**
 * Un contexto 2D falso que REGISTRA lo que se le pide dibujar. No dibuja nada:
 * solo anota, para que el test pueda afirmar sobre la geometría que el
 * componente produjo y no sobre su código fuente.
 *
 * Los registros se llaman distinto de los métodos a propósito: definir
 * `ellipse` dos veces en el mismo objeto hace que la segunda pise a la primera,
 * el array de registro desaparece, y el test falla con "expected [Function
 * ellipse]" en vez de decir qué dibujó de más.
 */
function ctxFalso() {
  const ellipseCalls: unknown[][] = [];
  const arcCalls: unknown[][] = [];
  const ctx = {
    ellipseCalls, arcCalls,
    save: vi.fn(), restore: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    beginPath: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
    fillRect: vi.fn(), clearRect: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(),
    arc: (...a: unknown[]) => { arcCalls.push(a); },
    ellipse: (...a: unknown[]) => { ellipseCalls.push(a); },
    createRadialGradient: () => ({ addColorStop: vi.fn() }),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
  };
  /* Los setters que el canvas real acepta y que el archivo usa. Un
     `defineProperty` por propiedad porque son de solo escritura. */
  for (const prop of [
    'fillStyle', 'strokeStyle', 'lineWidth', 'lineCap',
    'globalAlpha', 'globalCompositeOperation', 'font', 'textAlign',
  ]) {
    Object.defineProperty(ctx, prop, { set: vi.fn(), get: () => '' });
  }
  return ctx;
}

/** Los cuadros que el componente pidió, para correr el bucle a mano. */
let pendientes: FrameRequestCallback[] = [];

/** Corre exactamente un cuadro y no lo reprograma. */
function unCuadro(ts = 16) {
  const cb = pendientes.shift();
  if (!cb) {
    throw new Error('el componente no pidió ningún cuadro: el bucle no arrancó');
  }
  cb(ts);
}

let getContextSpy: ReturnType<typeof vi.fn>;
let raf: unknown;
let caf: unknown;
let matchMedia: unknown;

beforeEach(() => {
  getContextSpy = vi.fn(() => ctxFalso());
  HTMLCanvasElement.prototype.getContext = getContextSpy as never;

  raf = window.requestAnimationFrame;
  caf = window.cancelAnimationFrame;
  matchMedia = window.matchMedia;

  pendientes = [];
  /* Se asigna a `window` y no a `globalThis`: en el entorno jsdom de vitest no
     son el mismo objeto, y una referencia suelta a `requestAnimationFrame` en
     el componente resuelve contra `window`. Ponerlo en `globalThis` deja el
     mock sin instalar. */
  window.requestAnimationFrame = vi.fn((cb: FrameRequestCallback) => {
    pendientes.push(cb);
    return pendientes.length;
  }) as never;
  window.cancelAnimationFrame = vi.fn() as never;

  /* jsdom no implementa `matchMedia` y `HomeHero` la llama al montar. El
     componente necesita la guarda (Task 4) pero para poder probar el resto hay
     que dársela acá: sin esto el test falla por el environment y no por la carita
     que quiere comprobar. */
  window.matchMedia = vi.fn(() => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as never;

  /* La HORA, y `toFake: ['Date']` en vez de `useFakeTimers()` a secas, porque los
     fake timers REEMPLAZAN `requestAnimationFrame` por el suyo: como la llamada
     iba después de instalar el mock del bucle, se lo pisaba y el bucle no
     arrancaba nunca. Acá solo se quiere falsificar la FECHA. */
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-27T13:00:00'));
});

afterEach(() => {
  vi.useRealTimers();
  window.requestAnimationFrame = raf as never;
  window.cancelAnimationFrame = caf as never;
  window.matchMedia = matchMedia as never;
});

/** El contexto que el componente usó en su primer `getContext`. */
const ctxUsado = () =>
  getContextSpy.mock.results[0]?.value as ReturnType<typeof ctxFalso>;

describe('el sol de Inicio', () => {
  it('el bucle arranca: hay cuadros pedidos', () => {
    /* La guarda de vacuidad. Sin esto, un rAF que no ejecuta el callback deja
       todas las pruebas siguientes verdaderas por accidente: el cielo no se
       dibuja, no hay óvalos, y la de "no tiene cara" pasa sobre un cielo
       vacío. */
    render(<HomeHero />);
    expect(pendientes.length).toBeGreaterThan(0);
  });

  it('el cuadro dibuja el cielo de verdad, no una pantalla en blanco', () => {
    /* La otra mitad de la guarda: un cuadro tiene que PRODUCIR algo. Si esto
       pasara con una escena vacía, el "no tiene cara" de abajo no probaría
       nada: ausencia de óvalos en un dibujo que no tiene nada. */
    render(<HomeHero />);
    unCuadro();
    const c = ctxUsado();
    expect(c.arcCalls.length + c.ellipseCalls.length).toBeGreaterThan(3);
  });

  it('NO tiene cara: ni un solo óvalo', () => {
    /* Un sol con ojos y sonrisa es un personaje de dibujos animados. Es la
       razón por la que la pantalla se leía como de niño, y no es una cuestión
       de gusto: es un registro visual, y se cambia mirando lo que el canvas
       dibuja, no el nombre de la función. */
    render(<HomeHero />);
    unCuadro();
    expect(ctxUsado().ellipseCalls).toEqual([]);
  });

  it('el componente monta cuando `getContext` devuelve `null`', () => {
    /* `getContext` devuelve `null` cuando no hay aceleración o el navegador está
       en modo restringido. La persona igual tiene que poder entrar a Inicio y
       empezar a trabajar: la escena es decorativa y no puede tumbar la
       pantalla. */
    HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as never;
    expect(() => render(<HomeHero />)).not.toThrow();
  });
});
