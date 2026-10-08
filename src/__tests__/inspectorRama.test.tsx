/**
 * El inspector de rama de la fase de Estructura.
 *
 * El inspector es lo que hay adentro de UNA rama y qué se puede hacer SOLO ahí.
 * Y la parte que se prueba más fuerte es la del ALCANCE: "Reordenar" en un índice
 * jerárquico sin decir a qué aplica es una amenaza, y una acción que dice "esta
 * rama" y toca las hermanas es peor que una que no existiera.
 *
 * NOTA DE HISTORIA. Este archivo era `pulsoDocumento.test.tsx` y traía DOS
 * describes: el del inspector de rama y el del pulso de cinco números. El pulso
 * se borró del producto (palabras, balance, fases que faltan, figuras sin
 * leyenda y referencias sin citar se veían arriba de Estructura y el usuario no
 * les veía utilidad ahí: cada dato duplica algo que ya vive donde se acciona).
 * Con él se fueron sus siete pruebas. Lo que queda es lo que sigue vivo.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  InspectorRama,
  ACCIONES,
  alcanceDe,
  moverRama,
  preguntasDeIa,
  preguntaDeIa,
} from '../components/structure/InspectorRama';
import { construirJerarquia } from '../lib/jerarquia';
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

const h1 = (titulo: string): ElementModel => el({ type: 'heading', heading_level: 1, text: titulo });
const h2 = (titulo: string): ElementModel => el({ type: 'heading', heading_level: 2, text: titulo });
const parrafo = (texto: string): ElementModel => el({ type: 'paragraph', text: texto });

describe('el inspector de rama', () => {
  const DOC: ElementModel[] = [
    h1('1. Introducción'),
    parrafo('uno'),
    h1('2. Metodología'),
    h2('2.1 Instrumentos'),
    parrafo('dos'),
    parrafo('tres'),
    h1('3. Resultados'),
    parrafo('cuatro'),
  ];
  const ARBOL = construirJerarquia(DOC);
  const METODO = ARBOL[1];

  it('cada acción dice a qué alcance aplica', () => {
    expect(alcanceDe('reordenar')).toBe('esta-rama');
    expect(alcanceDe('promover')).toBe('esta-rama');
    expect(alcanceDe('renombrar')).toBe('esta-rama');
    expect(alcanceDe('consultar-ia')).toBe('esta-rama');
    /* Y el alcance está DECLARADO, no supuesto: si mañana aparece una acción
     * de documento, esta tabla es la que la vuelve visible. */
    expect(ACCIONES.every((a) => a.alcance === 'esta-rama')).toBe(true);
  });

  it('el alcance se ve en la pantalla, no solo en el código', () => {
    /* Un alcance que solo existe en el código no evita la amenaza: la amenaza es
     * de la persona que no lee el código. */
    render(<InspectorRama nodo={METODO} elementos={DOC} />);
    for (const accion of ACCIONES) {
      expect(screen.getAllByText(new RegExp(accion.etiquetaAlcance, 'i')).length).toBeGreaterThan(0);
    }
  });

  it('una acción de rama mueve la rama ENTERA y no toca el contenido de las hermanas', () => {
    /* "Reordenar" sin alcance declarado es una amenaza. Y si dice "esta rama" y
     * cambia el texto o el contenido de las hermanas, es peor que si no
     * existiera: por eso la prueba mira que las hermanas conservan su contenido
     * Y su orden relativo, y que la rama movida se lleva sus tres elementos. */
    const antes = moverRama(METODO, DOC, 'abajo');
    expect(antes).not.toBeNull();
    const nuevo = antes!;
    const tituloEn = (orden: string[]): string[] =>
      orden
        .map((id) => DOC.find((e) => e.id === id)!)
        .filter((e) => e.type === 'heading' && (e.heading_level ?? 1) === 1)
        .map((e) => e.text);
    expect(tituloEn(nuevo)).toEqual(['1. Introducción', '3. Resultados', '2. Metodología']);
    /* La rama movida conserva su contenido, íntegro y en orden. */
    const textos = (orden: string[]): string[] =>
      orden.map((id) => DOC.find((e) => e.id === id)!.text);
    expect(textos(nuevo)).toHaveLength(DOC.length);
    expect(textos(nuevo).filter((t) => t === 'dos' || t === 'tres')).toEqual(['dos', 'tres']);
    expect(textos(nuevo).filter((t) => t === 'uno')).toEqual(['uno']);
    expect(textos(nuevo).filter((t) => t === 'cuatro')).toEqual(['cuatro']);
  });

  it('una rama que ya está al borde no se mueve, y lo dice con null', () => {
    /* Un botón de "subir" en la primera rama es un botón que no hace nada. */
    expect(moverRama(ARBOL[0], DOC, 'arriba')).toBeNull();
    expect(moverRama(ARBOL[2], DOC, 'abajo')).toBeNull();
    expect(moverRama(ARBOL[0], DOC, 'abajo')).not.toBeNull();
  });

  it('preguntarle a la IA dice sobre qué rama pregunta', () => {
    expect(preguntaDeIa(METODO)).toContain('Metodología');
    /* Y la pregunta dice qué hay adentro: una pregunta sin el contenido de la
     * rama es una pregunta sobre el título. */
    expect(preguntasDeIa(METODO, DOC)).toContain('dos');
  });

  it('preguntar a la IA llama al backend de verdad, con la rama como contexto', () => {
    const consultar = vi.fn();
    render(<InspectorRama nodo={METODO} elementos={DOC} onConsultarIa={consultar} />);
    fireEvent.click(screen.getByRole('button', { name: /preguntarle a la IA/i }));
    expect(consultar).toHaveBeenCalledTimes(1);
    expect(consultar.mock.calls[0][1]).toContain('Metodología');
  });

  it('promover llama al store con el nivel nuevo, y renombrar con el texto nuevo', () => {
    const promover = vi.fn();
    const renombrar = vi.fn();
    render(
      <InspectorRama
        nodo={METODO.hijos[0]}
        elementos={DOC}
        onPromover={promover}
        onRenombrar={renombrar}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /promover/i }));
    expect(promover).toHaveBeenCalledWith(METODO.hijos[0]);
    expect(promover.mock.calls[0][0].titulo).toBe('2.1 Instrumentos');
  });

  it('sin la acción que no existe, NO hay botón: la lista es la que se puede hacer', () => {
    /* Nada de esta lista es un botón mudo: promover va a `updateElementType`,
     * renombrar a `updateElementText`, reordenar a `reorder-elements` y la
     * consulta al copiloto. Lo que no tiene endpoint no entra en la lista. */
    const spias = ACCIONES.map(() => vi.fn());
    render(
      <InspectorRama
        nodo={METODO}
        elementos={DOC}
        onPromover={spias[0]}
        onRenombrar={spias[1]}
        onReordenar={spias[2]}
        onConsultarIa={spias[3]}
      />,
    );
    expect(ACCIONES.map((a) => a.clave)).toEqual(['promover', 'reordenar', 'renombrar', 'consultar-ia']);
    expect(screen.getByRole('button', { name: /^Subir/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Bajar/i })).toBeTruthy();
  });

  it('la rama se PINTA: sus métricas, sus figuras y sus citas', () => {
    render(<InspectorRama nodo={METODO} elementos={DOC} />);
    expect(screen.getByText('Párrafos en rama')).toBeTruthy();
    expect(screen.getByText(/Palabras totales/i)).toBeTruthy();
    expect(screen.getByText(/citas/i)).toBeTruthy();
  });

  it('una rama sin contenido lo dice, y no muestra una lista vacía', () => {
    const vacia = construirJerarquia([h1('1. Introducción'), h1('2. Metodología')]);
    render(<InspectorRama nodo={vacia[1]} elementos={[h1('1. Introducción'), h1('2. Metodología')]} />);
    expect(screen.getByText(/sin contenido/i)).toBeTruthy();
  });
});
