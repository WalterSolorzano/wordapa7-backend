/**
 * Challenger 1 Verification Test for R1 (computePages in PaperCanvas)
 */
import { describe, it, expect } from 'vitest';
import { ElementModel } from '../types';

// Standalone mirror of computePages algorithm from PaperCanvas.tsx to isolate logic
function computePages(elements: ElementModel[]): ElementModel[][] {
  const pages: ElementModel[][] = [];
  let currentPage: ElementModel[] = [];
  let currentEstimatedHeight = 0;
  const MAX_PAGE_UNITS = 30;

  elements.forEach((elem) => {
    if (elem.type === 'empty') return;

    let units = 1;
    if (elem.type === 'heading') units = 2;
    if (elem.type === 'image') units = 4;
    if (elem.type === 'table') units = 6;
    if (elem.type === 'portada_block' || elem.is_cover_section) units = elem.image_info ? 1.2 : 0.6;
    if (elem.type === 'paragraph') units = Math.max(1, Math.ceil((elem.text || '').length / 250));

    const isFirstBodyHeading = !elem.is_cover_section && elem.type === 'heading' && elem.text && elem.text.toLowerCase().includes('introducc');
    const isLevel1Heading = elem.type === 'heading' && elem.heading_level === 1;

    if (
      elem.type === 'page_break' ||
      isFirstBodyHeading ||
      (isLevel1Heading && currentPage.length > 0) ||
      (currentEstimatedHeight + units > MAX_PAGE_UNITS && currentPage.length > 0)
    ) {
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentEstimatedHeight = 0;
      }
    }

    if (elem.type !== 'page_break') {
      currentPage.push(elem);
      currentEstimatedHeight += units;
    }
  });

  if (currentPage.length > 0) pages.push(currentPage);
  if (pages.length === 0) pages.push([]);

  return pages;
}

function makeDocElement(overrides: Partial<ElementModel> = {}): ElementModel {
  const text = overrides.text || 'Texto de prueba';
  return {
    id: `elem_${Math.random().toString(36).substring(2, 9)}`,
    type: 'paragraph',
    heading_level: 1,
    text: text,
    original_text: text,
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

describe('R1: Visual Pagination (computePages)', () => {
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
