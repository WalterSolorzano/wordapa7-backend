/**
 * Overlay de descarga (crítica P0): el auto-ocultado a 8s no debe soltar el
 * foco a mitad de lectura.
 * - Sin foco: se oculta a los 8s (comportamiento original intacto).
 * - focusin dentro: se cancela el timer (sigue visible >8s).
 * - focusout hacia fuera: se re-arranca con 8s completos.
 * - focusout interno (entre botones): no se re-arranca.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, screen } from '@testing-library/react';
import { DownloadSuccessOverlay } from '../components/layout/DownloadSuccessOverlay';
import { useDocStore } from '../store/useDocStore';

const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('DownloadSuccessOverlay — el foco pausa el auto-ocultado', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    act(() => {
      useDocStore.setState({ exportSuccessAt: 0 });
    });
    vi.useRealTimers();
  });

  it('sin foco dentro, se auto-oculta a los 8s', () => {
    useDocStore.setState({ exportSuccessAt: 1000 });
    render(<DownloadSuccessOverlay />);
    expect(screen.getByRole('status')).toBeTruthy();
    advance(8000);
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('focusin dentro del overlay cancela el timer (visible >8s)', () => {
    useDocStore.setState({ exportSuccessAt: 2000 });
    render(<DownloadSuccessOverlay />);
    const overlay = screen.getByRole('status');
    const btn = overlay.querySelector('button')!;
    fireEvent(btn, new FocusEvent('focusin', { bubbles: true }));
    advance(20000);
    expect(screen.queryByRole('status')).toBeTruthy();
  });

  it('focusout hacia fuera re-arranca el timer con 8s completos', () => {
    useDocStore.setState({ exportSuccessAt: 3000 });
    render(<DownloadSuccessOverlay />);
    const overlay = screen.getByRole('status');
    const btn = overlay.querySelector('button')!;
    fireEvent(btn, new FocusEvent('focusin', { bubbles: true }));
    advance(20000);
    expect(screen.queryByRole('status')).toBeTruthy(); // pausado

    const outside = document.createElement('div');
    document.body.appendChild(outside);
    fireEvent(btn, new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    advance(7999);
    expect(screen.queryByRole('status')).toBeTruthy(); // aún dentro de la ventana
    advance(1);
    expect(screen.queryByRole('status')).toBeNull(); // 8s exactos
  });

  it('mover el foco entre botones del overlay no re-arranca el timer', () => {
    useDocStore.setState({ exportSuccessAt: 4000 });
    render(<DownloadSuccessOverlay />);
    const overlay = screen.getByRole('status');
    const [btnA, btnB] = Array.from(overlay.querySelectorAll('button'));
    fireEvent(btnA, new FocusEvent('focusin', { bubbles: true }));
    fireEvent(btnA, new FocusEvent('focusout', { bubbles: true, relatedTarget: btnB }));
    advance(20000);
    expect(screen.queryByRole('status')).toBeTruthy(); // sigue pausado
  });
});
