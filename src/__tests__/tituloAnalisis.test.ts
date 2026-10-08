/* WordAPA7 — Test suite para el motor analítico de Títulos APA 7. */
import { describe, it, expect } from 'vitest';
import { analizarTitulo, extraerTituloPrincipal } from '../lib/tituloAnalisis';
import type { ElementModel } from '../types';

describe('analizarTitulo', () => {
  it('identifica título óptimo en formato APA 7', () => {
    const res = analizarTitulo('Impacto de la Inteligencia Artificial en la Educación Superior: Un Estudio de Caso');
    expect(res.puntaje).toBeGreaterThanOrEqual(90);
    expect(res.estado).toBe('optimo');
    expect(res.criterios.find((c) => c.id === 'sin_punto')?.cumple).toBe(true);
    expect(res.criterios.find((c) => c.id === 'capitalizacion')?.cumple).toBe(true);
  });

  it('detecta punto final indebido y genera sugerencia', () => {
    const res = analizarTitulo('Efectos del estrés laboral en el rendimiento docente.');
    expect(res.criterios.find((c) => c.id === 'sin_punto')?.cumple).toBe(false);
    expect(res.sugerencia).toBe('Efectos del estrés laboral en el rendimiento docente');
  });

  it('detecta títulos en mayúsculas sostenidas y propone Title Case', () => {
    const res = analizarTitulo('IMPACTO DEL TELETRABAJO EN LA PRODUCTIVIDAD');
    expect(res.criterios.find((c) => c.id === 'capitalizacion')?.cumple).toBe(false);
    expect(res.sugerencia).toBe('Impacto del Teletrabajo en la Productividad');
  });

  it('detecta títulos excesivamente largos', () => {
    const largo = 'Un análisis exhaustivo sobre los factores determinantes del rendimiento académico en estudiantes universitarios de primer año durante el periodo post pandemia en la ciudad de Lima Metropolitana';
    const res = analizarTitulo(largo);
    expect(res.palabrasCount).toBeGreaterThan(20);
    expect(res.criterios.find((c) => c.id === 'longitud')?.cumple).toBe(false);
  });

  it('extrae título correctamente desde elementos de portada', () => {
    const elementos: ElementModel[] = [
      { id: 'el-1', type: 'heading', text: 'Mi Tesis de Grado', is_cover: true } as any,
      { id: 'el-2', type: 'paragraph', text: 'Capítulo 1...', is_cover: false } as any,
    ];
    const { texto, elementoId } = extraerTituloPrincipal(elementos);
    expect(texto).toBe('Mi Tesis de Grado');
    expect(elementoId).toBe('el-1');
  });
});
