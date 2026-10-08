import { describe, it, expect } from 'vitest';
import { modoDeAncho, clampAncho } from '../layoutTaller';

describe('layoutTaller', () => {
  describe('modoDeAncho', () => {
    it('usa layout ancho (4 columnas) a partir de 1180px', () => {
      expect(modoDeAncho(1400)).toBe('ancho');
      expect(modoDeAncho(1180)).toBe('ancho');
    });

    it('acopla los paneles a la izquierda entre 760 y 1180px', () => {
      expect(modoDeAncho(1179)).toBe('medio');
      expect(modoDeAncho(900)).toBe('medio');
      expect(modoDeAncho(760)).toBe('medio');
    });

    it('cae a una sola columna por debajo de 760px', () => {
      expect(modoDeAncho(759)).toBe('angosto');
      expect(modoDeAncho(480)).toBe('angosto');
    });
  });

  describe('clampAncho', () => {
    it('respeta los límites min y max', () => {
      expect(clampAncho(100, 220, 520)).toBe(220);
      expect(clampAncho(900, 220, 520)).toBe(520);
      expect(clampAncho(340, 220, 520)).toBe(340);
    });
  });
});
