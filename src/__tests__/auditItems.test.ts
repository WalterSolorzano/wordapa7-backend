/**
 * `collectAuditItems` y los elementos que no tienen texto.
 *
 * Una figura o una tabla sin leyenda no tienen un texto que corregir, y el modelo
 * no lo decía: `AuditItem.originalText` era obligatorio, así que
 * `auditItems.ts` inventaba `'[Figura sin rotular]'` y la vista lo pintaba como si
 * fuera una cita del documento, en un `<pre>` monoespaciado y encima tachado. No
 * había nada que citar ni nada que borrar.
 */

import { describe, it, expect } from 'vitest';
import { collectAuditItems, type AuditSources } from '../lib/auditItems';
import type { ElementModel, ImageModel, TableModel } from '../types';

/** Un `ElementModel` con lo mínimo que el modelo de auditoría mira. */
const elemento = (over: Partial<ElementModel> & { id: string }): ElementModel =>
  ({ type: 'paragraph', text: '', ...over }) as ElementModel;

/** Un `image_info` con lo que exige su tipo y nada más. */
const imagen = (caption?: string): ImageModel => ({
  element_id: 'elem_fig',
  file_path: 'fig.png',
  filename: 'fig.png',
  relative_url: 'fig.png',
  width_cm: 10,
  height_cm: 6,
  caption: caption ?? '',
  figure_number: 1,
  alignment: 'center',
  wrap_style: 'inline',
  caption_position: 'below',
  constrain_proportions: true,
  design_style: 'standard',
});

/** Un `table_info` con lo que exige su tipo y nada más. */
const tablaInfo = (caption?: string): TableModel => ({
  element_id: 'elem_tbl',
  headers: ['Medida'],
  rows: [['media']],
  caption: caption ?? '',
  table_number: 1,
});

/** Las fuentes que recibe `collectAuditItems`, con solo el motor que interesa. */
const fuentes = (elements: ElementModel[]): AuditSources => ({
  elements,
  reviewResult: null,
  proofreadFindings: [],
  citationAuditResult: null,
});

describe('auditItems: elementos sin texto', () => {
  it('una figura sin leyenda no inventa un texto con forma de documento', () => {
    const items = collectAuditItems(
      fuentes([elemento({ id: 'elem_fig', type: 'image', image_info: imagen() })]),
    );
    const figura = items.find((i) => i.sinTexto?.clase === 'figura');
    expect(figura).toBeDefined();
    // El defecto: originalText valia '[Figura sin rotular]' y FindingDetail lo
    // pintaba en un <pre> monoespaciado, y EngineGroupCard lo tachaba.
    expect(figura!.originalText).toBe('');
  });

  it('una figura con leyenda entra por el camino de texto, no por el de sin texto', () => {
    const items = collectAuditItems(
      fuentes([
        elemento({ id: 'elem_fig', type: 'image', image_info: imagen('Figura 1. Flujo') }),
      ]),
    );
    expect(items.find((i) => i.sinTexto?.clase === 'figura')).toBeUndefined();
    /* Y el camino de texto no se cumple avisando: un elemento con leyenda no
       produce ningún hallazgo de rotulación, no uno con `sinTexto`. */
    expect(items.filter((i) => i.element_id === 'elem_fig')).toEqual([]);
  });

  it('una leyenda de un punto cuenta como leyenda', () => {
    // Un punto es texto. La distincion es caption.trim() vacio o no, no "es corta".
    const items = collectAuditItems(
      fuentes([elemento({ id: 'elem_fig', type: 'image', image_info: imagen(' . ') })]),
    );
    expect(items.find((i) => i.sinTexto?.clase === 'figura')).toBeUndefined();
  });

  it('una tabla sin rotular tambien lo dice, y no inventa', () => {
    const items = collectAuditItems(
      fuentes([
        elemento({
          id: 'elem_tbl',
          type: 'table',
          table_info: tablaInfo(),
        }),
      ]),
    );
    const tabla = items.find((i) => i.sinTexto?.clase === 'tabla');
    expect(tabla).toBeDefined();
    expect(tabla?.originalText).toBe('');
  });

  it('la portada original no produce aviso de figura sin rotular', () => {
    /* `use_original_cover` no puede mutar la portada, y una figura de portada no
       tiene por qué tener leyenda APA. El aviso es por elemento de cuerpo, no
       por documento. */
    const items = collectAuditItems(
      fuentes([
        elemento({ id: 'elem_portada', type: 'image', is_cover_section: true, image_info: imagen() }),
      ]),
    );
    expect(items.filter((i) => i.element_id === 'elem_portada')).toEqual([]);
  });

  it('un hallazgo con texto normal no lleva sinTexto', () => {
    const items = collectAuditItems(fuentes([elemento({ id: 'elem_1', text: 'La muestra fueza' })]));
    expect(items).toEqual([]);
    /* Y la forma del discriminante: cuando no hay aviso, `sinTexto` no aparece
       con `undefined` explícito, para que `item.sinTexto &&` sea la única
       pregunta que hay que hacerse. */
    const conHallazgo = collectAuditItems(
      fuentes([elemento({ id: 'elem_1', text: 'La muestra fueza' }), elemento({ id: 'elem_2', type: 'image', image_info: imagen() })]),
    );
    for (const item of conHallazgo) {
      if (item.sinTexto === undefined) expect('sinTexto' in item).toBe(false);
    }
  });
});
