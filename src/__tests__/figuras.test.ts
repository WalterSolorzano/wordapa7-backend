/**
 * La verdad de una figura, en un solo lugar.
 *
 * Este archivo existe porque esa verdad estaba embebida en un `useMemo` de
 * `Step3FiguresTablesWizard.tsx:76-126`, y una verdad que vive dentro de un
 * componente no se puede probar. Dos cosas se prueban acá.
 *
 * 1. QUE LA SECCION SE INDEXA POR POSICION Y NO POR `element_id`. Los ids son
 *    `elem_N`, un indice posicional que genera el backend. Insertar un parrafo
 *    arriba en Word corre TODOS los ids de abajo, y un mapa por id sigue al id:
 *    la figura "Metodologia" pasa a decir "Introduccion" y el parrafo anterior es
 *    el de otro. Es el mismo bug del diff por `element_id` que ya se corrigio
 *    recalculando, y se corrige igual.
 *
 * 2. QUE UN TAMANO NO DECLARADO SE DICE Y NO SE RELLENA. El defecto vivo era el
 *    `|| 12` y el `|| 8` de `ImageEditPanel.tsx`: nueve lugares donde un numero
 *    inventado se muestra con la apariencia de un dato. Una figura sin tamano
 *    declarado no es una figura de 12 x 8 cm: es una figura sin tamano declarado,
 *    y la pantalla lo dice.
 */
import { describe, it, expect } from 'vitest';
import {
  contextosDeFiguras, figurasDeTipo, buscarFiguras, figuraActiva, vecina,
  medidaDeFigura, ANCHO_DE_LA_HOJA_PX, MAX_CARACTERES_PARRAFO_ANTERIOR,
} from '../lib/figuras';
import { seccionesDeElementos } from '../lib/jerarquia';
import { anchoUtilMm, mmAPx, HOJA_CARTA_MM } from '../lib/portada/geometria';
import type { ElementModel } from '../types';

let secuencia = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({ id: `elem_${++secuencia}`, style_name: '', alignment: 'left', font_name: 'Times New Roman',
     font_size: 12, is_bold: false, is_italic: false, is_bullet: false, left_indent_cm: 0,
     confidence: 1, is_user_modified: false, cita_ids: [], needs_review: false,
     auto_applied: false, ...o }) as ElementModel;

const h1 = (t: string) => el({ type: 'heading', heading_level: 1, text: t });
const h2 = (t: string) => el({ type: 'heading', heading_level: 2, text: t });
const p = (t: string) => el({ type: 'paragraph', text: t });
const fig = (n: number, extra: Record<string, unknown> = {}) =>
  el({ type: 'image', text: `Figura ${n}`, image_info: { figure_number: n, caption: '', relative_url: '', ...extra } as never });
const tabla = (n: number) =>
  el({ type: 'table', text: `Tabla ${n}`, table_info: { table_number: n, caption: '', headers: [], rows: [] } as never });

const DOC: ElementModel[] = [
  h1('1. Introducción'),
  p('Primer parrafo de la introduccion con sus palabras'),
  h2('1.1 Antecedentes'),
  fig(1, { caption: 'Diagrama del proceso', width_cm: 14, height_cm: 9 }),
  h1('2. Metodología'),
  h2('2.1 Instrumentos'),
  p('Se aplico un cuestionario a doscientos estudiantes'),
  fig(2),
  tabla(1),
];

describe('seccionesDeElementos', () => {
  it('devuelve UNA ENTRADA POR ELEMENTO, en el mismo orden', () => {
    expect(seccionesDeElementos(DOC)).toHaveLength(DOC.length);
  });

  it('la figura de Antecedentes cuelga de su H2, no del H1 que la precede', () => {
    const sec = seccionesDeElementos(DOC)[3];
    expect(sec).toEqual({ h1: '1. Introducción', h2: '1.1 Antecedentes', enPreambulo: false });
  });

  it('un H3 no abre seccion propia: hereda el H2 que ya estaba', () => {
    const conH3 = [h1('1. Metodologia'), h2('1.1 Instrumentos'), el({ type: 'heading', heading_level: 3, text: '1.1.1 Detalle' }), p('x')];
    expect(seccionesDeElementos(conH3)[3].h2).toBe('1.1 Instrumentos');
  });

  it('antes del primer H1 el ambito es el preambulo, y un H2 suelto no lo abre', () => {
    const pre = [h2('Portada interna'), fig(1), h1('1. Introducción')];
    expect(seccionesDeElementos(pre)[0]).toEqual({ h1: null, h2: null, enPreambulo: true });
    expect(seccionesDeElementos(pre)[1].enPreambulo).toBe(true);
  });
});

describe('contextosDeFiguras — la POSICION es la identidad', () => {
  it('el contexto lleva indice, seccion, parrafo anterior y posicion en seccion', () => {
    const ctx = contextosDeFiguras(DOC);
    const segunda = ctx.find((c) => c.numero === 2)!;
    expect(segunda.h1).toBe('2. Metodología');
    expect(segunda.h2).toBe('2.1 Instrumentos');
    expect(segunda.seccion).toBe('2.1 Instrumentos');
    expect(segunda.parrafoAnterior).toBe('Se aplico un cuestionario a doscientos estudiantes');
    expect(segunda.posicionEnSeccion).toBe(1);
    expect(segunda.totalEnSeccion).toBe(1);
  });

  it('INSERTAR UN PARRAFO ARRIBA EN WORD NO CORTA LA SECCION DE LA FIGURA', () => {
    /* Los ids son posicionales, asi que al insertar arriba TODOS los ids de abajo
       corren. Un mapa por `element.id` sigue al id y se equivoca. Uno por posicion,
       no: la figura sigue siendo la misma figura y con la misma seccion. */
    const antes = contextosDeFiguras(DOC).find((c) => c.numero === 2)!;
    const corridos = DOC.map((e, i) => (i === 0 ? { ...e, id: 'elem_999' } : { ...e, id: `elem_${i + 40}` }));
    const despues = contextosDeFiguras([p('Parrafo nuevo en el tope'), ...corridos]).find((c) => c.numero === 2)!;
    expect(despues.seccion).toBe(antes.seccion);
    expect(despues.h1).toBe(antes.h1);
    expect(despues.parrafoAnterior).toBe(antes.parrafoAnterior);
  });

  it('un id de la pasada anterior YA NO APUNTA a la misma figura', () => {
    /* Por qué `id` no es la identidad, medido y no solo dicho.
       Los ids son `elem_N`, un indice posicional: insertar un parrafo arriba corre
       todos los de abajo. Este caso es el que rompe cualquier estructura que se
       guarde entre pasadas, un `Map` por id o un `selectedElementId` del store:
       ese id ya lo lleva OTRO elemento, y emparejarlo con la seccion de la figura
       anterior es la figura pegada al parrafo equivocado. */
    const antes = contextosDeFiguras(DOC);
    const idDeLaSegunda = antes[1].id;
    /* El backend renumera TODO al guardar, y la numeracion vieja no se respeta:
       el id que la figura tenia antes queda colgando o pasa a otro elemento. Por
       eso ese id no puede ser el lazo entre una pasada y la siguiente. */
    const corridos = DOC.map((e, i) => ({ ...e, id: `elem_${i + 40}` }));
    const despues = contextosDeFiguras([p('Parrafo nuevo en el tope'), ...corridos]);

    const conIdViejo = despues.find((c) => c.id === idDeLaSegunda) ?? null;
    /* Cualquiera de las dos formas es corrupcion: o el id no resuelve a nada, o
       resuelve a OTRA figura. Lo que no puede es devolver la de antes. */
    if (conIdViejo !== null) expect(conIdViejo.rotulo).not.toBe(antes[1].rotulo);

    /* Y la figura que realmente es la misma, la misma figura con su seccion. */
    const misma = despues.find((c) => c.numero === 2)!;
    expect(misma.seccion).toBe(antes[1].seccion);
    expect(misma.h1).toBe(antes[1].h1);
    expect(misma.parrafoAnterior).toBe(antes[1].parrafoAnterior);
  });

  it('el logo de la portada no es una figura de esta fase', () => {
    const conPortada = [h1('1. Introduccion'), el({ type: 'image', is_cover_section: true, text: 'Logo', image_info: { figure_number: 1, caption: '', relative_url: '' } as never })];
    expect(contextosDeFiguras(conPortada)).toHaveLength(0);
  });

  it('sin leyenda dice que NO HAY leyenda, y no inventa un texto', () => {
    const ctx = contextosDeFiguras(DOC).find((c) => c.numero === 2)!;
    expect(ctx.tieneLeyenda).toBe(false);
    expect(ctx.leyenda).toBe('');
  });

  it('el parrafo anterior se corta y el que no hay es null, no cadena vacia', () => {
    const largo = p('palabra '.repeat(80));
    const conCorte = [h1('1. Metodologia'), largo, fig(1)];
    const c = contextosDeFiguras(conCorte)[0];
    expect(MAX_CARACTERES_PARRAFO_ANTERIOR).toBe(200);
    expect(c.parrafoAnterior).toHaveLength(200);
    expect(contextosDeFiguras([h1('1. Metodologia'), fig(1)])[0].parrafoAnterior).toBeNull();
  });

  it('dos "2.1 Instrumentos" de capitulos distintos son dos secciones distintas', () => {
    /* Si la clave de agrupacion fuera el H2 solo, dos capitulos con el mismo
       subrotulo se fundirían en un bloque y "3 de 6" contaria figuras ajenas. */
    const doc: ElementModel[] = [
      h1('1. Uno'), h2('2.1 Instrumentos'), fig(1),
      h1('2. Otro'), h2('2.1 Instrumentos'), fig(2),
    ];
    const ctx = contextosDeFiguras(doc);
    expect(ctx[0].totalEnSeccion).toBe(1);
    expect(ctx[1].totalEnSeccion).toBe(1);
    expect(ctx[0].posicionEnSeccion).toBe(1);
    expect(ctx[1].posicionEnSeccion).toBe(1);
  });

  it('el numero del rotulo sale del dato, y lo que falta no se inventa', () => {
    const sinNumero = [h1('1. Uno'), el({ type: 'image', text: '', image_info: { caption: 'X', relative_url: '' } as never })];
    const c = contextosDeFiguras(sinNumero)[0];
    expect(c.numero).toBe(0);
    expect(c.rotulo).toBe('Figura');
  });
});

describe('contextosDeFiguras — la tabla viaja completa al lienzo', () => {
  it('el estilo y los spans de la tabla llegan al contexto (no se pierden)', () => {
    /* El Taller pinta el lienzo con `contextoActual.tabla`. Si el contexto arma
       la tabla solo con headers/rows, `TablaRender` cae al preset por defecto y
       el selector de estilo parece no hacer nada: el estado se guarda bien, la
       vista derivada lo descarta. */
    const doc: ElementModel[] = [
      h1('1. Uno'),
      el({
        type: 'table',
        text: 'Tabla 1',
        table_info: {
          element_id: 'elem_t1',
          table_number: 1,
          caption: '',
          headers: ['A', 'B'],
          rows: [['1', '2']],
          style: 'zebra',
          header_spans: [{ col: 2, row: 1 }],
          row_spans: [[{ col: 1, row: 1 }, { col: 1, row: 1 }]],
        } as never,
      }),
    ];
    const tabla = contextosDeFiguras(doc)[0].tabla!;
    expect(tabla.style).toBe('zebra');
    expect(tabla.header_spans).toEqual([{ col: 2, row: 1 }]);
    expect(tabla.row_spans).toEqual([[{ col: 1, row: 1 }, { col: 1, row: 1 }]]);
  });
});

describe('el buscador (§8.1: busca tambien por seccion)', () => {
  const ctx = contextosDeFiguras(DOC);

  it('encuentra por numero, por leyenda y por seccion', () => {
    expect(buscarFiguras(ctx, 'Figura 1').map((c) => c.numero)).toEqual([1]);
    expect(buscarFiguras(ctx, 'diagrama').map((c) => c.numero)).toEqual([1]);
    /* La que el buscador de hoy no puede encontrar: el buscador de
       `Step3FiguresTablesWizard.tsx:76-87` solo mira `Figura N` y `caption`. */
    /* Y trae la TABLA de esa seccion tambien, porque esta fase no filtra por
       tipo: el filtro de tipo es el toggle, no el buscador. */
    expect(buscarFiguras(ctx, 'instrumentos').map((c) => `${c.tipo}:${c.numero}`)).toEqual(['image:2', 'table:1']);
    expect(buscarFiguras(ctx, 'metodolog').map((c) => `${c.tipo}:${c.numero}`)).toEqual(['image:2', 'table:1']);
  });

  it('una cadena vacia devuelve todo, y una sin coincidencias devuelve la lista vacia', () => {
    expect(buscarFiguras(ctx, '   ')).toHaveLength(ctx.length);
    expect(buscarFiguras(ctx, 'zzz')).toEqual([]);
  });
});

describe('medidaDeFigura — sin tamano inventado', () => {
  it('con tamano declarado, la caja sale de la geometria de F2, no de un literal', () => {
    const utilMm = anchoUtilMm('carta');
    const escala = ANCHO_DE_LA_HOJA_PX / HOJA_CARTA_MM.ancho;
    const m = medidaDeFigura({ width_cm: 14, height_cm: 9 });
    expect(m.declarada).toBe(true);
    expect(m.anchoPx).toBeCloseTo(140 * escala, 4);
    expect(m.altoPx).toBeCloseTo(90 * escala, 4);
    /* Y entra en la hoja: el ancho util de una carta son 16.51 cm. */
    expect(140).toBeLessThan(utilMm);
  });

  it('SIN tamano declarado NO inventa 12 x 8: lo dice y devuelve la caja sin alto', () => {
    const m = medidaDeFigura({});
    expect(m.declarada).toBe(false);
    expect(m.altoPx).toBe(0);
    /* El defecto exacto que se mata: `|| 12` y `|| 8`. */
    expect(m.anchoPx).not.toBe(120 * (ANCHO_DE_LA_HOJA_PX / HOJA_CARTA_MM.ancho));
  });

  it('un ancho declarado en cero o negativo tampoco es un tamano', () => {
    expect(medidaDeFigura({ width_cm: 0, height_cm: 0 }).declarada).toBe(false);
    expect(medidaDeFigura({ width_cm: 14 }).declarada).toBe(false);
    expect(medidaDeFigura(null).declarada).toBe(false);
  });

  it('una figura mas ancha que la hoja no se sale de la caja', () => {
    /* 40 cm son 400 mm, y el ancho util de una carta son 165.1 mm. La caja se
       topa con el ancho util, NO con el ancho de la hoja: el margen de la hoja
       tambien es papel, y una figura que lo invade miente sobre lo que sale. */
    const m = medidaDeFigura({ width_cm: 40, height_cm: 30 });
    expect(m.anchoPx).toBeCloseTo(mmAPx(anchoUtilMm('carta'), ANCHO_DE_LA_HOJA_PX, 'carta'), 6);
    expect(m.anchoPx).toBeLessThan(ANCHO_DE_LA_HOJA_PX);
  });
});

describe('navegar y elegir', () => {
  const ctx = contextosDeFiguras(DOC);
  it('la figura activa se busca por indice, y un indice muerto da null', () => {
    expect(figuraActiva(ctx, ctx[0].indice)?.numero).toBe(1);
    expect(figuraActiva(ctx, 9999)).toBeNull();
    expect(figuraActiva(ctx, null)).toBeNull();
  });
  it('la vecina salta de tipo antes que de documento', () => {
    /* Figura 1, Figura 2, Tabla 1. De la Figura 2 la siguiente es la Tabla 1, no
       un id de la lista completa: el toggle Figuras | Tablas tiene que poder
       recorrerse entero sin pasar por el otro tipo. */
    const figs = figurasDeTipo(ctx, 'image');
    expect(figs).toHaveLength(2);
    expect(vecina(figs, figs[0].indice, 1)?.numero).toBe(2);
    expect(vecina(figs, figs[1].indice, 1)).toBeNull();
    expect(vecina(figs, figs[1].indice, -1)?.numero).toBe(1);
    expect(vecina(figs, figs[0].indice, -1)).toBeNull();
  });
  it('figurasDeTipo no muta el orden del documento', () => {
    expect(figurasDeTipo(ctx, 'table').map((c) => c.tipo)).toEqual(['table']);
  });
});
