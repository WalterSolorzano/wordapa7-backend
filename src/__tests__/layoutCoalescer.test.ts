// src/__tests__/layoutCoalescer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createLayoutCoalescer } from '../lib/layoutCoalescer';

describe('layoutCoalescer', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('N schedules en la ventana → un solo send', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const c = createLayoutCoalescer({ delayMs: 1500, send });
    c.schedule(); c.schedule(); c.schedule();
    await vi.advanceTimersByTimeAsync(1499);
    expect(send).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('schedule durante vuelo → dirty, no encadena: un send más tras resolver', async () => {
    let resolveSend!: () => void;
    const send = vi.fn().mockImplementation(
      () => new Promise<void>((r) => { resolveSend = r; }),
    );
    const c = createLayoutCoalescer({ delayMs: 1500, send });
    c.schedule();
    await vi.advanceTimersByTimeAsync(1500);   // send #1 en vuelo
    expect(send).toHaveBeenCalledTimes(1);
    c.schedule(); c.schedule();                 // durante vuelo → dirty
    await vi.advanceTimersByTimeAsync(5000);    // nada: sigue en vuelo
    expect(send).toHaveBeenCalledTimes(1);
    resolveSend();
    await vi.advanceTimersByTimeAsync(1499);    // nueva ventana completa
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);      // 1 sola reposición, sin cadena
  });

  it('send rechazado no deja inFlight colgado', async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error('red')).mockResolvedValue(undefined);
    const c = createLayoutCoalescer({ delayMs: 100, send });
    c.schedule();
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(10);      // flush del catch
    c.schedule();
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('dispose cancela el timer pendiente', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const c = createLayoutCoalescer({ delayMs: 1500, send });
    c.schedule();
    c.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(send).not.toHaveBeenCalled();
  });
});
