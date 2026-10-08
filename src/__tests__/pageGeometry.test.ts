/**
 * pageGeometry — conversión de APARuleSet (pt, cm) a píxeles reales.
 * El canvas pinta hoja genérica hoy; este módulo da geometría del documento.
 */
import { describe, it, expect } from 'vitest';
import {
  getPageGeometry, PX_PER_PT, PX_PER_CM, PT_TO_PX, CM_TO_PX,
} from '../lib/pageGeometry';

const base = { margins_cm: 2.54, font_size_pt: 12, line_spacing: 2, page_size: 'letter' };

describe('pageGeometry', () => {
  it('convierte unidades exactas (96 DPI)', () => {
    expect(PT_TO_PX(72)).toBeCloseTo(96, 5);
    expect(CM_TO_PX(2.54)).toBeCloseTo(96, 5);
    expect(PX_PER_PT).toBeCloseTo(96 / 72, 5);
    expect(PX_PER_CM).toBeCloseTo(96 / 2.54, 5);
  });

  it('Letter 2.54cm: hoja 612x792pt en px, margen 1in = 96px', () => {
    const g = getPageGeometry(base);
    expect(g.pageW).toBeCloseTo(612 * (96 / 72), 1);
    expect(g.pageH).toBeCloseTo(792 * (96 / 72), 1);
    expect(g.marginPx).toBeCloseTo(96, 1);
    expect(g.contentW).toBeCloseTo(g.pageW - 2 * g.marginPx, 1);
    expect(g.contentH).toBeCloseTo(g.pageH - 2 * g.marginPx - g.headerH, 1);
    expect(g.lineHeightPx).toBeCloseTo(12 * (96 / 72) * 2, 1);
  });

  it('margenes 3.5cm (tesis) reducen el ancho de contenido', () => {
    const g1 = getPageGeometry(base);
    const g2 = getPageGeometry({ ...base, margins_cm: 3.5 });
    expect(g2.marginPx).toBeGreaterThan(g1.marginPx);
    expect(g2.contentW).toBeLessThan(g1.contentW);
    expect(g2.contentH).toBeLessThan(g1.contentH);
  });

  it('A4 distinto de Letter', () => {
    const a4 = getPageGeometry({ ...base, page_size: 'a4' });
    const letter = getPageGeometry(base);
    expect(a4.pageW).toBeCloseTo(595 * (96 / 72), 1);
    expect(a4.pageH).toBeCloseTo(842 * (96 / 72), 1);
    expect(a4.pageH).toBeGreaterThan(letter.pageH);
  });

  it('line_spacing 2 da doble interlineado vs 1', () => {
    const g1 = getPageGeometry({ ...base, line_spacing: 1 });
    const g2 = getPageGeometry({ ...base, line_spacing: 2 });
    expect(g2.lineHeightPx).toBeCloseTo(g1.lineHeightPx * 2, 5);
  });

  it('defaults tolerantes sin campos', () => {
    const g = getPageGeometry({});
    expect(g.pageW).toBeGreaterThan(600);
    expect(g.contentW).toBeGreaterThan(0);
    expect(g.contentH).toBeGreaterThan(0);
    expect(g.lineHeightPx).toBeGreaterThan(0);
  });

  it('running head profesional reserva mas alto de cabecera', () => {
    const plain = getPageGeometry(base);
    const prof = getPageGeometry({ ...base, professional_running_head: true });
    expect(prof.headerH).toBeGreaterThan(plain.headerH);
    expect(prof.contentH).toBeLessThan(plain.contentH);
  });
});
