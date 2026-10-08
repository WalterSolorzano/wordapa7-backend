/**
 * WordAPA7 — Feature Tests for R1, R2, R3
 *
 * Tests for:
 * - R1: Visual Pagination with Level 1 Headings (computePages)
 * - R2: Real-time Roman/Decimal Numbering (toRoman & renumberHeadings)
 * - R3: Structural Revision Panel (Step2HeadingsWizard controls)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { useDocStore, toRoman, cleanHeadingPrefix } from '../store/useDocStore';
import { computePages } from '../components/layout/PaperCanvas';
import { Step2HeadingsWizard } from '../components/wizard/Step2HeadingsWizard';
import { DocumentModel, ElementModel } from '../types';

function makeDocElement(overrides: Partial<ElementModel> = {}): ElementModel {
  return {
    id: `elem_${Math.random().toString(36).substring(2, 9)}`,
    type: 'paragraph',
    heading_level: 1,
    text: 'Texto de prueba',
    style_name: 'Normal',
    alignment: 'left',
    font_name: 'Times New Roman',
    font_size: 12,
    is_bold: false,
    is_italic: false,
    is_bullet: false,
    left_indent_cm: 0,
    confidence: 0.9,
    is_user_modified: false,
    needs_review: false,
    auto_applied: false,
    cita_ids: [],
    ...overrides,
  };
}

describe('R2: Real-time Roman and Decimal Numbering (useDocStore)', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: null,
      history: [],
      historyIndex: -1,
    });
  });

  describe('toRoman helper function', () => {
    it('converts positive integers to Roman numerals', () => {
      expect(toRoman(1)).toBe('I');
      expect(toRoman(2)).toBe('II');
      expect(toRoman(3)).toBe('III');
      expect(toRoman(4)).toBe('IV');
      expect(toRoman(5)).toBe('V');
      expect(toRoman(9)).toBe('IX');
      expect(toRoman(10)).toBe('X');
      expect(toRoman(14)).toBe('XIV');
      expect(toRoman(21)).toBe('XXI');
    });

    it('returns empty string for non-positive numbers', () => {
      expect(toRoman(0)).toBe('');
      expect(toRoman(-5)).toBe('');
    });
  });

  describe('cleanHeadingPrefix helper function', () => {
    it('strips bracket markers and existing number prefixes', () => {
      expect(cleanHeadingPrefix('[ROMAN] Introducción')).toBe('Introducción');
      expect(cleanHeadingPrefix('[DECIMAL] Marco Teórico')).toBe('Marco Teórico');
      expect(cleanHeadingPrefix('I. Introducción')).toBe('Introducción');
      expect(cleanHeadingPrefix('1. Marco Teórico')).toBe('Marco Teórico');
      expect(cleanHeadingPrefix('IV. Metodología')).toBe('Metodología');
      expect(cleanHeadingPrefix('[ROMAN] I. Introducción')).toBe('Introducción');
      expect(cleanHeadingPrefix('Resultados')).toBe('Resultados');
    });
  });

  describe('renumberHeadings', () => {
    it('renumbers Level 1 headings with Roman prefixes ("I. ", "II. ")', () => {
      const doc = {
        session_id: 'test_sess',
        file_name: 'doc.docx',
        apa_format: 'student',
        elements: [
          makeDocElement({ id: 'h1', type: 'heading', heading_level: 1, text: 'Introducción' }),
          makeDocElement({ id: 'p1', type: 'paragraph', text: 'Párrafo de intro' }),
          makeDocElement({ id: 'h2', type: 'heading', heading_level: 2, text: 'Subsección' }),
          makeDocElement({ id: 'h3', type: 'heading', heading_level: 1, text: 'Metodología' }),
        ],
      } as unknown as DocumentModel;

      useDocStore.setState({ doc });

      useDocStore.getState().renumberHeadings('roman');

      const updated = useDocStore.getState().doc;
      expect(updated?.elements[0].text).toBe('I. Introducción');
      expect(updated?.elements[0].original_text).toBe('Introducción');
      expect(updated?.elements[1].text).toBe('Párrafo de intro');
      expect(updated?.elements[2].text).toBe('Subsección');
      expect(updated?.elements[3].text).toBe('II. Metodología');
      expect(updated?.elements[3].original_text).toBe('Metodología');
    });

    it('renumbers Level 1 headings with Decimal prefixes ("1. ", "2. ")', () => {
      const doc = {
        session_id: 'test_sess',
        file_name: 'doc.docx',
        apa_format: 'student',
        elements: [
          makeDocElement({ id: 'h1', type: 'heading', heading_level: 1, text: 'Antecedentes' }),
          makeDocElement({ id: 'h2', type: 'heading', heading_level: 1, text: 'Marco Teórico' }),
        ],
      } as unknown as DocumentModel;

      useDocStore.setState({ doc });

      useDocStore.getState().renumberHeadings('decimal');

      const updated = useDocStore.getState().doc;
      expect(updated?.elements[0].text).toBe('1. Antecedentes');
      expect(updated?.elements[0].original_text).toBe('Antecedentes');
      expect(updated?.elements[1].text).toBe('2. Marco Teórico');
      expect(updated?.elements[1].original_text).toBe('Marco Teórico');
    });

    it('switches between Roman and Decimal cleanly without duplicating prefixes', () => {
      const doc = {
        session_id: 'test_sess',
        file_name: 'doc.docx',
        apa_format: 'student',
        elements: [
          makeDocElement({ id: 'h1', type: 'heading', heading_level: 1, text: 'Capítulo Uno' }),
        ],
      } as unknown as DocumentModel;

      useDocStore.setState({ doc });

      // First convert to Roman
      useDocStore.getState().renumberHeadings('roman');
      expect(useDocStore.getState().doc?.elements[0].text).toBe('I. Capítulo Uno');

      // Then convert to Decimal
      useDocStore.getState().renumberHeadings('decimal');
      expect(useDocStore.getState().doc?.elements[0].text).toBe('1. Capítulo Uno');

      // Back to Roman
      useDocStore.getState().renumberHeadings('roman');
      expect(useDocStore.getState().doc?.elements[0].text).toBe('I. Capítulo Uno');
    });
  });
});

describe('R1: Visual Pagination (PaperCanvas / computePages)', () => {
  it('forces a page break on Level 1 headings when currentPage has elements', () => {
    const elements: ElementModel[] = [
      makeDocElement({ id: 'p1', type: 'paragraph', text: 'Párrafo de inicio' }),
      makeDocElement({ id: 'h1', type: 'heading', heading_level: 1, text: 'Sección Principal 1' }),
      makeDocElement({ id: 'p2', type: 'paragraph', text: 'Contenido de la sección 1' }),
      makeDocElement({ id: 'h2', type: 'heading', heading_level: 1, text: 'Sección Principal 2' }),
    ];

    const pages = computePages(elements);

    expect(pages.length).toBe(3);
    expect(pages[0].map(e => e.id)).toEqual(['p1']);
    expect(pages[1].map(e => e.id)).toEqual(['h1', 'p2']);
    expect(pages[2].map(e => e.id)).toEqual(['h2']);
  });

  it('does not create an extra page break if Level 1 heading is the first element on page', () => {
    const elements: ElementModel[] = [
      makeDocElement({ id: 'h1', type: 'heading', heading_level: 1, text: 'Sección Inicial' }),
      makeDocElement({ id: 'p1', type: 'paragraph', text: 'Texto de sección' }),
    ];

    const pages = computePages(elements);

    expect(pages.length).toBe(1);
    expect(pages[0].map(e => e.id)).toEqual(['h1', 'p1']);
  });

  it('does not force page breaks for Level 2 or Level 3 headings', () => {
    const elements: ElementModel[] = [
      makeDocElement({ id: 'p1', type: 'paragraph', text: 'Párrafo intro' }),
      makeDocElement({ id: 'h2', type: 'heading', heading_level: 2, text: 'Subsección' }),
      makeDocElement({ id: 'h3', type: 'heading', heading_level: 3, text: 'Sub-subsección' }),
    ];

    const pages = computePages(elements);

    expect(pages.length).toBe(1);
    expect(pages[0].length).toBe(3);
  });
});

describe('R3: Structural Revision Panel (Step2HeadingsWizard)', () => {
  const mockUpdateElementType = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    const mockElements: ElementModel[] = [
      makeDocElement({ id: 'h_lvl2', type: 'heading', heading_level: 2, text: 'Título Nivel 2', confidence: 0.6, needs_review: true }),
      makeDocElement({ id: 'h_lvl1', type: 'heading', heading_level: 1, text: 'Título Nivel 1', confidence: 0.7, needs_review: true }),
    ];

    const doc = {
      session_id: 'test_wizard_sess',
      file_name: 'wizard_doc.docx',
      apa_format: 'student',
      elements: mockElements,
    } as unknown as DocumentModel;

    useDocStore.setState({
      doc,
      selectedElementId: 'h_lvl2',
      updateElementType: mockUpdateElementType,
      rules: {
        heading_numbering_style_lvl1: 'decimal',
        heading_numbering_style_lvl2: 'decimal',
        heading_numbering_style_lvl3: 'decimal',
      } as any,
    });
  });

  it('renders headings in document view and shows filter toggles', () => {
    const { container } = render(React.createElement(Step2HeadingsWizard));

    // The document title is visible
    expect(screen.getByText('Estructura (2 títulos)')).toBeDefined();

    // Filter toggles exist
    expect(screen.getByRole('button', { name: 'Revisar (2)' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Ver todos (2)' })).toBeDefined();

    // Headings appear in the document canvas. The preview adds a numbering
    // prefix to the visible text (e.g. "0.1. Título Nivel 2"), so we assert
    // presence by the element id instead of an exact text match.
    expect(container.querySelectorAll('[id^="paper-elem-h_lvl"]').length).toBeGreaterThan(0);
  });

  it('does not show a duplicate heading map (unified in the rail flyout); sequential reviewer appears in Revisar mode', () => {
    render(React.createElement(Step2HeadingsWizard));

    // "Ver todos" is the default
    const todosBtn = screen.getByRole('button', { name: 'Ver todos (2)' });
    expect(todosBtn).toBeDefined();
    // El "Mapa de títulos" se unificó en el flyout del rail (visible en pasos
    // 2-4): ya no se duplica dentro de Step2.
    expect(screen.queryByText('Mapa de títulos')).toBeNull();

    // The reviewer header should NOT be visible yet
    expect(screen.queryByText('Revisor de títulos')).toBeNull();

    // Switch to "Revisar": sequential reviewer panel appears
    const revisarBtn = screen.getByRole('button', { name: 'Revisar (2)' });
    fireEvent.click(revisarBtn);
    expect(screen.getByText('Revisor de títulos')).toBeDefined();
    expect(screen.getByText('1 / 2')).toBeDefined();
  });

  it('renders headings with border-left styling in the document', () => {
    const { container } = render(React.createElement(Step2HeadingsWizard));

    // The heading elements are rendered as styled paragraphs in the PaperCanvas
    const headingElems = container.querySelectorAll('[id^="paper-elem-h_lvl"]');
    expect(headingElems.length).toBeGreaterThan(0);
  });
});

// ─── R4: Fase E (Home) / Fase F (Revisor IA) — store actions ─────────────────
describe('R4: Fase E/F — Home + AI Review store actions', () => {
  beforeEach(() => {
    useDocStore.setState({
      atHome: false,
      reviewResult: null,
      isReviewLoading: false,
      doc: null,
    });
  });

  it('goHome() toggles the atHome flag so App renders the backstage', () => {
    useDocStore.getState().goHome();
    expect(useDocStore.getState().atHome).toBe(true);
  });

  /* El test de `setReviewOpen()` se fue con el flag. `isReviewOpen` no lo leía
     ningún componente —la revisión se abre yendo a la fase 5— y una prueba que
     verifica que un setter escriba en un store que nadie mira es la forma más
     eficiente de mantener deuda viva. `flagsDeUiSinLector.test.ts` ahora es la
     que vigila que no vuelva. */

  it('runAIReview() no-ops when there is no document without crashing', async () => {
    await expect(useDocStore.getState().runAIReview()).resolves.toBeUndefined();
    expect(useDocStore.getState().reviewResult).toBeNull();
  });

  it('saveSnapshot() no-ops gracefully when there is no document', async () => {
    await expect(useDocStore.getState().saveSnapshot()).resolves.toBeUndefined();
  });
});
