/* WordAPA7 — LOS CONTROLES DEL PANEL DE EXPORTACIÓN, COMO DATO.
 *
 * Este archivo es la respuesta a la pregunta "¿este control llega a algo?", y
 * la respuesta está escrita UNA vez, acá, con el mismo criterio que
 * `formatoAjustes.ts` usa para los de Ajustes:
 *
 *     UN CONTROL ENTRA SI SU VALOR LLEGA A UNA LLAMADA O A UN PARÁMETRO DEL
 *     GENERADOR. SI NO LLEGA, NO ENTRA.
 *
 * POR QUÉ LA TABLA ESTÁ ACÁ Y NO EN EL TEST. Si los ids estuvieran escritos en
 * la prueba, agregar un control sin destino sería invisible: la prueba seguiría
 * affine sobre la lista que ella misma inventó. Al vivir acá, el guardián
 * (`exportarEstaMontada.test.tsx`) lee la tabla de verdad, y agregar un control
 * sin `destino` hace que nombre el id.
 *
 * TRES COSAS QUE ESTA FASE NO INVENTA:
 *
 *  - **Lo que Ajustes ya tiene, acá se LEE.** El tamaño de hoja vive en
 *    `rules.page_size` y lo edita la pestaña Documento; los márgenes y la
 *    tipografía viven en `rules` y los edita la pestaña Formato, que tiene 31
 *    controles en 7 secciones. Poner un segundo control editable sobre los
 *    mismos campos serían dos verdades para un dato, que es exactamente el
 *    defecto que esta fase vino a quitar. Esos van como DERIVADOS, de solo
 *    lectura, con el valor que va a salir.
 *
 *  - **Lo que no llega a nada, no entra.** El plan de fase pedía "qué se
 *    incluye: portada, índice, figuras y tablas, referencias, apéndices". De
 *    esos, solo la portada tiene un parámetro real detrás
 *    (`portada.force_skip_cover`, que el generador lee en `generator.py:969`).
 *    El índice, las figuras, las tablas y los apéndices no tienen ningún flag en
 *    `GenerateRequest` ni en `APARuleSet`: un interruptor para ellos sería un
 *    control mudo con la etiqueta de uno funcional, que es peor que no tenerlo.
 *    Quedan afuera, y por qué está acá y no en un comentario.
 *
 *  - **La tipografía se deriva, no se edita.** Cuerpo, títulos e interlineado
 *    se leen de `rules` y se muestran. Formato es el lugar donde se cambian.
 */

import { useDocStore } from '../../store/useDocStore';
import type { DocState } from '../../store/types';

/** Los cuatro grupos, con el título exacto que se ve en pantalla. */
export const CUATRO_GRUPOS = [
  'Qué se incluye',
  'La hoja',
  'La tipografía',
  'El archivo',
] as const;

export type GrupoDelPanel = typeof CUATRO_GRUPOS[number];

export interface ControlDelPanel {
  /** El `data-testid` del control. Es el id que el guardián nombra. */
  id: string;
  grupo: GrupoDelPanel;
  etiqueta: string;
  /** Qué pasa si se ENCIENDE. */
  alEncender: string;
  /** Qué pasa si se APAGA. Un control que solo dice qué activa, vende una cosa. */
  alApagar: string;
  /**
   * A QUÉ LLEGA EL VALOR. En una frase que nombra el campo del store o el
   * parámetro de la llamada. Es lo que la prueba mira: un control sin destino
   * no entra al panel.
   */
  destino: string;
  /** El setter del store al que escribe, si escribe en el store. */
  accionStore?: keyof DocState;
  /** Si el valor solo se puede cambiar con el formato .docx. */
  soloDocx?: boolean;
}

export const CONTROLES_DEL_PANEL: ControlDelPanel[] = [
  /* ── Qué se incluye ──────────────────────────────────────────────────────
     La portada tiene un parámetro real: `portada.force_skip_cover`, que el
     generador lee para decidir si toca o saltea el bloque de portada
     (`generator.py:969`). Es el único de los cinco del plan que llega a algo,
     y entra por eso y no porque el plan lo nombrara. */
  {
    id: 'incluir-portada',
    grupo: 'Qué se incluye',
    etiqueta: 'Incluir la portada',
    alEncender: 'El archivo sale con la portada, intacta si elegiste conservar la original.',
    alApagar: 'El archivo sale sin portada: el cuerpo empieza en la primera página.',
    destino: 'portada.force_skip_cover (lo lee generation/generator.py:969)',
    accionStore: 'setPortada',
  },

  /* ── La hoja ────────────────────────────────────────────────────────────
     Tamaño de hoja y márgenes NO SON CONTROLES: son DERIVADOS, de abajo.
     Editarlos acá sería un segundo control sobre `rules.page_size` y
     `rules.margins_cm`, que ya tienen el suyo en Ajustes. */

  /* ── La tipografía ──────────────────────────────────────────────────────
     Mismo caso: cuerpo, títulos e interlineado se LEEN de `rules`. Formato los
     edita, en sus 31 controles. Acá se muestran para que quien exporta sepa qué
     va a salir. */

  /* ── El archivo ─────────────────────────────────────────────────────────
     El idioma y las marcas de control de cambios son los dos que sí se
     cambian en la pantalla de exportar, y los dos llegan a la generación. */
  {
    id: 'idioma',
    grupo: 'El archivo',
    etiqueta: 'Idioma del texto',
    alEncender: 'Se escribe como w:lang en el archivo: Word usa ese corrector de ortografía.',
    alApagar: 'Vuelve al idioma por omisión del documento, que es español.',
    destino: 'portada.language (llega a w:lang por generation/inplace_editor.py:321)',
    accionStore: 'setPortada',
  },
  {
    id: 'marcas-de-cambio',
    grupo: 'El archivo',
    etiqueta: 'Incluir marcas de control de cambios',
    alEncender: 'Se genera por /api/generate-tracked y el archivo sale con las diferencias marcadas.',
    alApagar: 'Se genera por /api/generate y el archivo sale limpio, sin marcas.',
    destino: 'tracked (elige el endpoint de documentSlice.exportDocx)',
    accionStore: 'setTracked',
    soloDocx: true,
  },
];

export interface DerivadoDelPanel {
  id: string;
  grupo: GrupoDelPanel;
  etiqueta: string;
  /** De qué campo del store se lee. */
  de: string;
  /** El valor tal como se muestra. */
  leer: () => string;
  /** Dónde se cambia. La respuesta honesta a "esto no se edita acá". */
  seCambiaEn: string;
}

const COMAS = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 });

export const DERIVADOS_DEL_PANEL: DerivadoDelPanel[] = [
  {
    id: 'tamano-de-hoja',
    grupo: 'La hoja',
    etiqueta: 'Tamaño de hoja',
    de: 'rules.page_size',
    leer: () => (useRules().page_size === 'a4' ? 'A4 (210 × 297 mm)' : 'Carta (216 × 279 mm)'),
    seCambiaEn: 'Ajustes → Documento',
  },
  {
    id: 'margenes',
    grupo: 'La hoja',
    etiqueta: 'Márgenes',
    de: 'rules.margins_cm',
    leer: () => `${COMAS.format(useRules().margins_cm ?? 0)} cm en los cuatro lados`,
    seCambiaEn: 'Ajustes → Formato',
  },
  {
    id: 'cuerpo',
    grupo: 'La tipografía',
    etiqueta: 'Cuerpo del texto',
    de: 'rules.font_family + rules.font_size_pt',
    leer: () => `${useRules().font_family} ${useRules().font_size_pt} pt`,
    seCambiaEn: 'Ajustes → Formato',
  },
  {
    id: 'interlineado',
    grupo: 'La tipografía',
    etiqueta: 'Interlineado',
    de: 'rules.line_spacing',
    leer: () => {
      const n = useRules().line_spacing ?? 2;
      const nombre = n === 2 ? 'doble, lo que pide APA 7' : n === 1.5 ? 'de 1,5 líneas' : 'sencillo';
      return `${COMAS.format(n)} (${nombre})`;
    },
    seCambiaEn: 'Ajustes → Formato',
  },
  {
    id: 'titulos',
    grupo: 'La tipografía',
    etiqueta: 'Títulos',
    de: 'rules.heading_levels',
    leer: () => {
      const niveles = Object.keys(useRules().heading_levels ?? {}).length;
      return niveles > 0
        ? `niveles 1 a ${niveles} con su negrita, itálica y alineación`
        : 'con los valores de APA 7 por omisión';
    },
    seCambiaEn: 'Ajustes → Formato',
  },
];

/* Se lee con `getState()` y no con un hook: estas funciones se llaman desde el
   render del panel Y desde la prueba que afirma sobre la tabla, y un hook no se
   puede llamar desde los dos. `getState()` es la misma lectura sin suscripción:
   el panel vuelve a renderizar porque el componente se suscribe a `rules`. */
function useRules(): Record<string, any> {
  return (useDocStore.getState().rules ?? {}) as Record<string, any>;
}
