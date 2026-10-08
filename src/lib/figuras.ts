/**
 * WordAPA7 — la verdad de una figura, en un solo lugar.
 *
 * DOS REGLAS, Y LAS DOS SON EL MOTIVO DE QUE ESTE ARCHIVO EXISTA.
 *
 * 1. LA POSICIÓN ES LA IDENTIDAD. `ContextoFigura.indice` es la posición en
 *    `doc.elements`, y `id` es solo el direccionamiento que pide el backend al
 *    mutar. El orden importa: los ids son `elem_N`, un índice posicional que
 *    genera el backend (`src/store/slices/auditSlice.ts:150-154`), e insertar un
 *    párrafo arriba en Word corre TODOS los ids de abajo. Un mapa por
 *    `element.id` sigue al id, y después de un refresco `elem_7` es otro
 *    elemento: la figura "Metodología" pasa a decir "Introducción" y el párrafo
 *    anterior es el de otro. Es el mismo bug del diff por `element_id` que ya
 *    se corrigió recalculando en el motor de refresco.
 *
 * 2. UN TAMAÑO NO DECLARADO SE DICE, NO SE RELLENA. El defecto vivo eran los
 *    `|| 12` y `|| 8` de `ImageEditPanel.tsx` (nueve lugares) y los dos de
 *    `PaperCanvas.tsx`: un número inventado con la apariencia de un dato. Quien
 *    va a exportar mide lo que dice el `.docx`, no lo que dice la pantalla, así
 *    que un 12 x 8 que no está en el documento es una figura que miente sobre lo
 *    que va a salir. Acá `medidaDeFigura` sale de la geometría de la hoja
 *    (`portada/geometria.ts`), y cuando no hay tamaño declarado devuelve
 *    `declarada: false` y `altoPx: 0`: la altura la pone la proporción natural
 *    del archivo.
 *
 * Sin estado, sin React, sin `any` en la firma. Todo derivado de `doc.elements`
 * en una sola vuelta.
 */
import type { ElementModel, DesignStyle, CellSpan, TableStylePreset } from '../types';
import { seccionesDeElementos } from './jerarquia';
import { ANCHO_DE_LA_HOJA_PX, anchoUtilMm, mmAPx, type Hoja } from './portada/geometria';

export type TipoFigura = 'image' | 'table' | 'equation';

/** El nombre de la sección para lo que está antes del primer H1. Es un contexto
 *  real y se nombra, no se llama "Sin sección": hay una portada y está leída. */
export const ROTULO_DE_PREAMBULO = 'Portada';

/** Cuántos caracteres del párrafo anterior se muestran. */
export const MAX_CARACTERES_PARRAFO_ANTERIOR = 200;

/**
 * El ancho de pantalla que se supone al escenario.
 *
 * REEXPORTADO de `portada/geometria.ts` y no declarado otra vez: es el mismo
 * número con el mismo significado —el ancho de la hoja en pantalla—, y dos
 * constantes con el mismo nombre y valores distintos es la forma más común de
 * que dos pantallas digan cosas diferentes sobre la misma hoja.
 */
export { ANCHO_DE_LA_HOJA_PX };

/** Todo lo que la pantalla necesita saber de una figura, en un solo objeto. */
export interface ContextoFigura {
  /** Posición en `doc.elements`. ES LA IDENTIDAD. */
  indice: number;
  /** El id del backend. Solo para `updateElementImage` / `updateElementTable`. */
  id: string;
  tipo: TipoFigura;
  numero: number;
  /** "Figura 3" / "Tabla 1". */
  rotulo: string;
  leyenda: string;
  tieneLeyenda: boolean;
  /** "Metodología" / "Portada" si es preámbulo. */
  seccion: string;
  h1: string | null;
  h2: string | null;
  /** Hasta `MAX_CARACTERES_PARRAFO_ANTERIOR`, o `null` si no hay. `null` y `''`
   *  son cosas distintas: `''` es "hay un párrafo vacío", `null` es "no hay
   *  párrafo que presente a esta figura". */
  parrafoAnterior: string | null;
  /** Párrafo subsiguiente que sigue a la figura, o null si no hay. */
  parrafoSiguiente: string | null;
  /** 1-based, dentro de la sección y del mismo tipo. */
  posicionEnSeccion: number;
  totalEnSeccion: number;
  /** 1-based, dentro del mismo tipo en TODO el documento. Son los que el toggle
   *  Figuras | Tablas tiene que poder recorrerse enteros. */
  posicionEnTipo: number;
  totalEnTipo: number;
  /** El archivo de la imagen, crudo, o `null` si no hay o si esto es una tabla.
   *  Va crudo a propósito: quién lo resuelve a una URL es de la capa de red, y
   *  `contextosDeFiguras` no sabe de HTTP. */
  url: string | null;
  /** El tamaño DECLARADO, en centímetros, o `null` si el documento no lo dice.
   *  `null` no es `0` ni `12`: es "no declarado", y la pantalla lo dice. */
  anchoCm: number | null;
  altoCm: number | null;
  /** Los datos de una tabla, o `null` si esto es una figura. `TableModel` tiene
   *  `headers: string[]` y `rows: string[][]` (`src/types/index.ts:88-95`).
   *
   *  El ESTILO y los SPANS viajan acá y no se leen aparte: el Taller pinta el
   *  lienzo con este objeto (`TallerFigurasView.tsx` → `LienzoEditorialActivo`),
   *  y una tabla reducida a headers/rows pierde su `style` (el selector de
   *  estilo parecía no hacer nada) y sus celdas combinadas. */
  tabla: {
    headers: string[];
    rows: string[][];
    header_spans?: CellSpan[];
    row_spans?: CellSpan[][];
    style?: TableStylePreset;
  } | null;
  /** Estilo de diseño ('standard', 'scientific', 'full_width', 'multipanel', etc.) */
  designStyle?: DesignStyle;
  /** Subfiguras si la figura es compuesta / multipanel */
  subfigures?: { id: string; label: string; title: string; relative_url?: string }[];
}

export interface MedidaFigura {
  anchoPx: number;
  altoPx: number;
  /** `false` cuando el elemento NO declara tamaño, y entonces `altoPx` es 0: la
   *  altura la pone la proporción natural del archivo, no un número inventado. */
  declarada: boolean;
}

/**
 * El tamaño de una figura en píxeles de pantalla, a la escala de la hoja de F2.
 *
 * ESTA ES LA FUNCIÓN QUE SUSTITUYE AL `|| 12` / `|| 8`. Y no es lo mismo:
 *
 *   - Si hay `width_cm` y `height_cm`, la caja mide lo que la figura va a medir en
 *     la hoja, en la misma escala con la que la portada calcula su logo
 *     (`mmAPx` sobre `escalaDePreview`). Lo que se ve es lo que sale.
 *   - Si NO hay, `declarada` es `false`, `altoPx` es 0 y la vista usa la
 *     proporción natural del archivo.
 *
 * `Math.min(..., utilPx)`: una figura más ancha que el ancho útil no sale más
 * ancha en el papel, y una miniatura que se sale de la caja no es una miniatura.
 */
export function medidaDeFigura(
  info: { width_cm?: number; height_cm?: number } | null | undefined,
  anchoPx: number = ANCHO_DE_LA_HOJA_PX,
  hoja: Hoja = 'carta',
): MedidaFigura {
  const utilPx = mmAPx(anchoUtilMm(hoja), anchoPx, hoja);
  const w = info?.width_cm;
  const h = info?.height_cm;
  const declarada = typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0;
  if (!declarada) return { anchoPx: utilPx, altoPx: 0, declarada: false };
  return {
    anchoPx: Math.min(mmAPx(w * 10, anchoPx, hoja), utilPx),
    altoPx: mmAPx(h * 10, anchoPx, hoja),
    declarada: true,
  };
}

const PROSA = new Set<ElementModel['type']>([
  'paragraph',
  'bullet',
  'numbered_list',
  'block_quote',
]);

/* Un separador que no puede aparecer en un título. Uno escrito como escape y no
   como carácter: un espacio no sirve, porque los títulos llevan espacios y
   "2.1 Instrumentos" con espacios distintos partiría la misma clave en dos. */
const SEPARADOR_DE_CLAVE = '\u0000';

/**
 * La clave de agrupación de una figura: tipo + H1 + H2.
 *
 * EL H1 ENTRA POR UNA RAZÓN CONCRETA. Dos "2.1 Instrumentos" de capítulos
 * distintos son dos secciones distintas: agrupando por el H2 solo, dos capítulos
 * con el mismo subrótulo se fundirían en un bloque y "3 de 6" contaría figuras
 * ajenas. Y el tipo entra porque el toggle Figuras | Tablas tiene que poder
 * recorrerse entero sin que el conteo mezcle las dos clases.
 */
const claveDe = (h1: string | null, h2: string | null, tipo: TipoFigura): string =>
  `${tipo}${SEPARADOR_DE_CLAVE}${h1 ?? ''}${SEPARADOR_DE_CLAVE}${h2 ?? ''}`;

/**
 * TODO el contexto de todas las figuras y tablas del documento, en una sola
 * vuelta, más una segunda chiquita para los conteos de sección.
 */
export function contextosDeFiguras(elementos: readonly ElementModel[]): ContextoFigura[] {
  const secciones = seccionesDeElementos(elementos);
  const salida: ContextoFigura[] = [];
  /* Los índices de prosa con texto, en orden. Con la lista acumulada, el párrafo
     anterior de una figura sale del último que hay, sin volver a recorrer. */
  const prosa: number[] = [];

  for (let i = 0; i < elementos.length; i++) {
    const el = elementos[i];

    if (PROSA.has(el.type)) {
      if ((el.text || '').trim() && !el.is_cover_section) prosa.push(i);
      continue;
    }

    const esImagen = el.type === 'image';
    const esTabla = el.type === 'table';
    const esEcuacion = el.type === 'equation' || Boolean(el.equation);
    if (!esImagen && !esTabla && !esEcuacion) continue;
    /* Los logotipos de la portada no son figuras de esta fase: son parte del
       diseño de la portada, y `use_original_cover` no los puede tocar. */
    if (el.is_cover_section) continue;

    const numero = esImagen
      ? el.image_info?.figure_number ?? 0
      : esTabla
      ? el.table_info?.table_number ?? 0
      : typeof el.equation?.number === 'number'
      ? el.equation.number
      : parseInt(String(el.equation?.number ?? '0'), 10) || 0;
    const leyenda = esEcuacion
      ? (el.text || '').trim()
      : ((esImagen ? el.image_info?.caption : el.table_info?.caption) ?? '').trim();

    const sec = secciones[i] ?? { h1: null, h2: null, enPreambulo: true };

    let anterior: string | null = null;
    if (prosa.length > 0) {
      anterior = (elementos[prosa[prosa.length - 1]].text || '').trim();
      anterior = anterior ? anterior.slice(0, MAX_CARACTERES_PARRAFO_ANTERIOR) : null;
    }

    let siguiente: string | null = null;
    for (let j = i + 1; j < elementos.length; j++) {
      const nextEl = elementos[j];
      if (PROSA.has(nextEl.type) && (nextEl.text || '').trim() && !nextEl.is_cover_section) {
        siguiente = (nextEl.text || '').trim().slice(0, MAX_CARACTERES_PARRAFO_ANTERIOR);
        break;
      }
    }

    salida.push({
      indice: i,
      id: el.id,
      tipo: esImagen ? 'image' : esTabla ? 'table' : 'equation',
      numero,
      rotulo: esImagen
        ? numero
          ? `Figura ${numero}`
          : 'Figura'
        : esTabla
        ? numero
          ? `Tabla ${numero}`
          : 'Tabla'
        : numero
        ? `Ecuación ${numero}`
        : 'Ecuación',
      leyenda,
      tieneLeyenda: esEcuacion ? true : leyenda.length > 0,

      seccion: sec.h2 ?? sec.h1 ?? ROTULO_DE_PREAMBULO,
      h1: sec.h1,
      h2: sec.h2,
      parrafoAnterior: anterior,
      parrafoSiguiente: siguiente,
      posicionEnSeccion: 0,
      totalEnSeccion: 0,
      posicionEnTipo: 0,
      totalEnTipo: 0,
      url: esImagen ? el.image_info?.relative_url ?? null : null,
      anchoCm: esImagen && typeof el.image_info?.width_cm === 'number' ? el.image_info.width_cm : null,
      altoCm: esImagen && typeof el.image_info?.height_cm === 'number' ? el.image_info.height_cm : null,
      tabla: esImagen
        ? null
        : {
            headers: el.table_info?.headers ?? [],
            rows: el.table_info?.rows ?? [],
            header_spans: el.table_info?.header_spans,
            row_spans: el.table_info?.row_spans,
            style: el.table_info?.style,
          },
      designStyle: esImagen ? el.image_info?.design_style : undefined,
      subfigures: esImagen ? (el.image_info?.subfigures as any) : undefined,
    });
  }

  /* Segunda vuelta, chiquita: los conteos de sección no se saben hasta el final. */
  const totales = new Map<string, number>();
  for (const c of salida) {
    const clave = claveDe(c.h1, c.h2, c.tipo);
    totales.set(clave, (totales.get(clave) ?? 0) + 1);
  }
  const vistas = new Map<string, number>();
  for (const c of salida) {
    const clave = claveDe(c.h1, c.h2, c.tipo);
    const visto = (vistas.get(clave) ?? 0) + 1;
    vistas.set(clave, visto);
    c.posicionEnSeccion = visto;
    c.totalEnSeccion = totales.get(clave) ?? visto;
  }

  /* Y los conteos por tipo, que son los que gobiernan el toggle y las flechas.
     Se cuentan sobre la SALIDA ya ordenada, así que el número que ve la persona
     y el índice que se guardó salen de la misma vuelta. */
  const porTipo = new Map<TipoFigura, number>();
  for (const c of salida) porTipo.set(c.tipo, (porTipo.get(c.tipo) ?? 0) + 1);
  const vistosPorTipo = new Map<TipoFigura, number>();
  for (const c of salida) {
    const visto = (vistosPorTipo.get(c.tipo) ?? 0) + 1;
    vistosPorTipo.set(c.tipo, visto);
    c.posicionEnTipo = visto;
    c.totalEnTipo = porTipo.get(c.tipo) ?? visto;
  }

  return salida;
}

/** Solo un tipo. El toggle Figuras | Tablas de la UI pasa por acá, no por un
 *  filtro con `includes`. */
export function figurasDeTipo(
  ctx: readonly ContextoFigura[],
  tipo: TipoFigura,
): ContextoFigura[] {
  return ctx.filter((c) => c.tipo === tipo);
}

/**
 * Busca por rótulo, por leyenda Y POR SECCIÓN (§8.1). Los tres, en una sola pasada.
 *
 * POR LA MIGA COMPLETA Y NO SOLO POR `seccion`. `seccion` es el rótulo que se
 * muestra, que es el H2 cuando hay H2: una figura de "2.1 Instrumentos" NO tiene
 * "Metodología" en su `seccion`, y un redactor que escribe "metodología" en el
 * buscador quiere las figuras DEL CAPÍTULO, no solo las del subpárrafo. Por eso
 * el H1 y el H2 se buscan los dos.
 */
export function buscarFiguras(ctx: readonly ContextoFigura[], q: string): ContextoFigura[] {
  const recorte = q.trim().toLowerCase();
  if (!recorte) return [...ctx];
  return ctx.filter((c) =>
    `${c.rotulo} ${c.leyenda} ${c.seccion} ${c.h1 ?? ''} ${c.h2 ?? ''}`
      .toLowerCase()
      .includes(recorte),
  );
}

/** La figura activa, o `null`. Por POSICIÓN, no por id. */
export function figuraActiva(
  ctx: readonly ContextoFigura[],
  indice: number | null,
): ContextoFigura | null {
  if (indice === null) return null;
  return ctx.find((c) => c.indice === indice) ?? null;
}

/** Vecina en el orden del documento, dentro del mismo tipo, saltando el filtro. */
export function vecina(
  ctx: readonly ContextoFigura[],
  indice: number,
  paso: 1 | -1,
): ContextoFigura | null {
  const i = ctx.findIndex((c) => c.indice === indice);
  if (i === -1) return null;
  return ctx[i + paso] ?? null;
}
