/**
 * WordAPA7 — T17: la pantalla final de exportacion es una sola columna a la
 * izquierda, en orden fijo: check, titulo, una linea, dos botones. Y esa
 * columna no repite nada de lo que el usuario acaba de revisar.
 *
 * La afirmacion central de este archivo es negativa ("no hay resumenes"), y
 * una prueba negativa solo vale si puede fallar. Por eso el texto visible se
 * compara contra la cadena EXACTA que debe verse, con un documento que tiene
 * 3 citas fantasma cargadas: cualquier recap que alguien vuelva a colar (un
 * conteo, un porcentaje, un "corregiste N cosas") rompe esa igualdad. Se
 * afirma sobre `document.body`, no sobre la columna, para que un recap en un
 * hermano o en un portal tambien la rompa, y se agrega que ningun `title` ni
 * `aria-label` del mismo cuerpo tenga un digito (el conteo que solo oye el
 * lector de pantalla). T20: esa segunda comprobacion se quedaba en la columna
 * mientras la primera ya miraba el body, y esa diferencia de alcance era un
 * agujero. La version del brief (un grep de tres frases) solo
 * detectaba esas tres frases literales, y una vista que los repitiera con
 * otra redaccion pasaba.
 *
 * Hubo tambien una "regla de los digitos" (el unico digito visible es el 7 de
 * "APA 7"): se borro porque con el formato nombrado en el boton ya son dos, y
 * durante la exportacion `loadingPhase` mete un tercero. Era una prueba que
 * iba a fallar por copy, no por una violacion.
 */
import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ExportView } from '../components/export/ExportView';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));

/* Los tres hijos pesados solo se montan con la vista previa abierta; aqui no
   se prueba el lienzo ni el PDF, asi que se sustituyen. */
vi.mock('../components/layout/PaperCanvas', () => ({ PaperCanvas: () => <div data-testid="canvas" /> }));
vi.mock('../components/layout/ReactPDFPreview', () => ({ ReactPDFPreview: () => <div data-testid="pdf" /> }));
vi.mock('../components/export/QuickReferenceSearch', () => ({
  QuickReferenceSearch: () => <div data-testid="crossref" />,
}));

/* Specifier en variable + import dinamico: si Vite puede analizarlos los pasa
   por vite-plugin-node-polyfills, cuyos shims de browser no traen readFileSync
   (mismo truco que designTokens.test.ts y focusReadingCard.test.tsx). */
const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';
let SRC = '';
beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const testDir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  SRC = readFileSync(resolve(testDir, '../components/export/ExportView.tsx'), 'utf8');
});

/* ── Lo que la columna final DEBE mostrar, y nada mas ── */
const TITULO = 'Documento listo';
const LINEA = 'Descarga el archivo final o vuelve al documento para hacer ajustes.';
const TEXTO_ESPERADO = `${TITULO}Tesis.docxWord APA 7 .docx${LINEA}Descargar Word APA 7 (.docx)Convertir otroVer en WordOpcionesVolver a editarMESA DE ENTREGATu documento tiene salida.Elige el formato, revisa una página si lo necesitas y llévatelo contigo.Ver una página`;

/* Un documento con hallazgos de sobra: si la vista final los repitiera,
   estos datos serian justo lo que feedearia el recap que no debe existir. */
const TRES_CITAS_FANTASMA = {
  ghost_citations: [
    { marker: '(Smith, 2019)', page: 4 },
    { marker: '(Jones et al., 2020)', page: 9 },
    { marker: '(Lee, 2021)', page: 15 },
  ],
};

const cargar = (extra: Record<string, unknown> = {}) => {
  useDocStore.setState({
    doc: {
      session_id: 's-t17',
      file_name: 'Tesis.docx',
      elements: [],
      referencias: [],
      meta: { page_count: 12 },
    } as never,
    isLoading: false,
    atHome: false,
    citationAuditResult: null,
    /* `format` pasó a ser estado del store (fase F6), así que sobrevive entre
       pruebas de este archivo igual que entre fases de la app. Antes era
       `useState` local y se reiniciaba solo en cada montaje; ahora hay que
       devolverlo al default explícitamente, como cualquier otro estado
       compartido. La prueba que elige PDF lo hace a propósito y no lo devuelve:
       por eso el resto necesita nombrarlo. */
    format: 'docx',
    exportDocx: vi.fn(),
    exportPdf: vi.fn(),
    exportLatex: vi.fn(),
    clearQuickExport: vi.fn(),
    copyPdfToClipboard: vi.fn(),
    ...extra,
  });
};

const columna = () => screen.getByLabelText('Exportación lista para descargar');

describe('T17 — ExportView: la columna final', () => {
  beforeEach(() => cargar());

  it('respeta el orden fijo: check, título, una línea y los dos botones pegados', () => {
    render(<ExportView />);

     /* El archivo se identifica antes de la descripción; después quedan las
       dos acciones principales y el acceso terciario a Opciones/edición. */
    const hijos = Array.from(columna().children).map((el) => el.tagName.toLowerCase());
     expect(hijos).toEqual(['svg', 'h1', 'div', 'p', 'div', 'div', 'div']);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(TITULO);

    const linea = screen.getByText(LINEA);
    expect(linea.tagName).toBe('P');
    expect(linea.style.maxWidth).toBe('50ch');

    const fila = columna().children[4] as HTMLElement;
    const botones = Array.from(fila.querySelectorAll('button')).map((b) => b.textContent);
    expect(botones).toEqual(['Descargar Word APA 7 (.docx)', 'Convertir otro']);

    /* El contenido de la columna puede bajar de 340px: los dos botones no
       entran, y sin wrap el texto se parte a media frase. */
    expect(fila.style.flexWrap).toBe('wrap');
    expect(screen.getByRole('button', { name: 'Opciones' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Volver a editar' })).toBeTruthy();
  });

  it('no repite hallazgos ni estadísticas, ni aunque el documento los tenga', () => {
    /* Con 3 citas fantasma sin resolver y 12 paginas en el store: los numeros
       existen, la columna final no los menciona. */
    cargar({ citationAuditResult: TRES_CITAS_FANTASMA });
    render(<ExportView />);

    /* Se afirma sobre TODO el body, no sobre el `<aside>`: asi un recap
       montado en un hermano, o en un portal, tambien rompe la igualdad. Los
       tres hijos pesados estan simulados a nada, asi que no agregan texto. */
    expect(document.body.textContent).toBe(TEXTO_ESPERADO);

    /* Y los canales que solo lee el lector de pantalla: un `title=` o un
       `aria-label=` con un numero esconde el conteo a la vista y se lo
       anuncia a ciegas. T20: esto se afirmaba sobre la COLUMNA mientras el
       texto de arriba ya se afirmaba sobre `document.body`, así que un recap
       montado en un hermano —o en un portal— con el número escondido en un
       `title` pasaba las dos. Ahora las dos afirmaciones miran lo mismo: TODO
       el body. */
    const conCifras = Array.from(document.body.querySelectorAll('[title], [aria-label]'))
      .map((el) => `${el.getAttribute('title') ?? ''} ${el.getAttribute('aria-label') ?? ''}`)
      .filter((texto) => /\d/.test(texto));
    expect(conCifras).toEqual([]);
  });

  it('la columna no trae listas, tablas ni subtitulos en el estado por defecto', () => {
    /* Lo que este test puede ver: estructura semantica. Una "tarjeta" hecha
       de `div` con un icono y sin encabezado no es detectable en jsdom, asi
       que el nombre no promete mas de lo que afirma. */
    render(<ExportView />);
    expect(columna().querySelectorAll('ul, ol, dl, table, section, article')).toHaveLength(0);
    expect(columna().querySelectorAll('h2, h3, h4')).toHaveLength(0);
  });

  it('usa el padding del shell en la columna', () => {
    /* El ancho `clamp(340px, 32vw, 440px)` no se puede afirmar por el estilo
       calculado: el parser de jsdom descarta `clamp()` y lo deja vacio. El
       padding si, y es el que la spec fija en 60px 48px. */
    render(<ExportView />);
    expect(columna().style.padding).toBe('60px 48px');
  });
});

describe('T17 — ExportView: acciones', () => {
  beforeEach(() => cargar());

  it('“Convertir otro” vuelve al inicio limpio sin descargar nada', () => {
    render(<ExportView />);
    expect(useDocStore.getState().atHome).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Convertir otro' }));

    /* Se comprueba el store real, no un mock: `goHome` levanta `atHome` y
       deja el documento cargado (es su semantica, no un teardown). */
    expect(useDocStore.getState().atHome).toBe(true);
    expect(useDocStore.getState().doc).not.toBeNull();
    expect(useDocStore.getState().exportDocx).not.toHaveBeenCalled();
    expect(useDocStore.getState().clearQuickExport).not.toHaveBeenCalled();
  });

  it('“Descargar” exporta de inmediato aunque haya citas fantasma', () => {
    cargar({ citationAuditResult: TRES_CITAS_FANTASMA });
    render(<ExportView />);

    fireEvent.click(screen.getByRole('button', { name: /Descargar/ }));

    /* Un clic descarga: nada de avisos intermedios ni de paneles de friccion.
       Las citas fantasma ya se revisaron antes; la pantalla final no frena. */
    expect(useDocStore.getState().exportDocx).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/sin referencia en la bibliograf/i)).toBeNull();
  });

  it('el boton principal nombra el formato que se va a descargar', () => {
    render(<ExportView />);
    expect(screen.getByRole('button', { name: /Descargar/ }).textContent).toBe('Descargar Word APA 7 (.docx)');

    /* Eligió PDF, cerró el panel, y el botón sigue diciendo PDF: quien va a
       descargar un archivo tiene que saber de qué tipo es antes de hacerlo. */
    fireEvent.click(screen.getByRole('button', { name: 'Opciones' }));
    const formatos = screen.getByLabelText('Selector de formato');
    fireEvent.click(
      Array.from(formatos.querySelectorAll('button')).find((b) => b.textContent!.includes('PDF Listo'))!,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Opciones' }));

    expect(screen.getByRole('button', { name: /Descargar/ }).textContent).toBe('Descargar documento PDF');
  });

  it('el boton principal se ve deshabilitado mientras exporta', () => {
    render(<ExportView />);
    expect(screen.getByRole('button', { name: /Descargar/ }).style.cursor).toBe('pointer');

    act(() => {
      useDocStore.setState({ isLoading: true });
    });

    /* Exportar tarda 2.6s y pasa por tres fases. Con `disabled` pero con
       relleno de acento y cursor de puntero, el botón pide un clic que no
       hace nada: hay que verlo muerto. */
    const durante = screen.getByRole('button', { name: /Generando/ }) as HTMLButtonElement;
    expect(durante.disabled).toBe(true);
    expect(durante.style.cursor).toBe('not-allowed');
    expect(durante.style.opacity).toBe('0.7');
  });

  it('el atajo Ctrl+S exporta una vez y se queda con el atajo del navegador', () => {
    render(<ExportView />);

    /* fireEvent devuelve false cuando el evento fue cancelado. */
    const noCancelado = fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    expect(noCancelado).toBe(false);
    expect(useDocStore.getState().exportDocx).toHaveBeenCalledTimes(1);
  });

  it('el atajo no se re-registra en cada render', () => {
    const add = vi.spyOn(window, 'addEventListener');
    render(<ExportView />);
    const alMontar = add.mock.calls.filter((c) => c[0] === 'keydown').length;
    expect(alMontar).toBe(1);

    /* Un render nuevo no debe volver a suscribir el atajo: el efecto
       depende de un callback memoizado, no de "cada render". */
    act(() => {
      useDocStore.setState({ isLoading: true });
    });

    expect(add.mock.calls.filter((c) => c[0] === 'keydown')).toHaveLength(alMontar);
    add.mockRestore();
  });

  it('el formato y la vista previa siguen alcanzables bajo el toggle de opciones', () => {
    render(<ExportView />);
    const toggle = screen.getByRole('button', { name: 'Opciones' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByLabelText('Selector de formato')).toBeNull();

    fireEvent.click(toggle);

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const formatos = screen.getByLabelText('Selector de formato');
    const pdf = Array.from(formatos.querySelectorAll('button')).find((b) =>
      b.textContent!.includes('PDF Listo'),
    )!;
    fireEvent.click(pdf);
    expect(pdf.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /Previsualizar/ })).toBeTruthy();

    /* Cerrado, la columna vuelve a ser la de cuatro piezas. */
    fireEvent.click(toggle);
    expect(screen.queryByLabelText('Selector de formato')).toBeNull();
  });
});

describe('T17 — ExportView: higiene del archivo', () => {
  it('no tiene iconos muertos ni estilos huerfanos', () => {
    expect(SRC).not.toMatch(/ICON_PALETTES|summaryItemStyle|summaryTitleStyle|summaryDescStyle|iconBox/);
  });

  it('no trae hex literales fuera del design system', () => {
    expect(SRC).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
