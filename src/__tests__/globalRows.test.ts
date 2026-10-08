import { describe, it, expect } from 'vitest';
import { collectAuditItems, type AuditSources } from '../lib/auditItems';

/* Las ocho universales de la Fase 1. Sin fila propia caían en "Otro hallazgo del
   corrector", con el `kind` crudo en el chip del lienzo — y el mapa de
   subtipos es la tercera agrupación de la vista: fase → motor → subtipo. */

const KINDS = [
  // La clave es la que emite `phase_scope.py`, sin más. Con la grafía "correcta"
  // de la regla G11 el backend nunca la mandaba y la fila quedaba muerta: un
  // nombre para un hallazgo que no existe. El backend ya la corrigió y esta
  // lista lo siguió; `reglasDeFaseConNombre` falla si vuelven a divergir.
  'g11_variacion_oracion', 'g34_sigla_sin_definir', 'g35_unidades_mixtas',
  'g51_registro_coloquial', 'g52_exclamacion', 'g53_segunda_persona',
  'g61_triada', 'g63_conectores_densidad',
];

const sources = (kind: string): AuditSources => ({
  elements: [],
  reviewResult: null,
  proofreadFindings: [{
    element_id: 'e1', start: 0, end: 5, excerpt: 'texto',
    kind, severity: 'warn', message: 'm', source: 'local',
    phase: 'global', read_only: false,
  }],
  citationAuditResult: null,
});

describe('las ocho universales tienen fila propia', () => {
  for (const kind of KINDS) {
    it(`${kind} no cae en "otro" y no trae texto sugerido`, () => {
      const items = collectAuditItems(sources(kind));
      expect(items).toHaveLength(1);
      expect(items[0].subtype, `${kind} cae en el fallback "otro"`).not.toBe('otro');
      // Ninguna trae correccion automatica: una reescritura de prosa
      // argumental seria decidir por el usuario. El motor detecta, la persona
      // corrige.
      expect(items[0].suggestedText).toBeUndefined();
    });
  }

  it('todas son reglas generales, no de una fase', () => {
    for (const kind of KINDS) {
      // 'global' se traduce a null: para la vista, una regla general y un
      // hallazgo sin fase son lo mismo.
      expect(collectAuditItems(sources(kind))[0].phase).toBeNull();
    }
  });

  it('cada una tiene un subtipo distinto o compartido, pero nunca "otro"', () => {
    const subtipos = new Set(KINDS.map((k) => collectAuditItems(sources(k))[0].subtype));
    expect(subtipos.has('otro')).toBe(false);
  });
});
