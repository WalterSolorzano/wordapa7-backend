/**
 * EL PASO 4 DICE LA VERDAD, O NO DICE NADA.
 *
 * Estas pruebas fijan tres cosas que la pantalla hoy hace al revés, y las tres
 * son del mismo tipo de defecto: la pantalla afirma algo que no sabe.
 *
 *  1. EL ESTADO DE LA REFERENCIA. El chip decía "Válidas · DOI verificado OK"
 *     para un grupo que solo miraba que la referencia tuviera autor y un título
 *     de más de cinco caracteres. Nadie contrastaba esas referencias contra
 *     nada. Con la corrección, el chip sale de `diagnosticoDeReferencia` y
 *     `verificada` —el dato que un resolutor real pone—, y cuando el estado es
 *     "sin verificar" la pantalla dice POR QUÉ en vez de fingir que está bien.
 *
 *  2. `null` NO ES `false`. La versión vieja pintaba "Sin citar en texto" a todo
 *     lo que no encontraba, y `isOrphan` comparaba
 *     `s.includes(authors?.[0] || '---')`: con autores vacíos el operando
 *     derecho era la cadena `'---'`, y con autores presentes comparaba el
 *     NOMBRE COMPLETO del autor contra el texto, donde lo que está es el
 *     apellido. Antes de que corra la auditoría no se sabe si una referencia
 *     está citada, y decir "no está citada" cuando nadie miró es una
 *     afirmación sin dato.
 *
 *  3. LA VISTA PREVIA COMPOSA MENTIRAS. Pintaba
 *     `authors (year). title. source` armándolo en el render, mientras lo que
 *     va al documento es `formatted_apa`: con la elipsis de APA 7 de 21+ autores
 *     y el DOI normalizado, que sólo arma el backend. Lo que la persona lee no
 *     era lo que el documento recibía.
 *
 * Lo que NO se prueba acá, a propósito: los colores. Los tonos salen de tokens
 * y `TONO_DE_ESTADO`, y hay una prueba de R3 que lo cobra.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, within, fireEvent, act } from '@testing-library/react';
import { Step5ReferencesWizard } from '../components/referencias/Step5ReferencesWizard';
import { useDocStore } from '../store/useDocStore';

const runCitationAudit = vi.fn();
const addReference = vi.fn();
const removeReference = vi.fn();
const updateReferences = vi.fn();
const resolveDoiReference = vi.fn().mockResolvedValue(undefined);
const resolveDoisBlock = vi.fn().mockResolvedValue(undefined);
const resolveGhostCitation = vi.fn().mockResolvedValue(undefined);
const showToast = vi.fn();

const REF = {
  id: 'r1',
  authors: ['García, A.'],
  year: '2021',
  title: 'Análisis de metodologías',
  source: 'Revista X',
  formatted_apa: 'García, A. (2021). Análisis de metodologías. Revista X.',
  raw_text: '',
  verificada: true,
};

/** Un documento con un párrafo que cita a García. Sin documento, la pantalla no
 *  tiene nada que mostrar y los vacíos cambian de motivo. */
const DOC = {
  id: 'd1',
  name: 'tesis.docx',
  elements: [
    { id: 'p1', type: 'paragraph', text: 'Garcia (2021) lo demonstró en su trabajo' },
  ],
} as never;

function montar(
  references: unknown[],
  selectedId: string | null = 'r1',
  auditoria: unknown = null,
  doc: unknown = DOC,
) {
  useDocStore.setState({
    references,
    selectedReferenceId: selectedId,
    citationAuditResult: auditoria,
    doc,
    isLoading: false,
    addReference,
    removeReference,
    updateReferences,
    resolveDoiReference,
    resolveDoisBlock,
    runCitationAudit,
    resolveGhostCitation,
    showToast,
    setSelectedElementId: vi.fn(),
    setScrollTargetId: vi.fn(),
    setSelectedReferenceId: vi.fn(),
    setWizardStep: vi.fn(),
  } as never);
  return render(<Step5ReferencesWizard />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

/* ── El chip sale del dato, no de una cuenta de autores ────────────────────── */

describe('el estado de la referencia seleccionada', () => {
  it('una referencia verificada se rotula Verificada', () => {
    montar([REF]);
    expect(within(screen.getByTestId('estado-referencia')).getByText('Verificada')).toBeTruthy();
  });

  /* El defecto medido: el grupo decía "Válidas · DOI verificado OK" y solo
     miraba que hubiera autor y título. Nadie contrastó esas referencias. */
  it('una referencia con datos pero sin verificar NO dice "Válida", dice por qué', () => {
    montar([{ ...REF, verificada: false }]);
    const detalle = screen.getByTestId('estado-referencia');
    expect(detalle.textContent).not.toMatch(/Válida/);
    expect(detalle.textContent).toMatch(/contrast/i);
  });

  it('sin autores, el motivo nombra el campo que falta', () => {
    montar([{ ...REF, authors: [], verificada: false }]);
    expect(screen.getByTestId('estado-referencia').textContent).toMatch(/autor/i);
  });

  it('sin título ni texto crudo, el motivo también lo nombra', () => {
    montar([{ ...REF, title: '', raw_text: '', verificada: false }]);
    const texto = screen.getByTestId('estado-referencia').textContent;
    expect(texto).toMatch(/autor|título/i);
    expect(texto).toMatch(/título/i);
  });

  it('cuando está verificada, la razón es la real y no un campo que falta', () => {
    montar([{ ...REF, verificada: true, fuente_verificacion: 'doi' }]);
    const detalle = screen.getByTestId('estado-referencia');
    expect(detalle.textContent).toMatch(/doi/i);
    /* Y no se inventa un defecto: una referencia verificada no le falta nada. */
    expect(detalle.textContent).not.toMatch(/falta/i);
  });
});

/* ── `null` no es `false` ──────────────────────────────────────────────────── */

describe('la referencia sin citar en el texto', () => {
  it('sin auditoría corriendo NO dice que la referencia esté sin citar', () => {
    montar([REF], 'r1', null);
    expect(screen.getByTestId('estado-referencia').textContent).not.toMatch(/sin citar/i);
  });

  it('con la auditoría corrida y la referencia huérfana, lo dice', () => {
    montar([REF], 'r1', { ghost_citations: [], orphan_references: [{ id: 'r1' }] });
    expect(screen.getByTestId('estado-referencia').textContent).toMatch(/sin citar/i);
  });

  it('con la auditoría corrida y la referencia citada, NO lo dice', () => {
    montar([REF], 'r1', { ghost_citations: [], orphan_references: [{ id: 'r9' }] });
    expect(screen.getByTestId('estado-referencia').textContent).not.toMatch(/sin citar/i);
  });

  /* El caso que `isOrphan` no distinguía: con autores vacíos el operando
     derecho era `'---'`. Ahora no hay búsqueda en el cliente: el conjunto sale
     del `id` que devolvió el backend. */
  it('una referencia sin autor no se marca sola como huérfana', () => {
    montar([{ ...REF, authors: [] }], 'r1', { ghost_citations: [], orphan_references: [] });
    expect(screen.getByTestId('estado-referencia').textContent).not.toMatch(/sin citar/i);
  });
});

/* ── La vista previa muestra lo que va al documento ────────────────────────── */

describe('la vista previa de la referencia', () => {
  it('muestra formatted_apa, no un texto compuesto en el render', () => {
    montar([{ ...REF, formatted_apa: 'Texto que arma el backend.' }]);
    expect(screen.getByTestId('vista-previa-apa').textContent).toContain('Texto que arma el backend.');
  });

  it('sin formatted_apa cae al texto crudo, que también va al documento', () => {
    montar([{ ...REF, formatted_apa: '', raw_text: 'Texto crudo que sí se escribe.' }]);
    expect(screen.getByTestId('vista-previa-apa').textContent).toContain('Texto crudo que sí se escribe.');
  });

  it('sin ninguno de los dos lo dice, en vez de inventar una referencia', () => {
    montar([{ ...REF, formatted_apa: '', raw_text: '' }]);
    expect(screen.getByTestId('vista-previa-apa').textContent).toMatch(/no tiene texto/i);
  });

  it('la vista previa aplica sangría francesa y no se centra', () => {
    montar([REF]);
    const el = screen.getByTestId('vista-previa-apa');
    expect(el.style.textIndent).toBe('-0.5in');
    expect(el.style.paddingLeft).toBe('0.5in');
  });
});

/* ── El formulario sigue editable: es el que arma formatted_apa ────────────── */

describe('el formulario sigue editable, ahora bajo demanda en el modal', () => {
  /* La ficha dejó de ser un formulario permanente en el canvas: se abre con
     "Editar ficha". El contrato no cambió —cinco campos editables y un guardado
     que escribe en el store—, sólo cambió dónde vive. */
  const abrirEdicion = () => {
    montar([REF]);
    fireEvent.click(screen.getByRole('button', { name: /editar ficha/i }));
  };

  it('los cinco campos siguen ahí', () => {
    abrirEdicion();
    const cajas = screen.getAllByRole('textbox');
    const nombres = cajas.map((c) => c.getAttribute('placeholder') || c.getAttribute('value') || '');
    expect(cajas.length).toBeGreaterThanOrEqual(5);
    expect(nombres.join(' ')).not.toBe('');
  });

  it('"Guardar Cambios" sigue llamando a la actualización de referencias', async () => {
    abrirEdicion();
    /* `fireEvent`, no `.click()`: el guardado pasa por el `onSubmit` del form y
       el `.click()` nativo no lo envuelve en `act`. El guardado es async porque
       pide la línea APA al backend; por eso se espera. */
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    await vi.waitFor(() => expect(updateReferences).toHaveBeenCalled());
  });
});

/* ── La lista se agrupa por el dato, no por la heurística ──────────────────── */

describe('los grupos de la lista', () => {
  it('una referencia con datos pero sin verificar NO va al grupo de verificadas', () => {
    /* El defecto: `titleText.length < 5` mandaba a "Sin verificar" un artículo
       titulado "AI", y una referencia jamás contrastada entraba como válida. El
       rótulo del grupo es "Pendientes" y no "Metadatos incompletos": lo que
       tiene esa referencia son los metadatos completos y ninguna verificación. */
    const { container } = montar([{ ...REF, id: 'larga', verificada: false }], null);
    expect(container.textContent).toMatch(/Pendientes/);
    expect(container.textContent).not.toMatch(/Metadatos Incompletos/);
  });

  /* Los rótulos viejos afirmaban cosas que el grupo no comprobaba. "Válidas
     (DOI verificado OK)" sobre un grupo que sólo miraba autor y título era una
     etiqueta que el sistema se daba a sí mismo. */
  it('el grupo de verificadas no se rotula a sí mismo como "válidas"', () => {
    const { container } = montar([REF]);
    expect(container.textContent).not.toMatch(/Válidas/);
    expect(container.textContent).toMatch(/Verificadas/);
  });
});

/* ── El badge y las menciones de la FILA salen de la auditoría ─────────────── */

describe('el estado de la fila del catálogo', () => {
  /* La fila y el detalle tienen que decir lo mismo. La versión vieja leía
     `never_cited`/`cited_count` del modelo, que llegan con los defaults del
     store (`cited_count: 0`), así que TODA la bibliografía salía "Sin citar" y
     "0 menciones" mientras el panel de al lado contaba bien. */
  const pendiente = (extra: Record<string, unknown> = {}) => ({
    ...REF, id: 'rp', verificada: false, cited_count: 0, ...extra,
  });

  const abrirPendientes = () =>
    fireEvent.click(screen.getByRole('tab', { name: /pendientes/i }));

  const fila = (container: HTMLElement) => container.querySelector('.card-source') as HTMLElement;

  it('una referencia citada NO se marca "Sin citar" aunque cited_count sea 0', () => {
    const { container } = montar(
      [pendiente()], 'rp',
      { ghost_citations: [], orphan_references: [{ id: 'otra' }] },
    );
    abrirPendientes();
    expect(fila(container).textContent).not.toMatch(/Sin citar/);
  });

  it('una referencia huérfana sí se marca "Sin citar"', () => {
    const { container } = montar(
      [pendiente()], 'rp',
      { ghost_citations: [], orphan_references: [{ id: 'rp' }] },
    );
    abrirPendientes();
    expect(fila(container).textContent).toMatch(/Sin citar/);
  });

  it('la fila cuenta las menciones del texto, no el cited_count obsoleto', () => {
    /* DOC trae "Garcia (2021) lo demonstró": una mención real de García. */
    const { container } = montar(
      [pendiente()], 'rp',
      { ghost_citations: [], orphan_references: [] },
    );
    abrirPendientes();
    expect(fila(container).textContent).toMatch(/1 mención/);
  });

  it('no cuenta como mención los párrafos que están en la sección de referencias/bibliografía', () => {
    const docConBibliografia = {
      id: 'd2',
      name: 'tesis.docx',
      elements: [
        { id: 'p1', type: 'paragraph', text: 'En este capítulo se analiza la propuesta.' },
        { id: 'h_ref', type: 'heading', heading_level: 1, text: 'Referencias' },
        { id: 'p_biblio', type: 'paragraph', text: 'Garcia, A. (2021). Análisis de metodologías. Revista X.' },
      ],
    };
    const { container } = montar(
      [pendiente()], 'rp',
      { ghost_citations: [], orphan_references: [] },
      docConBibliografia,
    );
    abrirPendientes();
    // Debe mostrar 0 menciones porque el único texto con Garcia está en la sección de referencias
    expect(fila(container).textContent).toMatch(/0 menciones/);
  });
});

/* ── La mascota: la cara sale del estado de la fase ────────────────────────── */

describe('la mascota de la fase', () => {
  it('se pinta, y con el kind que EditorialMascot dibuja', () => {
    /* Un `kind` declarado y no dibujado deja la mascota en blanco, que es un
       fallo que no se ve: la pantalla parece tener icono y no tiene nada. */
    const { container } = montar([REF]);
    expect(container.querySelector('.editorial-mascot-kind-reference')).toBeTruthy();
  });

  it('con referencias incompletas está preocupada, y con la fase en orden está feliz', () => {
    /* La expresión se deriva del estado, no del decorado. Si fuera fija, estas
       dos pruebas daría lo mismo. */
    const incompleta = montar([{ ...REF, authors: [], verificada: false }]);
    expect(incompleta.container.querySelector('.editorial-mascot-expression-worried')).toBeTruthy();

    const enOrden = montar([REF]);
    expect(enOrden.container.querySelector('.editorial-mascot-expression-happy')).toBeTruthy();
  });

  it('sin documento está preocupada, aunque las referencias estén completas', () => {
    /* El orden de las reglas de `expresionDeReferencias` importa: sin documento
       no hay nada que verificar, por muchas fuentes que diga el store. */
    const { container } = montar([REF], 'r1', null, null);
    expect(container.querySelector('.editorial-mascot-expression-worried')).toBeTruthy();
  });

  it('con citas sin fuente está preocupada aunque no haya incompletas', () => {
    const { container } = montar([REF], 'r1', {
      ghost_citations: [{ raw_text: 'Alguien (2019) dijo algo' }], orphan_references: [],
    });
    expect(container.querySelector('.editorial-mascot-expression-worried')).toBeTruthy();
  });
});

/* ── Los vacíos son los compartidos ────────────────────────────────────────── */

describe('los estados vacíos', () => {
  it('el grupo activo vacío y el lienzo usan EstadoVacio, no un div con texto a mano', () => {
    /* Los textos viejos —"No hay fuentes válidas aún", "No hay entradas
       pendientes", "No se detectaron citas huérfanas"— no decían SU CAUSA, que
       es lo que el componente compartido exige. Con las pestañas solo se pinta
       UNA lista (la activa, vacía) más el vacío del lienzo: dos, no tres. */
    const { container } = montar([], null);
    expect(container.querySelectorAll('[data-testid="estado-vacio"]').length)
      .toBeGreaterThanOrEqual(2);
  });

  it('el vacío nombra el filtro que lo dejó así, que es lo único tocable', () => {
    const { container } = montar([], null);
    expect(container.textContent).toMatch(/filtro activo/i);
  });

  it('sin selección con fuentes, el lienzo es la bibliografía, no un tablero de números', () => {
    /* El tablero de tres cifras que nadie pidió y que el §3 de la barra de
       calidad prohíbe repetir como si fueran un resultado. Con fuentes y sin
       selección el lienzo muestra la página real; sin fuentes no hay página y
       eso lo cubre el caso siguiente. */
    const { container } = montar([REF], null);
    expect(container.querySelector('[data-testid="bibliografia-completa"]')).toBeTruthy();
    expect(container.textContent).not.toMatch(/Total Fuentes/);
  });

  it('sin documento y sin fuentes, el motivo es el de documento ausente', () => {
    /* El vacío de "documento ausente" vive en el lienzo cuando no hay ni
       documento ni fuentes que mostrar. */
    const { container } = montar([], null, null, null);
    expect(container.textContent).toMatch(/documento/i);
  });
});

/* ── Una acción de acento por bloque ───────────────────────────────────────── */

describe('la jerarquía de acciones', () => {
  it('la barra superior tiene UN solo botón de acento', () => {
    /* Antes "Nueva Referencia" y "Continuar a Auditoría" eran los dos
       `btn-primary`, y el que ganaba la mirada era el de adelante porque
       estaba más a la derecha. Después la barra quedó con "Auditar citas" y
       "Continuar a Auditoría" como texto secundario al lado del botón de
       agregar, y los tres verbos competían. La decisión final es que ESTA
       pantalla tiene una sola acción: agregar una referencia. La auditoría
       corre sola al entrar y "continuar" es el rail de fases, no una decisión
       de esta pantalla. */
    const { container } = montar([REF]);
    expect(container.querySelectorAll('header [data-accion="principal"]')).toHaveLength(1);
  });

  it('el botón de acento es el único de la barra: agregar', () => {
    const { container } = montar([REF]);
    const principal = container.querySelector('header [data-accion="principal"]');
    expect(principal?.textContent).toMatch(/nueva referencia/i);
    /* El texto que competía con el botón de agregar ya no está: ni "Auditar
       citas" ni "Continuar a Auditoría" viven en esta barra. */
    expect(screen.queryByRole('button', { name: /continuar a auditor/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /auditar citas/i })).toBeNull();
  });

  it('el modal conserva sus dos modos: DOI y entrada manual', () => {
    /* El modal no se toca en esta fase, pero si al migrar los botones se
       hubiera caído un modo, nadie lo notaría hasta que alguien lo use.
       "Nueva referencia" ahora despliega un menú: el modal abre al elegir
       una de sus dos entradas. */
    montar([REF]);
    /* `fireEvent`, no `.click()` directo: el `.click()` de DOM native no lo
       envuelve en `act` y el modal no llega a pintarse antes del assert. */
    fireEvent.click(screen.getByRole('button', { name: /nueva referencia/i }));
    expect(screen.getByRole('button', { name: /doi|crossref/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /entrada manual/i })).toBeTruthy();
  });
});

/* ── El campo de DOI acepta un BLOQUE ──────────────────────────────────────── */

/**
 * El pegado masivo. El caso real es la literatura completa: se seleccionan veinte
 * papers en el navegador, se copian, se pega. Con un `input` de una línea no hay
 * forma de pegar más de uno, y con veinte clicks la bibliografía no se arma nunca.
 *
 * Estas pruebas vivían en un archivo de pruebas del panel borrado, que probaba un
 * componente que la aplicación no le mostraba a nadie. El comportamiento —el que
 * vale— queda fijo acá, en la pantalla que sí está montada (`App.tsx:688` y
 * `:707`).
 *
 * El nombre del panel no aparece en esta línea a propósito: la guarda de
 * `referenciasEstaMontada.test.tsx` lee este archivo del disco y no admite ni una
 * mención, y una mención en un comentario es exactamente el falso positivo que
 * esa guarda evita.
 */
describe('el campo de DOI acepta un bloque', () => {
  const campoDOI = () => screen.getByRole('textbox', { name: /doi o (?:título|enlace)/i });

  const abrirModoDoi = () => {
    montar([REF]);
    /* El FAB despliega el menú; elegir "DOI o enlace" abre el modal en ese
       modo. Dos clicks en vez de uno es el precio de separar la decisión
       (cómo agregar) del resto de la barra. */
    fireEvent.click(screen.getByRole('button', { name: /nueva referencia/i }));
    fireEvent.click(screen.getByRole('button', { name: /doi|crossref/i }));
  };

  it('el campo es un área de texto, no una línea', () => {
    /* El primer defecto de un `input type="text"` con pegado masivo: la segunda
       línea no existe, y lo que se pega es media bibliografía. */
    abrirModoDoi();
    expect(campoDOI().tagName).toBe('TEXTAREA');
  });

  it('el rótulo dice que se pueden pegar varios, porque la capacidad existe', () => {
    abrirModoDoi();
    expect(document.body.textContent || '').toMatch(/uno por línea|uno por linea/i);
  });

  it('varias líneas van al endpoint de LOTE, no al de uno', async () => {
    /* El lote es lo que deduplica por DOI normalizado y reporta lo que falló uno
       por uno (`python/routers/references.py:42-51`): un DOI malo no puede tirar
       abajo los otros diecinueve. Mandar el bloque al endpoint de uno perdería
       justo eso. */
    abrirModoDoi();
    fireEvent.change(campoDOI(), { target: { value: '10.1000/a\n10.1000/b\n10.1000/c' } });
    /* `act` y no `fireEvent` suelto: el handler es `await` y el `setShowAddModal`
       de después llega en un microtask, fuera del `act` de `fireEvent`. */
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buscar y extraer metadatos/i }));
    });
    expect(resolveDoisBlock).toHaveBeenCalledWith('10.1000/a\n10.1000/b\n10.1000/c');
    expect(resolveDoiReference).not.toHaveBeenCalled();
  });

  it('una sola línea sigue yendo al endpoint de uno', async () => {
    /* El caso de siempre no se rompe: una línea con el mensaje del servidor
       ("eso no parece un DOI", `references.py:102-106`) es más útil que un
       contador de lote para un campo mal pegado. */
    abrirModoDoi();
    fireEvent.change(campoDOI(), { target: { value: '10.1000/solo' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /buscar y extraer metadatos/i }));
    });
    expect(resolveDoiReference).toHaveBeenCalledWith('10.1000/solo');
    expect(resolveDoisBlock).not.toHaveBeenCalled();
  });

  it('Enter resuelve y Shift+Enter parte línea', async () => {
    /* Sin esto no hay bloque: en un `input` Enter manda la acción y no hay
       forma de escribir la segunda línea. */
    abrirModoDoi();
    fireEvent.change(campoDOI(), { target: { value: '10.1000/a' } });
    fireEvent.keyDown(campoDOI(), { key: 'Enter', shiftKey: true });
    expect(resolveDoisBlock).not.toHaveBeenCalled();
    expect(resolveDoiReference).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.keyDown(campoDOI(), { key: 'Enter' });
    });
    expect(resolveDoiReference).toHaveBeenCalledWith('10.1000/a');
  });
});
