/**
 * Ninguna clave interna llega a la lista de correcciones.
 *
 * El usuario vio `g74_verbatim_sin_comillas` donde debía leer "Texto copiado
 * sin comillas". Ese rótulo SÍ existía: el problema no fue la tabla, fue el
 * `SUBTYPE_LABELS[key] || key`, que devuelve la clave cruda en cuanto la tabla
 * no conoce el subtipo. Es un modo de fallo por omisión —se manifiesta la
 * primera vez que el backend emite una regla nueva— y por eso se cierra sobre
 * la clase, no sobre el caso.
 *
 * Estas pruebas walkean el catálogo de reglas y comprueban dos cosas: que todo
 * subtipo tiene rótulo de usuario, y que aunque no lo tuviera, lo que se
 * muestra nunca es la clave.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rotuloDeSubtipo, agruparHallazgosPorFase } from '../hooks/useReviewWorkbench';
import { PROOFREAD_SPECS } from '../lib/auditItems';
import { escribirMarcas, leerMarcas, CLAVE_MARCAS } from '../lib/marcasMap';

/** El mismo objeto que la vista recibe, con el tipo más flojo posible. */
const item = (subtype: string) => ({
  id: 'i', element_id: 'e', category: 'style', subtype,
  severity: 'low', summary: '', detail: '', originalText: '',
  pageNumber: 1, phase: null, readOnly: false,
});

describe('ningún nombre interno llega a la pantalla', () => {
  it('todo subtipo que la vista produce tiene rótulo de usuario', () => {
    /* La guarda que hace que las pruebas siguientes no pasen por no haber leído
       nada: si el catálogo se vacía, esto se vuelve cierto por falta de
       catálogo y no porque esté todo cubierto. */
    const subtipos = [...new Set(Object.values(PROOFREAD_SPECS).map((s) => s.subtype))];
    expect(subtipos.length).toBeGreaterThan(15);

    const sinRotulo = subtipos.filter((s) => rotuloDeSubtipo(s) === s);
    expect(
      sinRotulo,
      `subtipos que se muestran con su propia clave: ${sinRotulo.join(', ')}`,
    ).toEqual([]);
  });

  it('el g74 sale con el rótulo, no con la clave', () => {
    /* El caso que reportó el usuario, nombrado. */
    const fila = PROOFREAD_SPECS.g74_verbatim_sin_comillas;
    expect(fila).toBeTruthy();
    expect(rotuloDeSubtipo(fila.subtype)).toBe('Texto copiado sin comillas');
  });

  it('una regla nueva y desconocida NO muestra su clave interna', () => {
    /* El modo de fallo por omisión. Con el `|| key` de antes esto devolvía
       `regla_del_ano_que_nadie_registro`; ahora devuelve un rótulo legible y
       avisa en la consola, que es donde se arregla. */
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const rotulo = rotuloDeSubtipo('regla_del_ano_que_nadie_registro');
    expect(rotulo).not.toBe('regla_del_ano_que_nadie_registro');
    expect(rotulo).toBe('Otro hallazgo del corrector');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ninguna etiqueta de la tabla parece un identificador', () => {
    /* La otra mitad: que la tabla no se haya llenado con claves. Un rótulo con
       guion bajo o que empiece por una letra y número seguidos es una clave
       que se coló. */
    const subtipos = [...new Set(Object.values(PROOFREAD_SPECS).map((s) => s.subtype))];
    const crudos = subtipos
      .map((s) => rotuloDeSubtipo(s))
      .filter((r) => /^[a-z0-9]+(_[a-z0-9]+)+$/.test(r));
    expect(crudos, `rótulos que son claves: ${crudos.join(', ')}`).toEqual([]);
  });

  it('el rack agrupa con el rótulo, no con la clave', () => {
    /* Y que el camino que de verdad usa la vista pase por acá. */
    const grupos = agruparHallazgosPorFase([item('verbatim_sin_comillas')] as never);
    const sub = grupos[0] as unknown as { items: { subtype: string }[] };
    expect(sub.items[0].subtype).toBe('verbatim_sin_comillas');
    const etiqueta = rotuloDeSubtipo(sub.items[0].subtype);
    expect(etiqueta).not.toContain('_');
  });
});

/**
 * El mismo guardián, del lado del mapa de marcas: el `snake_case` que el usuario
 * vio en el lienzo salía de acá, no de la lista de correcciones.
 *
 * El mapa lo escribía `map[element_id] = KIND_LABELS[kind] || kind` dentro del
 * slice del store. `KIND_LABELS` tenía diez filas y el backend emite unas treinta,
 * así que las veinte que faltaban caían al `kind` crudo, y `PaperCanvas` lo
 * pintaba encima del párrafo como si fuera un rótulo.
 */
describe('el mapa de marcas no puede contener un identificador interno', () => {
  beforeEach(() => localStorage.clear());

  it('el mapa no puede contener un valor con guion bajo en minúsculas', () => {
    escribirMarcas([
      { element_id: 'elem_1', kind: 'paragraph_words' },
      { element_id: 'elem_2', kind: 'g11_variacion_oracion' },
      { element_id: 'elem_3', kind: 'regla_que_nadie_registro' },
    ]);
    const marcas = leerMarcas();
    for (const [elementId, etiqueta] of Object.entries(marcas)) {
      expect(etiqueta, `marca de ${elementId}`).not.toMatch(/^[a-z0-9]+(_[a-z0-9]+)+$/);
    }
  });

  it('el mapa se escribe con version, y sin version no se lee', () => {
    /* Un mapa de la versión anterior guarda rótulos viejos: es una tabla que el
       código ya no produce y no hay forma de traducirla. Se descarta. */
    escribirMarcas([{ element_id: 'elem_1', kind: 'ortografia' }]);
    expect(JSON.parse(localStorage.getItem(CLAVE_MARCAS) as string).version).toBeGreaterThan(0);
    expect(leerMarcas()).toEqual({ elem_1: 'Falta ortográfica o tilde' });

    localStorage.setItem(CLAVE_MARCAS, JSON.stringify({ elem_1: 'Primera persona' }));
    expect(leerMarcas()).toEqual({});
  });

  it('el fuente del slice ya no declara su propia tabla de rótulos', async () => {
    /* La firma del defecto: `KIND_LABELS` y su `|| f.kind`. Un test que la
       reconoce por texto no necesita que nadie se acuerde de que existió.
       La tercera mira es la lectura a mano: el slice puede BORRAR el mapa
       cuando invalida hallazgos rancios, pero no puede leerlo con un
       `JSON.parse` propio, porque eso es volver a conocer la forma. */
    const fuente = await import('../store/slices/auditSlice?raw');
    expect(fuente.default).not.toMatch(/KIND_LABELS/);
    expect(fuente.default).not.toMatch(/\|\|\s*f\.kind/);
    expect(fuente.default).not.toMatch(
      /JSON\.parse\(localStorage\.getItem\(['"]wordapa7_marcas_map/,
    );
  });

  it('el archivo que escribe el mapa no vuelve al kind crudo', async () => {
    /* El guardián de arriba mira el slice porque ahí estaba el defecto, pero el
       mapa hoy se escribe en `lib/marcasMap`. Un guardián atado al archivo viejo
       pasa en verde aunque el `|| f.kind` vuelva un metro más allá: esta
      asignatura se corrió al mover el código, y con ella se fue la vigilancia. */
    const fuente = await import('../lib/marcasMap?raw');
    expect(fuente.default).not.toMatch(/\|\|\s*f\.kind/);
    expect(fuente.default).not.toMatch(/KIND_LABELS/);
  });
});
