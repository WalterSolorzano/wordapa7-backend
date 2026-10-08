import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useDocStore } from '../store/useDocStore';

const updateElement = vi.fn();
const insertElement = vi.fn();

vi.mock('../api/backend', () => ({
  uploadDocxFile: vi.fn(),
  updateElement: (...args: unknown[]) => updateElement(...args),
  getApiBase: vi.fn(),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://x'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn(),
  explainElement: vi.fn(),
  suggestCaption: vi.fn(),
  insertElement: (...args: unknown[]) => insertElement(...args),
}));

const makeDoc = () =>
  ({
    session_id: 's1',
    file_name: 't.docx',
    elements: [
      { id: 'e0', type: 'paragraph', text: 'uno', page_number: 1 },
      { id: 'e1', type: 'paragraph', text: 'dos', page_number: 1 },
      { id: 'e2', type: 'paragraph', text: 'tres', page_number: 1 },
    ],
    meta: { page_count: 1 },
    referencias: [],
  }) as any;

describe('splitParagraphAt', () => {
  beforeEach(() => {
    updateElement.mockReset().mockImplementation(async (_sid: string, eid: string, _t: string, _l: number, text: string) => {
      const st = useDocStore.getState();
      const doc = st.doc!;
      const updated = { ...doc, elements: doc.elements.map((e: any) => (e.id === eid ? { ...e, text } : e)) };
      useDocStore.setState({ doc: updated });
      return updated;
    });
    insertElement.mockReset().mockImplementation(async (_sid: string, afterId: string, newId: string, text: string) => {
      const st = useDocStore.getState();
      const doc = st.doc!;
      const idx = doc.elements.findIndex((e: any) => e.id === afterId);
      const newElem = { id: newId, type: 'paragraph', text, page_number: 1 } as any;
      const elements = [...doc.elements.slice(0, idx + 1), newElem, ...doc.elements.slice(idx + 1)];
      const updated = { ...doc, elements };
      useDocStore.setState({ doc: updated });
      return updated;
    });
    useDocStore.setState({ doc: makeDoc(), layoutCuts: {}, layoutEcho: 0, wordLayoutUnavailable: false });
  });

  it('commit de before al actual + insert de after como párrafo nuevo', async () => {
    await useDocStore.getState().splitParagraphAt('e1', 'dos MITAD', 'MITAD dos');
    const s = useDocStore.getState();
    expect(s.doc!.elements[1].text).toBe('dos MITAD');
    expect(insertElement).toHaveBeenCalledWith('s1', 'e1', expect.any(String), 'MITAD dos');
    // El nuevo elemento está en el modelo, tras e1
    const ids = s.doc!.elements.map((e) => e.id);
    expect(ids[0]).toBe('e0');
    expect(ids[1]).toBe('e1');
    expect(ids[2]).not.toBe('e1');
    expect(ids[3]).toBe('e2');
    expect(s.doc!.elements[2].text).toBe('MITAD dos');
    expect(s.doc!.elements[2].type).toBe('paragraph');
  });

  it('after vacío → no inserta (split al final del texto)', async () => {
    await useDocStore.getState().splitParagraphAt('e1', 'dos', '');
    expect(insertElement).not.toHaveBeenCalled();
  });

  it('elemento inexistente → no hace nada', async () => {
    await useDocStore.getState().splitParagraphAt('zzz', 'a', 'b');
    expect(insertElement).not.toHaveBeenCalled();
  });
});
