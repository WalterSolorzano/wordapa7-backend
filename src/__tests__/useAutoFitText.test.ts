/**
 * WordAPA7 — T11: el parrafo de lectura se auto-ajusta, con piso duro.
   El usuario pidio que se adapte si es inmenso, pero no a costa de la
   legibilidad: 13px es el piso y ningun camino lo cruza.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { createElement } from 'react';
import { useAutoFitText, fitSize, MIN_FONT_PX, MAX_FONT_PX, MAX_LINES, lineHeightFor } from '../hooks/useAutoFitText';

/* jsdom no envuelve texto: clientHeight y scrollHeight son 0 en todos los
   elementos y ademas no dependen del cuerpo que se les aplique. La busqueda
   binaria vive justamente de esa realimentacion —poner un cuerpo, leer el alto
   que provoca, decidir— asi que el modelo de reflow no es un adorno del test:
   es la parte del motor de layout que hay que modelar. Se espia en
   Element.prototype, que es lo mas cerca del layout que jsdom permite. */
let resizeCb: (() => void) | null = null;
let resizeLlamadas = 0;
let rafCola: FrameRequestCallback[] = [];
let rafUltimoId = 0;
const rafCancelados: number[] = [];
let restaurar: Array<() => void> = [];
/** Alto que el texto ocuparia a 19px. Cambiarlo ES cambiar de parrafo. */
let altoA19 = 0;

function espiar(obj: object, prop: string, descriptor: PropertyDescriptor) {
  const previo = Object.getOwnPropertyDescriptor(obj, prop);
  Object.defineProperty(obj, prop, { configurable: true, ...descriptor });
  restaurar.push(() => {
    if (previo) Object.defineProperty(obj, prop, previo);
    else delete (obj as Record<string, unknown>)[prop];
  });
}

/** La caja, en px. */
function caja(alto: number) {
  espiar(Element.prototype, 'clientHeight', { get: () => alto });
}

/** Modelo de reflow: lo que a 19px ocupaba `altoA19` ocupa `ceil(altoA19·f/19)`
 *  a cuerpo f, como lo haria el navegador al envolver el mismo texto.
 *  Sin cuerpo aplicado caemos en MAX_FONT_PX, que es lo que haria el navegador
 *  con la hoja por defecto. */
function modeloDeReflow() {
  espiar(Element.prototype, 'scrollHeight', {
    get(this: Element) {
      const f = parseFloat((this as HTMLElement).style.fontSize);
      const cuerpo = Number.isFinite(f) && f > 0 ? f : MAX_FONT_PX;
      return Math.ceil(altoA19 * (cuerpo / MAX_FONT_PX));
    },
  });
}

/** Cambia el parrafo que hay que leer: uno de `lineas` lineas a cuerpo 19px. */
function parrafoDe(lineas: number) {
  altoA19 = Math.ceil(lineas * MAX_FONT_PX * lineHeightFor(MAX_FONT_PX));
}

/** La tarjeta real de Task 14: un contenedor medido que se pinta al tamano
 *  que el hook decidio. Sin JSX para poder vivir en un .test.ts. */
function Tarjeta({ id }: { id: string }) {
  const { containerRef, fontSize, lineHeight } = useAutoFitText(id);
  return createElement(
    'div',
    { ref: containerRef, 'data-testid': 'tarjeta' },
    createElement('span', { 'data-testid': 'salida' }, `${fontSize}|${lineHeight}`),
  );
}

function salida(): string {
  return document.querySelector('[data-testid="salida"]')!.textContent!;
}
function leerPx(): number {
  return Number(salida().split('|')[0]);
}
function tarjeta(): HTMLElement {
  return document.querySelector('[data-testid="tarjeta"]') as HTMLElement;
}

/** El cuerpo que quedo REALMENTE aplicado en el nodo, que es lo que el
 *  navegador esta pintando. Si el hook midiera a un cuerpo distinto del que
 *  aplica, estos dos valores discreparian. */
function cuerpoPintado(): number {
  return parseFloat(tarjeta().style.fontSize);
}

/** La propiedad de la spec 5.3, evaluada desde afuera del hook: al cuerpo que
 *  eligio, el texto cabe en la caja y en MAX_LINES lineas o menos. */
function propertyDeRelleno(f: number): boolean {
  const el = tarjeta();
  el.style.fontSize = `${f}px`;
  const altoTexto = el.scrollHeight;
  return altoTexto <= el.clientHeight && altoTexto / (f * lineHeightFor(f)) <= MAX_LINES;
}

beforeEach(() => {
  resizeCb = null;
  resizeLlamadas = 0;
  rafCola = [];
  rafUltimoId = 0;
  altoA19 = 0;
  rafCancelados.length = 0;
  restaurar = [];

  espiar(globalThis, 'ResizeObserver', { value: class {
    constructor(cb: () => void) {
      resizeCb = () => { resizeLlamadas++; cb(); };
    }
    observe() {}
    unobserve() {}
    disconnect() {}
  } });
  espiar(globalThis, 'requestAnimationFrame', { value: (cb: FrameRequestCallback) => {
    rafCola.push(cb);
    return ++rafUltimoId;
  } });
  espiar(globalThis, 'cancelAnimationFrame', { value: (id: number) => {
    rafCancelados.push(id);
  } });
});

afterEach(() => {
  // Al reves: el test 6 vuelve a espiar scrollHeight encima del espia anterior,
  // y restaurar en orden dejaria el espia nuevo puesto DESPUES del real —
  // contaminando los 41 archivos siguientes con un alto de 100000.
  [...restaurar].reverse().forEach((f) => f());
  restaurar = [];
  vi.useRealTimers();
});

describe('T11 — useAutoFitText', () => {
  it('los limites son 13 y 19, en ese orden', () => {
    expect(MIN_FONT_PX).toBe(13);
    expect(MAX_FONT_PX).toBe(19);
    expect(MAX_LINES).toBe(26);
  });

  it('el interlineado crece con el cuerpo, entre 1.75 y 1.85', () => {
    expect(lineHeightFor(13)).toBeGreaterThanOrEqual(1.75);
    expect(lineHeightFor(19)).toBeLessThanOrEqual(1.85);
    expect(lineHeightFor(13)).toBeGreaterThan(lineHeightFor(19));
  });

  it('arranca en el techo cuando el texto cabe holgado', () => {
    caja(2000);
    modeloDeReflow();
    parrafoDe(6);
    render(createElement(Tarjeta, { id: 'p1' }));
    expect(leerPx()).toBe(MAX_FONT_PX);
  });

  it('baja de tamano pero NUNCA del piso, con un texto enorme', () => {
    caja(300);
    modeloDeReflow();
    parrafoDe(60);
    render(createElement(Tarjeta, { id: 'p1' }));
    expect(leerPx()).toBe(MIN_FONT_PX);
    expect(leerPx()).toBeGreaterThanOrEqual(MIN_FONT_PX);
  });

  it('encuentra un cuerpo ESTRICTAMENTE entre los dos limites', () => {
    // 27 lineas a 19px en una caja de 800px: el techo no cabe por la caja ni
    // por el tope de lineas, y el piso sobra. La respuesta tiene que estar en
    // el interior, o el "auto-ajuste" no estaria ajustando nada.
    caja(800);
    modeloDeReflow();
    parrafoDe(27);
    render(createElement(Tarjeta, { id: 'p1' }));
    const px = leerPx();
    expect(px).toBeGreaterThan(MIN_FONT_PX);
    expect(px).toBeLessThan(MAX_FONT_PX);
  });

  it('el cuerpo que elige SI rellena: la propiedad se cumple, no se supone', () => {
    caja(800);
    modeloDeReflow();
    parrafoDe(27);
    render(createElement(Tarjeta, { id: 'p1' }));
    expect(propertyDeRelleno(leerPx())).toBe(true);
  });

  it('lo que midio es lo que quedo aplicado en el nodo', () => {
    caja(800);
    modeloDeReflow();
    parrafoDe(27);
    render(createElement(Tarjeta, { id: 'p1' }));
    expect(cuerpoPintado()).toBeCloseTo(leerPx(), 5);
  });

  it('nunca sale del rango, y rellena siempre que no se apoyo en el piso', () => {
    // Barrido de cajas y parrafos, con las dos cotas derivadas de las
    // constantes y no de numeros cocidos. La caja es "lo que ocupan MAX_LINES
    // lineas a 19px" por un factor, asi que cambiar MAX_LINES mueve el barrido
    // entero. Un 900 a pelo contra el umbral (26·33.25 = 864.5) se caeria al
    // return temprano en cuanto MAX_LINES cambiara, y el techo se quedaria sin
    // ninguna prueba que pueda fallar.
    const lineaA19 = MAX_FONT_PX * lineHeightFor(MAX_FONT_PX);
    const cajaDeMaxLines = MAX_LINES * lineaA19;
    for (const factor of [0.15, 0.35, 1, 2.3]) {
      const alto = Math.round(cajaDeMaxLines * factor);
      for (const lineas of [1, 10, MAX_LINES, MAX_LINES + 1, 60, 200]) {
        caja(alto);
        modeloDeReflow();
        parrafoDe(lineas);
        const el = document.createElement('div');
        const px = fitSize(el);
        expect(px).toBeGreaterThanOrEqual(MIN_FONT_PX);
        expect(px).toBeLessThanOrEqual(MAX_FONT_PX);
        // Lo que se midio es lo que quedo: en todos los escenarios, y no solo
        // en el afortunado en que la ultima candidata resultara aceptada.
        expect(parseFloat(el.style.fontSize)).toBeCloseTo(px, 5);
        // Solo se exige rellenar cuando no estamos en el piso: en el piso, o
        // cabe, o la tarjeta scrollea y las dos son legales (spec 5.3).
        if (px > MIN_FONT_PX) {
          el.style.fontSize = `${px}px`;
          const h = el.scrollHeight;
          expect(h <= el.clientHeight).toBe(true);
          expect(h / (px * lineHeightFor(px))).toBeLessThanOrEqual(MAX_LINES);
        }
      }
    }
  });

  it('el interlineado que acompaña al tamano elegido viene del mismo cuerpo', () => {
    caja(800);
    modeloDeReflow();
    parrafoDe(27);
    render(createElement(Tarjeta, { id: 'p1' }));
    const [px, lh] = salida().split('|');
    expect(Number(lh)).toBeCloseTo(lineHeightFor(Number(px)), 10);
  });

  it('al cambiar de parrafo re-mide, y no por un resize que no ocurrio', () => {
    caja(800);
    modeloDeReflow();
    parrafoDe(60);
    const { rerender } = render(createElement(Tarjeta, { id: 'p1' }));
    expect(leerPx()).toBe(MIN_FONT_PX);

    // El parrafo siguiente es mucho mas corto y la caja no cambia ni un px: en
    // el navegador esto NO dispara el ResizeObserver, porque el borde y la caja
    // de contenido son los mismos. Si el tamano se moviese aqui, seria porque
    // lo disparo la clave del contenido, que es lo que tiene que pasar.
    parrafoDe(4);
    expect(resizeLlamadas).toBe(0);
    rerender(createElement(Tarjeta, { id: 'p2' }));
    expect(resizeLlamadas).toBe(0);
    expect(leerPx()).toBe(MAX_FONT_PX);
  });

  it('el ResizeObserver sigue siendo la via cuando cambia la caja', () => {
    // Caja de 600px con 27 lineas a 19px: no cabe ni a 13px, asi que aqui el
    // limite que aprieta es la CAJA, no el tope de lineas. Por eso al agrandarla
    // el cuerpo tiene que subir: es el caso donde el auto-ajuste tiene algo que
    // resolver. (Con una caja que ya da para 26 lineas, el tope de lineas manda
    // y crecer la caja no moviera nada — que es justo por lo que aqui se
    // empieza en 600 y no en 800.)
    caja(600);
    modeloDeReflow();
    parrafoDe(27);
    render(createElement(Tarjeta, { id: 'p1' }));
    const antes = leerPx();
    expect(antes).toBe(MIN_FONT_PX);

    espiar(Element.prototype, 'clientHeight', { get: () => 2000 });
    act(() => {
      resizeCb?.();
      rafCola.splice(0).forEach((cb) => cb(0));
    });
    expect(resizeLlamadas).toBe(1);
    expect(leerPx()).toBeGreaterThan(antes);
  });

  it('al desmontar, cancela el frame pendiente en vez de medir un arbol muerto', () => {
    caja(800);
    modeloDeReflow();
    parrafoDe(60);
    const { unmount } = render(createElement(Tarjeta, { id: 'p1' }));
    act(() => { resizeCb?.(); });
    expect(rafCola).toHaveLength(1);
    unmount();
    expect(rafCancelados).toEqual([rafUltimoId]);
  });
});
