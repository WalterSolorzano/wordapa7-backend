import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { collectAuditItems, PHASE_ORDER, type AuditItem } from '../lib/auditItems';
import { agruparHallazgosPorFase } from '../hooks/useReviewWorkbench';
import type { ProofreadFinding } from '../types';

/* La fase se filtra y se NOMBRA, pero no se convierte en eje de navegación:
   la revisión sigue siendo un párrafo a la vez (AGENTS.md §1). Estos tests
   fijan las dos mitades de esa frase — filtra y no rompe — y la parte que más
   muerde: un hallazgo de solo lectura no puede aceptar nada. */

const hallazgo = (over: Partial<AuditItem>): AuditItem => ({
  id: 'x', element_id: 'e1', category: 'structure', subtype: 's',
  severity: 'low', summary: 's', detail: 'd', originalText: 't',
  pageNumber: 1, phase: null, readOnly: false, ...over,
});

const dePrueba = (f: Partial<ProofreadFinding>): ProofreadFinding => ({
  element_id: 'e1', start: 0, end: 3, excerpt: 'Con',
  kind: 'bloom_vague', severity: 'warn', message: 'm', source: 'local', ...f,
});

describe('filtro por fase', () => {
  it('el agrupado por fase respeta el orden del documento, no el alfabético', () => {
    const items = [
      hallazgo({ id: '1', phase: 'conclusiones' }),
      hallazgo({ id: '2', phase: 'objetivos' }),
      hallazgo({ id: '3', phase: 'portada' }),
    ];
    const g = agruparHallazgosPorFase(items);
    expect(g.map((x) => x.key)).toEqual(['portada', 'objetivos', 'conclusiones']);
  });

  it('las fases sin hallazgos no aparecen, y las generales van aparte', () => {
    const items = [
      hallazgo({ id: '1', phase: 'objetivos' }),
      hallazgo({ id: '2', phase: null }),
    ];
    const g = agruparHallazgosPorFase(items);
    expect(g.map((x) => x.key)).toEqual(['objetivos', 'global']);
    expect(g[1].label).toBe('Todo el documento');
  });

  it('las generales no se pierden aunque haya fases con hallazgos', () => {
    const items = [
      hallazgo({ id: '1', phase: 'objetivos' }),
      hallazgo({ id: '2', phase: 'metodo' }),
      hallazgo({ id: '3', phase: null }),
    ];
    const g = agruparHallazgosPorFase(items);
    expect(g.map((x) => x.key)).toEqual(['objetivos', 'metodo', 'global']);
  });

  it('sin hallazgos, ninguna fase', () => {
    expect(agruparHallazgosPorFase([])).toEqual([]);
  });

  it('una fase con clave desconocida no desaparece ni inventa etiqueta', () => {
    const g = agruparHallazgosPorFase([hallazgo({ id: '1', phase: 'clave_inventada' })]);
    expect(g.map((x) => x.key)).toEqual(['clave_inventada']);
    expect(g[0].label).toBe('Seccion sin nombre');
  });

  it('el conteo de una fase es el de sus hallazgos, no un re-derivado', () => {
    const items = [
      hallazgo({ id: '1', phase: 'objetivos' }),
      hallazgo({ id: '2', phase: 'objetivos' }),
      hallazgo({ id: '3', phase: 'metodo' }),
    ];
    const g = agruparHallazgosPorFase(items);
    expect(g.find((x) => x.key === 'objetivos')?.count).toBe(2);
    expect(g.find((x) => x.key === 'metodo')?.count).toBe(1);
  });
});

describe('lo de solo lectura no se puede aceptar', () => {
  it('un grupo de solo lectura no ofrece aceptacion masiva', () => {
    // Se prueba sobre la derivacion pura, no sobre el componente: el boton se
    // dibuja a partir de `action`, asi que la decision tiene que estar ahi.
    const g = agruparHallazgosPorFase([
      hallazgo({ id: '1', phase: 'portada', readOnly: true }),
    ]);
    expect(g[0].action).toBe('none');
    expect(g[0].massLabel).toBe('');
  });

  it('un grupo con una mezcla ofrece aceptacion solo de lo aplicable', () => {
    const g = agruparHallazgosPorFase([
      hallazgo({ id: '1', phase: 'portada', readOnly: true, category: 'structure', subtype: 's1' }),
      hallazgo({ id: '2', phase: 'objetivos', category: 'structure', subtype: 's2' }),
    ]);
    // El hallazgo de solo lectura no se cuenta como cubierto por la acción.
    const objetivos = g.find((x) => x.key === 'objetivos');
    expect(objetivos?.action).toBe('accept');
    const portada = g.find((x) => x.key === 'portada');
    expect(portada?.action).toBe('none');
  });

  it('el motor de portada no trae sugerencia, que es la otra mitad de la invariante', () => {
    const items = collectAuditItems({
      elements: [],
      reviewResult: null,
      proofreadFindings: [
        dePrueba({ kind: 'portada_title_larga', phase: 'portada', read_only: true,
                   start: 0, end: 5, excerpt: 'Percep' }),
      ],
      citationAuditResult: null,
    });
    expect(items).toHaveLength(1);
    expect(items[0].readOnly).toBe(true);
    expect(items[0].suggestedText).toBeUndefined();
  });
});

describe('el vocabulario de fases no puede divergir del backend', () => {
  it('PHASE_ORDER cubre el mismo vocabulario que el motor declara', () => {
    // El backend es la fuente de verdad; esto falla cuando alguien agrega una
    // fase ahi y olvida el chip de aca, que es como un hallazgo queda
    // invisible para el usuario.
    for (const k of ['portada', 'resumen', 'introduccion', 'marco_teorico',
                     'objetivos', 'metodo', 'resultados', 'discusion',
                     'conclusiones', 'referencias', 'anexos']) {
      expect(PHASE_ORDER, `falta ${k}`).toContain(k);
    }
  });
});
