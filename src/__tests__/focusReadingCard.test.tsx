/**
 * WordAPA7 - T14: la tarjeta de lectura es el centro de la vista de Revision.
 *   Un parrafo, su seccion, su pagina y los resaltados.
 *
 *   Tres cosas que este archivo no deja pasar por alto, porque las tres son
 *   silenciosas: un parrafo que hereda el cuerpo del anterior, una caja cuyo
 *   auto-ajuste no significa nada, y un texto que se pierde por el camino.
 */
import React from 'react';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { FocusReadingCard } from '../components/review/FocusReadingCard';
import type { AuditItem } from '../hooks/useReviewWorkbench';
import type { ElementModel, ProofreadFinding } from '../types';
import { MAX_FONT_PX, MIN_FONT_PX, lineHeightFor } from '../hooks/useAutoFitText';

/* TEXTO va sin acentos a proposito: es el defecto que la tarjeta tiene que
   dejar ver, no un error del test. */
const TEXTO = 'El disenio no fue tan crivido como se esperaba.';
/* Este si lleva acentos: es el texto que se compara caracter a caracter al
   final, y es donde un acento perdido se nota. */
const PASA = 'La metodología fue rigurosa según el análisis, según la muestra.';

const item = (over: Partial<AuditItem> = {}): AuditItem => ({
  id: 'h1', element_id: 'e1', category: 'spelling', subtype: 'ortografia',
  severity: 'medium', summary: 'Ortografía', detail: 'Falta tilde',
  originalText: TEXTO,
  pageNumber: 14, phase: null, readOnly: false, ...over,
});

const elemento = (over: Partial<ElementModel> = {}): ElementModel => ({
  id: 'e1', type: 'paragraph', text: PASA, style_name: 'Normal', alignment: 'left',
  font_name: 'Times New Roman', font_size: 12, is_bold: false, is_italic: false,
  is_bullet: false, left_indent_cm: 0, confidence: 1, is_user_modified: false,
  needs_review: false, auto_applied: false, cita_ids: [], ...over,
});

/* 'fue' arranca en 15 y acaba en 18: el rango del corrector cae sobre el
   fragmento real, no sobre el texto del hallazgo. */
const corrector = (over: Partial<ProofreadFinding> = {}): ProofreadFinding => ({
  element_id: 'e1', start: 15, end: 18, excerpt: '…metodología fue…',
  kind: 'passive_voice', severity: 'info', message: 'voz pasiva: usar activa',
  source: 'local', ...over,
});

const store = (extra: Record<string, unknown> = {}) => {
  useDocStore.setState({
    doc: null, reviewResult: null, proofreadFindings: [], citationAuditResult: null,
    validationIssues: [], sugerenciasProactivas: true, dismissedCommentIds: [],
    ...extra,
  } as never);
};

const documento = (elements: unknown[]) => ({
  session_id: 's1', file_name: 't.docx', apa_format: 'student',
  referencias: [], meta: { page_count: 1 }, elements,
});

/* El revisor ya corrio: es lo que habilita el comentario de redaccion
   (`styleAuditRun`) y, con el, el subrayado que se esta comprobando. */
const revisionDe = (text: string) => ({
  session_id: 's1', total_paragraphs: 1, ai_avg_score: 0.1, flagged_count: 0,
  spelling_count: 0, spelling_status: 'ok', table_signals: [], document_signals: [],
  paragraphs: [{ element_id: 'e1', index: 0, type: 'paragraph', text, ai_score: 0.1, ai_category: 'LOW', findings: [], spelling: [] }],
});

const montar = (props: Partial<React.ComponentProps<typeof FocusReadingCard>> = {}) =>
  render(<FocusReadingCard item={item()} totalFindings={3} {...props} />);

/** La caja del parrafo: unica, y buscada por estructura, no por un atributo
 *  que solo existiria para el test. */
const cuerpo = (container: HTMLElement): HTMLElement =>
  container.querySelector('section[aria-label="Párrafo en revisión"] > div') as HTMLElement;

/* ── Modelo de layout ──────────────────────────────────────────────────────
   jsdom no envuelve texto: clientHeight y scrollHeight son 0 y no dependen del
   cuerpo. El auto-ajuste vive justamente de esa realimentacion, asi que el
   modelo de reflow no es un adorno del test: es lo que permite observar que
   la caja decide. Mismo modelo que usa el test de T11. */
let resizeLlamadas = 0;
let resizeCb: (() => void) | null = null;
let altoA19 = 0;
let restaurar: Array<() => void> = [];

/** Registra el callback del ResizeObserver SIN dispararlo, y el navegador
 *  tampoco lo dispararia al cambiar de parrafo: por eso `resizeLlamadas` tiene
 *  que quedarse en 0 y, si se mueve, es que algo lo fired sin motivo. Cuenta
 *  NOTIFICACIONES, no construcciones: construir el observer no es redimensionar
 *  la caja. */
function espiar(obj: object, prop: string, descriptor: PropertyDescriptor) {
  const previo = Object.getOwnPropertyDescriptor(obj, prop);
  Object.defineProperty(obj, prop, { configurable: true, ...descriptor });
  restaurar.push(() => {
    if (previo) Object.defineProperty(obj, prop, previo);
    else delete (obj as Record<string, unknown>)[prop];
  });
}

/** Modelo de reflow: lo que a 19px ocupaba `altoA19` ocupa `ceil(altoA19·f/19)`
 *  a cuerpo f, como lo haria el navegador al envolver el mismo texto. */
function modeloDeLayout(alto: number) {
  espiar(Element.prototype, 'clientHeight', { get: () => alto });
  espiar(Element.prototype, 'scrollHeight', {
    get(this: Element) {
      const f = parseFloat((this as HTMLElement).style.fontSize);
      const tam = Number.isFinite(f) && f > 0 ? f : MAX_FONT_PX;
      return Math.ceil(altoA19 * (tam / MAX_FONT_PX));
    },
  });
}

/** Alto que el parrafo ocuparia a 19px, en lineas de cuerpo maximo. */
const parrafoDe = (lineas: number) => {
  altoA19 = Math.ceil(lineas * MAX_FONT_PX * lineHeightFor(MAX_FONT_PX));
};

const cuerpoPx = (el: HTMLElement): number => parseFloat(el.style.fontSize);

beforeEach(() => {
  resizeLlamadas = 0;
  resizeCb = null;
  altoA19 = 0;
  restaurar = [];
  espiar(globalThis, 'ResizeObserver', { value: class {
    // `resizeCb` queda guardado y NADIE lo dispara en este archivo: el punto es
    // que el observer no sea la via de la re-medicion al cambiar de parrafo.
    constructor(cb: () => void) { resizeCb = () => { resizeLlamadas += 1; cb(); }; }
    observe() {}
    unobserve() {}
    disconnect() {}
  } });
  espiar(globalThis, 'requestAnimationFrame', { value: (cb: FrameRequestCallback) => { cb(0); return 1; } });
  espiar(globalThis, 'cancelAnimationFrame', { value: () => {} });
  // Por defecto: caja holgada y parrafo corto, o sea el techo del auto-ajuste.
  parrafoDe(4);
  modeloDeLayout(2000);
  store();
});

afterEach(() => {
  [...restaurar].reverse().forEach((f) => f());
  restaurar = [];
});

/* Specifier en variable + import dinamico: si Vite puede analizarlos los pasa
   por vite-plugin-node-polyfills, cuyos shims de browser no traen readFileSync
   (mismo truco que designTokens.test.ts y readingText.test.tsx). */
const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';
let SRC = '';
let CSS = '';
beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  SRC = readFileSync(resolve(testDir, '../components/review/FocusReadingCard.tsx'), 'utf8');
  CSS = readFileSync(resolve(testDir, '../styles/design-system.css'), 'utf8');
});

describe('T14 - FocusReadingCard', () => {
  it('muestra la pagina del hallazgo en el encabezado', () => {
    montar();
    expect(screen.getByText(/14/)).toBeTruthy();
  });

  it('el encabezado nombra la seccion, o sea el motor del hallazgo', () => {
    montar({ item: item({ category: 'citations' }) });
    // El motor vive en `category` y el titulo de usuario en `ENGINE_META`: la
    // tarjeta no puede inventar su propia etiqueta.
    expect(screen.getByText(/Citas · Página 14/)).toBeTruthy();
    expect(montar({ item: item({ category: 'spelling' }) }).getByText(/Ortografía · Página 14/)).toBeTruthy();
  });

  it('declara cuantos hallazgos hay en el bloque', () => {
    montar();
    expect(screen.getByText(/3 hallazgos en este bloque/)).toBeTruthy();
  });

  it('pinta la fase activa como contexto, y no la inventa si no llega', () => {
    // La fase la aporta el hook (`allPhases`); la tarjeta solo la muestra. Sin
    // fase activa, la línea no existe: no se inventa un rótulo.
    const { unmount } = montar({ phaseLabel: 'Metodo' });
    expect(screen.getByTestId('review-phase-context').textContent).toBe('Metodo');
    unmount();
    montar();
    expect(screen.queryByTestId('review-phase-context')).toBeNull();
  });

  it('un solo hallazgo no se declara en plural', () => {
    montar({ totalFindings: 1 });
    expect(screen.getByText(/1 hallazgo en este bloque/)).toBeTruthy();
  });

  it('sin seleccion, no monta un parrafo vacio: dice que no hay seleccion', () => {
    montar({ item: null });
    expect(screen.queryByText(new RegExp(TEXTO.slice(0, 10)))).toBeNull();
    expect(screen.getByText(/Sin hallazgo seleccionado/)).toBeTruthy();
    /* Y el encabezado no inventa una página para un hallazgo que no existe. La
       línea de contexto era `pagina = 'Sin selección'` cuando `item` es null: un
       rótulo inventado ocupando el lugar exacto donde, con algo seleccionado, va
       un dato. Ahora la línea NO se renderiza, y esto mira las dos mitades: que
       no esté el rótulo viejo, y que tampoco haya quedado un hueco vacío con la
       misma forma. */
    expect(screen.queryByText(/Sin selección/)).toBeNull();
    expect(screen.queryByText(/Sin página asignada/)).toBeNull();
    expect(screen.queryByText(/de la revisión/)).toBeNull();
  });

  it('un hallazgo sin texto no deja una caja en blanco', () => {
    // El elemento puede haber desaparecido del documento: el hallazgo sobrevive
    // en la lista y su `originalText` llega vacio. Un parrafo vacio seria un
    // hueco sin explicacion.
    montar({ item: item({ originalText: '' }) });
    expect(screen.getByText(/ya no está en el documento/)).toBeTruthy();
  });

  it('sin numero de pagina real, no inventa ninguno', () => {
    montar({ item: item({ pageNumber: null }) });
    expect(screen.getByText(/Sin página asignada/)).toBeTruthy();
    expect(screen.queryByText(/Página 0/)).toBeNull();
  });

  it('el parrafo conserva su texto integro tras el resaltado', () => {
    // Elemento a elemento, no "contiene": un mark que se comiera un caracter o
    // un acento caeria en `toContain` y pasaria el test.
    store({
      doc: documento([elemento()]),
      proofreadFindings: [corrector()],
    });
    const { container } = montar({ item: item({ originalText: PASA }) });
    const caja = cuerpo(container);
    const nodos = Array.from(caja.querySelectorAll('span, mark'));
    expect(nodos.length).toBeGreaterThan(1);
    expect(nodos.map((n) => n.textContent).join('')).toBe(PASA);
    // Los acentos siguen donde estaban escritos.
    expect(caja.textContent).toContain('metodología');
    expect(caja.textContent).toContain('análisis');
  });

  it('el texto resaltado sale de ReadingText, con sus tokens', () => {
    store({
      doc: documento([elemento()]),
      proofreadFindings: [corrector()],
    });
    const { container } = montar({ item: item({ originalText: PASA }) });
    const mark = cuerpo(container).querySelector('mark');
    expect(mark).toBeTruthy();
    expect(mark!.textContent).toBe('fue');
    // El color lo pone MARK_STYLE, no la tarjeta: ningun hex, ningun rgba.
    expect(mark!.getAttribute('style')).toContain('var(--');
  });

  it('el comentario del gutter se subraya en la tarjeta', () => {
    // El otro canal (la burbuja) ya anuncia este hallazgo: si la tarjeta no lo
    // subraya, el mismo defecto aparece dos veces en dos formatos.
    const texto = 'En conclusión, el método es válido.';
    store({ doc: documento([elemento({ text: texto })]), reviewResult: revisionDe(texto) });
    const { container } = montar({ item: item({ originalText: texto }) });
    const mark = cuerpo(container).querySelector('mark');
    expect(mark).toBeTruthy();
    expect(mark!.textContent!.toLowerCase()).toBe('en conclusión');
  });

  it('un comentario descartado no deja subrayado huerfano', () => {
    // Los dos canales tienen que coincidir: si el gutter descarta la burbuja,
    // la tarjeta no puede seguir subrayando.
    const texto = 'En conclusión, el método es válido.';
    store({
      doc: documento([elemento({ text: texto })]),
      reviewResult: revisionDe(texto),
      dismissedCommentIds: ['e1'],
    });
    const { container } = montar({ item: item({ originalText: texto }) });
    expect(cuerpo(container).querySelector('mark')).toBeNull();
  });

  it('ninguna cadena de la tarjeta lleva emojis', () => {
    const { container } = montar();
    expect(container.textContent || '').not.toMatch(/\p{Extended_Pictographic}/u);
  });
});

describe('T14 - el auto-ajuste tiene que significar algo', () => {
  it('la caja del parrafo es un contenedor de scroll acotado', () => {
    // Sin tope de altura, `scrollHeight <= clientHeight` se cumple siempre y el
    // ajuste se reduce a "cabe en 26 lineas": todo parrafo largo se encoge sin
    // motivo visual. `overflowY: auto` + `minHeight: 0` es lo que le da sentido.
    const { container } = montar();
    const caja = cuerpo(container);
    expect(caja.style.overflowY).toBe('auto');
    expect(Number.parseFloat(caja.style.minHeight || 'NaN')).toBe(0);
  });

  it('al cambiar de parrafo, el cuerpo se vuelve a medir sin que la caja cambie', () => {
    // El alto de la caja no se mueve al cambiar de parrafo, asi que en el
    // navegador esto NO dispara el ResizeObserver. Si el cuerpo no se moviera,
    // seria porque no se esta midiendo: el parrafo nuevo heredaria el del
    // anterior, que es el defecto que pasa inadvertido.
    modeloDeLayout(800);
    parrafoDe(60);
    // El alto lo impone el modelo, no el texto: `larga` solo tiene que ser de
    // verdad largo, para que el DOM que se monta se parezca al que se mide.
    const larga = 'palabra '.repeat(400);
    const { container, rerender } = montar({ item: item({ id: 'larga', originalText: larga }), totalFindings: 1 });
    expect(cuerpoPx(cuerpo(container))).toBeCloseTo(MIN_FONT_PX, 5);

    parrafoDe(4);
    expect(resizeLlamadas).toBe(0);
    rerender(<FocusReadingCard item={item({ id: 'corta', originalText: 'Parrafo corto.' })} totalFindings={1} />);
    expect(resizeLlamadas).toBe(0);
    expect(cuerpoPx(cuerpo(container))).toBeCloseTo(MAX_FONT_PX, 5);
  });

  it('el interlineado que se aplica viene del cuerpo que se eligio', () => {
    const { container } = montar();
    const caja = cuerpo(container);
    const px = cuerpoPx(caja);
    expect(px).toBeGreaterThanOrEqual(MIN_FONT_PX);
    expect(px).toBeLessThanOrEqual(MAX_FONT_PX);
    expect(Number.parseFloat(caja.style.lineHeight)).toBeCloseTo(lineHeightFor(px), 5);
  });
});

describe('T14 - tokens', () => {
  it('no contiene hex literales', () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it('no le pone fallback a ningun token', () => {
    // `var(--x, 8px)` esconde un token mal escrito detras de un valor que
    // funciona: el error no se ve, y el dia que el token exista, el valor
    // equivocado se queda callado. Un token que existe no lleva fallback.
    expect(SRC).not.toMatch(/var\(\s*--[a-z0-9-]+\s*,/i);
  });

  it('cada token que usa esta definido en design-system.css', () => {
    const usados = new Set<string>();
    for (const m of SRC.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) usados.add(m[1]);
    expect(usados.size).toBeGreaterThan(0);
    for (const token of usados) {
      expect(CSS, `${token} no esta definido`).toMatch(new RegExp(`${token}\\s*:`));
    }
  });

  it('no usa radios literales', () => {
    const radios = Array.from(SRC.matchAll(/borderRadius:\s*'([^']+)'/g)).map((m) => m[1]);
    expect(radios.length).toBeGreaterThan(0);
    for (const r of radios) expect(r).toMatch(/^var\(--radius-/);
  });
});

describe('T14 - la barra de acciones del hallazgo', () => {
  beforeEach(() => store({ doc: documento([elemento()]) }));

  it('un hallazgo objetivo con sugerencia ofrece Aceptar y lo aplica', () => {
    const onAccept = vi.fn();
    montar({ item: item({ suggestedText: 'El diseño no fue tan vivido.' }), action: 'accept', onAccept });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar' }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('con mas de un hallazgo del subtipo ofrece Aceptar todas', () => {
    const onAcceptAll = vi.fn();
    montar({ item: item({ suggestedText: 'x' }), action: 'accept', onAccept: vi.fn(), onAcceptAll, bulkCount: 4 });
    fireEvent.click(screen.getByRole('button', { name: 'Aceptar todas' }));
    expect(onAcceptAll).toHaveBeenCalledTimes(1);
  });

  it('el motor probabilistico solo marca: no ofrece Aceptar', () => {
    const onMark = vi.fn();
    montar({ item: item({ category: 'ai', subtype: 'parrafo_ia' }), action: 'mark', onMark });
    expect(screen.queryByRole('button', { name: /^Aceptar/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Marcar para revisar' }));
    expect(onMark).toHaveBeenCalledTimes(1);
  });

  it('la portada de solo lectura no ofrece Aceptar, pero si Descartar', () => {
    montar({
      item: item({ readOnly: true, category: 'structure', subtype: 'portada' }),
      action: 'none',
      onAccept: vi.fn(),
      onDismiss: vi.fn(),
    });
    expect(screen.queryByRole('button', { name: /^Aceptar/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Descartar' })).toBeTruthy();
  });

  it('sin props de accion la tarjeta solo lee: no pinta la barra', () => {
    montar({ item: item() });
    expect(screen.queryByRole('button', { name: 'Descartar' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Aceptar/ })).toBeNull();
  });

  it('los mecanismos de documento ofrecen su propio rotulo, no Aceptar', () => {
    const onEngineAction = vi.fn();
    montar({
      item: item({ category: 'structure', subtype: 'figura' }),
      action: 'autoCaption',
      onEngineAction,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Rotular todo' }));
    expect(onEngineAction).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /^Aceptar/ })).toBeNull();
  });
});
