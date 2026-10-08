import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { useWindowWidth } from '../useWindowWidth';

describe('useWindowWidth', () => {
  beforeEach(() => {
    window.innerWidth = 1280;
  });

  it('devuelve el ancho actual', () => {
    const { result } = renderHook(() => useWindowWidth());
    expect(result.current).toBe(window.innerWidth);
  });

  it('se actualiza cuando cambia el ancho de la ventana', () => {
    const { result } = renderHook(() => useWindowWidth());
    act(() => {
      window.innerWidth = 640;
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(640);
  });

  it('deja de escuchar al desmontar', () => {
    const { result, unmount } = renderHook(() => useWindowWidth());
    unmount();
    act(() => {
      window.innerWidth = 400;
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(1280);
  });
});
