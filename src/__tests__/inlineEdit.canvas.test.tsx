/** Fase 3: el párrafo de cuerpo se edita con contentEditable inline;
 *  los headings conservan el textarea overlay (NO editables inline). */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { PaperCanvas } from '../components/layout/PaperCanvas';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(), resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(), suggestCaption: vi.fn(),
  insertElement: vi.fn().mockResolvedValue({ elements: [] }),
  updateElement: vi.fn(async (_sid: string, eid: string, _t: string, _l: number, text: string) => {
    const st = useDocStore.getState();
    const doc = st.doc!;
    const updated = { ...doc, elements: doc.elements.map((e: any) => (e.id === eid ? { ...e, text } : e)) };
    useDocStore.setState({ doc: updated });
    return updated;
  }),
}));
vi.mock('../api/layout', () => ({ paginateLayout: vi.fn() }));

const elem = (id: string, type: string, text: string, extra: any = {}) =>
  ({
    id, type, text, page_number: 1, alignment: 'left', font_name: 'Times New Roman',
    font_size: 12, is_bold: false, is_italic: false, is_bullet: false,
    left_indent_cm: 0, confidence: 1, is_user_modified: false,
    needs_review: false, auto_applied: false, cita_ids: [], ...extra,
  }) as any;

const docWith = (elements: any[]) =>
  ({
    session_id: 's1', file_name: 't.docx', apa_format: 'student',
    elements, referencias: [], meta: { page_count: 1 },
  }) as any;

describe('edición inline en el canvas', () => {
  beforeEach(() => {
    useDocStore.setState({ doc: null, layoutCuts: {}, layoutEcho: 0, wordLayoutUnavailable: false });
  });

  it('doble click en párrafo → contentEditable inline', () => {
    useDocStore.setState({ doc: docWith([elem('p1', 'paragraph', 'hola mundo')]) });
    render(<PaperCanvas />);
    const node = document.getElementById('paper-elem-p1')!;
    fireEvent.doubleClick(node);
    const ed = screen.getByRole('textbox');
    expect(ed.getAttribute('contenteditable')).toBe('true');
    expect(ed.textContent).toBe('hola mundo');
  });

  it('doble click en heading → NO es contentEditable (textarea overlay)', () => {
    useDocStore.setState({ doc: docWith([elem('h1', 'heading', 'Título', { heading_level: 1 })]) });
    render(<PaperCanvas />);
    const node = document.getElementById('paper-elem-h1')!;
    fireEvent.doubleClick(node);
    expect(document.querySelector('[contenteditable="true"]')).toBeNull();
    expect(document.querySelector('textarea')).toBeTruthy();
  });

  it('Enter en el editor inline → splitParagraphAt (nuevo párrafo)', () => {
    useDocStore.setState({ doc: docWith([elem('p1', 'paragraph', 'dos MITAD')]) });
    render(<PaperCanvas />);
    const node = document.getElementById('paper-elem-p1')!;
    fireEvent.doubleClick(node);
    const ed = screen.getByRole('textbox') as HTMLElement;
    const range = document.createRange();
    range.setStart(ed.firstChild!, 3);
    range.collapse(true);
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent.keyDown(ed, { key: 'Enter' });
    // El store recibió el split: el párrafo actual quedó con "dos"
    const s = useDocStore.getState();
    expect(s.doc!.elements[0].text).toBe('dos');
  });
});
