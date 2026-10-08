import { describe, expect, it } from 'vitest';
import { formatearCuota } from '../cuotaProveedor';

describe('formatearCuota', () => {
  it('formatea con dato', () => {
    expect(formatearCuota(12, 450, 438)).toBe('12/450 hoy · restante: 438');
  });

  it('sin dato no inventa numeros', () => {
    expect(formatearCuota(null, null, null)).toBe('sin dato de cuota');
  });
});
