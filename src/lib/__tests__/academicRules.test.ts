import { describe, it, expect } from 'vitest';
import { auditarBinomio, auditarLlamadasFiguras, auditarEncuadre } from '../academicRules';
import type { NodoJerarquia } from '../jerarquia';
import type { ElementModel } from '../../types';

describe('academicRules APA 7', () => {
  it('detecta subsecciones solitarias (regla del binomio)', () => {
    const arbolSolitario: NodoJerarquia[] = [{
      id: 'h1_1',
      titulo: 'Metodología',
      nivel: 1,
      palabras: 500,
      element_id: 'elem_1',
      hijos: [{
        id: 'h2_1',
        titulo: 'Muestra',
        nivel: 2,
        palabras: 200,
        element_id: 'elem_2',
        hijos: []
      }]
    }];
    const hallazgos = auditarBinomio(arbolSolitario);
    expect(hallazgos.length).toBe(1);
    expect(hallazgos[0].id).toBe('binomio_h2_1');
    expect(hallazgos[0].mensaje).toContain('subdivisión solitaria');
  });

  it('detecta falta de mención en texto para figuras asociadas', () => {
    const capitulo: NodoJerarquia = {
      id: 'h1_1',
      titulo: 'Resultados',
      nivel: 1,
      palabras: 300,
      element_id: 'elem_1',
      hijos: []
    };
    const elementos: ElementModel[] = [
      { id: 'elem_1', type: 'heading', text: 'Resultados', heading_level: 1 },
      { id: 'elem_2', type: 'paragraph', text: 'Los datos muestran una tendencia creciente en el grupo analizado.' },
      { id: 'elem_3', type: 'image', text: '', image_info: { figure_number: 1, caption: 'Gráfico de dispersión' } }
    ];
    const hallazgos = auditarLlamadasFiguras(capitulo, elementos);
    expect(hallazgos.length).toBe(1);
    expect(hallazgos[0].mensaje).toContain('no tiene llamada explícita');
  });

  it('detecta si un H1 no tiene párrafo de encuadre antes de su primer H2', () => {
    const capitulo: NodoJerarquia = {
      id: 'h1_1',
      titulo: 'Metodología',
      nivel: 1,
      palabras: 200,
      element_id: 'elem_1',
      hijos: [{ id: 'h2_1', titulo: 'Diseño', nivel: 2, palabras: 100, element_id: 'elem_2', hijos: [] }]
    };
    const elementosSinEncuadre: ElementModel[] = [
      { id: 'elem_1', type: 'heading', text: 'Metodología', heading_level: 1 },
      { id: 'elem_2', type: 'heading', text: 'Diseño', heading_level: 2 }
    ];
    expect(auditarEncuadre(capitulo, elementosSinEncuadre)).toBe(false);
  });
});
