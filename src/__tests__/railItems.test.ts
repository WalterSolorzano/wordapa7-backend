/**
 * WordAPA7 — T3: los destinos del rail son datos, no JSX. El estado de cada
 * fase se calcula aquí para que el rail y su flyout muestren lo mismo.
 */
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { EDITOR_RAIL_ITEMS } from '../components/shell/railItems';
import { useRailDestinations } from '../hooks/useRailDestinations';

const elem = (over: Record<string, unknown> = {}) =>
  ({ id: 'e1', type: 'paragraph', text: 'x', ...over }) as never;

const docWith = (over: Record<string, unknown> = {}) =>
  ({ id: 'd1', name: 'doc', elements: [], referencias: [], ...over }) as never;

/** Lee el hook con un render mínimo: el estado vive en el store, no en React. */
function readDestinations(): ReturnType<typeof useRailDestinations> {
  let items: ReturnType<typeof useRailDestinations> = [];
  function Probe() {
    items = useRailDestinations();
    return null;
  }
  render(React.createElement(Probe));
  return items;
}

const byStep = (items: ReturnType<typeof useRailDestinations>, step: number) => {
  const found = items.find((i) => i.step === step);
  if (!found) throw new Error(`sin destino para la fase ${step}`);
  return found;
};

/**
 * SOLO LAS FASES, Y POR QUE.
 *
 * El catálogo suma 'mis-proyectos': la pantalla de proyectos es un módulo que
 * `AGENTS.md` §5 lista como principal. Este archivo antes afirmaba "son las seis"
 * sobre el catálogo ENTERO, o sea que cualquier destino nuevo lo rompía.
 *
 * La forma de arreglarlo NO es aflojar la afirmación a "las que haya": es
 * separar las dos clases. Estas pruebas hablan de FASES, y una fase tiene `step`
 * numérico. El módulo tiene `step: null` y se cuenta aparte, con su propia
 * prueba (`proyectoEstaAccesible.test.tsx`). Un filtro explícito además evita el
 * modo de fallo de leer un token de un elemento vecino: si el filtro fuera
 * `.slice(0, 6)`, un destino nuevo insertado en el medio pasaría la prueba
 * midiendo las seis primeras sin comprobar que sean las fases.
 */
const fasesDelCatalogo = () => EDITOR_RAIL_ITEMS.filter((i) => i.step !== null);
const fasesPintadas = () => readDestinations().filter((i) => i.step !== null);

describe('T3 — destinos del rail', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: null,
      wizardStep: 1,
      coverSetupDone: false,
      proofreadFindings: [],
      citationAuditResult: null,
    });
  });

  it('son las seis fases, en orden, con etiqueta sin emojis', () => {
    expect(fasesDelCatalogo().map((i) => i.label)).toEqual([
      'Portada', 'Estructura', 'Figuras', 'Referencias', 'Revisión & IA', 'Exportar',
    ]);
    // La afirmacion de "seis" se sostiene sobre las FASES, no sobre el
    // catalogo entero: la pantalla de proyectos no es una fase.
    expect(fasesDelCatalogo()).toHaveLength(6);
    for (const item of EDITOR_RAIL_ITEMS) {
      expect(item.label).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });

  it('las fases siguen siendo las unicas con numero de paso', () => {
    // El control de la de arriba. Si un modulo con `step: null` colara en la
    // lista de fases, `byStep` dejaria de encontrarlo y estas pruebas empezarian
    // a medir un subconjunto sin decirlo.
    expect(fasesDelCatalogo().every((i) => typeof i.step === 'number')).toBe(true);
    // 'mis-proyectos' es una pantalla, no una fase: step: null.
    expect(EDITOR_RAIL_ITEMS.filter((i) => i.step === null).map((i) => i.id)).toEqual(['mis-proyectos']);
  });

  it('el mapa del documento solo se ofrece en las fases de sección', () => {
    const conMapa = EDITOR_RAIL_ITEMS.filter((i) => i.showOutline).map((i) => i.step);
    /* SOLO la fase 2. Antes eran 2, 3 y 4, y el árbol de estructura se
       superponía sobre Figuras y Referencias: un panel que describe otra fase
       que la que el rail dice que está activa. El reporte literal del usuario
       fue "al pasar el mouse por una fase que no salga la ventana flotante", y
       la mitad de ese defecto era este `true` de más.

       La lista se compara completa a propósito —y no con un `toContain(2)`—
       porque lo que se afirma es que NO HAY más de uno. Un `toContain`
       pasaría con los tres. */
    expect(conMapa).toEqual([2]);
  });

  it('cada destino lleva id estable, icono y la misma gramática del catálogo', () => {
    // El emparejamiento es POR ID, no por indice. Con indice, insertar el
    // Explorador en medio del catalogo corria el `label` de una fila contra el
    // `Icon` de otra y la prueba comparaba dos cosas que no se corresponden sin
    // quejarse: el quinto fallo de guarda de esta lista, y el mismo.
    const items = fasesPintadas();
    expect(items.map((i) => i.id)).toEqual([
      'step-1', 'step-2', 'step-3', 'step-4', 'step-5', 'step-6',
    ]);
    for (const item of items) {
      const src = EDITOR_RAIL_ITEMS.find((i) => i.id === item.id);
      expect(src, `el destino ${item.id} no esta en el catalogo`).toBeTruthy();
      expect(item.step).toBe(src!.step);
      expect(item.label).toBe(src!.label);
      expect(item.Icon).toBe(src!.Icon);
      expect(item.showOutline).toBe(src!.showOutline);
    }
  });
});

describe('T3b — estado por destino', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: null,
      wizardStep: 1,
      coverSetupDone: false,
      proofreadFindings: [],
      citationAuditResult: null,
    });
  });

  it('sin documento, todas las fases quedan idle', () => {
    // Se cuenta sobre las FASES. La pantalla de proyectos no cuenta, y no es una
    // excepcion escondida: es que no tiene `status` porque no es una tarea — es
    // el mismo motivo por el que Ajustes no lleva estado en `HOME_RAIL_ITEMS`.
    const items = fasesPintadas();
    expect(items).toHaveLength(6);
    expect(items.every((i) => i.status === 'idle')).toBe(true);
    expect(items.every((i) => i.pending === 0)).toBe(true);
  });

  it('con documento, una fase con pendientes queda pending y sin pendientes done', () => {
    useDocStore.setState({
      doc: docWith({
        elements: [
          elem({ id: 'h1', type: 'heading', needs_review: true }),
          elem({ id: 'h2', type: 'heading', needs_review: false }),
        ],
      }),
    });
    const items = readDestinations();
    expect(byStep(items, 2).status).toBe('pending');
    expect(byStep(items, 2).pending).toBe(1);
    expect(byStep(items, 3).status).toBe('done');
  });

  it('cuenta como pendientes solo las imágenes y tablas NUMERADAS y marcadas', () => {
    // La fase 3 exige lo mismo que el atajo de teclado: una figura sin número
    // o con error de render no es rotulable desde esa fase, así que no cuenta.
    useDocStore.setState({
      doc: docWith({
        elements: [
          elem({ id: 'i1', type: 'image', needs_review: true, image_info: { figure_number: 1 } }),
          elem({ id: 't1', type: 'table', needs_review: true, table_info: { table_number: 1 } }),
          elem({ id: 'i2', type: 'image', needs_review: false, image_info: { figure_number: 2 } }),
          elem({ id: 'i3', type: 'image', needs_review: true, image_info: {} }),
          elem({ id: 'p1', type: 'paragraph', needs_review: true }),
        ],
      }),
    });
    const items = readDestinations();
    expect(byStep(items, 3).pending).toBe(2);
    expect(byStep(items, 3).status).toBe('pending');
    // Un párrafo marcado no infla la fase de figuras.
    expect(byStep(items, 2).pending).toBe(0);
  });

  it('la fase de auditoría suma hallazgos de ortografía y citas fantasma', () => {
    useDocStore.setState({
      doc: docWith(),
      proofreadFindings: [
        { id: 'f1', kind: 'typo', message: 'x', excerpt: 'x' },
        { id: 'f2', kind: 'typo', message: 'y', excerpt: 'y' },
      ] as never,
      citationAuditResult: { ghost_citations: [{ cite: 'a' }], orphan_references: [] } as never,
    });
    const step5 = byStep(readDestinations(), 5);
    expect(step5.pending).toBe(3);
    expect(step5.status).toBe('pending');
  });

  it('la portada queda done solo cuando el usuario confirmó su configuración', () => {
    useDocStore.setState({ doc: docWith(), coverSetupDone: true });
    const items = readDestinations();
    expect(byStep(items, 1).status).toBe('done');
    // Referencias sin confirmar no se marcan listas por el solo hecho de tener documento.
    expect(byStep(items, 4).status).toBe('idle');
  });

  it('referencias queda done cuando el documento trae al menos una referencia', () => {
    useDocStore.setState({ doc: docWith({ referencias: [{ id: 'r1' }] }) });
    expect(byStep(readDestinations(), 4).status).toBe('done');
  });
});
