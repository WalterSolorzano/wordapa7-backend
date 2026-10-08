import { describe, it, expect } from 'vitest';
import { dpiEfectivo, ratioDeDimensiones, altoProporcional, esBajaResolucion, DPI_MIN } from '../imagenFormato';

describe('imagenFormato', () => {
  describe('dpiEfectivo', () => {
    it('calcula la resolucion efectiva a partir del ancho en pixeles y en cm', () => {
      // 1000 px en 10.16 cm (4 pulgadas) => 250 ppp
      expect(dpiEfectivo(1000, 10.16)).toBe(250);
    });

    it('devuelve null cuando no hay datos suficientes', () => {
      expect(dpiEfectivo(0, 10)).toBeNull();
      expect(dpiEfectivo(1000, 0)).toBeNull();
      expect(dpiEfectivo(Number.NaN, 10)).toBeNull();
    });
  });

  describe('ratioDeDimensiones', () => {
    it('devuelve alto/ancho', () => {
      expect(ratioDeDimensiones(14.5, 9.0)).toBeCloseTo(0.6207, 3);
    });

    it('devuelve null con ancho no positivo', () => {
      expect(ratioDeDimensiones(0, 9)).toBeNull();
      expect(ratioDeDimensiones(Number.NaN, 9)).toBeNull();
    });
  });

  describe('altoProporcional', () => {
    it('conserva la proporcion al cambiar el ancho, redondeando a 2 decimales', () => {
      // ratio 0.62, ancho 10 => 6.2
      expect(altoProporcional(10, 0.62)).toBe(6.2);
      expect(altoProporcional(15.5, 0.6207)).toBe(9.62);
    });
  });

  describe('esBajaResolucion', () => {
    it('marca por debajo del minimo y no por encima', () => {
      expect(DPI_MIN).toBe(150);
      expect(esBajaResolucion(120)).toBe(true);
      expect(esBajaResolucion(150)).toBe(false);
      expect(esBajaResolucion(300)).toBe(false);
      expect(esBajaResolucion(null)).toBe(false);
    });
  });
});
