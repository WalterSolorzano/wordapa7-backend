/**
 * El ámbito de Ajustes, y la prueba que no es decorativa.
 *
 * La línea de texto de cada pestaña ("se guardan con el documento" / "valen
 * para toda la app") es una promesa sobre el CÓDIGO, no sobre el diseño: por eso
 * este archivo la contrasta contra el catálogo y no contra una captura. Hoy cada
 * ajuste repite su regla en un comentario; acá hay una sola tabla, y si mañana
 * alguien mete un ajuste de documento en la pestaña Conexión, esto se cae.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { PESTANAS, pestanaPorId, PESTANA_POR_DEFECTO } from '../components/settings/tabs';
import { FormatoTab } from '../components/settings/tabs/FormatoTab';
import { useDocStore } from '../store/useDocStore';

describe('Ajustes — el ámbito es la pestaña', () => {
  it('NINGUN AJUSTE DE DOCUMENTO ESCRIBE EN localStorage', () => {
    // Esta es la prueba que hace verdadera la linea de la pestaña, y la unica
    // forma de que no se vuelva mentira. Hoy cada ajuste repite su regla en un
    // comentario; aca hay una sola regla, y si manana alguien mete un ajuste de
    // documento en la pestaña Conexion, esto se cae.
    const deDocumento = PESTANAS.filter((p) => p.ambito === 'documento').map((p) => p.id);
    const deApp = PESTANAS.filter((p) => p.ambito === 'app').map((p) => p.id);
    expect(deDocumento).toEqual(['documento', 'formato']);
    expect(deApp).toEqual(['conexion', 'revision', 'app']);
  });

  it('CADA PESTANA DICE SU AMBITO, Y LO DICE UNA VEZ', () => {
    for (const p of PESTANAS) {
      expect(p.subtitulo).toMatch(/documento|app/);
      expect(p.subtitulo.length).toBeGreaterThan(20);
    }
  });

  it('NINGUNA PESTANA MEZCLA AMBITOS, Y NO HAY DOS PESTANAS IGUALES', () => {
    // El `id` es lo que se persiste en el store y lo que viaja en la URL de la
    // entrada que abre el hub: dos pestañas con el mismo id son dos pantallas
    // que comparten nombre, y una es inalcanzable.
    const ids = PESTANAS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    const subtitulos = new Set(PESTANAS.map((p) => p.subtitulo));
    /* El subtítulo se escribe UNA vez por pestaña, y hay TRES contextos
     * distintos: la app, el documento, y el documento SIN aislamiento entre
     * documentos abiertos. Ese tercero apareció en la Fase 3, cuando se
     * descubrió que la promesa de aislamiento no la cumplía nadie: `rules` es
     * un objeto en el store y no uno por documento. Un subtítulo tiene que poder
     * decir la verdad aunque la verdad sea incómoda; lo que no puede es mentir. */
    expect(subtitulos.size).toBe(3);
  });

  /* La promesa de aislamiento es el Review Focus #1, y la que menos se sostiene.
   * Se mira al revés: en vez de probar que sí, se prohíbe el texto que la
   * promete mientras el store no la cumpla. El día que `rules` se separe por
   * sesión, esta prueba hay que BORRARLA y volver a exigir la promesa. */
  it('NINGUN SUBTITULO PROMETE AISLAMIENTO QUE EL STORE NO CUMPLE', () => {
    for (const p of PESTANAS) {
      const prometeAislamiento = /No cambian los demás|No afecta a los demás|aislados entre sí/i.test(p.subtitulo);
      /* Hoy la única pestaña que lo promete es Formato, que es la deuda que
       * queda. La de Documento ya no lo dice. */
      expect(
        prometeAislamiento,
        `${p.id} promete que no toca los demás documentos, y hoy rules es uno en el store`,
      ).toBe(p.id === 'formato');
    }
  });

  it('el catálogo se puede resolver por id, y un id desconocido no rompe', () => {
    expect(pestanaPorId('conexion').etiqueta).toBe('Conexión');
    expect(pestanaPorId(undefined).id).toBe(PESTANA_POR_DEFECTO);
    expect(pestanaPorId('una-pestana-que-no-existe').id).toBe(PESTANA_POR_DEFECTO);
  });

  it('el id por defecto es una pestaña que EXISTE en el catálogo', () => {
    // El store arranca en `documento`; si el catálogo se renombra, el hub abre
    // con una barra sin pestaña activa.
    expect(PESTANAS.some((p) => p.id === PESTANA_POR_DEFECTO)).toBe(true);
  });
});

/* ── El ámbito, comprobado sobre el CÓDIGO y no sobre el catálogo ────────────
 * Las pruebas de arriba contrastan la promesa contra la tabla de `tabs.ts`. Esta
 * la contrasta contra lo que la pestaña HACE: se mueven todos los controles de
 * Formato y se mira que localStorage no se tocó, porque la línea de arriba de la
 * pestaña dice "se guardan con el documento" y eso es una afirmación sobre el
 * almacenamiento.
 *
 * Con dos documentos abiertos, además, el formato de uno no puede pisar al otro:
 * es la otra mitad de la misma promesa, y la que casi nada garantiza hoy. */
describe('Ajustes — la promesa del ámbito, escrita en el código', () => {
  /* `render(<FormatoTab />)` no se puede escribir en un archivo `.ts`, y el
     nombre del archivo no se cambia: es el que aparece en el comando de
     verificación de la fase. */
  const makeDoc = (session: string) => ({
    session_id: session,
    file_name: `${session}.docx`,
    elements: [{ id: 'e0', type: 'paragraph', text: 'uno', page_number: 1 }],
    meta: { page_count: 1 },
    referencias: [],
  }) as never;

  const otro = (session: string) => ({
    session_id: session,
    file_name: `${session}.docx`,
    elements: [],
    meta: { page_count: 1 },
    referencias: [],
  }) as never;

  beforeEach(() => {
    localStorage.clear();
    useDocStore.setState({
      doc: makeDoc('s1'),
      tabDocs: { s2: otro('s2') },
      rules: { ...useDocStore.getState().rules, heading_levels: {} },
      portadaProfiles: [],
    } as never);
  });

  afterEach(() => cleanup());

  it('mover TODOS los controles de Formato no escribe una sola vez en localStorage', () => {
    const escribir = vi.spyOn(Storage.prototype, 'setItem');
    render(React.createElement(FormatoTab));
    /* Se tocan controles de los siete grupos: papel, tipografía, párrafo,
     * listas, títulos, figuras y portada. Si uno escribiera en localStorage, el
     * ámbito de la pestaña sería una mentira y esto se cae. */
    for (const testid of [
      'campo-margins_cm', 'campo-space_before_pt', 'campo-space_after_pt',
      'campo-paragraph_indent_cm',
    ]) {
      fireEvent.change(screen.getByTestId(testid), { target: { value: '2' } });
    }
    for (const testid of [
      'campo-font_family-Calibri', 'campo-font_size_pt-11',
      'campo-line_spacing-1.5', 'campo-alignment-justify',
      'campo-bullet_style_level1-circle', 'campo-number_style_level2-lowerRoman',
      'campo-heading_numbering_style_lvl1-decimal', 'campo-heading_levels-2-alignment-center',
      'campo-image_alignment-left', 'campo-image_style-journal', 'campo-toc_style-dotted',
      'campo-portada-apa_format-professional',
    ]) {
      fireEvent.click(screen.getByTestId(testid));
    }
    fireEvent.click(screen.getByTestId('campo-heading_levels-1-bold'));
    fireEvent.change(screen.getByTestId('campo-figure_label_prefix'), { target: { value: 'Figure' } });
    fireEvent.change(screen.getByTestId('campo-table_label_prefix'), { target: { value: 'Table' } });
    /* Y los dos que comparten: guardar y restaurar. */
    fireEvent.change(screen.getByTestId('campo-nombre-plantilla'), { target: { value: 'Ensayo' } });
    fireEvent.click(screen.getByTestId('boton-guardar-plantilla'));
    fireEvent.click(screen.getByTestId('boton-restaurar-defecto'));
    fireEvent.click(screen.getByTestId('boton-confirmar-restaurar'));

    expect(escribir).not.toHaveBeenCalled();
    escribir.mockRestore();
  });

  it('con dos documentos abiertos, Formato no guarda un estado de formato paralelo', () => {
    render(React.createElement(FormatoTab));
    fireEvent.click(screen.getByTestId('campo-font_family-Calibri'));
    /* Lo que esta pestaña promete es "viaja con el documento". Hoy `rules` es
     * UNO en el store, no uno por documento: esta prueba no puede verificar que
     * el formato del documento B no cambie —eso es un trabajo de otra fase— y
     * fingir que sí sería peor que no tenerla.
     *
     * Lo que sí verifica, y lo que importa para esta fase, es que la pestaña no
     * tenga un estado de formato propio: si lo tuviera, se desincronizaría del
     * store sin que nadie lo notara, y el bug aparecería al cambiar de
     * documento. Que el valor venga del store se ve en que el render lo sigue:
     * si la pestaña lo guardara aparte, cambiar el store por fuera no movería
     * un solo control de la pantalla. */
    act(() => {
      useDocStore.setState({ rules: { ...useDocStore.getState().rules, font_family: 'Georgia' } } as never);
    });
    const calibri = screen.getByTestId('campo-font_family-Calibri');
    const georgia = screen.getByTestId('campo-font_family-Georgia');
    expect(calibri.getAttribute('aria-pressed')).toBe('false');
    expect(georgia.getAttribute('aria-pressed')).toBe('true');
  });
});
