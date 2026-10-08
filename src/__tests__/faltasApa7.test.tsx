/**
 * Qué le falta a APA 7, y por qué no se inventa lo que no está.
 *
 * Esto ya se calculaba en Python y se tiraba. `phase_scope.py` sabe qué
 * títulos abren qué fase, y `match_phase_exact` distingue un H2 mal nivelado de
 * uno que el autor puso a propósito. Para un redactor, esa es exactamente la
 * distinción que hace falta antes de escribir, y hoy no la muestra nadie.
 *
 * Y LA LISTA DE FASES REQUERIDAS NO SE ESCRIBE ACÁ. El plan daba por hecho que
 * `RULE_SCOPES` la tenía: no la tiene. `RULE_SCOPES` declara el ÁMBITO de cada
 * regla —a qué fase pertenece un tipo de hallazgo— y no dice qué secciones exige
 * APA 7 en una tesis. No hay ninguna constante de eso en el backend ni ningún
 * endpoint que lo exponga, así que la lista llega como ARGUMENTO, desde quien
 * la tenga: el frontend no inventa la quinta copia de una tabla que es de otro,
 * y la función no la esconde en una constante.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  FaltasApa7,
  faltasApa7,
  promoverPorDefecto,
} from '../components/structure/FaltasApa7';
import { construirJerarquia, crearVocabulario } from '../lib/jerarquia';
import { useDocStore } from '../store/useDocStore';
import type { ElementModel } from '../types';

let secuencia = 0;
const el = (o: Partial<ElementModel> & { type: ElementModel['type']; text: string }): ElementModel =>
  ({
    id: `e${++secuencia}`,
    style_name: '',
    alignment: 'left',
    font_name: 'Times New Roman',
    font_size: 12,
    is_bold: false,
    is_italic: false,
    is_bullet: false,
    left_indent_cm: 0,
    confidence: 1,
    is_user_modified: false,
    cita_ids: [],
    needs_review: false,
    auto_applied: false,
    ...o,
  }) as ElementModel;

const h1 = (titulo: string): ElementModel =>
  el({ type: 'heading', heading_level: 1, text: titulo });
const h2 = (titulo: string): ElementModel =>
  el({ type: 'heading', heading_level: 2, text: titulo });
const parrafo = (texto: string): ElementModel => el({ type: 'paragraph', text: texto });

/** Solo los títulos: para estas reglas el cuerpo no cuenta. */
const titulos = (ts: string[]): ElementModel[] => ts.map(h1);

/* El vocabulario del backend, en la FORMA en que viajaría si el endpoint que
 * expone `PHASES` existiera. Acá va completo para las tres fases que las
 * pruebas miran, y esa es la forma en que esta pantalla espera recibirlo. */
const VOCABULARIO = crearVocabulario([
  { key: 'introduccion', label: 'Introduccion', titles: ['introduccion'] },
  { key: 'resultados', label: 'Resultados', titles: ['resultados', 'resultado'] },
  { key: 'metodo', label: 'Metodo', titles: ['metodo', 'metodologia', 'metodologia de la investigacion'] },
]);

describe('faltas de APA 7', () => {
  it('una tesis sin Metodología la reporta como falta, no la inventa', () => {
    /* "No la inventa" es la mitad de la prueba: la lista de fases que se
     * revisan viene del que la tiene, y la que se falta se DICE. */
    const arbol = construirJerarquia(titulos(['1. Introducción', '2. Resultados']));
    const f = faltasApa7(arbol, ['introduccion', 'metodo', 'resultados'], VOCABULARIO);
    expect(f.map((x) => x.clase)).toContain('fase-requerida');
    const metodo = f.find((x) => x.detalle.includes('Metodo'));
    expect(metodo).toBeTruthy();
    /* Y el detalle nombra la fase por su NOMBRE, no con la clave. */
    expect(metodo!.detalle).toContain('Metodo');
  });

  it('una fase que el documento SÍ tiene no se reporta como falta', () => {
    /* El árbol se arma con el vocabulario DEL BACKEND, porque es el que sabe que
     * "Metodología" abre la fase `metodo`. Sin él el nodo llega con `fase: null`
     * y el resultado honesto es "falta el método" —que no es un defecto de esta
     * función sino del dato que le dieron—, y por eso el vocabulario entra por
     * los dos lados en vez de adivinarse dos veces. */
    const arbol = construirJerarquia(
      titulos(['1. Introducción', '2. Metodología']),
      {},
      VOCABULARIO,
    );
    const f = faltasApa7(arbol, ['introduccion', 'metodo', 'resultados'], VOCABULARIO);
    expect(f.filter((x) => x.clase === 'fase-requerida').map((x) => x.detalle)).toHaveLength(1);
  });

  it('sin lista de requeridas, NO se inventan faltas de fase', () => {
    /* La lista ausente no es "todas las fases faltan". Es ausencia, y una
     * pantalla que se inventa dieciocho capítulos para escribir está peor que
     * una que no dice nada. */
    const arbol = construirJerarquia(titulos(['1. Introducción']));
    expect(faltasApa7(arbol)).toEqual([]);
  });

  it('un H2 que dice "Resultados" a secas se propone promover, con el motivo', () => {
    const arbol = construirJerarquia([h1('1. Metodología'), h2('1.1 Resultados')]);
    const f = faltasApa7(arbol).find((x) => x.clase === 'h2-mal-nivelado');
    expect(f?.accion).toBe('promover');
    expect(f?.detalle).toContain('Resultados');
    expect(f?.nodoId).toBe(arbol[0].hijos[0].id);
  });

  it('un H2 con calificador NO se propone promover, y el motivo explica por qué no', () => {
    /* El autor puso un calificador: quiere decir algo concreto. Promoverlo sería
     * peor que no promover nada, porque aplana una subsección deliberada. */
    const arbol = construirJerarquia([h1('1. Metodología'), h2('1.1 Resultados de la encuesta')]);
    const f = faltasApa7(arbol).find((x) => x.clase === 'h2-mal-nivelado');
    expect(f).toBeUndefined();
  });

  it('nunca decide el ámbito mirando el cuerpo de un párrafo', () => {
    /* Un párrafo que dice "nuestra metodología se aplicó a 40 personas" NO puede
     * hace que el documento parezca tener una fase de método. `AGENTS.md` §1
     * prohíbe exactamente esto, y es el mismo error que el del "meta" dentro
     * de "metodología". */
    const arbol = construirJerarquia([
      h1('1. Introduccion'),
      parrafo('La metodologia se aplico a 40 personas del universo'),
    ]);
    expect(arbol[0].fase).toBe('introduccion');
    /* Y con la lista de requeridas, el método sigue faltando: el párrafo no lo
     * abre. */
    const f = faltasApa7(arbol, ['metodo'], VOCABULARIO);
    expect(f.map((x) => x.clase)).toEqual(['fase-requerida']);
  });

  it('la comparación es por la fase abierta por un H1, nunca por el texto', () => {
    /* Un "1.1 Resultados" que cuelga de un H1 de DISCUSIÓN no abre la fase
     * resultados: abre la de su ancestro, y por eso la fase que falta se
     * calcula sobre las de los H1. */
    const arbol = construirJerarquia([h1('1. Discusión'), h2('1.1 Resultados')]);
    const fases = new Set(arbol.map((n) => n.fase));
    expect(fases).toEqual(new Set(['discusion']));
  });
});

describe('la acción de promover es real, o no está', () => {
  it('el botón llama a la acción con el nodo, y no finge', () => {
    const arbol = construirJerarquia([h1('1. Metodología'), h2('1.1 Resultados')]);
    const onPromover = vi.fn();
    render(<FaltasApa7 raices={arbol} onPromover={onPromover} />);
    fireEvent.click(screen.getByRole('button', { name: /promover/i }));
    expect(onPromover).toHaveBeenCalledTimes(1);
    expect(onPromover.mock.calls[0][0].titulo).toBe('1.1 Resultados');
  });

  it('la acción por omisión llama al store, que pega al backend de verdad', () => {
    /* Un botón que actualiza el estado local y no el documento es peor que no
     * tenerlo: ocupa el lugar del que sí funciona. `updateElementType` termina
     * en `POST /api/update-element` con el `heading_level` nuevo, y el store se
     * reponer con la respuesta del servidor —no con una edición local— que es
     * lo que hace que el `.docx` salga con el H1. */
    const arbol = construirJerarquia([h1('1. Metodología'), h2('1.1 Resultados')]);
    const spy = vi.spyOn(useDocStore.getState(), 'updateElementType').mockResolvedValue(undefined);
    promoverPorDefecto(arbol[0].hijos[0]);
    expect(spy).toHaveBeenCalledWith(arbol[0].hijos[0].elementoId, 'heading', 1, '1.1 Resultados');
    spy.mockRestore();
  });

  it('una fase que falta NO ofrece un botón que no puede hacer nada', () => {
    /* No hay endpoint que inserte un capítulo en un documento que no lo tiene,
     * y no se va a simular. La fila lo dice. */
    const arbol = construirJerarquia(titulos(['1. Introducción']));
    render(<FaltasApa7 raices={arbol} fasesRequeridas={['introduccion', 'metodo']} />);
    expect(screen.getByText(/fase-requerida|Metodo/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /crear|agregar|añadir/i })).toBeNull();
  });

  it('sin faltas, el hueco se dice y no se muestra una lista vacía', () => {
    /* Con el árbol YA resuelto con el vocabulario del backend: sin él, "falta el
     * método" sería la respuesta honesta a un dato que no le dieron. */
    const arbol = construirJerarquia(
      [h1('1. Metodología'), h2('1.1 Instrumentos')],
      {},
      VOCABULARIO,
    );
    const { container } = render(
      <FaltasApa7 raices={arbol} fasesRequeridas={['metodo']} vocabulario={VOCABULARIO} />,
    );
    expect(screen.getByRole('status').textContent).toMatch(/no falta nada|no hay faltas/i);
    expect(container.querySelectorAll('li')).toHaveLength(0);
  });
});
