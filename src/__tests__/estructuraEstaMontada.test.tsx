/**
 * EL GUARDIÁN DEL MONTAJE. Este archivo existe por un hecho, no por una idea:
 * `src/components/structure/` llegó a tener componentes terminados, con sus
 * pruebas en verde, y CERO importadores fuera de la propia carpeta. Un trabajo
 * terminado que no llega a la pantalla no está terminado: está guardado.
 *
 * EL REDISEÑO «CANÓNICO UNIFICADO» (spec
 * `2026-10-03-estructura-redesign-design.md`) volvió a una sola fase montada:
 * `EscritorioEstructura`, con tres columnas —esquema, diagrama y panel—. La
 * cadena anatómica (`EstudioEstructuraView → EsqueletoNavegacion,
 * DiagramaAnatomicoSVG, InspectorActivosSeccion`) se absorbió y se borró.
 *
 * Las pruebas siguen siendo negativas y ancladas al DISCO:
 *
 *   1. la fase monta el esquema y el diagrama, y NO el documento entero;
 *   2. tocar un título abre la prosa de esa sección;
 *   3. cada `.tsx` de la carpeta tiene un importador, y los nombres se LEEN.
 *
 * LOS `__tests__` NO CUENTAN COMO MONTADA UNA COSA: una prueba que importa un
 * componente para probarlo no lo pone en pantalla, así que ni sus nombres entran
 * a la lista de componentes ni sus imports cuentan como importadores.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { EscritorioEstructura, fasesConocidasDe } from '../components/structure/EscritorioEstructura';
import { construirJerarquia } from '../lib/jerarquia';
import type { ElementModel } from '../types';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  sendLiveChat: vi.fn().mockResolvedValue({ reply: '' }),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
}));

/* ── Los fuentes de `src/`, leídos del disco ─────────────────────────────── */

const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const CARPETA = '/src/components/structure/';

/** Los nombres de los COMPONENTES de la carpeta, LEÍDOS. Nunca escritos. */
const NOMBRES_DE_LA_CARPETA: string[] = Object.keys(FUENTES)
  .filter((ruta) => ruta.startsWith(CARPETA) && ruta.endsWith('.tsx'))
  .map((ruta) => ruta.slice(CARPETA.length).replace(/\.tsx$/, ''))
  .filter((nombre) => !nombre.includes('.test'));

/**
 * Cuántos archivos, fuera de las pruebas, importan cada componente. Se cuenta
 * el IMPORT, no el archivo: el specifier cuyo último segmento es el nombre, con
 * barra antes, y no el nombre suelto —que aparece en comentarios y pruebas—.
 */
function contarImportadores(carpeta: string): Record<string, number> {
  const cuenta: Record<string, number> = {};
  for (const nombre of NOMBRES_DE_LA_CARPETA) cuenta[nombre] = 0;

  for (const [ruta, fuente] of Object.entries(FUENTES)) {
    if (ruta.includes('/__tests__/')) continue;
    for (const nombre of NOMBRES_DE_LA_CARPETA) {
      const patron = new RegExp(`from\\s+['"][^'"]*/${nombre}['"]`);
      if (patron.test(fuente)) cuenta[nombre] += 1;
    }
  }
  return cuenta;
}

/* ── El documento de la prueba ────────────────────────────────────────────── */

let secuencia = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({
    id: `e${++secuencia}`,
    style_name: '',
    alignment: 'left',
    font_name: 'Times New Roman',
    font_size: 12,
    is_bold: false,
    is_italic: false,
    is_bullet: false,
    left_indent_cm: 0,
    confidence: 1,
    is_user_modified: false,
    cita_ids: [],
    needs_review: false,
    auto_applied: false,
    ...o,
  }) as ElementModel;

const h1 = (t: string): ElementModel => el({ type: 'heading', heading_level: 1, text: t });
const h2 = (t: string): ElementModel => el({ type: 'heading', heading_level: 2, text: t });
const parrafo = (n: number): ElementModel =>
  el({ type: 'paragraph', text: Array.from({ length: n }, (_, i) => `w${i}`).join(' ') });

/* Un caso desbalanceado a propósito: es el problema que el índice existe para
   volver visible, y un documento de capítulos iguales no lo demuestra. */
const ELEMENTOS: ElementModel[] = [
  h1('1. Introducción'),
  parrafo(12000),
  h1('2. Metodología'),
  h2('2.1 Resultados'),
  parrafo(80),
];

/**
 * Monta la fase de Estructura con un documento cargado. Se monta la superficie
 * viva —`EscritorioEstructura`—, no un recorte que se parece a la pantalla.
 */
function montarCon(elementos: ElementModel[]) {
  act(() => {
    useDocStore.setState({
      doc: {
        session_id: 's-f3',
        file_name: 'Tesis.docx',
        elements: elementos,
        referencias: [],
        meta: { page_count: 12 },
      } as never,
      reviewResult: null,
      proofreadFindings: [],
      citationAuditResult: null,
    });
  });
  return render(<EscritorioEstructura />);
}

const montarFase = () => montarCon(ELEMENTOS);

beforeEach(() => {
  secuencia = 0;
  /* jsdom no es una pantalla: su `innerWidth` por defecto (1024) cae bajo el
   * umbral responsive y colapsaría el panel derecho. Acá se declara un
   * escritorio ancho, que es el entorno que estas pruebas describen. */
  window.innerWidth = 1440;
});

describe('la fase de Estructura está montada', () => {
  it('monta el esquema y el diagrama, y no el documento entero', () => {
    montarFase();
    expect(screen.getByTestId('indice-estructura')).toBeTruthy();
    expect(screen.getByTestId('diagrama-estructura')).toBeTruthy();
    expect(screen.queryByTestId('documento-completo')).toBeNull();
  });

  it('el panel derecho ofrece Prosa y Herramientas', () => {
    montarFase();
    expect(screen.getByRole('tab', { name: /prosa/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /herramientas/i }));
    expect(screen.getByTestId('panel-herramientas')).toBeTruthy();
  });

  it('tocar un título abre la prosa de esa sección', () => {
    montarFase();
    /* Estando en Herramientas, tocar el título debe volver a Prosa con la
       sección elegida: es el gesto que el usuario pidió explícitamente. */
    fireEvent.click(screen.getByRole('tab', { name: /herramientas/i }));
    expect(screen.getByTestId('panel-herramientas')).toBeTruthy();

    fireEvent.click(screen.getByText('2. Metodología'));
    const prosa = screen.getByTestId('prosa-seccion');
    expect(prosa.textContent).toContain('2. Metodología');
    expect(screen.queryByTestId('panel-herramientas')).toBeNull();
  });

  it('sin encabezados, el esquema dice que no hay estructura que medir', () => {
    montarCon([parrafo(10)]);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('la fase es alcanzable desde el rail: App.tsx la monta, no un recorte', () => {
    const app = FUENTES['/src/App.tsx'];
    expect(app, 'App.tsx no está entre los fuentes leídos').toBeTruthy();
    expect(app).toMatch(/from '\.\/components\/structure\/EscritorioEstructura'/);
    expect(app).toMatch(/<EscritorioEstructura \/>/);
  });
});

describe('todos los componentes de structure/ están montados en algún lado', () => {
  it('el guard ve la carpeta entera, y la lista no está escrita a mano', () => {
    expect(NOMBRES_DE_LA_CARPETA.length).toBeGreaterThanOrEqual(7);
    expect(NOMBRES_DE_LA_CARPETA).toContain('EscritorioEstructura');
    expect(NOMBRES_DE_LA_CARPETA).toContain('IndiceEstructura');
    expect(NOMBRES_DE_LA_CARPETA).toContain('MapaEstructura');
  });

  it('cada componente de la carpeta tiene un importador', () => {
    const usos = contarImportadores(CARPETA);
    const huerfanos = NOMBRES_DE_LA_CARPETA.filter((n) => (usos[n] ?? 0) === 0);
    expect(huerfanos, `componentes de structure/ que nadie usa: ${huerfanos.join(', ')}`).toEqual(
      [],
    );
  });

  it('ningún componente de la carpeta usa un <select>', () => {
    const conSelect = NOMBRES_DE_LA_CARPETA.filter((n) =>
      /<select\b/i.test(FUENTES[CARPETA + `${n}.tsx`] ?? ''),
    );
    expect(conSelect, `componentes con <select>: ${conSelect.join(', ')}`).toEqual([]);
  });
});

describe('la fase de un elemento la dice el backend, y no se re-deriva', () => {
  it('un hallazgo con fase le da la fase al elemento, y uno general no', () => {
    const elementos = [{ id: 'h1' }, { id: 'p1' }];
    const fases = fasesConocidasDe(elementos, [
      { element_id: 'h1', phase: 'metodo' },
      { element_id: 'p1', phase: null },
    ]);
    expect(fases).toEqual({ h1: 'metodo' });
  });

  it('sin hallazgos, el árbol se arma solo con los títulos, y eso es un dato', () => {
    const arbol = construirJerarquia([h1('1. Introducción'), parrafo(10)], {});
    expect(arbol[0].fase).toBe('introduccion');
  });
});
