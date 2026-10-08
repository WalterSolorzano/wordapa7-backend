/**
 * EL GUARDIÁN DEL MONTAJE DEL TALLER DE FIGURAS Y TABLAS.
 *
 * La fase 3 llegó a tener DOS implementaciones: el par contextual
 * (`ListaContextual` + `EscenarioFigura`, montado por `Step3FiguresTablesWizard`)
 * y el Taller unificado (`TallerFigurasView`). El par quedó huérfano, con sus
 * pruebas en verde y cero importadores: el trabajo TERMINADO que no está
 * terminado, está guardado. Esta guarda vigila que exista UNA sola verdad.
 *
 * Todas las pruebas se apoyan en el mismo par: el glob lee los fuentes del disco
 * y la lista de componentes NO está escrita a mano. Una lista escrita a mano es
 * la tautología que hay que evitar: se agrega un componente, no se monta, y la
 * guarda sigue verde porque no lo conocía.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { TallerFigurasView } from '../components/figures/TallerFigurasView';
import { contextosDeFiguras } from '../lib/figuras';
import type { ElementModel } from '../types';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((p?: string | null) => (p ? `https://x/${p}` : null)),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
  autoCaptionAll: vi.fn().mockResolvedValue(undefined),
  suggestCaption: vi.fn().mockResolvedValue('sugerida'),
}));

const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** El fuente SIN comentarios. Un regex no sabe qué es un comentario, y un guardián
 *  que se puede desactivar con un `//` no vigila nada. */
const SIN_COMENTARIOS = (f: string) => f
  .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const CARPETA = '/src/components/figures/';
const NOMBRES = Object.keys(FUENTES)
  /* Las pruebas NO son componentes de la carpeta: si entraran, cada archivo de
     prueba se leería como un componente huérfano y la guarda acusaría al test. */
  .filter((r) => r.startsWith(CARPETA) && r.endsWith('.tsx') && !r.includes('/__tests__/'))
  .map((r) => r.slice(CARPETA.length).replace(/\.tsx$/, ''));

let n = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({ id: `elem_${++n}`, style_name: '', alignment: 'left', font_name: 'Times New Roman',
     font_size: 12, is_bold: false, is_italic: false, is_bullet: false, left_indent_cm: 0,
     confidence: 1, is_user_modified: false, cita_ids: [], needs_review: false,
     auto_applied: false, ...o }) as ElementModel;

const ELEMENTOS: ElementModel[] = [
  el({ type: 'heading', heading_level: 1, text: '2. Metodología' }),
  el({ type: 'paragraph', text: 'Se aplico un cuestionario a doscientos estudiantes' }),
  el({ type: 'image', text: 'Figura 1', image_info: { figure_number: 1, caption: 'Diagrama', relative_url: 'a.png', width_cm: 14, height_cm: 9 } as never }),
  el({ type: 'image', text: 'Figura 2', image_info: { figure_number: 2, caption: '', relative_url: 'b.png' } as never }),
];

function montar() {
  act(() => {
    useDocStore.setState({
      doc: { session_id: 's-f4', file_name: 'Tesis.docx', elements: ELEMENTOS, referencias: [], meta: { page_count: 4 } } as never,
      reviewResult: null, proofreadFindings: [], citationAuditResult: null,
      imagePanelOpen: false, selectedElementId: null,
    } as never);
  });
  return render(<TallerFigurasView />);
}

beforeEach(() => { n = 0; });

describe('la fase de Figuras y tablas está montada', () => {
  it('el glob esta leyendo de verdad y la carpeta tiene los componentes del taller', () => {
    expect(Object.keys(FUENTES).length).toBeGreaterThan(100);
    expect(NOMBRES).toContain('TallerFigurasView');
    expect(NOMBRES).toContain('RailTipoActivos');
    expect(NOMBRES).toContain('GaleriaActivosColumna');
    expect(NOMBRES).toContain('LienzoEditorialActivo');
    expect(NOMBRES).toContain('InspectorActivoTabs');
    expect(NOMBRES).toContain('IconosFiguras');
  });

  it('cada componente de la carpeta tiene un importador REAL fuera de las pruebas', () => {
    /* POR QUÉ SE LEEN LOS COMENTARIOS ANTES. Un `import` comentado no es un
       importador: un regex no sabe qué es un comentario, y esa guarda quedaría
       verde justo con el componente huérfano que viene a cazar. */
    const cuenta: Record<string, number> = {};
    for (const nombre of NOMBRES) cuenta[nombre] = 0;
    for (const [ruta, fuente] of Object.entries(FUENTES)) {
      if (ruta.includes('/__tests__/')) continue;
      const limpio = SIN_COMENTARIOS(fuente);
      for (const nombre of NOMBRES) {
        if (new RegExp(`from\\s+['"][^'"]*/${nombre}['"]`).test(limpio)) cuenta[nombre] += 1;
      }
    }
    const huerfanos = NOMBRES.filter((x) => (cuenta[x] ?? 0) === 0);
    expect(huerfanos, `componentes de figures/ que nadie usa: ${huerfanos.join(', ')}`).toEqual([]);
  });

  it('monta el taller con el rail, la galería, el lienzo y el inspector', () => {
    montar();
    expect(screen.getByTestId('taller-figuras-view')).toBeTruthy();
    expect(screen.getByTestId('editorial-reading-canvas')).toBeTruthy();
    /* El rail y la galería existen como regiones etiquetadas. */
    expect(screen.getByRole('complementary', { name: /Selector de tipos de activos/i })).toBeTruthy();
    expect(screen.getByRole('complementary', { name: /Galería de activos/i })).toBeTruthy();
  });

  it('la fase es alcanzable desde el rail: App.tsx la monta en el paso 3', () => {
    /* Montar el componente a mano no prueba que exista en la app. Un componente
       importado por un modulo que nadie monta tiene la misma existencia que uno sin
       importador. */
    const app = FUENTES['/src/App.tsx'];
    expect(app, 'App.tsx no esta entre los fuentes leidos').toBeTruthy();
    expect(app).toMatch(/wizardStep === 3 && <TallerFigurasView \/>/);
  });
});

describe('la vista previa se resuelve en los DOS canales', () => {
  /* Bug histórico: el lienzo y la galería pasaban la ruta cruda al `<img>`, y en
     Electron (origen app://) eso da 404 silencioso. Los dos canales deben leer
     `resolveAssetUrl`; si uno vuelve a pintar la ruta cruda, esta guarda cae. */
  it('el lienzo y la galería resuelven la URL del activo', () => {
    const taller = SIN_COMENTARIOS(FUENTES['/src/components/figures/TallerFigurasView.tsx']);
    const galeria = SIN_COMENTARIOS(FUENTES['/src/components/figures/GaleriaActivosColumna.tsx']);
    expect(taller).toMatch(/resolveAssetUrl/);
    expect(galeria).toMatch(/resolveAssetUrl/);
  });
});

describe('la verdad de la figura no se re-deriva en la vista', () => {
  it('el taller lee la MISMA verdad contextual de la librería', () => {
    /* Un `sectionMap` local y un `contextosDeFiguras` en la lib son dos verdades
       sobre a qué sección pertenece una figura, y divergen el primer día que una
       cambia. El taller tiene que leer el mismo arreglo. */
    const taller = SIN_COMENTARIOS(FUENTES['/src/components/figures/TallerFigurasView.tsx']);
    expect(taller).toMatch(/contextosDeFiguras/);
    expect(taller).not.toMatch(/new Map<string, \{ title: string; level/);
  });

  it('la figura activa se guarda por índice y elegir NO abre el panel de imagen', () => {
    const taller = SIN_COMENTARIOS(FUENTES['/src/components/figures/TallerFigurasView.tsx']);
    expect(taller).toMatch(/indiceActivo/);
    /* Seleccionar NO abre el panel de imagen: eso es reemplazar en vez de navegar. */
    expect(taller).not.toMatch(/setImagePanelOpen\(true\)/);
    expect(taller).not.toMatch(/setForceRightPanelOpen\(true\)/);
  });

  it('el total que muestra el rail es el mismo número que sale de la librería', () => {
    const ctx = contextosDeFiguras(ELEMENTOS);
    expect(ctx.filter((c) => c.tipo === 'image')).toHaveLength(2);
    montar();
    /* El rail dice 2 y la librería dice 2: un número derivado dos veces divergen,
       y el que miente es el que la persona ve. */
    expect(screen.getByRole('button', { name: /Figuras \(2\)/ })).toBeTruthy();
  });
});
