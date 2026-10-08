import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useDocStore } from '../store/useDocStore';
import * as api from '../api/backend';

vi.mock('../api/backend', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/backend')>();
  return {
    ...real,
    listSessionSnapshots: vi.fn(),
    restoreSessionSnapshot: vi.fn(),
    recoverSession: vi.fn(),
  };
});

describe('historial de snapshots', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useDocStore.setState({
      doc: { session_id: 's1', file_name: 'T.docx', elements: [], referencias: [] } as never,
      snapshots: [],
      tabDocs: {},
      showToast: vi.fn(),
    });
  });

  it('loadSnapshots guarda la lista que devuelve el backend', async () => {
    (api.listSessionSnapshots as any).mockResolvedValue([
      { id: 2, created_at: '2026-10-06 10:00:00', element_count: 10, file_name: 'T.docx' },
    ]);
    await useDocStore.getState().loadSnapshots();
    expect(useDocStore.getState().snapshots).toHaveLength(1);
    expect(useDocStore.getState().snapshots[0].id).toBe(2);
  });

  it('restoreSnapshot recarga el documento restaurado', async () => {
    (api.restoreSessionSnapshot as any).mockResolvedValue({ session_id: 's1' });
    (api.recoverSession as any).mockResolvedValue({
      session_id: 's1', file_name: 'T.docx', elements: [], referencias: [],
    });
    await useDocStore.getState().restoreSnapshot(2);
    expect(api.restoreSessionSnapshot).toHaveBeenCalledWith('s1', 2);
    expect(api.recoverSession).toHaveBeenCalledWith('s1');
  });
});
