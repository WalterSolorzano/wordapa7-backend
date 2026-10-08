/**
 * La pestaña Formato: treinta y un controles del documento, en un solo lugar, y
 * dos controles muertos que despiertan.
 *
 * Lo que se prueba acá es lo que no se ve en una captura:
 *
 *  - QUE CADA CONTROL ESCRIBE Y SE GUARDA. Los doce que vivían en el estudio de
 *    ajustes, más las reglas de `APARuleSet` que nadie editaba. Cada uno escribe
 *    en `rules` y el store lo devuelve.
 *  - QUE UNA REGLA QUE NO ES UN AJUSTE NO TIENE CONTROL. Esta es la prueba del
 *    criterio de la fase, y va en las DOS direcciones: lo dibujado tiene que
 *    estar declarado en `AJUSTES` con su motivo, y lo declarado tiene que estar
 *    dibujado. Un control para `doi_as_hyperlink` —que en APA 7 es obligatorio—
 *    no serviría para otra cosa que para poder hacer un documento mal.
 *  - QUE LO QUE NO SE EDITA SE DICE. Un campo que nadie puede tocar sin control
 *    es indistinguible de un campo olvidado: por eso la pestaña los nombra y
 *    explica. La prueba mira DÓNDE aparece el nombre, no que no aparezca.
 *  - QUE LAS PLANTILLAS SE PUEDEN RECUPERAR. Se guardaban y no había forma de
 *    aplicarlas; el estudio solo mostraba un contador.
 *  - QUE RESTAURAR PIDE CONFIRMACIÓN Y DICE QUÉ RESTAURÓ. Sin la pregunta borra
 *    el formato entero de un clic; sin la lista, el toast afirmaría sin mirar.
 *  - QUE SIN DOCUMENTO LA PESTAÑA NO SE RENDERIZA COMO VACÍA (Review Focus #4):
 *    treinta y un controles que guardan nada no informan a nadie.
 */
import React, { act } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FormatoTab } from '../components/settings/tabs/FormatoTab';
import { AJUSTES, NO_ES_AJUSTE, SECCIONES } from '../components/settings/tabs/formatoAjustes';
import { useDocStore } from '../store/useDocStore';

const makeDoc = () => ({
  session_id: 's1',
  file_name: 't.docx',
  elements: [{ id: 'e0', type: 'paragraph', text: 'uno', page_number: 1 }],
  meta: { page_count: 1 },
  referencias: [],
}) as never;

/* El store es un singleton y estos archivos se pisan entre pruebas: sin esta
 * foto taken al cargar el módulo, la segunda prueba arrancaría con la fuente que
 * dejó la primera y "el tamaño del cuerpo no arrastra la fuente" se verificaría
 * sobre datos que ya estaban sucios. */
const REGLAS_DE_FABRICA = { ...useDocStore.getState().rules, heading_levels: {} };
const PORTADA_DE_FABRICA = { ...useDocStore.getState().portada };

const Poner = () =>
  act(() => {
    useDocStore.setState({
      doc: makeDoc(),
      rules: { ...REGLAS_DE_FABRICA },
      portada: { ...PORTADA_DE_FABRICA },
      /* Las listas de plantillas se vacían también: son acumuladores, y sin
       * esto el segundo "Ensayo" guardado aparece dos veces en la lista. */
      ruleProfiles: [],
      portadaProfiles: [],
      toasts: [],
      toastMessage: null,
    } as never);
  });

const reglas = () => useDocStore.getState().rules;

/** Los `data-campo` unicos que hay dibujados ahora mismo. */
const camposDibujados = (): string[] => {
  const todos = Array.from(document.querySelectorAll('[data-campo]'))
    .map((el) => el.getAttribute('data-campo') || '');
  return [...new Set(todos)].sort();
};

const id = (clave: string) => `campo-${clave.replace(/\./g, '-')}`;
const NOMBRE = 'campo-nombre-plantilla';

beforeEach(() => {
  localStorage.clear();
  Poner();
});

/* ── Los doce controles que estaban en el estudio ─────────────────────────── */

describe('Formato — los doce controles que estaban en el estudio', () => {
  it('están todos, y cada uno escribe en el store', () => {
    render(<FormatoTab />);
    /* Los doce, uno por uno. La lista es la del estudio
     * (`SettingsPreviewStudio`), y está escrita acá para que la migración no
     * pueda perder uno en silencio. */
    const losDoce = [
      'font_family', 'font_size_pt', 'line_spacing', 'alignment', 'paragraph_indent_cm',
      'image_alignment', 'image_style', 'toc_style', 'portada.apa_format',
      'heading_numbering_style_lvl1', 'heading_levels.1.bold', 'heading_levels.1.italic',
      'heading_levels.1.alignment',
    ];
    for (const clave of losDoce) {
      expect(camposDibujados(), `falta el control de ${clave}`).toContain(clave);
    }

    act(() => { fireEvent.click(screen.getByTestId(`${id('font_family')}-Georgia`)); });
    expect(reglas().font_family).toBe('Georgia');

    act(() => { fireEvent.click(screen.getByTestId(`${id('line_spacing')}-1.5`)); });
    expect(reglas().line_spacing).toBe(1.5);

    act(() => { fireEvent.click(screen.getByTestId(`${id('alignment')}-justify`)); });
    expect(reglas().alignment).toBe('justify');

    act(() => { fireEvent.change(screen.getByTestId(id('paragraph_indent_cm')), { target: { value: '1.5' } }); });
    expect(reglas().paragraph_indent_cm).toBe(1.5);

    /* Los interruptores de título escriben DENTRO de `heading_levels`, sin
     * pisar el mapa entero: el nivel 2 no puede perder su configuración porque
     * se tocó el nivel 1. */
    act(() => { fireEvent.click(screen.getByTestId(id('heading_levels.1.bold'))); });
    expect(reglas().heading_levels[1].bold).toBe(false);
    act(() => { fireEvent.click(screen.getByTestId(id('heading_levels.3.italic'))); });
    expect(reglas().heading_levels[3].italic).toBe(true);
    expect(reglas().heading_levels[3].bold).toBe(true);
    expect(reglas().heading_levels[1].bold).toBe(false);

    /* La portada no vive en `rules`: va a `portada`, que es donde el generador
     * la lee. */
    act(() => { fireEvent.click(screen.getByTestId(`${id('portada.apa_format')}-professional`)); });
    expect(useDocStore.getState().portada.apa_format).toBe('professional');
  });

  it('el tamaño del cuerpo se escribe solo, aunque la fuente no lo arrastre', () => {
    render(<FormatoTab />);
    act(() => { fireEvent.click(screen.getByTestId(`${id('font_size_pt')}-14`)); });
    expect(reglas().font_size_pt).toBe(14);
    expect(reglas().font_family).toBe('Times New Roman');
  });
});

/* ── Las reglas que existían sin ningún control ──────────────────────────── */

describe('Formato — las reglas que existían sin UI', () => {
  it('márgenes, espacio antes y después, rótulos, viñetas y numeraciones', () => {
    render(<FormatoTab />);
    const dibujados = camposDibujados();
    for (const clave of [
      'margins_cm', 'space_before_pt', 'space_after_pt',
      'figure_label_prefix', 'table_label_prefix',
      'bullet_style_level1', 'bullet_style_level2', 'bullet_style_level3',
      'number_style_level1', 'number_style_level2', 'number_style_level3',
    ]) {
      expect(dibujados, `${clave} existe en APARuleSet y nadie la editaba`).toContain(clave);
    }

    act(() => { fireEvent.change(screen.getByTestId(id('margins_cm')), { target: { value: '3' } }); });
    expect(reglas().margins_cm).toBe(3);

    act(() => { fireEvent.change(screen.getByTestId(id('space_before_pt')), { target: { value: '6' } }); });
    expect(reglas().space_before_pt).toBe(6);

    act(() => { fireEvent.change(screen.getByTestId(id('space_after_pt')), { target: { value: '0' } }); });
    expect(reglas().space_after_pt).toBe(0);

    act(() => { fireEvent.change(screen.getByTestId(id('figure_label_prefix')), { target: { value: 'Figure' } }); });
    expect(reglas().figure_label_prefix).toBe('Figure');

    act(() => { fireEvent.change(screen.getByTestId(id('table_label_prefix')), { target: { value: 'Table' } }); });
    expect(reglas().table_label_prefix).toBe('Table');

    act(() => { fireEvent.click(screen.getByTestId(`${id('bullet_style_level2')}-circle`)); });
    expect(reglas().bullet_style_level2).toBe('circle');

    act(() => { fireEvent.click(screen.getByTestId(`${id('number_style_level3')}-lowerRoman`)); });
    expect(reglas().number_style_level3).toBe('lowerRoman');
  });

  it('un campo de número vacío NO escribe: un 2 a medio escribir no es un formato de 2', () => {
    render(<FormatoTab />);
    const campo = screen.getByTestId(id('margins_cm')) as HTMLInputElement;
    /* Borrar el campo es un estado legítimo —"todavía no sé"— y no puede volverse
     * un `NaN` en las reglas, que el lienzo después paginaría como NaN. Lo que
     * se guarda es el número, y solo cuando hay número. */
    act(() => { fireEvent.change(campo, { target: { value: '' } }); });
    expect(reglas().margins_cm).toBe(2.54);
    act(() => { fireEvent.change(campo, { target: { value: '3.5' } }); });
    expect(reglas().margins_cm).toBe(3.5);
    expect(campo.value).toBe('3.5');
  });
});

/* ── LA PRUEBA DEL CRITERIO ───────────────────────────────────────────────── */

describe('Formato — una regla que no es un ajuste no tiene control', () => {
  it('TODO control dibujado está declarado como ajuste, con su motivo escrito', () => {
    render(<FormatoTab />);
    const declarados = new Set(AJUSTES.map((a) => a.clave));
    for (const clave of camposDibujados()) {
      expect(declarados.has(clave), `${clave} se dibuja sin estar declarado en AJUSTES`).toBe(true);
    }
    /* Y el motivo no es decorativo: es el criterio, escrito. Sin esto, la lista
     * es una lista de campos y no una decisión. */
    for (const a of AJUSTES) {
      expect(a.porQue.length, `${a.clave} no dice por qué es un ajuste`).toBeGreaterThan(30);
    }
  });

  it('TODO ajuste declarado tiene control: nada declarado queda inalcanzable', () => {
    render(<FormatoTab />);
    const dibujados = camposDibujados();
    for (const a of AJUSTES) {
      expect(dibujados, `${a.clave} está declarado como ajuste y no tiene control`).toContain(a.clave);
    }
  });

  it('NINGUN campo de NO_ES_AJUSTE tiene un control, en ninguna forma', () => {
    render(<FormatoTab />);
    for (const n of NO_ES_AJUSTE) {
      /* Ni un control... */
      expect(camposDibujados(), `${n.campo} es constante de la norma y tiene un control`).not.toContain(n.campo);
      expect(document.querySelector(`[data-no-ajuste="${n.campo}"] input`), `${n.campo} tiene un input`).toBeNull();
      expect(document.querySelector(`[data-no-ajuste="${n.campo}"] select`), `${n.campo} tiene un select`).toBeNull();
      expect(document.querySelector(`[data-no-ajuste="${n.campo}"] button`), `${n.campo} tiene un botón`).toBeNull();
      /* ...pero sí se NOMBRA, y se explica por qué. Un campo que nadie puede
       * tocar sin explicación es indistinguible de uno olvidado. */
      const fila = document.querySelector(`[data-no-ajuste="${n.campo}"]`);
      expect(fila, `${n.campo} no está explicado en la pestaña`).not.toBeNull();
      expect((fila as HTMLElement).textContent).toContain(n.porQue);
    }
  });

  it('la lista de NO_ES_AJUSTE no se solapa con la de ajustes', () => {
    const ajustes = new Set(AJUSTES.map((a) => a.clave));
    for (const n of NO_ES_AJUSTE) {
      expect(ajustes.has(n.campo), `${n.campo} está en las dos listas`).toBe(false);
    }
    /* Los cuatro que la fase revisó, nombrados: si mañana `APARuleSet` gana un
     * campo, la lista tiene que crecer o el control aparece sin criterio. */
    expect(NO_ES_AJUSTE.map((n) => n.campo)).toEqual([
      'doi_as_hyperlink', 'inline_text', 'table_border_style', 'reference_hanging_indent_cm',
    ]);
  });

  it('cada sección declarada tiene por lo menos un control, y cada control una sección', () => {
    render(<FormatoTab />);
    for (const s of SECCIONES) {
      expect(AJUSTES.filter((a) => a.clase === s.clase).length, `${s.clase} no tiene ajustes`).toBeGreaterThan(0);
    }
    const clases = new Set(SECCIONES.map((s) => s.clase));
    for (const a of AJUSTES) {
      expect(clases.has(a.clase), `${a.clave} está en una sección que no existe`).toBe(true);
    }
  });
});

/* ── Las plantillas: el puente entre los dos ámbitos ──────────────────────── */

describe('Formato — las plantillas se guardan Y se recuperan', () => {
  it('guardar una plantilla la deja listada, con un botón que la aplica', () => {
    render(<FormatoTab />);
    act(() => { fireEvent.click(screen.getByTestId(`${id('font_family')}-Georgia`)); });
    act(() => { fireEvent.change(screen.getByTestId(NOMBRE), { target: { value: 'Ensayo' } }); });
    act(() => { fireEvent.click(screen.getByTestId('boton-guardar-plantilla')); });

    const { ruleProfiles } = useDocStore.getState();
    expect(ruleProfiles.map((p) => p.profile_name)).toContain('Ensayo');
    /* Y el botón existe. Antes no había ninguno: la cuenta del estudio no
     * dejaba hacer nada con lo que contaba. */
    expect(screen.getByTestId('aplicar-plantilla-Ensayo')).toBeTruthy();
  });

  it('aplicar una plantilla cambia el formato del documento, y no le pone su nombre', () => {
    render(<FormatoTab />);
    act(() => { fireEvent.click(screen.getByTestId(`${id('font_family')}-Georgia`)); });
    act(() => { fireEvent.change(screen.getByTestId(NOMBRE), { target: { value: 'Ensayo' } }); });
    act(() => { fireEvent.click(screen.getByTestId('boton-guardar-plantilla')); });

    act(() => { fireEvent.click(screen.getByTestId(`${id('font_family')}-Arial`)); });
    expect(reglas().font_family).toBe('Arial');

    act(() => { fireEvent.click(screen.getByTestId('aplicar-plantilla-Ensayo')); });
    expect(reglas().font_family).toBe('Georgia');
    /* `profile_name` y `is_default` son la etiqueta de la caja, no formato:
     * aplicarlos renombraría el documento por el nombre de una plantilla. */
    expect(reglas().profile_name).toBe('APA 7 Estándar');
    expect(reglas().is_default).toBeUndefined();
  });

  it('aplicar una portada guardada cambia la portada', () => {
    render(<FormatoTab />);
    act(() => { fireEvent.click(screen.getByTestId(`${id('portada.apa_format')}-professional`)); });
    act(() => { fireEvent.change(screen.getByTestId(NOMBRE), { target: { value: 'Tesis' } }); });
    act(() => { fireEvent.click(screen.getByTestId('boton-guardar-plantilla')); });

    act(() => { fireEvent.click(screen.getByTestId(`${id('portada.apa_format')}-student`)); });
    expect(useDocStore.getState().portada.apa_format).toBe('student');

    act(() => { fireEvent.click(screen.getByTestId('aplicar-portada-Portada: Tesis')); });
    expect(useDocStore.getState().portada.apa_format).toBe('professional');
  });

  it('una plantilla sin nombre NO se guarda: sin nombre no se puede recuperar', () => {
    render(<FormatoTab />);
    act(() => { fireEvent.change(screen.getByTestId(NOMBRE), { target: { value: '   ' } }); });
    act(() => { fireEvent.click(screen.getByTestId('boton-guardar-plantilla')); });
    expect(useDocStore.getState().ruleProfiles.map((p) => p.profile_name)).not.toContain('');
  });

  it('el botón de guardar declara que esto es lo único que se comparte', () => {
    render(<FormatoTab />);
    /* El puente entre los dos ámbitos, dicho en la UI: todo lo demás de la
     * pestaña se queda con el documento, y una plantilla no. */
    const puente = screen.getByTestId('puente-plantillas').textContent || '';
    expect(puente).toMatch(/única parte de Ajustes que se comparte/);
    expect(puente).toMatch(/los demás que tengas abiertos no se tocan/);
  });
});

/* ── Restaurar valores por defecto ────────────────────────────────────────── */

describe('Formato — restaurar valores por defecto', () => {
  it('PIDE CONFIRMACIÓN: hasta confirmarlo, no cambia nada', () => {
    render(<FormatoTab />);
    act(() => { fireEvent.click(screen.getByTestId(`${id('font_family')}-Georgia`)); });
    act(() => { fireEvent.change(screen.getByTestId(id('margins_cm')), { target: { value: '4' } }); });

    act(() => { fireEvent.click(screen.getByTestId('boton-restaurar-defecto')); });
    expect(screen.getByTestId('aviso-restaurar')).toBeTruthy();
    expect(reglas().font_family).toBe('Georgia');
    expect(reglas().margins_cm).toBe(4);

    act(() => { fireEvent.click(screen.getByTestId('boton-cancelar-restaurar')); });
    expect(screen.queryByTestId('aviso-restaurar')).toBeNull();
    expect(reglas().font_family).toBe('Georgia');
  });

  it('confirmado, vuelve a los valores de fábrica y DICE cuáles restauró', () => {
    render(<FormatoTab />);
    act(() => { fireEvent.click(screen.getByTestId(`${id('font_family')}-Georgia`)); });
    act(() => { fireEvent.click(screen.getByTestId(`${id('line_spacing')}-1`)); });
    act(() => { fireEvent.change(screen.getByTestId(id('margins_cm')), { target: { value: '4' } }); });

    act(() => { fireEvent.click(screen.getByTestId('boton-restaurar-defecto')); });
    act(() => { fireEvent.click(screen.getByTestId('boton-confirmar-restaurar')); });

    expect(reglas().font_family).toBe('Times New Roman');
    expect(reglas().line_spacing).toBe(2);
    expect(reglas().margins_cm).toBe(2.54);
    /* El texto no es un "listo" genérico: nombra lo que volvió. Un aviso que no
     * dice qué cambió deja a la persona sin forma de saber si se restauró lo
     * que ella creía. */
    const que = screen.getByTestId('que-se-restauro').textContent || '';
    expect(que).toMatch(/Fuente del texto/);
    expect(que).toMatch(/Interlineado/);
    expect(que).toMatch(/Márgenes/);
  });

  it('las plantillas guardadas NO se tocan al restaurar', () => {
    render(<FormatoTab />);
    act(() => { fireEvent.click(screen.getByTestId(`${id('font_family')}-Georgia`)); });
    act(() => { fireEvent.change(screen.getByTestId(NOMBRE), { target: { value: 'Ensayo' } }); });
    act(() => { fireEvent.click(screen.getByTestId('boton-guardar-plantilla')); });

    act(() => { fireEvent.click(screen.getByTestId('boton-restaurar-defecto')); });
    act(() => { fireEvent.click(screen.getByTestId('boton-confirmar-restaurar')); });

    expect(useDocStore.getState().ruleProfiles.map((p) => p.profile_name)).toContain('Ensayo');
    expect(screen.getByTestId('aplicar-plantilla-Ensayo')).toBeTruthy();
  });
});

/* ── Sin documento, la pestaña no se renderiza como vacía ─────────────────── */

describe('Formato — sin documento no hay formato que ajustar', () => {
  it('lo dice, y no muestra los treinta y un controles mudos', () => {
    act(() => { useDocStore.setState({ doc: null } as never); });
    render(<FormatoTab />);
    expect(screen.getByTestId('formato-estado').textContent).toMatch(/Todavía no hay ningún documento abierto/);
    expect(camposDibujados()).toEqual([]);
    /* La cara preocupada sale del estado, no del decorado. */
    expect(document.querySelector('.editorial-mascot-expression-worried')).not.toBeNull();
  });

  it('con documento, la cara de la mascota sale de si el formato se sale de APA', () => {
    /* Times New Roman, doble y a la izquierda es APA 7. */
    render(<FormatoTab />);
    expect(document.querySelector('.editorial-mascot-expression-happy')).not.toBeNull();
    /* Georgia con interlineado sencillo no lo es, y la pestaña lo dice en
     * palabras: la cara sola no le sirve a nadie. */
    act(() => { fireEvent.click(screen.getByTestId(`${id('line_spacing')}-1`)); });
    expect(document.querySelector('.editorial-mascot-expression-curious')).not.toBeNull();
    expect(screen.getByTestId('formato-estado').textContent).toMatch(/se sale de APA 7/);
  });
});
