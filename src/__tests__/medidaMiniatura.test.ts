import { describe, it, expect } from 'vitest';
import { medidaDeLaMiniatura } from '../components/wizard/portada/MiniaturaRealDePortada';

describe('medidaDeLaMiniatura', () => {
  it('A4 es más alto que carta para la plantilla UNI', () => {
    const a4 = medidaDeLaMiniatura('uni', 'a4', { page_size: 'a4' });
    const carta = medidaDeLaMiniatura('uni', 'carta', { page_size: 'carta' });
    expect(a4.alto).toBeGreaterThan(carta.alto);
  });

  it('la tarjeta custom (acción) no rompe: usa la hoja', () => {
    const medida = medidaDeLaMiniatura('custom', 'carta', undefined);
    expect(Number.isFinite(medida.alto)).toBe(true);
    expect(medida.alto).toBeGreaterThan(0);
  });

  it('original usa la geometría del documento', () => {
    const medida = medidaDeLaMiniatura('original', 'carta', {
      page_size: 'carta', margins_cm: { top: 2.54, bottom: 2.54, left: 2.54, right: 2.54 },
      font_size_pt: 12, line_spacing: 2,
    });
    expect(medida.ancho).toBeGreaterThan(0);
    expect(medida.alto).toBeGreaterThan(0);
  });
});
