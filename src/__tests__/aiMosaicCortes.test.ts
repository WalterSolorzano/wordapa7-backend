/**
 * La calibración de la rampa de IA: los cortes dejan de ser una constante.
 *
 * Lo que se prueba acá es la mitad de la Fase 5 que no se ve en una captura, y
 * que por eso es la parte peligrosa: editar una calibración cambia el MAPA DE
 * CALOR entero, y un mapa que cambia sin que nadie lo haya pedido —o sin forma
 * de deshacerlo— es peor que un mapa fijo.
 *
 * Tres reglas, y cada una corrige un modo de fallo concreto:
 *
 *  - POR DEFECTO SIGUE SIENDO POR DEFECTO. Sin escribir nada, los cortes son
 *    los percentiles del PROPIO documento. Si una calibración vacía se
 *    confundiera con una de 30/60/90 fijos, la app empezaría a mentir sobre
 *    documentos que antes se leían bien, y no habría ningún control que
 *    dijera por qué.
 *  - LO ESCRITO MANDA. Con cortes escritos, la rampa es absoluta: eso cambia la
 *    lectura del escalón 4, que deja de ser "el peor de tu documento", y la
 *    prueba lo comprueba sobre el mismo documento con y sin escribir.
 *  - VOLVER ATRÁS ES PARTE DEL AJUSTE. Sin un `null` que significhe "automático",
 *    escribir una calibración sería una puerta de un solo sentido.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CORTES_AUTOMATICOS,
  LLAVE_DE_CORTES,
  construirMosaico,
  cortesDeLaRampa,
  cortesDesdeTexto,
  cortesPorCuartiles,
  guardarCortes,
  leerCortesGuardados,
  nivelDe,
  nivelesAlcanzables,
  normalizarCortes,
  repartirNiveles,
  type CortesIa,
} from '../lib/aiMosaic';
import { useDocStore } from '../store/useDocStore';
import type { ElementModel } from '../types';
import type { AuditItem } from '../lib/auditItems';

const el = (over: Partial<ElementModel> & { id: string; text: string }): ElementModel => ({
  type: 'paragraph', style_name: '', alignment: 'left', font_name: 'TNR', font_size: 12,
  is_bold: false, is_italic: false, is_bullet: false, left_indent_cm: 0, confidence: 1,
  is_user_modified: false, ...over,
} as ElementModel);

const item = (over: Partial<AuditItem> & { element_id: string }): AuditItem => ({
  id: `f-${over.element_id}`, category: 'ai', subtype: 'ai_phrase', severity: 'warn',
  summary: '', detail: '', originalText: '', pageNumber: 1, phase: 'metodo',
  readOnly: false, ...over,
} as AuditItem);

const H1 = (t: string, id: string) => el({ id, text: t, type: 'heading', heading_level: 1 });

/* Dos secciones de cuatro párrafos, con el detector marcando uno en la primera
   y tres en la segunda: 25% y 75%. Con percentiles del documento eso da dos
   escalones; con cortes fijos 10/20/30 la segunda se va al tope. */
const DOC: ElementModel[] = [
  H1('Metodo', 'h1'),
  el({ id: 'p1', text: 'Uno' }), el({ id: 'p2', text: 'Dos' }),
  el({ id: 'p3', text: 'Tres' }), el({ id: 'p4', text: 'Cuatro' }),
  H1('Resultados', 'h2'),
  el({ id: 'p5', text: 'Uno' }), el({ id: 'p6', text: 'Dos' }),
  el({ id: 'p7', text: 'Tres' }), el({ id: 'p8', text: 'Cuatro' }),
];

const HALLAZGOS: AuditItem[] = [
  item({ element_id: 'p1', phase: 'metodo' }),
  item({ element_id: 'p5', phase: 'resultados' }),
  item({ element_id: 'p6', phase: 'resultados' }),
  item({ element_id: 'p7', phase: 'resultados' }),
];

beforeEach(() => {
  localStorage.clear();
  useDocStore.setState({ iaCortes: null });
});

describe('la calibración: por defecto, los percentiles del propio documento', () => {
  it('lo que se escribe por defecto es P30, P60 y P90', () => {
    expect(CORTES_AUTOMATICOS).toEqual([0.3, 0.6, 0.9]);
    /* Y que la constante y la función digan lo mismo: dos listas de tres números
       que se parecen no son una decisión, son una coincidencia que un día
       diverge sola. */
    expect(cortesPorCuartiles([])).toEqual([...CORTES_AUTOMATICOS]);
  });

  it('sin escribir nada, el documento se reparte como antes', () => {
    const automatico = construirMosaico(DOC, HALLAZGOS);
    const escrito = construirMosaico(DOC, HALLAZGOS, null);
    expect(escrito.map((b) => b.nivel)).toEqual(automatico.map((b) => b.nivel));
    /* 25% y 75% en dos secciones: con los percentiles del propio documento la
       segunda es el tope y la primera queda en "algo". */
    expect(automatico.map((b) => b.proporcion)).toEqual([0.25, 0.75]);
    expect(automatico.map((b) => b.nivel)).toEqual([2, 4]);
  });

  it('la rampa por defecto alcanza los cuatro escalones', () => {
    expect(nivelesAlcanzables(CORTES_AUTOMATICOS)).toEqual([1, 2, 3, 4]);
  });
});

describe('la calibración: lo escrito manda', () => {
  it('los cortes escritos cambian los niveles del mismo documento', () => {
    const automatico = construirMosaico(DOC, HALLAZGOS);
    const fijo = construirMosaico(DOC, HALLAZGOS, [0.1, 0.2, 0.3]);
    /* 25% y 75%: con 10/20/30 la primera pasa el corte del 20% y la segunda el
       del 30%, así que las dos suben un escalón. Es el efecto que hace peligroso
       editar la rampa, y por eso los cortes se ven y se pueden deshacer. */
    expect(automatico.map((b) => b.nivel)).toEqual([2, 4]);
    expect(fijo.map((b) => b.nivel)).toEqual([3, 4]);
  });

  it('el escalón 4 deja de ser "el peor de tu documento"', () => {
    /* La definición del corte más alto es relativa al documento mientras sea
       automático, y absoluta cuando se escribe. `nivelDe` no cambia; lo que
       cambia es de dónde salen los tres números. El 65% de este documento es
       nivel 3 con los percentiles y nivel 4 con la calibración escrita. */
    const relativo = cortesDeLaRampa([0.1, 0.2, 0.3, 0.9], null);
    expect(relativo).toEqual([0.2, 0.3, 0.9]);
    expect(nivelDe(0.65, relativo)).toBe(3);

    const escrito: CortesIa = [0.4, 0.5, 0.6];
    expect(cortesDeLaRampa([0.1, 0.2, 0.3, 0.9], escrito)).toEqual([0.4, 0.5, 0.6]);
    expect(nivelDe(0.65, escrito)).toBe(4);
    /* Y al revés, con la calibración escrita una sección del 10% sigue siendo
       el escalón más bajo: el corte más bajo manda por debajo de 40%. */
    expect(nivelDe(0.1, escrito)).toBe(1);
  });

  it('la segunda pasada de la amplitud sigue aplicando con cortes escritos', () => {
    /* El uniforme se reprime a 2 igual que antes: la calibración cambia dónde
       caen los cortes, no la regla que impide una alarma sobre todo el
       documento. */
    expect(repartirNiveles([0.5, 0.5, 0.5], [0.1, 0.2, 0.3])).toEqual([2, 2, 2]);
  });

  it('los cortes se normalizan: tres números de 0 a 1, de menor a mayor', () => {
    expect(normalizarCortes([0.6, 0.3, 0.9])).toEqual([0.3, 0.6, 0.9]);
    expect(normalizarCortes([1.4, -0.2, 0.5])).toEqual([0, 0.5, 1]);
    expect(normalizarCortes([0.123456, 0.2, 0.3])).toEqual([0.123, 0.2, 0.3]);
    /* Y lo que no es una calibración no se guarda como si lo fuera. */
    expect(normalizarCortes(null)).toBeNull();
    expect(normalizarCortes([0.3, 0.6])).toBeNull();
    expect(normalizarCortes([0.3, NaN, 0.9])).toBeNull();
  });

  it('un almacenamiento con basura se lee como automático, no como un corte', () => {
    expect(cortesDesdeTexto(null)).toBeNull();
    expect(cortesDesdeTexto('no soy json')).toBeNull();
    expect(cortesDesdeTexto('{"cortes": [0.3, 0.6, 0.9]}')).toBeNull();
    expect(cortesDesdeTexto('[0.3, 0.6, 0.9]')).toEqual([0.3, 0.6, 0.9]);
  });

  it('y sin calibración guardada, la rampa tiene los cuatro escalones', () => {
    /* El caso que el plan avisa: con los tres cortes en 95 las bandas del 2 y
       del 3 no tienen NINGÚN valor que las alcance, y el mapa sale en dos
       escalones. Por eso este número se calcula y no se escribe a mano. */
    expect(nivelesAlcanzables([0.95, 0.95, 0.95])).toEqual([1, 4]);
    expect(nivelesAlcanzables([0.1, 0.2, 0.3])).toEqual([1, 2, 3, 4]);
  });
});

describe('la calibración: se guarda, y se puede volver al automático', () => {
  it('lo que escribe Ajustes sobrevive a la recarga', () => {
    guardarCortes([0.4, 0.5, 0.6]);
    expect(JSON.parse(localStorage.getItem(LLAVE_DE_CORTES) as string)).toEqual([0.4, 0.5, 0.6]);
    expect(leerCortesGuardados()).toEqual([0.4, 0.5, 0.6]);
    guardarCortes(null);
    expect(localStorage.getItem(LLAVE_DE_CORTES)).toBeNull();
    expect(leerCortesGuardados()).toBeNull();
  });

  it('el setter del store escribe la calibración en los dos lados', () => {
    const cortes: CortesIa = [0.4, 0.5, 0.6];
    useDocStore.getState().setIaCortes(cortes);
    expect(useDocStore.getState().iaCortes).toEqual(cortes);
    expect(leerCortesGuardados()).toEqual(cortes);
  });

  it('VOLVER AL AUTOMÁTICO es un setter más, y deshace hasta lo guardado', () => {
    /* El botón de "Volver al automático" de la pestaña Revisión llama a esto.
       Si `null` no significara automático, el ajuste sería una puerta de un
       solo sentido y deshacer una calibración sería imposible. */
    useDocStore.getState().setIaCortes([0.95, 0.95, 0.95]);
    expect(useDocStore.getState().iaCortes).toEqual([0.95, 0.95, 0.95]);

    useDocStore.getState().setIaCortes(null);
    expect(useDocStore.getState().iaCortes).toBeNull();
    /* Y el almacenamiento no quedó con la calibración muerta adentro. */
    expect(leerCortesGuardados()).toBeNull();
    /* Con lo cual el mosaico vuelve a los percentiles del documento. */
    const automatico = construirMosaico(DOC, HALLAZGOS, useDocStore.getState().iaCortes);
    expect(automatico.map((b) => b.nivel)).toEqual([2, 4]);
  });

  it('el setter ordena, así que un triple desordenado no deja bandas vacías', () => {
    useDocStore.getState().setIaCortes([0.9, 0.3, 0.6]);
    expect(useDocStore.getState().iaCortes).toEqual([0.3, 0.6, 0.9]);
  });
});
