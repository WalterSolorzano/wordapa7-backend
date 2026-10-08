import { describe, it, expect } from 'vitest';
import {
  summarizeScanOutcomes,
  toReason,
  EngineScanOutcome,
  MAX_TOAST_LENGTH,
} from '../components/wizard/scanOutcome';

const IA: EngineScanOutcome = { id: 'ai', label: 'IA', ok: true };
const ORTO: EngineScanOutcome = { id: 'proofread', label: 'Ortografía', ok: true };
const CITAS: EngineScanOutcome = { id: 'citations', label: 'Citas', ok: true };

const failed = (o: EngineScanOutcome, reason?: string): EngineScanOutcome => ({
  ...o,
  ok: false,
  reason,
});

describe('summarizeScanOutcomes — agregación allSettled del escaneo global', () => {
  it('todos los motores OK -> toast de éxito', () => {
    const toast = summarizeScanOutcomes([IA, ORTO, CITAS]);
    expect(toast.type).toBe('success');
    expect(toast.message).toBe('Auditoría integral completada');
  });

  it('un motor fallido -> aviso que nombra el motor fallido y los completados', () => {
    const toast = summarizeScanOutcomes([failed(IA, 'HTTP 500'), ORTO, CITAS]);
    expect(toast.type).toBe('warning');
    expect(toast.message).toContain('Fallo el motor de IA: HTTP 500');
    expect(toast.message).toContain('Ortografía y Citas completados');
    expect(toast.message).not.toBe('Auditoría integral completada');
  });

  it('dos motores fallidos -> aviso que nombra ambos y el completado', () => {
    const toast = summarizeScanOutcomes([failed(IA), failed(CITAS), ORTO]);
    expect(toast.type).toBe('warning');
    expect(toast.message).toContain('Fallaron los motores IA y Citas');
    expect(toast.message).toContain('Ortografía completado');
  });

  it('todos los motores fallan -> error, sin resultado fake de éxito', () => {
    const toast = summarizeScanOutcomes([failed(IA), failed(ORTO), failed(CITAS)]);
    expect(toast.type).toBe('error');
    expect(toast.message).toContain('IA, Ortografía y Citas');
    expect(toast.message).toContain('Sin resultados nuevos');
    expect(toast.message).not.toContain('completad');
    expect(toast.message).not.toContain('Auditoría integral completada');
  });

  it('sin motores ejecutados -> error, nunca éxito', () => {
    const toast = summarizeScanOutcomes([]);
    expect(toast.type).toBe('error');
  });

  it('ningún mensaje supera los 120 caracteres', () => {
    const longReason = 'x'.repeat(300);
    const scenarios: EngineScanOutcome[][] = [
      [IA, ORTO, CITAS],
      [failed(IA, longReason), ORTO, CITAS],
      [failed(IA), failed(ORTO), CITAS],
      [failed(IA, longReason), failed(ORTO, longReason), failed(CITAS, longReason)],
      [],
    ];
    scenarios.forEach((scenario) => {
      const toast = summarizeScanOutcomes(scenario);
      expect(toast.message.length).toBeLessThanOrEqual(MAX_TOAST_LENGTH);
      expect(toast.message).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    });
  });
});

describe('toReason', () => {
  it('extrae el mensaje de un Error y descarta motivos inútiles', () => {
    expect(toReason(new Error('HTTP 503'))).toBe('HTTP 503');
    expect(toReason(new Error(''))).toBeUndefined();
    expect(toReason('fallo de red')).toBe('fallo de red');
    expect(toReason(undefined)).toBeUndefined();
    expect(toReason(42)).toBeUndefined();
  });
});
