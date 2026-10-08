/**
 * Resaltado inline de revisión en PaperCanvas (crítica P0):
 * - Con reviewHighlightIds poblado, TODOS los tipos de elemento (encabezado,
 *   párrafo, viñeta, lista numerada, bloque citado, imagen, tabla y texto de
 *   portada) pintan el fondo de acento del design system.
 * - Sin el prop, ningún elemento lleva fondo extra (render idéntico).
 * - Solo los ids del conjunto se resaltan.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { PaperCanvas } from '../components/layout/PaperCanvas';
import { defaultPortada } from '../store/slices/coverSlice';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(),
  suggestCaption: vi.fn(),
}));

const HL = 'var(--color-accent-soft)';

const baseEl = (id: string, type: string, extra: Record<string, unknown> = {}) => ({
  id,
  type,
  text: `Texto de ${id}`,
  heading_level: undefined,
  alignment: 'left',
  font_name: 'Times New Roman',
  font_size: 12,
  is_bold: false,
  is_italic: false,
  is_bullet: false,
  left_indent_cm: 0,
  confidence: 1,
  is_user_modified: false,
  needs_review: false,
  auto_applied: false,
  cita_ids: [],
  ...extra,
});

const makeDoc = (elements: unknown[]) => ({
  session_id: 's1',
  file_name: 't.docx',
  apa_format: 'student',
  elements,
  referencias: [],
  meta: { page_count: 1 },
});

const BODY_IDS = ['h1', 'p1', 'b1', 'n1', 'q1', 'img1', 't1'];

const bodyDoc = () =>
  makeDoc([
    baseEl('h1', 'heading', { heading_level: 1 }),
    baseEl('p1', 'paragraph'),
    baseEl('b1', 'bullet'),
    baseEl('n1', 'numbered_list'),
    baseEl('q1', 'block_quote'),
    baseEl('img1', 'image', {
      image_info: { relative_url: 'fig.png', caption: '', figure_number: 0, alignment: 'center' },
    }),
    baseEl('t1', 'table', {
      table_info: { table_number: 1, caption: '', headers: ['Col'], rows: [['c']], note: '' },
    }),
  ]);

describe('PaperCanvas — resaltado inline de revisión', () => {
  it('con reviewHighlightIds, cada tipo de elemento pinta el fondo de acento', () => {
    useDocStore.setState({ doc: bodyDoc() as any, portada: { ...defaultPortada } });
    const { container } = render(<PaperCanvas reviewHighlightIds={new Set(BODY_IDS)} />);
    for (const id of BODY_IDS) {
      const wrap = container.querySelector(`#paper-elem-${id}`);
      expect(wrap, `wrapper de ${id}`).toBeTruthy();
      expect(wrap!.querySelector(`[style*="${HL}"]`), `resaltado en ${id}`).toBeTruthy();
    }
  });

  it('sin el prop, ningún elemento lleva fondo de resaltado', () => {
    useDocStore.setState({ doc: bodyDoc() as any, portada: { ...defaultPortada } });
    const { container } = render(<PaperCanvas />);
    for (const id of BODY_IDS) {
      const wrap = container.querySelector(`#paper-elem-${id}`);
      expect(wrap, `wrapper de ${id}`).toBeTruthy();
      expect(wrap!.querySelector(`[style*="${HL}"]`), `sin resaltado en ${id}`).toBeNull();
    }
  });

  it('solo se resaltan los ids presentes en el conjunto', () => {
    useDocStore.setState({ doc: bodyDoc() as any, portada: { ...defaultPortada } });
    const { container } = render(<PaperCanvas reviewHighlightIds={new Set(['p1'])} />);
    const marked = container.querySelector('#paper-elem-p1');
    expect(marked!.querySelector(`[style*="${HL}"]`)).toBeTruthy();
    for (const id of BODY_IDS.filter((x) => x !== 'p1')) {
      const wrap = container.querySelector(`#paper-elem-${id}`);
      expect(wrap!.querySelector(`[style*="${HL}"]`), `sin resaltado en ${id}`).toBeNull();
    }
  });

  it('el texto de portada estructurada también se resalta', () => {
    useDocStore.setState({
      doc: makeDoc([baseEl('cv1', 'paragraph', { is_cover_section: true })]) as any,
      portada: { ...defaultPortada },
    });
    const { container } = render(<PaperCanvas reviewHighlightIds={new Set(['cv1'])} />);
    const wrap = container.querySelector('#paper-elem-cv1');
    expect(wrap).toBeTruthy();
    expect(wrap!.getAttribute('style')).toContain(HL);
  });
});
