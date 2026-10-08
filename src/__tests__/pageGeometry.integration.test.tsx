/**
 * Integración geometría real en PaperCanvas (smoke):
 * - render sin doc no crashea
 * - con doc, la hoja usa PAGE_W/H derivados de pageGeometry (no 680 fijo)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { PaperCanvas } from '../components/layout/PaperCanvas';
import { getPageGeometry } from '../lib/pageGeometry';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(),
  suggestCaption: vi.fn(),
}));
vi.mock('../api/layout', () => ({ paginateLayout: vi.fn() }));

describe('PaperCanvas con geometría real', () => {
  beforeEach(() => {
    const s = useDocStore.getState();
    if (typeof (s as any).resetForTests === 'function') (s as any).resetForTests();
  });

  it('render sin doc sin crashear', () => {
    const { container } = render(<PaperCanvas />);
    expect(container).toBeTruthy();
  });

  it('pageGeometry expone la fuente de verdad de dimensiones', () => {
    // Contrato consumido por el canvas: hoja Letter real 816x1056px (612x792pt).
    const g = getPageGeometry({ margins_cm: 2.54, font_size_pt: 12, line_spacing: 2 });
    expect(Math.round(g.pageW)).toBe(816);
    expect(Math.round(g.pageH)).toBe(1056);
    expect(Math.round(g.marginPx)).toBe(96);
    void screen;
  });

  it('hoja pintada usa dimensiones de pageGeometry, no 680px fijo', () => {
    const doc = {
      session_id: 's1',
      file_name: 't.docx',
      apa_format: 'student',
      elements: [
        {
          id: 'p1', type: 'paragraph', text: 'hola', heading_level: undefined,
          alignment: 'left', font_name: 'Times New Roman', font_size: 12,
          is_bold: false, is_italic: false, is_bullet: false, left_indent_cm: 0,
          confidence: 1, is_user_modified: false, needs_review: false,
          auto_applied: false, cita_ids: [],
        },
      ],
      referencias: [],
      meta: { page_count: 1 },
    };
    useDocStore.setState({ doc: doc as any });
    const { container } = render(<PaperCanvas />);
    const sheet = container.querySelector('[id^="paper-page-"] > div') as HTMLElement
      || container.querySelector('div[style*="box-shadow"]') as HTMLElement;
    expect(sheet).toBeTruthy();
    const g = getPageGeometry({ margins_cm: 2.54, font_size_pt: 12, line_spacing: 2 });
    expect(sheet.style.width).toBe(`${Math.round(g.pageW)}px`);
    expect(sheet.style.height).toBe(`${Math.round(g.pageH)}px`);
    expect(sheet.style.padding).toBe(`${Math.round(g.marginPx)}px`);
  });

  /* La hoja del CSS y la del lienzo tienen que ser la MISMA. Se eligen por un
     atributo en `<html>`, igual que el tema, y el que lo escribe es el lienzo:
     si lo escribiera la pestaña de Ajustes, un documento guardado en A4 abriría
     con la hoja de Carta hasta que alguien pasara por el hub. */
  it('el lienzo publica el tamaño de hoja en <html data-page-size>', () => {
    const doc = {
      session_id: 's1', file_name: 't.docx', apa_format: 'student',
      elements: [{
        id: 'p1', type: 'paragraph', text: 'hola', confidence: 1,
        is_user_modified: false, needs_review: false, auto_applied: false, cita_ids: [],
      }],
      referencias: [], meta: { page_count: 1 },
    } as any;
    const base = useDocStore.getState().rules;

    act(() => { useDocStore.setState({ doc, rules: { ...base, page_size: 'a4' } as any }); });
    const { unmount } = render(<PaperCanvas />);
    expect(document.documentElement.getAttribute('data-page-size')).toBe('a4');
    unmount();

    act(() => { useDocStore.setState({ rules: { ...base, page_size: 'carta' } as any }); });
    render(<PaperCanvas />);
    expect(document.documentElement.getAttribute('data-page-size')).toBe('carta');
  });

  it('sin page_size en las reglas, el atributo sale con el default y no vacío', () => {
    /* Un documento guardado antes de que el campo existiera viene sin el. Si
       `aplicarPageSizeEnHtml` devolviera `undefined`, el atributo sería
       `data-page-size="undefined"` y el CSS no casaría con ningún par. */
    const doc = {
      session_id: 's1', file_name: 't.docx', apa_format: 'student',
      elements: [{
        id: 'p1', type: 'paragraph', text: 'hola', confidence: 1,
        is_user_modified: false, needs_review: false, auto_applied: false, cita_ids: [],
      }],
      referencias: [], meta: { page_count: 1 },
    } as any;
    const sinCampo = { ...useDocStore.getState().rules } as Record<string, unknown>;
    delete sinCampo.page_size;
    act(() => { useDocStore.setState({ doc, rules: sinCampo as any }); });
    render(<PaperCanvas />);
    expect(document.documentElement.getAttribute('data-page-size')).toBe('carta');
  });
});
