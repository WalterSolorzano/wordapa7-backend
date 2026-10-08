import { describe, it, expect } from 'vitest';
import { reviewContent, objetivosBloom, reemplazarVerbo } from '../lib/contentReview';

function el(id: string, text: string, type = 'paragraph'): any {
  return { id, text, type, heading_level: type === 'heading' ? 2 : 1 };
}

describe('reviewContent — objetivos (Bloom)', () => {
  const doc = [
    el('h1', 'Objetivos', 'heading'),
    el('g', 'Desarrollar un sistema de gestión para la microempresa.'),
    el('e1', 'Identificar los tiempos muertos en el proceso de producción.'),
    el('e2', 'Analizar las causas de los tiempos improductivos.'),
    el('e3', 'Proponer mejoras con base en el método S.C.E.M.'),
  ];

  it('flags an objective that does not start with an infinitive verb', () => {
    const withBad = [
      ...doc.slice(0, 2),
      el('bad', 'La mejora del proceso de producción.'),
      ...doc.slice(2),
    ];
    const f = reviewContent(withBad as any);
    expect(f.some((x) => x.rule === 'objetivo_sin_infinitivo')).toBe(true);
  });

  it('flags forbidden Bloom verbs like "conocer"', () => {
    const f = reviewContent([
      el('h1', 'Objetivos', 'heading'),
      el('g', 'Desarrollar un sistema.'),
      el('e1', 'Conocer los tiempos muertos.'),
      el('e2', 'Analizar las causas.'),
    ] as any);
    const hit = f.find((x) => x.rule === 'objetivo_verbo_no_medible');
    expect(hit?.message).toContain('"conocer"');
  });

  it('flags repeated verbs across specific objectives', () => {
    const f = reviewContent([
      el('h1', 'Objetivos', 'heading'),
      el('g', 'Desarrollar un sistema.'),
      el('e1', 'Analizar los tiempos.'),
      el('e2', 'Analizar las causas.'),
      el('e3', 'Analizar las mejoras.'),
    ] as any);
    expect(f.some((x) => x.rule === 'objetivo_verbo_repetido')).toBe(true);
  });
});

describe('reviewContent — introducción', () => {
  it('flags missing research question', () => {
    const f = reviewContent([
      el('h1', 'Introducción', 'heading'),
      el('p1', 'La microempresa enfrenta tiempos de producción elevados.'),
      el('p2', 'Este estudio busca documentar el proceso actual.'),
    ] as any);
    expect(f.some((x) => x.rule === 'intro_sin_pregunta')).toBe(true);
  });

  it('passes when there is a question', () => {
    const f = reviewContent([
      el('h1', 'Introducción', 'heading'),
      el('p1', '¿Cómo se pueden reducir los tiempos muertos en la producción?'),
      el('p2', 'Este trabajo se divide en cuatro capítulos.'),
    ] as any);
    expect(f.some((x) => x.rule === 'intro_sin_pregunta')).toBe(false);
  });

  it('flags a dictionary-definition opening', () => {
    const f = reviewContent([
      el('h1', 'Introducción', 'heading'),
      el('p1', 'Según la RAE, el tiempo es la duración de las cosas sujetas a cambio.'),
    ] as any);
    expect(f.some((x) => x.rule === 'intro_definicion_diccionario')).toBe(true);
  });
});

describe('reviewContent — hipótesis y metodología', () => {
  it('flags a hypothesis written as a question', () => {
    const f = reviewContent([
      el('h1', 'Hipótesis', 'heading'),
      el('h', '¿La implementación de las 5S reducirá los tiempos muertos?'),
    ] as any);
    expect(f.some((x) => x.rule === 'hipotesis_como_pregunta')).toBe(true);
  });

  it('flags methodology missing type and instruments', () => {
    const f = reviewContent([
      el('h1', 'Metodología', 'heading'),
      el('m', 'Se realizaron mediciones directas en el área de producción.'),
    ] as any);
    expect(f.some((x) => x.rule === 'metodologia_sin_tipo')).toBe(true);
    expect(f.some((x) => x.rule === 'metodologia_sin_instrumentos')).toBe(true);
  });
});

describe('reviewContent — resumen y conclusiones', () => {
  it('flags a summary outside 150-250 words', () => {
    const short = el('r', 'Resumen corto de la investigación.');
    const f = reviewContent([
      el('h1', 'Resumen', 'heading'),
      short,
    ] as any);
    const hit = f.find((x) => x.rule === 'resumen_longitud');
    expect(hit?.message).toContain('palabras');
  });

  it('flags a vague recommendation', () => {
    const f = reviewContent([
      el('h1', 'Conclusiones', 'heading'),
      el('c', 'Se recomienda seguir investigando para ampliar los resultados.'),
    ] as any);
    expect(f.some((x) => x.rule === 'conclusiones_recomendacion_vaga')).toBe(true);
  });
});

describe('reviewContent — general y específicos salen del documento, no de la posición', () => {
  /* Orden raro a propósito: el H2 de específicos ANTES del general. El código
     viejo aplanaba todo y asumía que el primero era el general, así que tomaba
     "Identificar" (nivel 1 de Bloom) como general y marcaba "Analizar" (nivel 4)
     como un específico de nivel más alto. Falso: el general real es
     "Desarrollar" (nivel 6). */
  const ordenRaro = [
    el('h1', 'Objetivos', 'heading'),
    el('he', 'Objetivos específicos', 'heading'),
    el('e1', 'Identificar los tiempos muertos.'),
    el('e2', 'Analizar las causas.'),
    el('hg', 'Objetivo general', 'heading'),
    el('g', 'Desarrollar un sistema de gestión.'),
  ];

  it('el general se reconoce por su H2, no por ser el primero de la lista', () => {
    const f = reviewContent(ordenRaro as any);
    expect(f.some((x) => x.rule === 'objetivo_nivel_mayor_que_general')).toBe(false);
  });

  it('la cuenta de específicos usa los específicos reales', () => {
    const f = reviewContent(ordenRaro as any);
    const hit = f.find((x) => x.rule === 'objetivos_cantidad');
    expect(hit?.message).toContain('2 objetivos específicos');
    expect(hit?.elementIds).toEqual(['e1', 'e2']);
  });
});

describe('objetivosBloom — nivel actual y propuesto para el informe', () => {
  it('usa la misma separación general/específicos y propone nivel 4 al específico bajo', () => {
    const r = objetivosBloom([
      el('h1', 'Objetivos', 'heading'),
      el('g', 'Desarrollar un sistema de gestión.'),
      el('e1', 'Identificar los tiempos muertos.'),
      el('e2', 'Analizar las causas.'),
    ] as any);
    expect(r.map((x) => x.elementId)).toEqual(['g', 'e1', 'e2']);
    const general = r.find((x) => x.elementId === 'g')!;
    expect(general.nivelActual).toBe(6);
    expect(general.nivelPropuesto).toBe(6);
    expect(general.verboPropuesto).toBe('desarrollar');
    const e1 = r.find((x) => x.elementId === 'e1')!;
    expect(e1.nivelActual).toBe(1);
    expect(e1.nivelPropuesto).toBe(4);
    expect(e1.verboPropuesto.length).toBeGreaterThan(0);
  });

  it('marca nivelActual null y propone el mínimo cuando el verbo no es medible', () => {
    const r = objetivosBloom([
      el('h1', 'Objetivos', 'heading'),
      el('g', 'Desarrollar un sistema.'),
      el('e1', 'Conocer los tiempos muertos.'),
    ] as any);
    const e1 = r.find((x) => x.elementId === 'e1')!;
    expect(e1.verboActual).toBe('conocer');
    expect(e1.nivelActual).toBeNull();
    expect(e1.nivelPropuesto).toBe(4);
  });

  it('devuelve lista vacía cuando no hay sección de objetivos', () => {
    expect(objetivosBloom([el('p', 'Solo texto sin objetivos.')] as any)).toEqual([]);
  });
});

describe('objetivosBloom — análisis, alternativas y detección de verbos', () => {
  const base = [
    el('h1', 'Objetivos', 'heading'),
    el('g', 'Desarrollar un sistema de gestión.'),
    el('e1', 'Identificar los tiempos muertos.'),
    el('e2', 'Analizar las causas y describir los efectos.'),
    el('e3', 'Conocer'),
  ];

  it('marca general/específico y ofrece alternativas por encima del verbo actual', () => {
    const r = objetivosBloom(base as any);
    const g = r.find((x) => x.elementId === 'g')!;
    const e1 = r.find((x) => x.elementId === 'e1')!;
    expect(g.esGeneral).toBe(true);
    expect(e1.esGeneral).toBe(false);
    expect(g.alternativas.length).toBeGreaterThan(0);
    expect(e1.alternativas).toContain('analizar');
    expect(e1.alternativas).not.toContain('identificar');
    expect(e1.analisis.length).toBeGreaterThan(0);
  });

  it('detecta un segundo verbo dentro de la frase', () => {
    const e2 = objetivosBloom(base as any).find((x) => x.elementId === 'e2')!;
    expect(e2.tieneDosVerbos).toBe(true);
    expect(e2.verboExtra).toBe('describir');
    const e1 = objetivosBloom(base as any).find((x) => x.elementId === 'e1')!;
    expect(e1.tieneDosVerbos).toBe(false);
    expect(e1.verboExtra).toBeNull();
  });

  it('marca sinVariable cuando el objetivo no dice sobre qué actúa', () => {
    const r = objetivosBloom(base as any);
    expect(r.find((x) => x.elementId === 'e3')!.sinVariable).toBe(true);
    expect(r.find((x) => x.elementId === 'e1')!.sinVariable).toBe(false);
  });
});

describe('reemplazarVerbo', () => {
  it('cambia solo el primer verbo y conserva la mayúscula inicial', () => {
    expect(reemplazarVerbo('Identificar los tiempos muertos.', 'analizar')).toBe('Analizar los tiempos muertos.');
    expect(reemplazarVerbo('conocer', 'determinar')).toBe('determinar');
  });
});
