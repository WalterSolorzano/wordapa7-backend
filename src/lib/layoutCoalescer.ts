// src/lib/layoutCoalescer.ts
/**
 * WordAPA7 — Fase 2: coalescer de repaginación.
 *
 * Contrato (spec §3.1): debounce ~1.5s tras la última mutación y NUNCA
 * encadenar repaginaciones en vuelo. Si llegan schedules mientras `send`
 * corre, se marca dirty y, al terminar, se reinicia la ventana COMPLETA
 * de delayMs (pausa de tecleo real, no disparo inmediato).
 */
export interface LayoutCoalescer {
  schedule(): void;
  dispose(): void;
}

export interface CoalescerOptions {
  delayMs: number;
  send: () => Promise<void>;
  setTimeoutFn?: typeof setTimeout;
  clearTimeoutFn?: typeof clearTimeout;
}

export function createLayoutCoalescer(opts: CoalescerOptions): LayoutCoalescer {
  // CRÍTICO: resolver setTimeout/clearTimeout en CADA llamada, no en la
  // creación. El singleton se construye al importar el módulo (antes de que
  // los tests instalen fake timers); capturarlos ahí haría que
  // vi.advanceTimersByTimeAsync no disparara nunca el timer real.
  const scheduleTimer = (fn: () => void, ms: number): ReturnType<typeof setTimeout> =>
    opts.setTimeoutFn ? opts.setTimeoutFn(fn, ms) : setTimeout(fn, ms);
  const cancelTimer = (t: ReturnType<typeof setTimeout>): void =>
    opts.clearTimeoutFn ? opts.clearTimeoutFn(t) : clearTimeout(t);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight = false;
  let dirty = false;

  const schedule = (): void => {
    if (inFlight) { dirty = true; return; }
    if (timer) cancelTimer(timer);
    timer = scheduleTimer(() => {
      timer = null;
      void run();
    }, opts.delayMs);
  };

  const run = async (): Promise<void> => {
    inFlight = true;
    try {
      await opts.send();
    } catch {
      // Layout es best-effort: backend caído o sin Word no rompe el ciclo.
    } finally {
      inFlight = false;
    }
    if (dirty) {
      dirty = false;
      schedule();
    }
  };

  const dispose = (): void => {
    if (timer) cancelTimer(timer);
    timer = null;
    dirty = false;
  };

  return { schedule, dispose };
}
