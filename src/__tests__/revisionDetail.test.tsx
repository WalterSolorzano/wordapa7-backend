import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RevisionDetail } from '../components/review/RevisionDetail';
import { useDocStore } from '../store/useDocStore';

const hallazgo = (over = {}) => ({
  element_id: 'e1', start: 0, end: 3, excerpt: 'a evolucionado', kind: 'ortografia',
  severity: 'warn', message: 'Se esperaba «ha»', source: 'local', phase: null, read_only: false, ...over,
});

describe('RevisionDetail (REV-L1)', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: { session_id: 's', elements: [{ id: 'e1', type: 'paragraph', text: 'a evolucionado hacia modelos' }] } as never,
      proofreadFindings: [hallazgo()],
      reviewResult: null,
      citationAuditResult: null,
      dismissedFindingIds: [],
      dismissedCommentIds: [],
    });
  });

  it('ofrece Aceptar y Aceptar todas en un motor objetivo', () => {
    render(<RevisionDetail foco={{ motor: 'spelling' }} onBack={() => {}} />);
    expect(screen.getByText('Aceptar')).toBeTruthy();
    expect(screen.getByText(/Aceptar todas/)).toBeTruthy();
  });

  it('nunca ofrece Aceptar sobre un motor de IA', () => {
    useDocStore.setState({
      proofreadFindings: [hallazgo({ kind: 'muletilla', severity: 'info' })],
    });
    render(<RevisionDetail foco={{ motor: 'ai' }} onBack={() => {}} />);
    expect(screen.queryByText('Aceptar')).toBeNull();
    expect(screen.getByText('Marcar para revisar')).toBeTruthy();
  });

  it('la portada no ofrece botón de aceptar', () => {
    useDocStore.setState({ proofreadFindings: [hallazgo({ kind: 'portada_punto_final', read_only: true, phase: 'portada' })] });
    render(<RevisionDetail foco={{ phase: 'portada' }} onBack={() => {}} />);
    expect(screen.queryByText('Aceptar')).toBeNull();
    expect(screen.getByText(/Solo lectura/)).toBeTruthy();
  });

  it('replica el mockup: severidad, propuesta antigua→nueva, Copiar y puntos del motor', () => {
    useDocStore.setState({
      proofreadFindings: [hallazgo({ suggestion: 'ha evolucionado' })],
    });
    render(<RevisionDetail foco={{ motor: 'spelling' }} onBack={() => {}} />);
    expect(screen.getByText('severidad alta')).toBeTruthy();
    expect(screen.getByText('Propuesta')).toBeTruthy();
    expect(screen.getByText('ha evolucionado')).toBeTruthy();
    expect(screen.getByText('Puntos de este motor')).toBeTruthy();
    expect(screen.getByText(/motor objetivo/)).toBeTruthy();
    const copiar = screen.getByText('Copiar');
    expect(copiar).toBeTruthy();
    fireEvent.click(copiar);
  });

  it('«Aceptar todas» no incluye subtipos que el motor solo marca', () => {
    useDocStore.setState({
      proofreadFindings: [
        hallazgo({ element_id: 'e1', kind: 'first_person', message: 'Primera persona' }),
        hallazgo({ element_id: 'e2', kind: 'passive_voice', message: 'Voz pasiva' }),
      ],
    });
    render(<RevisionDetail foco={{ motor: 'style' }} onBack={() => {}} />);
    expect(screen.getByText('Aceptar')).toBeTruthy();
    // 1 corregible (`primera_persona`), 1 que solo se marca (`voz_pasiva`).
    expect(screen.getByText('Aceptar todas (1)')).toBeTruthy();
    expect(screen.queryByText('Aceptar todas (2)')).toBeNull();
  });

  it('una cita fantasma ofrece resolver las citas del documento', () => {
    const autoResolveGhosts = vi.fn();
    useDocStore.setState({
      proofreadFindings: [],
      autoResolveGhosts,
      citationAuditResult: {
        ghost_citations: [{ citation_text: 'García, 2020', element_id: 'e1' }],
        orphan_references: [],
      } as never,
    });
    render(<RevisionDetail foco={{ motor: 'citations' }} onBack={() => {}} />);
    expect(screen.queryByText(/Solo lectura/)).toBeNull();
    fireEvent.click(screen.getByText('Resolver citas del documento'));
    expect(autoResolveGhosts).toHaveBeenCalled();
  });

  it('una figura sin rotular ofrece rotular el documento', () => {
    useDocStore.setState({
      doc: { session_id: 's', elements: [{ id: 'img1', type: 'image', image_info: {} }] } as never,
      proofreadFindings: [],
      citationAuditResult: null,
    });
    render(<RevisionDetail foco={{ motor: 'structure' }} onBack={() => {}} />);
    expect(screen.queryByText(/Solo lectura/)).toBeNull();
    expect(screen.getByText('Rotular todo el documento')).toBeTruthy();
  });

  it('una referencia huérfana no muestra el texto reservado a la portada', () => {
    useDocStore.setState({
      proofreadFindings: [],
      citationAuditResult: {
        ghost_citations: [],
        orphan_references: [{ authors: ['Pérez'], year: 2019, raw_text: 'Pérez (2019).' }],
      } as never,
    });
    render(<RevisionDetail foco={{ motor: 'citations' }} onBack={() => {}} />);
    expect(screen.queryByText(/Solo lectura/)).toBeNull();
    expect(screen.getByText('Marcar para revisar')).toBeTruthy();
  });

  it('filtra por fase con la misma resolución que la columna de REV-L0', () => {
    /* El hallazgo de cita llega con `phase: null`; su fase es la del H1 que lo
       contiene. Filtrar por el `phase` crudo lo dejaba fuera de la columna que
       sí lo contaba. */
    useDocStore.setState({
      doc: {
        session_id: 's',
        elements: [
          { id: 'h1', type: 'heading', heading_level: 1, text: 'Metodo' },
          { id: 'e1', type: 'paragraph', text: 'Se aplicó una encuesta.' },
        ],
      } as never,
      proofreadFindings: [],
      citationAuditResult: {
        ghost_citations: [{ citation_text: 'García, 2020', element_id: 'e1' }],
        orphan_references: [],
      } as never,
    });
    render(<RevisionDetail foco={{ phase: 'metodo' }} onBack={() => {}} />);
    expect(screen.queryByText('No hay hallazgos con este filtro.')).toBeNull();
    expect(screen.getByText(/Aparece citada en el cuerpo/)).toBeTruthy();
  });
});
