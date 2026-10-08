/**
 * WordAPA7 — el rail y la pantalla a la que lleva no pueden discrepar.
 *
 * Estas pruebas son la ERRATA de las tres definiciones de "pendiente" que
 * coexistían: `useRailDestinations` (sin clave para la portada, y contando
 * solo ortografía + citas fantasma en la fase 5), `App.pendingCountForPhase`
 * (que exigía `figure_number > 0` en la fase 3) y el workbench de Revisión (que
 * además contaba detector de IA, referencias huérfanas y rotulación). Ahora
 * las tres leen `lib/railPending.ts`, y esta tabla dice qué dice esa función.
 *
 * Tabla sobre fixtures, no sobre un documento real: cada fila es un caso donde
 * el rail viejo y la pantalla vieja se contradecían.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { render } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { useRailDestinations, railPendingInputFrom } from '../hooks/useRailDestinations';
import { readPhaseStates, pendingCountForPhase } from '../lib/railPending';
import { collectAuditItems } from '../lib/auditItems';
import type { RailPendingInput } from '../lib/railPending';

const portadaVacia = { title: '', author: '', apa_format: 'student' } as never;
const portadaLlena = { title: 'Tesis', author: 'Ana Pérez', apa_format: 'student' } as never;

const base = (over: Partial<RailPendingInput> = {}): RailPendingInput => ({
  hasDoc: true,
  portada: portadaVacia,
  coverSetupDone: false,
  elements: [],
  hasReferences: false,
  reviewResult: null,
  proofreadFindings: [],
  citationAuditResult: null,
  ...over,
});

const img = (over: Record<string, unknown> = {}) => ({
  id: 'i1', type: 'image', text: '', needs_review: true, auto_applied: false,
  cita_ids: [], confidence: 1, ...over,
}) as never;

describe('las tres definiciones de "pendiente", en una sola', () => {
  it('la fase 1 cuenta los campos vacíos de la portada, no un cero estructural', () => {
    // El rail viejo no tenía clave `1`: Portada era "Listo"/"Sin pendientes"
    // sobre un documento sin título y sin autor, que el atajo contaba como 2.
    const s = readPhaseStates(base());
    expect(s[1].pending).toBe(2);
    expect(s[1].done).toBe(false);
  });

  it('la portada confirmada manda sobre los campos: un "Listo" con dos vacíos sería falso', () => {
    const s = readPhaseStates(base({ coverSetupDone: true }));
    expect(s[1].pending).toBe(0);
    expect(s[1].done).toBe(true);
  });

  it('la fase 3 exige lo mismo que el atajo: numerada y sin error de render', () => {
    const elements = [
      // Numerada y marcada: pendiente, y accionable.
      img({ id: 'f1', image_info: { figure_number: 1 } }),
      // Sin número: la fase 3 no puede rotular lo que no tiene posición.
      img({ id: 'f2', image_info: {} }),
      // Numerada pero no se pudo renderizar: otro problema, no un pendiente.
      img({ id: 'f3', image_info: { figure_number: 3, render_error: true } }),
    ];
    expect(readPhaseStates(base({ elements }))[3].pending).toBe(1);
  });

  it('la fase 5 cuenta lo MISMO que el workbench: el detector de IA también es trabajo', () => {
    const elements = [img({ id: 'f1', image_info: { figure_number: 1 } })];
    const input = base({
      elements,
      proofreadFindings: [
        { element_id: 'p1', start: 0, end: 1, excerpt: 'x', kind: 'ortografia', severity: 'warn', message: 'x', source: 'local' },
      ] as never,
      reviewResult: { paragraphs: [{ element_id: 'p1', ai_score: 80 }] },
      citationAuditResult: { ghost_citations: [], orphan_references: [{ authors: ['X'], year: 2020 }] },
    });
    const rail = readPhaseStates(input)[5].pending;
    // El workbench abre: 1 de IA + 1 de ortografía + 1 huérfana + 1 figura sin
    // rotular. El rail viejo contaba solo el segundo.
    const workbench = collectAuditItems(input).length;
    expect(workbench).toBe(4);
    expect(rail).toBe(workbench);
  });

  it('el rail descuenta lo que la persona ya descartó en la pantalla', () => {
    // Si no lo hiciera, la fase 5 seguiría "pendiente" después de que el usuario
    // la dejó limpia: la misma contradicción rail/pantalla, con el signo cambiado.
    const elements = [img({ id: 'f1', image_info: { figure_number: 1 } })];
    const input = base({
      elements,
      proofreadFindings: [
        { element_id: 'p1', start: 0, end: 1, excerpt: 'x', kind: 'ortografia', severity: 'warn', message: 'x', source: 'local' },
      ] as never,
    });
    const total = collectAuditItems(input).length;
    const conDescarte = readPhaseStates({
      ...input,
      dismissedFindingIds: [collectAuditItems(input)[0].id],
    })[5].pending;
    expect(conDescarte).toBe(total - 1);
  });

  it('la fase 1 cuenta el autor del acta, no solo el título de la portada', () => {
    const input = base({ portada: portadaLlena, acta: { autor: '' } as never });
    expect(readPhaseStates(input)[1].pending).toBe(1);
  });

  it('la fase 2 usa needsReview: un elemento ya editado por el usuario no es pendiente', () => {
    const elements = [
      { id: 'h1', type: 'heading', text: 'x', needs_review: true, auto_applied: false, cita_ids: [], confidence: 1, is_user_modified: true },
    ] as never[];
    expect(readPhaseStates(base({ elements }))[2].pending).toBe(0);
  });

  it('sin documento no hay fases que contar', () => {
    expect(readPhaseStates(base({ hasDoc: false }))).toEqual({});
  });

  it('el atajo de teclado lee la MISMA cuenta que el rail', () => {
    // `pendingCountForPhase` es lo que usa Ctrl+Enter para saltar de fase; si
    // contara otra cosa, llevaría a una fase que el rail declara "Lista".
    const elements = [img({ id: 'f1', image_info: { figure_number: 1 } })];
    const input = base({ elements });
    expect(pendingCountForPhase(input, 3)).toBe(readPhaseStates(input)[3].pending);
    expect(pendingCountForPhase(input, 1)).toBe(2);
  });
});

describe('el rail pintado con la misma derivación', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: null,
      portada: portadaVacia,
      coverSetupDone: false,
      reviewResult: null,
      proofreadFindings: [],
      citationAuditResult: null,
      viewMode: 'edit',
    } as never);
  });

  const read = () => {
    let items: ReturnType<typeof useRailDestinations> = [];
    function Probe() { items = useRailDestinations(); return null; }
    render(React.createElement(Probe));
    return items;
  };

  const byStep = (items: ReturnType<typeof useRailDestinations>, step: number) => {
    const found = items.find((i) => i.step === step);
    if (!found) throw new Error(`sin destino para la fase ${step}`);
    return found;
  };

  it('una portada vacía no se muestra como "Sin pendientes"', () => {
    useDocStore.setState({ doc: { elements: [], referencias: [] } } as never);
    const step1 = byStep(read(), 1);
    expect(step1.status).toBe('pending');
    expect(step1.pending).toBe(2);
  });

  it('tres figuras sin rotular hacen que Revisión & IA NO sea "Listo"', () => {
    // Este era el caso que el review.signal: punto verde y la palabra "Listo"
    // encima de un workbench con tres hallazgos `high`.
    useDocStore.setState({
      doc: {
        elements: [
          img({ id: 'f1', image_info: { figure_number: 1 } }),
          img({ id: 'f2', image_info: { figure_number: 2 } }),
          img({ id: 'f3', image_info: { figure_number: 3 } }),
        ],
        referencias: [],
      },
    } as never);
    const step5 = byStep(read(), 5);
    expect(step5.status).toBe('pending');
    expect(step5.pending).toBe(3);
  });

  it('Exportar no tiene estado inventado: la fase 6 no está en la derivación', () => {
    useDocStore.setState({ doc: { elements: [], referencias: [] } } as never);
    const step6 = byStep(read(), 6);
    expect(step6.status).toBe('idle');
    expect(step6.pending).toBe(0);
  });

  it('con el túnel de export abierto, Exportar es el destino a la vista', () => {
    useDocStore.setState({
      doc: { elements: [], referencias: [] },
      wizardStep: 2,
      viewMode: 'export',
    } as never);
    const step6 = byStep(read(), 6);
    expect(step6.current).toBe(true);
  });

  it('el armado de la entrada lee el store entero una sola vez', () => {
    const input = railPendingInputFrom(useDocStore.getState());
    expect(input.hasDoc).toBe(false);
    useDocStore.setState({ doc: { elements: [img({ id: 'f1', image_info: { figure_number: 1 } })], referencias: [] } } as never);
    const conDoc = railPendingInputFrom(useDocStore.getState());
    expect(conDoc.hasDoc).toBe(true);
    expect(conDoc.elements).toHaveLength(1);
  });
});
