/** Fase 2: los cortes Word parten el elemento ANTES de computePages →
 *  cada fragmento cae en SU página (pág 2 existe y tiene su trozo). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { PaperCanvas } from '../components/layout/PaperCanvas';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(), resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(), suggestCaption: vi.fn(),
}));
vi.mock('../api/layout', () => ({ paginateLayout: vi.fn().mockResolvedValue({ session_id: 's1', available: false }) }));

describe('cortes Word en el canvas', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: {
        session_id: 's1', file_name: 't.docx', apa_format: 'student',
        elements: [{
          id: 'p1', type: 'paragraph', page_number: 1,
          text: 'AAA'.repeat(60) + 'BBB'.repeat(60),
          alignment: 'left', font_name: 'Times New Roman', font_size: 12,
          is_bold: false, is_italic: false, is_bullet: false,
          left_indent_cm: 0, confidence: 1, is_user_modified: false,
          needs_review: false, auto_applied: false, cita_ids: [],
        }],
        referencias: [], meta: { page_count: 1 },
      } as any,
      layoutCuts: { p1: [{ offset: 180, page: 2 }] },
      layoutEcho: 0, wordLayoutUnavailable: false,
    });
  });

  it('fragmenta en 2 hojas: la 2ª contiene solo el segundo tercio', () => {
    const { container } = render(<PaperCanvas />);
    const pageNodes = container.querySelectorAll('[id^="paper-page-"]');
    expect(pageNodes.length).toBe(2);
    const p1 = pageNodes[0].textContent || '';
    const p2 = pageNodes[1].textContent || '';
    const firstThird = 'AAA'.repeat(60);
    const lastThird = 'BBB'.repeat(60);
    expect(p1).toContain(firstThird.slice(0, 60));
    expect(p2).toContain(lastThird.slice(-60));
    expect(p2).not.toContain(firstThird.slice(0, 60));  // no duplica
    expect(p1).not.toContain(lastThird.slice(-60));
  });
});
