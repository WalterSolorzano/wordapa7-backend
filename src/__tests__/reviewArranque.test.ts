/**
 * La vista de revisión no arranca vacía.
 *
 * El usuario reporto que, con un archivo que tiene muchas correcciones, el
 * centro de la pantalla decía "Sin hallazgo seleccionado. Elige uno en el panel
 * de la derecha o pulsa 'Siguiente hallazgo'".
 *
 * El mensaje no miente sobre su propia causa —no hay nada seleccionado— pero
 * la pantalla arrancaba así. Con 300 hallazgos, la primera cosa que ve la
 * persona es un centro vacío con una instrucción, y la conclusión razonable es
 * "está roto" o "no encontró nada". Ninguna de las dos es cierta.
 *
 * Un modo de lectura que arranca sin leer es un modo que hay que usar dos veces
 * para ver algo. Estos tests fijan que la siembra ocurre, y sobre todo CUÁNDO:
 * recién llegada la lista, y de nuevo cuando cambia el filtro, porque si solo
 * Cells al montar la pantalla se abre con la lista todavía vacía —las
 * auditorías corren en segundo plano— y vuelve a quedar en blanco.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReviewWorkbench } from '../hooks/useReviewWorkbench';
import { useDocStore } from '../store/useDocStore';
import type { ElementModel } from '../types';
import type { ProofreadFinding } from '../types';

const el = (o: Partial<ElementModel> & { id: string; text: string }): ElementModel => ({
  type: 'paragraph', style_name: '', alignment: 'left', font_name: 'TNR', font_size: 12,
  is_bold: false, is_italic: false, is_bullet: false, left_indent_cm: 0, confidence: 1,
  is_user_modified: false, ...o,
}) as ElementModel;

const finding = (i: number, phase = 'metodo'): ProofreadFinding => ({
  element_id: `e${i}`,
  start: 0,
  end: 3,
  excerpt: 'xxx',
  kind: 'ortografia',
  severity: 'warn',
  message: `Falta ${i}`,
  source: 'local',
  phase,
} as ProofreadFinding);

const DOC: ElementModel[] = [
  el({ id: 'e0', text: 'Cero' }),
  el({ id: 'e1', text: 'Uno' }),
  el({ id: 'e2', text: 'Dos' }),
];

const base = {
  doc: { session_id: 's1', elements: DOC } as never,
  proofreadFindings: [finding(1), finding(2)] as ProofreadFinding[],
  reviewResult: null,
  citationAuditResult: null,
  portada: null,
  isScanning: false,
  progress: null,
};

function montar(extra: Record<string, unknown> = {}) {
  useDocStore.setState({
    doc: base.doc,
    proofreadFindings: base.proofreadFindings,
    reviewResult: null,
    citationAuditResult: null,
    setSelectedElementId: vi.fn(),
    setScrollTargetId: vi.fn(),
    ...extra,
  } as never);
  return renderHook(() => useReviewWorkbench());
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('la vista de revisión no arranca vacía', () => {
  it('con hallazgos a la vista, SELECCIONA el primero al entrar', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.selected).toBeTruthy());
    expect(result.current.selected?.id).toBeTruthy();
  });

  it('sin hallazgos, NO inventa una selección', async () => {
    /* Al revés también: un modo de lectura que arranca con un hallazgo
       fantasma es peor que uno que arranca vacío, porque el panel muestra
       texto que no viene de ninguna parte. */
    const { result } = montar({ proofreadFindings: [] });
    await waitFor(() => expect(result.current.items).toHaveLength(0));
    expect(result.current.selected).toBeNull();
  });

  it('la lista llega TARDE (la auditoría corre en segundo plano) y igual siembra', async () => {
    /* La causa real del vacío: al abrir el paso 5 la lista todavía no está, y
       cuando llega el efecto ya se corrió una vez. Una siembra que solo mira
       el montaje deja la pantalla en blanco justo en el caso que la dispara. */
    const { result, rerender } = montar({ proofreadFindings: [] });
    await waitFor(() => expect(result.current.items).toHaveLength(0));
    act(() => {
      useDocStore.setState({ proofreadFindings: base.proofreadFindings } as never);
    });
    rerender();
    await waitFor(() => expect(result.current.selected).toBeTruthy());
  });

  it('cambiar de filtro vuelve a sembrar, para no quedar en blanco', async () => {
    const { result } = montar();
    await waitFor(() => expect(result.current.selected).toBeTruthy());

    /* Un filtro que no deja hallazgos: la selección se vacía, y la pantalla
       vuelve al mensaje de "elige uno" —que en un filtro SIN hallazgos es
       correcto, no es el bug. El bug es el caso de la lista VACÍA. */
    act(() => result.current.setFilter('structure' as never));
    await waitFor(() => expect(result.current.visibleCount).toBe(0));

    /* Y al volver a un filtro con hallazgos, la lectura se repone sola. */
    act(() => result.current.setFilter('all' as never));
    await waitFor(() => expect(result.current.selected).toBeTruthy());
  });

  it('la siembra NO pisa lo que la persona ya estaba leyendo', async () => {
    /* Si la persona ya eligió un hallazgo, la llegada de más resultados —una
       auditoría que termina, un hallazgo nuevo— no le salta el contenido bajo
       los pies. Resembrar siempre sería peor que no sembrar nunca. */
    const { result } = montar();
    await waitFor(() => expect(result.current.selected).toBeTruthy());

    /* `select` toma el ID del HALLAZGO, que la vista genera, no el del
       elemento. Buscamos el que cae sobre `e2` para no adivinar el id. */
    const sobreE2 = result.current.items.find((i) => i.element_id === 'e2')!;
    expect(sobreE2).toBeTruthy();
    act(() => result.current.select(sobreE2.id));
    await waitFor(() => expect(result.current.selected?.id).toBe(sobreE2.id));

    act(() => {
      useDocStore.setState({ proofreadFindings: [...base.proofreadFindings, finding(3)] } as never);
    });
    await waitFor(() => expect(result.current.items.length).toBeGreaterThan(2));
    expect(result.current.selected?.id).toBe(sobreE2.id);
  });
});
