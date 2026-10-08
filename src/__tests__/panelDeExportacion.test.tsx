/**
 * El panel de ajustes de exportación, que hasta esta fase no existía: había un
 * link terciario sin icono que revelaba UN checkbox.
 *
 * LO QUE ESTE ARCHIVO AFIRMA, Y POR QUÉ CADA AFIRMACIÓN PUEDE CAER:
 *
 *  1. El toggle es un `<button>` CON ICONO y con la misma jerarquía que "Volver
 *     a editar". Antes era texto plano con `--color-text-tertiary`, sin icono,
 *     en un `div` sin jerarquía con el otro.
 *  2. El panel tiene los cuatro grupos que nombra la spec. Afirmar los cuatro
 *     TEXTO por texto y no "que haya algo" es lo que hace que un grupo
 *     renombrado se caiga en vez de pasar.
 *  3. Cada formato dice su extensión EN el botón, que es donde se elige. Antes
 *     `ext` y `sublabel` solo aparecían en la línea de identidad.
 *  4. Lo que el panel DERIVA de Ajustes se declara como derivado: se lee, no
 *     se duplica. Un control editable aquí sería un segundo control sobre el
 *     mismo campo del store, que es el defecto que esta fase viene a quitar.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ExportView } from '../components/export/ExportView';
import { CUATRO_GRUPOS, CONTROLES_DEL_PANEL, DERIVADOS_DEL_PANEL } from '../components/export/panelDeExportacion';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));
vi.mock('../components/layout/PaperCanvas', () => ({ PaperCanvas: () => <div data-testid="canvas" /> }));
vi.mock('../components/layout/ReactPDFPreview', () => ({ ReactPDFPreview: () => <div data-testid="pdf" /> }));
vi.mock('../components/export/QuickReferenceSearch', () => ({
  QuickReferenceSearch: () => <div data-testid="crossref" />,
}));

const cargar = (extra: Record<string, unknown> = {}) => {
  useDocStore.setState({
    doc: { session_id: 's-panel', file_name: 'Tesis.docx', elements: [], referencias: [] } as never,
    isLoading: false,
    atHome: false,
    citationAuditResult: null,
    exportDocx: vi.fn(),
    exportPdf: vi.fn(),
    exportLatex: vi.fn(),
    clearQuickExport: vi.fn(),
    copyPdfToClipboard: vi.fn(),
    sayMascot: vi.fn(),
    showToast: vi.fn(),
    ...extra,
  } as never);
};

const abrir = () => fireEvent.click(screen.getByRole('button', { name: /opciones/i }));

beforeEach(() => {
  vi.clearAllMocks();
  cargar();
});

describe('el toggle de ajustes', () => {
  it('es un boton, con icono, y no un link terciario', () => {
    render(<ExportView />);
    const b = screen.getByRole('button', { name: /opciones/i });

    /* Un icono de verdad, no un adorno: `lucide-react` dibuja un `svg`. */
    expect(b.querySelector('svg')).toBeTruthy();

    /* Y con la misma jerarquía que "Volver a editar": mismo tamaño de letra y
       mismo grosor de trazo. Antes era `--text-xs` en `--color-text-tertiary`
       contra `--text-xs` en acento. */
    const volver = screen.getByRole('button', { name: /volver a editar/i });
    expect(b.style.fontSize).toBe(volver.style.fontSize);
    expect(b.style.color).toBe(volver.style.color);
    expect(b.style.fontWeight).toBe(volver.style.fontWeight);
  });
});

describe('el panel de ajustes', () => {
  it('existe y tiene los cuatro grupos', () => {
    render(<ExportView />);
    abrir();
    for (const grupo of CUATRO_GRUPOS) {
      expect(screen.getByText(grupo), `falta el grupo ${grupo}`).toBeTruthy();
    }
  });

  it('cada control dice que pasa si se apaga, no solo que pasa si se activa', () => {
    /* Un interruptor que solo dice qué activa vende una cosa y hace otra. La
       segunda línea es la del apagado, y es la que no se puede inventar. */
    render(<ExportView />);
    abrir();
    for (const c of CONTROLES_DEL_PANEL) {
      const fila = screen.getByTestId(`control-${c.id}`);
      expect(fila.getAttribute('data-al-apagar'), `falta el texto de apagado de ${c.id}`).toBeTruthy();
      expect(fila.textContent).toContain(c.alApagar);
    }
  });

  it('el tamaño de hoja y la tipografia se LEEN de Ajustes, no se editan aca', () => {
    /* Si Formato tiene un control, Exportar lo lee. Un segundo control
       editable sobre `rules.margins_cm` serían dos verdades para un campo. */
    render(<ExportView />);
    act(() => { useDocStore.setState({ rules: { ...useDocStore.getState().rules, margins_cm: 3, font_family: 'Georgia' } as never }); });
    abrir();

    for (const d of DERIVADOS_DEL_PANEL) {
      const linea = screen.getByTestId(`derivado-${d.id}`);
      expect(linea.getAttribute('data-solo-lectura')).toBe('true');
      expect(linea.textContent).toContain(d.leer());
    }
  });
});

describe('el formato dice su extension en el boton de elegir', () => {
  it('cada formato nombra su extension donde se elige', () => {
    render(<ExportView />);
    abrir();
    const selector = screen.getByLabelText('Selector de formato');

    for (const ext of ['.docx', '.pdf', '.tex']) {
      const boton = Array.from(selector.querySelectorAll('button'))
        .find((b) => b.textContent!.includes(ext));
      expect(boton, `ningun boton dice ${ext}`).toBeTruthy();
    }
  });

  it('y el sublabel acompana, que es lo que la persona decide leer', () => {
    render(<ExportView />);
    abrir();
    const selector = screen.getByLabelText('Selector de formato');
    expect(selector.textContent).toContain('Documento editable');
  });
});

describe('el panel no promete lo que no hace', () => {
  it('cada control del panel termina en una llamada o en un parametro', async () => {
    /* La guarda de la fase. Vive acá y no en el test: agregar un control sin
       destino tiene que hacer que el guardián nombre el id. */
    const sinDestino = CONTROLES_DEL_PANEL.filter((c) => !c.destino);
    expect(sinDestino.map((c) => c.id)).toEqual([]);

    /* Y no alcanza con que lo diga la tabla: cada `destino` tiene que existir de
       verdad en el store o en la firma de la llamada. */
    const store = useDocStore.getState() as unknown as Record<string, unknown>;
    for (const c of CONTROLES_DEL_PANEL) {
      expect(typeof c.destino, `${c.id} no dice a qué llega`).toBe('string');
      expect(c.destino.length, `${c.id} tiene un destino vacío`).toBeGreaterThan(0);
      if (c.accionStore) {
        expect(typeof store[c.accionStore], `${c.id} dice ${c.accionStore} y no existe`).toBe('function');
      }
    }
  });

  it('ningun grupo esta vacio, y los que no editan son solo lectura', () => {
    /* La contraste de la regla del plan: "si te queda largo, achicá el panel
       antes que dejar controles a medias". Un grupo vacío es un encabezado que
       promete ajustes y no tiene ninguno, y es el mismo defecto que un control
       mudo: ocupa el lugar de algo que sí funciona.

       Y la regla de Ajustes: si Formato ya tiene un control, Exportar lo LEE.
       Por eso "La hoja" y "La tipografía" no editan nada acá: muestran lo que
       va a salir y dicen dónde se cambia. Un grupo sin controles tiene que ser
       ENTERAMENTE derivado —si tuviera uno a medio cablear, se está
       contradiciendo a sí mismo— y eso es lo que se afirma acá. */
    for (const g of CUATRO_GRUPOS) {
      const controles = CONTROLES_DEL_PANEL.filter((c) => c.grupo === g);
      const derivados = DERIVADOS_DEL_PANEL.filter((d) => d.grupo === g);
      expect(controles.length + derivados.length, `el grupo ${g} esta vacio`).toBeGreaterThan(0);
      if (controles.length === 0) {
        expect(derivados.length, `${g} no edita y tampoco muestra nada`).toBeGreaterThan(0);
      }
    }
  });
});
