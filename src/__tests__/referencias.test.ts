/**
 * LA VERDAD DE UNA REFERENCIA.
 *
 * Estas pruebas existen por dos defectos que se escondían en el mismo `useMemo`
 * del paso 4 (`Step5ReferencesWizard.tsx:81-96`) y que por eso no se podían probar:
 *
 *  1. `isZombie` clasificaba por **heurística de texto**: `'s.f.'`,
 *     `'autor (s.f.)'`, `'sin título'` y `titleText.length < 5`. Eso mandaba a
 *     "Sin verificar" un artículo que se titula "AI", y daba por completo un
 *     año `s.f.`, que es una fecha válida de APA 7 para una obra sin fecha. El
 *     spec §9 lo dice: "deja de clasificar por heurística de texto y **verifica
 *     si la referencia resuelve de verdad**". Y el repo YA tiene ese dato:
 *     `ReferenciaModel.verificada`, que pone un resolutor real y que el paso 4
 *     lee y pinta como "Verificada"/"Sin verificar".
 *     Ignorarlo y re-derivar desde los autores es crear una segunda verdad sobre
 *     lo mismo, que es lo que `AGENTS.md` §1 prohíbe.
 *
 *  2. `isOrphan` hacía `s.includes(authors?.[0] || '---')` (`:321-324`). Con
 *     autores vacíos el operando derecho es la cadena `'---'`, que matchea
 *     cualquier string: **toda** referencia sin autor salía marcada "Sin citar en
 *     texto". Y el backend ya sabe: `citation_matcher.py:162` calcula
 *     `never_cited` y lo devuelve en `orphan_references`.
 *
 * Y hay un tercero que no es de este archivo sino del modelo: **`null` no es
 * `false`**. Antes de que corra la auditoría, no se sabe si una referencia está
 * citada. Decir "no está citada" cuando la auditoría no corrió es una
 * afirmación sin dato, y esta prueba lo prohíbe.
 *
 * `src/lib/referencias.ts` es el archivo bajo prueba. Sin estado, sin React y
 * sin `any` en la firma, por la misma razón que `src/lib/figuras.ts` en F4: una
 * verdad que vive dentro de un `useMemo` no se puede probar, y la segunda copia
 * diverge el primer día que cambia.
 */
import { describe, it, expect } from 'vitest';
import {
  diagnosticoDeReferencia,
  particionarReferencias,
  parrafosQueCitan,
  expresionDeReferencias,
  ROTULO_DE_ESTADO,
  TONO_DE_ESTADO,
} from '../lib/referencias';
import type { ElementModel, ReferenciaModel } from '../types';

const base: ReferenciaModel = {
  id: 'r1',
  authors: ['García, A.'],
  year: '2021',
  title: 'Análisis de metodologías',
  source: 'Revista X',
  formatted_apa: 'García, A. (2021). Análisis de metodologías. Revista X.',
  raw_text: '',
  verificada: true,
};

const parrafo = (id: string, text: string, extra: Partial<ElementModel> = {}): ElementModel =>
  ({ id, type: 'paragraph', text, ...extra }) as ElementModel;

/* ── Los criterios del estado ─────────────────────────────────────────────── */

describe('el estado de una referencia', () => {
  /* El defecto medido: `titleText.length < 5` mandaba a "Sin verificar" un
     artículo que se titula "AI". Es un título corto, no una referencia rota. */
  it('un título de dos letras NO es incompleto si hay autor', () => {
    expect(diagnosticoDeReferencia({ ...base, title: 'AI' }).estado).toBe('verificada');
  });

  it('sin autores es incompleta, y el motivo nombra el campo', () => {
    const d = diagnosticoDeReferencia({ ...base, authors: [] });
    expect(d.estado).toBe('incompleta');
    expect(d.faltantes).toContain('autores');
  });

  it('autores que son solo espacios cuentan como ausencia', () => {
    const d = diagnosticoDeReferencia({ ...base, authors: ['   ', '  '] });
    expect(d.estado).toBe('incompleta');
    expect(d.faltantes).toContain('autores');
  });

  it('sin título ni texto crudo es incompleta', () => {
    const d = diagnosticoDeReferencia({ ...base, title: '', raw_text: '' });
    expect(d.estado).toBe('incompleta');
    expect(d.faltantes).toContain('título');
  });

  /* Un `raw_text` con contenido es texto: la referencia se puede escribir. */
  it('sin título pero con texto crudo no es incompleta', () => {
    const d = diagnosticoDeReferencia({ ...base, title: '', raw_text: 'Algo mio.' });
    expect(d.estado).toBe('verificada');
  });

  /* El dato del backend manda, y la ausencia de ese dato NO es "verificada". */
  it('con datos pero sin verificar es "sin verificar", no "incompleta"', () => {
    const d = diagnosticoDeReferencia({ ...base, verificada: false });
    expect(d.estado).toBe('sin-verificar');
    /* Y no le inventamos un campo que falta: no falta ninguno. */
    expect(d.faltantes).toEqual([]);
  });

  it('sin el campo `verificada` tampoco se presume verificada', () => {
    /* `verificada` es opcional en el tipo. Una referencia que venía del .docx
       del estudiante nunca fue contrastada contra nada, y eso hay que decirlo. */
    const { verificada, ...sinBandera } = base;
    void verificada;
    expect(diagnosticoDeReferencia(sinBandera as ReferenciaModel).estado).toBe('sin-verificar');
  });
});

/* ── Las strings que el motor escribió dejan de ser hechos ─────────────────── */

describe('las heurísticas de texto desaparecieron', () => {
  it('un año "s.f." es una fecha válida, no una incompleta', () => {
    expect(diagnosticoDeReferencia({ ...base, year: 's.f.' }).estado).toBe('verificada');
  });

  it('un autor que dice "s.f." no vuelve incompleta la referencia', () => {
    /* La heurística vieja buscaba 's.f.' en el TEXTO DEL AUTOR. Un apellido mal
       transcrito que contenga esas tres letras no es una referencia rota. */
    expect(diagnosticoDeReferencia({ ...base, authors: ['Boss.f.'] }).estado).toBe('verificada');
  });

  it('un título que dice "sin título" pero tiene autor no es incompleto', () => {
    /* El título de verdad es ese, y se escribe. Lo que no hay son los metadatos
       para completarlo, y eso lo dice `verificada`. */
    expect(diagnosticoDeReferencia({ ...base, title: 'sin título' }).estado).toBe('verificada');
  });
});

/* ── Huérfana: el dato del backend, y la diferencia entre null y false ────── */

describe('la referencia sin citar', () => {
  it('antes de que corra la auditoría no se sabe, y se dice que no se sabe', () => {
    /* `null` no es `false`. La pantalla vieja marcaba "Sin citar en texto" a
       todo lo que no encontraba, que incluye lo que nadie miró. */
    expect(diagnosticoDeReferencia(base).huerfana).toBeNull();
  });

  it('con el backend diciendo que sí, es huérfana', () => {
    expect(diagnosticoDeReferencia(base, { huerfanas: new Set(['r1']) }).huerfana).toBe(true);
  });

  it('con el backend diciendo que no, no es huérfana', () => {
    expect(diagnosticoDeReferencia(base, { huerfanas: new Set(['r9']) }).huerfana).toBe(false);
  });

  it('el conjunto llega vacío también es un dato: auditó y no encontró', () => {
    expect(diagnosticoDeReferencia(base, { huerfanas: new Set() }).huerfana).toBe(false);
  });
});

/* ── La partición de la lista ─────────────────────────────────────────────── */

describe('la partición de la lista', () => {
  it('manda a verificadas lo verificado, y todo lo demás a pendientes', () => {
    const { verificadas, pendientes } = particionarReferencias([
      base,
      { ...base, id: 'r2', verificada: false },
      { ...base, id: 'r3', authors: [] },
    ]);
    expect(verificadas.map((r) => r.id)).toEqual(['r1']);
    expect(pendientes.map((r) => r.id)).toEqual(['r2', 'r3']);
  });

  it('ordena por apellido, y lo que no tiene apellido va al final', () => {
    /* El .docx pone las referencias sin autor al final, y una lista donde
       aparecen en medio esconde justo lo que hay que arreglar. */
    const { pendientes } = particionarReferencias([
      { ...base, id: 'sin', authors: [], verificada: false },
      { ...base, id: 'zeta', authors: ['Zeta, B.'], verificada: false },
      { ...base, id: 'alfa', authors: ['Alfa, C.'], verificada: false },
    ]);
    expect(pendientes.map((r) => r.id)).toEqual(['alfa', 'zeta', 'sin']);
  });

  it('el orden no depende de las tildes', () => {
    const { pendientes } = particionarReferencias([
      { ...base, id: 'n', authors: ['Núñez, A.'], verificada: false },
      { ...base, id: 'o', authors: ['Ortega, A.'], verificada: false },
    ]);
    expect(pendientes.map((r) => r.id)).toEqual(['n', 'o']);
  });
});

/* ── Los párrafos que citan ───────────────────────────────────────────────── */

describe('los párrafos que citan una referencia', () => {
  /* El defecto: `s.includes(authors?.[0] || '---')`. Con autores vacíos el
     operando derecho es `'---'`, y `String.includes('---')` da `false` para
     cualquier texto real — pero el código viejo comparaba contra el `o.title`,
     y una referencia sin autor igual caía en el caso. Acá lo que se verifica es
     que la función NO devuelve nada, sin lanzar. */
  it('una referencia sin autor no encuentra párrafos, y no lanza', () => {
    const sinAutor: ReferenciaModel = { ...base, authors: [] };
    expect(() => parrafosQueCitan(sinAutor, [parrafo('p1', 'García (2021) lo dijo')])).not.toThrow();
    expect(parrafosQueCitan(sinAutor, [parrafo('p1', 'García (2021) lo dijo')])).toEqual([]);
  });

  it('sin el campo `authors` tampoco lanza', () => {
    const roto = { ...base, authors: undefined } as unknown as ReferenciaModel;
    expect(parrafosQueCitan(roto, [parrafo('p1', 'García (2021) lo dijo')])).toEqual([]);
  });

  it('encuentra el párrafo que la cita, con el año', () => {
    const ps = parrafosQueCitan(base, [parrafo('p1', 'Garcia (2021) lo demuestra')]);
    expect(ps.map((p) => p.id)).toEqual(['p1']);
  });

  /* El backend normaliza sin tildes (`citation_matcher._normalize_text`); el
     cliente también, con el `toKey` que ya existe en `citationMatcher.ts`. */
  it('la tilde no impide el reconocimiento', () => {
    const conTilde: ReferenciaModel = { ...base, authors: ['García, A.'] };
    const ps = parrafosQueCitan(conTilde, [parrafo('p1', 'Garcia (2021) lo demuestra')]);
    expect(ps.map((p) => p.id)).toEqual(['p1']);
  });

  /* Un título de dos letras no puede ser el operando de una búsqueda: matchearía
     media pega del documento. Por eso la búsqueda es por apellido. */
  it('busca por el apellido, no por el título entero', () => {
    const { authors, title, ...resto } = base;
    void authors;
    void title;
    const ref: ReferenciaModel = { ...resto, authors: ['García, A.'], title: 'AI' };
    const ps = parrafosQueCitan(ref, [parrafo('p1', 'Un texto que menciona AI y nada de Garcia')]);
    expect(ps).toEqual([]);
  });

  it('un encabezado no cuenta como mención, y la portada tampoco', () => {
    const ps = parrafosQueCitan(base, [
      { id: 'h1', type: 'heading', heading_level: 1, text: 'García (2021)' } as ElementModel,
      parrafo('p3', 'García (2021) también', { is_cover_section: true }),
      parrafo('p4', 'García (2021) en el cuerpo'),
    ]);
    expect(ps.map((p) => p.id)).toEqual(['p4']);
  });

  it('sin el campo `elements` devuelve una lista vacía y no lanza', () => {
    expect(parrafosQueCitan(base, undefined)).toEqual([]);
  });
});

/* ── Los rótulos y los tonos ───────────────────────────────────────────────── */

describe('los rótulos del estado', () => {
  it('cada estado tiene un rótulo DISTINTO, y ninguno es una cadena vacía', () => {
    const vistos = new Set(Object.values(ROTULO_DE_ESTADO));
    expect(vistos.size).toBe(3);
    for (const r of Object.values(ROTULO_DE_ESTADO)) expect(r.trim().length).toBeGreaterThan(3);
  });

  it('"incompleta" NO se llama "zombie", que es una palabra interna', () => {
    /* §3.4: ningún identificador interno visible. "Zombie" es el nombre de la
       categoría interna del código, y la que lo ve es la persona que está
       escribiendo su tesis. */
    for (const r of Object.values(ROTULO_DE_ESTADO)) {
      expect(r.toLowerCase()).not.toMatch(/zombie/i);
    }
  });

  it('los tonos salen de tokens, y los tres son distintos', () => {
    for (const t of Object.values(TONO_DE_ESTADO)) expect(t).toMatch(/^var\(--/);
    expect(new Set(Object.values(TONO_DE_ESTADO)).size).toBe(3);
  });
});

/* ── El guardián de la deuda que R3 cobra ──────────────────────────────────── */

/** El fuente SIN comentarios. Un regex no sabe qué es un comentario, y un
 *  guardián que se desactiva con un `//` no vigila nada. La lección viene de
 *  `figurasEstaMontada.test.tsx:38-42`, donde la cabecera del paso explica el
 *  defecto NOMBRANDO el código que ya no está. */
const SIN_COMENTARIOS = (f: string) => f
  .replace(/\/\*[\s\S]*?\*\//g, (b) => b.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const FUENTES = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const PASO = '/src/components/referencias/Step5ReferencesWizard.tsx';

describe('el paso de Referencias no reintroduce la deuda que R3 cobra', () => {
  /* La primera de las seis, y la que más veces se ha escrito mal: si el glob
     devuelve vacío, `FUENTES[PASO] ?? ''` es cadena vacía, una cadena vacía no
     matchea ninguna regla, y TODAS las guardas de este bloque pasan sin haber
     leído una línea. Por eso se comprueba que el archivo esté entre los leídos
     y que el glob haya leído más de cien. */
  it('el glob lee de verdad y el archivo está entre los leídos', () => {
    expect(Object.keys(FUENTES).length).toBeGreaterThan(100);
    expect(FUENTES[PASO]).toBeTruthy();
    expect(FUENTES[PASO].length).toBeGreaterThan(1000);
  });

  /* Cuarenta y un tamaños de fuente literales. La tabla del plan:
     9px→xs, 10px→xs, 11px→sm, 11.5px→sm, 12px→sm, 13px→base, 14px→base,
     15px→lg, 24px→2xl. */
  it('ningún tamaño de fuente literal: todos salen de un token', () => {
    const literales = SIN_COMENTARIOS(FUENTES[PASO]).match(/fontSize:\s*'[\d.]+px'/g);
    expect(literales, `quedan ${literales?.length ?? 0} tamaños literales`).toBeNull();
  });

  /* Los siete alias legacy: están declarados y son deuda histórica. Un alias
     nuevo en código nuevo hace crecer la lista de excepciones que R3 tiene que
     mantener, y es exactamente lo que este guardián mide. */
  it('ningún alias legacy: el canónico es el que se usa', () => {
    const paso = SIN_COMENTARIOS(FUENTES[PASO]);
    for (const alias of ['--accent-primary', '--text-main', '--text-secondary',
      '--text-muted', '--surface-elevated', '--sidebar-bg', '--surface-subtle']) {
      expect(paso.includes(alias), `vuelve el alias legacy ${alias}`).toBe(false);
    }
  });

  it('ninguna clase btn-*, que es la del diseño anterior', () => {
    expect(SIN_COMENTARIOS(FUENTES[PASO])).not.toMatch(/className="btn btn-/);
  });

  /* Los ocho `'4px'` son `gap` y `padding`, no radios: mandarlos a
     `--radius-sm` habría hecho la pantalla más cerrada de lo que el diseño
     pide. Van a `--space-1`. */
  it('ningún espaciado de 4px escrito a mano: sale de --space-1', () => {
    expect(SIN_COMENTARIOS(FUENTES[PASO])).not.toMatch(/'4px'/);
  });

  /* El canvas ya no compone bloques con el molde `Seccion`: la hoja de papel es
     un `article` y el acordeón de menciones un componente propio. Lo que sigue
     fijo es que los vacíos pasan por `EstadoVacio`. */
  it('el canvas usa la hoja de papel y los vacíos pasan por EstadoVacio', () => {
    const paso = SIN_COMENTARIOS(FUENTES[PASO]);
    expect(paso).toMatch(/<article/);
    expect(paso).toMatch(/<EstadoVacio/);
  });

  /* Los dos estilos que reescribían el molde de sección a mano. Con `Seccion`
     en el archivo, la copia del molde es una segunda versión que diverge. */
  it('no quedan los dos estilos que reescribían el molde a mano', () => {
    const paso = SIN_COMENTARIOS(FUENTES[PASO]);
    expect(paso).not.toMatch(/groupCardStyle/);
    expect(paso).not.toMatch(/groupHeaderStyle/);
  });

  /* El estado de la referencia se LEE, no se re-deriva en el render: si el
     componente vuelve a mirar `verificada` por su cuenta, hay dos verdades. */
  it('el estado sale de diagnosticoDeReferencia, no de una heurística en el render', () => {
    const paso = SIN_COMENTARIOS(FUENTES[PASO]);
    expect(paso).toMatch(/diagnosticoDeReferencia/);
    expect(paso).not.toMatch(/isZombie/);
    /* Y la comparación de huérfanas por texto —`includes(authors?.[0] || '---')`—
       se va con ella: el dato llega del backend con el `id`. */
    expect(paso).not.toMatch(/isOrphan/);
    expect(paso).not.toMatch(/'---'/);
  });
});


describe('la cara de la mascota', () => {
  const feliz = {
    hayDocumento: true, totalReferencias: 3, incompletas: 0, citasSinFuente: 0,
  };

  it('sin documento está preocupada: no hay nada que verificar', () => {
    expect(expresionDeReferencias({ ...feliz, hayDocumento: false })).toBe('worried');
  });

  it('con cero referencias es curiosa: una pantalla que nunca se usó', () => {
    expect(expresionDeReferencias({ ...feliz, totalReferencias: 0 })).toBe('curious');
  });

  it('con referencias incompletas está preocupada', () => {
    expect(expresionDeReferencias({ ...feliz, incompletas: 2 })).toBe('worried');
  });

  it('con citas sin fuente está preocupada, aunque no haya incompletas', () => {
    /* Son dos problemas distintos y los dos se pagan con trabajo del usuario. */
    expect(expresionDeReferencias({ ...feliz, citasSinFuente: 1 })).toBe('worried');
  });

  it('con todo en orden está feliz', () => {
    expect(expresionDeReferencias(feliz)).toBe('happy');
  });

  it('muchas referencias y ninguna pendiente es la única que se emociona', () => {
    /* La emoción se reserva para el documento de verdad, no para "está bien": con
       tres referencias en orden no hay nada que celebrar. */
    expect(expresionDeReferencias({ ...feliz, totalReferencias: 24 })).toBe('excited');
    expect(expresionDeReferencias({ ...feliz, totalReferencias: 19 })).toBe('happy');
  });

  it('sin documento, un monton de referencias no la vuelve feliz', () => {
    /* El orden de las reglas importa: sin documento no hay nada, por muchas que
       diga el store. La regla que se puede mutar es la que decide. */
    expect(expresionDeReferencias({
      hayDocumento: false, totalReferencias: 40, incompletas: 0, citasSinFuente: 0,
    })).toBe('worried');
  });
});
