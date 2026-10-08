/* WordAPA7 — la IDENTIDAD de un hallazgo no es su posición.

   Un id de hallazgo se usa para tres cosas: la clave de React, el conjunto de
   descartes (`dismissedIds`) y el de marcas de revisión (`markedIds`). Con un id
   POSICIONAL (`proact_${element_id}_${idx}`) las tres se rompen en cuanto la
   lista cambia: resolver una cita fantasma la corre al principio, el descarte
   que la persona acaba de hacer se queda apuntando al hallazgo que ocupa ese
   lugar, y el hallazgo de al lado desaparece de la cola sin aviso. Con un
   segundo documento cuyos hallazgos caen en las mismas posiciones, el patrón se
   repite y se pierde otra tanda entera.

   Estos casos prueban la IDENTIDAD, no el contenido: dos listas con los mismos
   hallazgos en distinto orden tienen que producir el MISMO conjunto de ids.
   El patrón tiene que ser asimétrico a propósito (tres hallazgos distinguibles
   en tres elementos distintos): con dos hallazgos de un mismo elemento, un id
   posicional y uno estable dan el mismo conjunto y la prueba no distinguiría
   nada. */
import { describe, it, expect, beforeAll } from 'vitest';
import { collectAuditItems, type AuditSources } from '../lib/auditItems';
import type { ProofreadFinding } from '../types';

const hallazgo = (over: Partial<ProofreadFinding>): ProofreadFinding => ({
  element_id: 'e1', start: 0, end: 6, excerpt: 'tambien', kind: 'ortografia',
  severity: 'error', message: 'Falta tilde', suggestion: 'también', source: 'local',
  ...over,
});

/* A la capa de datos solo le interesan `id`, `type` y `text` de cada elemento
   (para el texto original y el tipo de figura/tabla/encabezado); el modelo
   completo tiene treinta campos. */
const parrafo = (id: string) => ({ id, type: 'paragraph', text: 'texto' }) as never;

const fuentes = (over: Partial<AuditSources>): AuditSources => ({
  elements: [parrafo('e1'), parrafo('e2'), parrafo('e3')],
  reviewResult: null,
  proofreadFindings: [],
  citationAuditResult: null,
  ...over,
});

const ids = (s: AuditSources) => collectAuditItems(s).map((i) => i.id).sort();

/* `nodePolyfills()` (plugin de vite) shimmea `fs` a null en vitest, así que el
   módulo se carga por `import()` dinámico y con `@vite-ignore`, que es lo que
   hacen las otras pruebas que leen fuentes. */
/* Los especificadores van en VARIABLES a propósito: con un literal, Vite los
   resuelve en build y `nodePolyfills()` los shimmea a null. Es la forma que ya
   usan las otras pruebas que leen fuentes del repo. */
const NODE_FS = 'node:fs';
const NODE_PATH = 'node:path';
const NODE_URL = 'node:url';
let FUENTE = '';
beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ NODE_FS);
  const { resolve } = await import(/* @vite-ignore */ NODE_PATH);
  const { fileURLToPath } = await import(/* @vite-ignore */ NODE_URL);
  const dir = fileURLToPath(import.meta.url).replace(/[^/\\]+$/, '');
  FUENTE = readFileSync(resolve(dir, '../lib/auditItems.ts'), 'utf8');
});
const leerFuente = (): string => FUENTE;

describe('La identidad de un hallazgo', () => {
  it('el corrector no depende del lugar que ocupa en la lista', () => {
    // El motor puede devolver los mismos hallazgos en otro orden (corridas
    // distintas, filtros del backend, orden de las promesas): los ids no pueden
    // moverse con ellos.
    const a = hallazgo({ element_id: 'e1', start: 0, end: 6, kind: 'ortografia' });
    const b = hallazgo({ element_id: 'e2', start: 3, end: 9, kind: 'muletilla', message: 'Muletilla' });
    const c = hallazgo({ element_id: 'e3', start: 10, end: 20, kind: 'passive_voice', message: 'Voz pasiva' });

    expect(ids(fuentes({ proofreadFindings: [a, b, c] }))).toEqual(
      ids(fuentes({ proofreadFindings: [c, b, a] })),
    );
  });

  it('el corrector se distingue por tipo y posición en el TEXTO, no por su sitio en la lista', () => {
    // Dos hallazgos del mismo elemento que solo se distinguen por dónde caen.
    // Con un id puramente posicional el descarte del primero se comía al
    // segundo en cuanto la lista se reordenaba, y la clave de React pasaba a
    // ser la de otro hallazgo: el detalle se recolocaba solo.
    const orto = hallazgo({ start: 0, end: 6, kind: 'ortografia' });
    const pasiva = hallazgo({ start: 12, end: 24, kind: 'passive_voice', message: 'voz pasiva' });
    const lista = collectAuditItems(fuentes({ proofreadFindings: [orto, pasiva] }));
    const otros = collectAuditItems(fuentes({ proofreadFindings: [pasiva, orto] }));
    expect(lista.map((i) => i.id).sort()).toEqual(otros.map((i) => i.id).sort());
    expect(new Set(lista.map((i) => i.id)).size).toBe(2);
  });

  it('el párrafo del detector de IA se identifica por su elemento', () => {
    const p = (element_id: string, ai_score: number) => ({ element_id, text: 'x', ai_score, ai_category: 'HIGH' as const, findings: [], spelling: [] });
    const una = (paragraphs: unknown[]) =>
      ids(fuentes({ reviewResult: { paragraphs } as never }));
    expect(una([p('e1', 80), p('e2', 70), p('e3', 60)])).toEqual(
      una([p('e3', 60), p('e2', 70), p('e1', 80)]),
    );
  });

  it('dos citas fantasma del MISMO texto en elementos distintos son dos hallazgos', () => {
    // La misma referencia citada sin entrada bibliográfica en dos párrafos son
    // dos apariciones que se corrigen por separado. Un id con el texto solo las
    // fundiría en una, y descartar una se llevaría la otra.
    const fantasma = (element_id: string, texto: string) => ({ element_id, citation_text: texto });
    const lista = collectAuditItems(fuentes({
      citationAuditResult: {
        ghost_citations: [fantasma('e1', '(García, 2020)'), fantasma('e2', '(García, 2020)'), fantasma('e3', '(López, 2021)')],
        orphan_references: [],
      },
    })).filter((i) => i.subtype === 'cita_fantasma');
    expect(lista).toHaveLength(3);
    expect(new Set(lista.map((i) => i.id)).size).toBe(3);
    const reordenada = collectAuditItems(fuentes({
      citationAuditResult: {
        ghost_citations: [fantasma('e3', '(López, 2021)'), fantasma('e1', '(García, 2020)'), fantasma('e2', '(García, 2020)')],
        orphan_references: [],
      },
    })).filter((i) => i.subtype === 'cita_fantasma');
    expect(lista.map((i) => i.id).sort()).toEqual(reordenada.map((i) => i.id).sort());
  });

  it('las referencias huérfanas se distinguen por su referencia, no por su lugar', () => {
    const huerfana = (raw_text: string, authors: string[], year: number) => ({ raw_text, authors, year });
    const tres = [huerfana('Pérez, J. (2019).', ['Pérez'], 2019), huerfana('López, M. (2021).', ['López'], 2021), huerfana('García, A. (2022).', ['García'], 2022)];
    const lista = collectAuditItems(fuentes({ citationAuditResult: { ghost_citations: [], orphan_references: tres } }))
      .filter((i) => i.subtype === 'referencia_huerfana');
    const invertida = collectAuditItems(fuentes({ citationAuditResult: { ghost_citations: [], orphan_references: [...tres].reverse() } }))
      .filter((i) => i.subtype === 'referencia_huerfana');
    expect(lista.map((i) => i.id).sort()).toEqual(invertida.map((i) => i.id).sort());
    expect(new Set(lista.map((i) => i.id)).size).toBe(3);
  });

  it('un hallazgo descartado sigue siendo el MISMO después de reescanear', () => {
    // El caso que se pierde: se descarta la cita fantasma de García, se resuelve
    // la de López, y al volver a correr la auditoría la lista corre un puesto.
    // Con un id posicional, `ghost_cite_0` pasa a ser la de López —que nadie
    // descartó— y la de García, que sí se descartó, reaparece. O al revés: la
    // de García reaparece y la de López desaparece sin que nadie la haya
    // descartado. Las dos cosas son una cola que pierde elementos sin aviso.
    const fantasma = (element_id: string, texto: string) => ({ element_id, citation_text: texto });
    const antes = collectAuditItems(fuentes({
      citationAuditResult: { ghost_citations: [fantasma('e1', '(García, 2020)'), fantasma('e2', '(López, 2021)')], orphan_references: [] },
    })).filter((i) => i.subtype === 'cita_fantasma');
    const descartada = antes[0].id;

    const despues = collectAuditItems(fuentes({
      citationAuditResult: { ghost_citations: [fantasma('e2', '(López, 2021)')], orphan_references: [] },
    })).filter((i) => i.subtype === 'cita_fantasma');

    // La que se descartó era la de García, y García ya no está: la que queda
    // (López) NO puede llevar el id del descarte.
    expect(despues.map((i) => i.id)).not.toContain(descartada);
  });

  it('ningún id se construye con el índice de la lista', () => {
    /* Guarda de FUENTE, no de resultado: un id con contenido puede terminar en
       dígito (el rango del corrector es un número) y una aserción sobre la
       forma del id daría falsos positivos. Lo que no puede aparecer es el
       índice de la lista en una interpolación de id, y eso se lee en el
       código. El desempate del duplicado real está permitido y declarado: es un
       `n` que cuenta repeticiones del MISMO hallazgo, no una posición. */
    /* `node:fs` no se importa arriba a propósito: `nodePolyfills()` lo shimmea
       a null en vitest. El resto de las pruebas del repo lo cargan con
       `import()` y `@vite-ignore`, y por eso el `beforeAll` es asíncrono. */
    const fuente = leerFuente();
    // Sin comentarios: la NOTA de este módulo nombra el patrón viejo a propósito
    // (para explicar por qué no se usa), y una guarda que leyera los comentarios
    // la encontraría y fallaría por su propia explicación.
    const codigo = leerFuente()
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    for (const m of codigo.matchAll(/id:\s*[^,\n]*\$\{[^}]*\bidx\b[^}]*\}/g)) {
      throw new Error(`id construido con el indice de la lista: ${m[0]}`);
    }
    expect(codigo).not.toMatch(/`ghost_cite_\$\{/);
    expect(codigo).not.toMatch(/`orphan_ref_\$\{/);
    expect(codigo).not.toMatch(/`proact_/);
    expect(codigo).not.toMatch(/`ai_rev_/);
  });
});
