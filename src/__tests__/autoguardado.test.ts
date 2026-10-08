import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { useAutosave } from '../lib/useAutosave';

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('guarda al pasar el intervalo si hay cambios sin guardar', () => {
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    useDocStore.setState({
      doc: { session_id: 's1', elements: [], referencias: [] } as never,
      hasUnsavedChanges: true,
      isSaving: false,
      saveSnapshot,
    });
    renderHook(() => useAutosave(1000));
    vi.advanceTimersByTime(1000);
    expect(saveSnapshot).toHaveBeenCalledTimes(1);
  });

  it('no guarda si no hay cambios sin guardar', () => {
    const saveSnapshot = vi.fn().mockResolvedValue(undefined);
    useDocStore.setState({
      doc: { session_id: 's1', elements: [], referencias: [] } as never,
      hasUnsavedChanges: false,
      isSaving: false,
      saveSnapshot,
    });
    renderHook(() => useAutosave(1000));
    vi.advanceTimersByTime(3000);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
});
