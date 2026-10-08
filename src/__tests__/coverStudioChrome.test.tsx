/**
 * WordAPA7 — T18 (revisado): la portada se ELIGE en el carrusel y se EDITA a la
 * derecha, en 320px.
 *
 * LA TIRA DE ESTRATEGIAS YA NO EXISTE. Era una barra de 44px con un chip de texto
 * por estrategia y el botón "Usar este diseño y Continuar", y encima se montaba
 * SIEMPRE (recibía `visible` y lo ignoraba). Repetía las cinco opciones que cada
 * tarjeta ya dibuja con su miniatura REAL, y su único aporte propio —el nombre de
 * la plantilla cargada y el aviso de un `cover_mode` que la app no reconoce— es
 * honestidad, no decoración: sobrevive, reubicado donde el usuario lo necesita.
 *
 * Lo que este archivo protege, en orden:
 *
 *  1. Hay UNA sola superficie de elección: el carrusel. No queda ningún grupo de
 *     chips de estrategia, ni el botón de salida duplicado de la tira.
 *  2. Honestidad: un `cover_mode` que la app no reconoce se DICE (y no se
 *     disfraza de APA 7), y la plantilla cargada se nombra.
 *  3. El editor de 320px es `CoverEditorPanel` de verdad, es la última zona, y la
 *     salida del paso vive ahí ("Continuar a Estructura").
 *  4. La cadena de alto sigue declarada (raíz y fila con `height: 100%` y
 *     `minHeight: 0`): sin ella el editor crece, su cuerpo nunca se desplaza y
 *     `Step1PortadaWizard` recorta la salida del paso. OJO: son DECLARACIONES;
 *     jsdom no calcula layout.
 *  5. La portada sigue siendo INDIVISIBLE: este componente no pagina ni vuelve a
 *     medir la hoja (`PaperCanvas` es el único paginador).
 *  6. El chrome usa tokens declarados y no lleva emojis.
 *
 * `PaperCanvas` va simulado: no hace falta la hoja real para probar el chrome, y
 * medirse a sí mismo en jsdom no significa nada.
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { defaultPortada } from '../store/slices/coverSlice';
import { CoverCarouselStudio } from '../components/wizard/CoverCarouselStudio';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));

vi.mock('../components/layout/PaperCanvas', () => ({
  PaperCanvas: () => <div data-testid="canvas" />,
}));

/* ── Utilidades ───────────────────────────────────────────────────────────── */

const portada = (over: Record<string, unknown> = {}) => {
  useDocStore.setState({
    portada: { ...defaultPortada, ...over },
    doc: null,
    wizardStep: 1,
  } as never);
};

const estado = () => useDocStore.getState().portada as unknown as Record<string, unknown>;

/** La única superficie de elección. */
const pista = (): HTMLElement => screen.getByTestId('cover-model-track');

/** Las CINCO estrategias reales, con el rótulo que las nombra. */
const ESTRATEGIAS = [
  'Conservar original',
  'APA 7 Estándar',
  'Institucional UNI',
  'Profesional APA',
  '+ Subir plantilla',
];

/* ── Lectura del archivo ──────────────────────────────────────────────────── */

let SRC = '';
let CHROME = '';
let declarados = new Set<string>();
/** Lo que se busca es un color en un ESTILO, no en un comentario. */
const codigo = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

beforeAll(async () => {
  // Las flechas del carrusel llaman a scrollBy, que jsdom no trae.
  if (!Element.prototype.scrollBy) {
    Element.prototype.scrollBy = function () {};
  }
  /* El nombre va en una variable: con el literal, `nodePolyfills()` de vite lo
     resuelve a su propio shim y `readFileSync` no existe. */
  const NODE_FS = 'node:fs';
  const NODE_PATH = 'node:path';
  const NODE_URL = 'node:url';
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  SRC = readFileSync(resolve(testDir, '../components/wizard/CoverCarouselStudio.tsx'), 'utf8');
  const css = readFileSync(resolve(testDir, '../styles/design-system.css'), 'utf8');
  declarados = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

  /* El chrome es el archivo ENTERO. Antes había que recortarlo hasta `COVER_CARDS`
     porque la tira era la única zona nueva; con la tira fuera, cada declaración
     del archivo es "chrome nuevo" y la guarda mira todo (los comentarios los
     quita `codigo`). */
  CHROME = SRC;
});

/* ── Una sola superficie de elección ──────────────────────────────────────── */

describe('T18 — una sola superficie de elección: el carrusel', () => {
  it('no queda ninguna tira de estrategias', () => {
    /* El defecto reportado: la tira de chips arriba repetía en texto lo que el
       carrusel ya dibuja con su miniatura. Ni el grupo de chips ni el botón
       "Usar este diseño y Continuar" vuelven. */
    portada();
    render(<CoverCarouselStudio />);
    expect(screen.queryByRole('group', { name: 'Estrategias de portada' })).toBeNull();
    expect(screen.queryByText(/Usar este diseño/i)).toBeNull();
  });

  it('las cinco estrategias se ofrecen una vez, como tarjetas del carrusel', () => {
    portada();
    render(<CoverCarouselStudio />);
    // Una tarjeta por estrategia, con el rótulo que la nombra. Si el carrusel
    // creciera a una estrategia sin tarjeta, ese modo no se podría elegir.
    expect(within(pista()).getAllByRole('button')).toHaveLength(ESTRATEGIAS.length);
    for (const titulo of ESTRATEGIAS) {
      expect(within(pista()).getByText(titulo, { selector: 'span' })).toBeTruthy();
    }
  });

  it('elegir una tarjeta escribe el modo en el documento', () => {
    portada();
    render(<CoverCarouselStudio />);
    fireEvent.click(within(pista()).getByRole('button', { name: /Profesional APA/ }));
    expect(estado().cover_mode).toBe('apa_pro');
    expect(estado().use_original_cover).toBe(false);
  });

  it('la tarjeta de plantilla es una acción y no elige un modo', () => {
    // "+ Subir plantilla" no es un modo más: abre el selector de archivos. Si se
    // tratara como los demás pondría `cover_template_id` sin que haya una
    // plantilla detrás, y el documento declararía una portada que no existe.
    portada();
    const abierto = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    render(<CoverCarouselStudio />);
    fireEvent.click(within(pista()).getByRole('button', { name: /Subir plantilla/ }));
    expect(abierto).toHaveBeenCalled();
    expect(estado().cover_template_id).toBeUndefined();
    abierto.mockRestore();
  });

  it('la tarjeta de plantilla no se anuncia como interruptor, y las otras cuatro sí', () => {
    /* Un `aria-pressed` sobre una acción: el lector de pantalla anuncia "botón,
       no presionado" y lo que hace es abrir un diálogo de archivos. */
    portada();
    render(<CoverCarouselStudio />);
    const subir = within(pista()).getByRole('button', { name: /Subir plantilla/ });
    expect(subir.hasAttribute('aria-pressed')).toBe(false);
    for (const modo of ['Conservar original', 'APA 7 Estándar', 'Institucional UNI', 'Profesional APA']) {
      expect(within(pista()).getByRole('button', { name: new RegExp(modo) }).hasAttribute('aria-pressed')).toBe(true);
    }
  });

  it('el carrusel se alcanza y se elige con el teclado', () => {
    // Una tarjeta que solo responde al clic es un modo que no se puede elegir sin
    // ratón. Las tarjetas son `<button>` de verdad: enfocables, con Enter y
    // Espacio del navegador y sin `tabindex` manual.
    portada();
    render(<CoverCarouselStudio />);
    const tarjetas = within(pista()).getAllByRole('button');
    for (const t of tarjetas) {
      expect(t.tagName).toBe('BUTTON');
      expect(t.getAttribute('tabindex')).toBeNull();
    }
    const uni = within(pista()).getByRole('button', { name: /Institucional UNI/ });
    uni.focus();
    expect(document.activeElement).toBe(uni);
    fireEvent.click(uni);
    expect(estado().cover_mode).toBe('generate_uni_cover');
  });
});

/* ── Honestidad del modo de portada ───────────────────────────────────────── */

describe('T18 — honestidad del modo de portada', () => {
  it('la plantilla cargada se nombra en la vista previa del editor', () => {
    /* Sin esto, quien sube un .docx ve la misma vista de siempre y no tiene cómo
       saber que su archivo ya está en uso.

       El rótulo vive en el encabezado de la vista previa (la columna del
       carrusel), así que hay que entrar al editor —el CTA del carrusel— para
       verlo. Se elige 'pro' a propósito: `selectMode('pro')` NO reescribe
       `cover_template_id` (solo 'custom' lo hace), así que el rótulo conserva el
       nombre que la plantilla ya tenía. */
    portada({ use_original_cover: false, cover_mode: 'apa_pro', cover_template_id: 'custom-7' });
    render(<CoverCarouselStudio />);
    fireEvent.click(screen.getByTestId('btn-seleccionar-portada-cta'));
    expect(within(screen.getByTestId('cover-carousel')).getByText(/custom-7/)).toBeTruthy();
  });

  it('un modo que la app no reconoce se dice, y no se disfraza de APA 7', () => {
    /* El backend tiene su propio vocabulario (`keep_original`,
       `keep_design_update_data`, `generate_apa7_template`), así que un valor
       desconocido es real. Encender "APA 7" para ese documento sería una
       afirmación falsa; lo honesto es decirlo. */
    portada({ use_original_cover: false, cover_mode: 'cover_del_año_que_viene' });
    render(<CoverCarouselStudio />);
    const carrusel = within(screen.getByTestId('cover-carousel'));
    const aviso = carrusel.getByRole('status');
    expect(aviso.textContent).toMatch(/no reconoce/i);
    expect(aviso.textContent).toMatch(/cover_del_año_que_viene/);
  });

  it('un cover_mode del backend que SÍ es APA 7 no se reporta como desconocido', () => {
    // `generate_apa7_template` es la palabra del backend por el mismo estado que
    // la app escribe como `cover_mode: ''`. Tratarlo como desconocido haría que un
    // documento APA 7 real mostrara un aviso que no corresponde.
    portada({ use_original_cover: false, cover_mode: 'generate_apa7_template' });
    render(<CoverCarouselStudio />);
    expect(within(screen.getByTestId('cover-carousel')).queryByRole('status')).toBeNull();
  });
});

/* ── Las dos zonas ────────────────────────────────────────────────────────── */

describe('T18 — el editor vive a la derecha, en 320px', () => {
  it('el panel de 320px es el editor de verdad y no una caja con el ancho bien', () => {
    portada();
    const { container } = render(<CoverCarouselStudio />);
    const panel = container.querySelector('[data-testid="cover-editor"]') as HTMLElement;
    expect(panel).toBeTruthy();
    expect(panel.style.width).toBe('320px');
    // Un `flex: 1` encima del ancho lo borraría en cuanto la ventana creciera.
    expect(panel.style.flexShrink).toBe('0');
    expect(within(panel).getByText('Editor de portada')).toBeTruthy();
  });

  it('el carrusel es la primera zona de la fila y el editor la última', () => {
    portada();
    const { container } = render(<CoverCarouselStudio />);
    const raiz = container.firstElementChild as HTMLElement;
    // Sin la tira, la fila del cuerpo es la PRIMERA hija de la raíz.
    const fila = raiz.children[0] as HTMLElement;
    expect(fila.children[0]).toBe(screen.getByTestId('cover-carousel'));
    expect(fila.children[fila.children.length - 1]).toBe(
      container.querySelector('[data-testid="cover-editor"]')
    );
  });

  it('el carrusel y su vista previa comparten la columna del centro', () => {
    portada();
    render(<CoverCarouselStudio />);
    const centro = screen.getByTestId('cover-carousel');
    expect(centro.contains(screen.getByTestId('cover-model-track'))).toBe(true);
    // La preview del carrusel ES la tarjeta activa: no hay un segundo paginador
    // oculto. Un paginador escondido era una instancia pesada por nada.
    expect(within(centro).queryByTestId('paginador-de-portada')).toBeNull();
  });
});

/* ── La altura llega hasta el panel ───────────────────────────────────────── */

describe('T18 — la cadena de alto llega hasta el panel de 320px', () => {
  it('la raíz y la fila del cuerpo tienen alto DEFINIDO', () => {
    /* Esto son DECLARACIONES, no layout: jsdom no calcula cajas. Pero el defecto
       que cubren es literal —una declaración que faltaba—, y sin ella el `flex: 1`
       de la raíz no hace nada, porque `Step1PortadaWizard` es una caja de BLOQUE
       (`position: relative; height: 100%`) y un hijo de bloque no es ítem
       flexible. El tamaño real se verificó en un navegador. */
    portada();
    const { container } = render(<CoverCarouselStudio />);
    const raiz = container.firstElementChild as HTMLElement;
    const fila = raiz.children[0] as HTMLElement;
    expect(raiz.style.height).toBe('100%');
    expect(fila.style.height).toBe('100%');
    // Y las dos cajas se pueden encoger: sin `minHeight: 0` el `flex: 1` de abajo
    // no llega a mandar y el contenido manda en el alto.
    expect(raiz.style.minHeight).toBe('0px');
    expect(fila.style.minHeight).toBe('0px');
  });

  it('la columna del centro reparte el alto entre la pista y la vista previa', () => {
    portada();
    render(<CoverCarouselStudio />);
    const centro = screen.getByTestId('cover-carousel');
    expect(centro.style.display).toBe('flex');
    expect(centro.style.flexDirection).toBe('column');
    expect(centro.style.minHeight).toBe('0px');
  });
});

/* ── La portada no se mide dos veces ──────────────────────────────────────── */

describe('T18 — la portada sigue siendo un bloque que no se parte', () => {
  it('este componente no pagina el documento: eso es de `PaperCanvas`', () => {
    /* La invariante real. La paginación sale de `computeRenderedPages`, de la
       geometría del documento (`geom.pageH`) y del alto de cada elemento
       (`offsetHeight`), y un `overflow` de un ancestro no entra en esa cuenta.
       Lo que sí partiría la portada en dos es un SEGUNDO paginador aquí, o algo
       que vuelva a medir la hoja. Se comprueba sobre el archivo. */
    expect(SRC).toMatch(/import \{ PaperCanvas \}/);
    for (const modulo of ['computePages', 'computeRenderedPages', 'applyPageFlow', 'applyLayout', 'usePageIndex']) {
      expect(SRC, `este archivo importa ${modulo}`).not.toMatch(new RegExp(`import[^;]*\\b${modulo}\\b`));
    }
  });

  it('este componente no vuelve a medir la hoja', () => {
    // Una re-medición es la otra forma de partir la portada: si este archivo
    // buscara los nodos de la hoja para medirlos, tendría su propia cuenta de
    // páginas, y dos cuentas no pueden coincidir. Se mira el CÓDIGO, no los
    // comentarios: este archivo explica la regla y nombra `offsetHeight` al hablar
    // de ella.
    for (const llamada of ['querySelectorAll', 'getBoundingClientRect', 'offsetHeight', 'clientHeight', 'scrollHeight', 'paper-elem']) {
      expect(codigo(SRC), `este archivo usa ${llamada}`).not.toMatch(new RegExp(`[^\\w.]${llamada}\\b`));
    }
  });
});

/* ── Tokens y copy ────────────────────────────────────────────────────────── */

describe('T18 — el chrome usa tokens declarados', () => {
  it('no lleva colores literales ni radios fuera de token', () => {
    expect(codigo(CHROME)).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(codigo(CHROME)).not.toMatch(/rgba?\(/);
    const radios = [...codigo(CHROME).matchAll(/borderRadius:\s*'([^']+)'/g)].map((m) => m[1]);
    // Sin radios la comprobación de abajo no miraría nada.
    expect(radios.length).toBeGreaterThan(0);
    for (const radio of radios) expect(radio).toMatch(/^var\(--radius-/);
  });

  it('cada token que usa está declarado en design-system.css', () => {
    const usados = new Set<string>();
    for (const m of codigo(CHROME).matchAll(/var\(\s*(--[a-z0-9-]+)/g)) usados.add(m[1]);
    expect(usados.size).toBeGreaterThan(0);
    for (const token of usados) {
      expect(declarados.has(token), `${token} no esta declarado`).toBe(true);
    }
  });

  it('ninguna cadena de la vista lleva emojis', () => {
    portada();
    const { container } = render(<CoverCarouselStudio />);
    expect(container.textContent || '').not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('la salida del paso vive en el editor, que es donde se termina de editar', () => {
    /* La tira tenía su propio "Usar este diseño y Continuar"; al quitarla, la
       única salida es la del editor. Hay que ENTRAR al editor (el CTA del
       carrusel) porque con el editor oculto (`display: none`) la consulta por
       `role` lo excluye por accesibilidad, que es justamente lo que se quiere:
       un botón que no se alcanza no es una salida. */
    portada();
    render(<CoverCarouselStudio />);
    fireEvent.click(screen.getByTestId('btn-seleccionar-portada-cta'));
    const editor = screen.getByTestId('cover-editor');
    expect(within(editor).getByRole('button', { name: /Continuar a Estructura/ })).toBeTruthy();
  });
});
