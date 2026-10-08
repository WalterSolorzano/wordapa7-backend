import { describe, it, expect } from 'vitest';
import { altoImagenAjustado } from '../lib/figuraAjuste';

describe('altoImagenAjustado', () => {
  it('escala si el alto declarado excede el disponible', () => {
    expect(altoImagenAjustado(900, 700)).toBe(700);
  });

  it('respeta el declarado si cabe', () => {
    expect(altoImagenAjustado(300, 700)).toBe(300);
  });

  it('sin declarado devuelve null (usa el default del render)', () => {
    expect(altoImagenAjustado(null, 700)).toBeNull();
  });

  it('declarado no finito devuelve null', () => {
    expect(altoImagenAjustado(Number.NaN, 700)).toBeNull();
  });
});
