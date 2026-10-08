/**
 * El carrusel: la activa SIEMPRE al centro, y la miniatura es el diseño REAL.
 *
 * Lo que había y por qué estaba mal:
 * - La tarjeta activa no estaba al centro: las cinco tarjetas se pintaban en una
 *   fila con `justify-content: center`, así que el centro lo ocupaba la tercera,
 *   no la elegida.
 * - Y encima, una tarjeta a más de dos puestos de la activa recibía
 *   `transform: undefined` (o sea, tamaño completo) junto con
 *   `filter: brightness(0.48)`. El papel blanco se multiplica a un gris plano y
 *   la tarjeta se lee como una losa vacía: ni diseño ni miniatura.
 * - La miniatura era un dibujo paralelo (`MiniaturasDeDiseno`) con `Times New
 *   Roman` y tamaños escritos a mano, así que no se parecía a lo que el `.docx`
 *   escribe ni a lo que la propia app muestra en el editor.
 *
 * Ahora la miniatura ES el componente del editor a la escala de la hoja
 * (`lib/portada/geometria`), y la fila se corre un paso por cada paso de índice
 * para que la elegida quede en el centro.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((u: string) => u),
  triggerDownload: vi.fn(),
}));
vi.mock('../components/layout/PaperCanvas', () => ({
  PaperCanvas: () => <div data-testid="canvas" />,
}));

import { useDocStore } from '../store/useDocStore';
import { clasificarAutoresDePortada } from '../components/layout/UNICoverPreview';
import { defaultActa, defaultPortada } from '../store/slices/coverSlice';
import { CarruselPortada, HOJA_DE_DATOS_TESTID, pasoDeArrastre, UMBRAL_DE_ARRASTRE_PX } from '../components/wizard/portada/CarruselPortada';
import { HojaDatosPortada } from '../components/wizard/portada/HojaDatosPortada';
import { CATALOGO_DE_UNIVERSIDADES } from '../lib/portada/catalogo';

const montarCarrusel = (portada = {}) => {
  useDocStore.setState({
    portada: { ...defaultPortada, institution: 'UNAN-Managua', ...portada },
    acta: { ...defaultActa, autor: 'Br. Ana Pérez | Carnet: 2023-1029U' },
    doc: null,
    wizardStep: 1,
  } as never);
  /* La institucion se elige en el store, no se escribe a mano: el logo viaja con
     la eleccion del catalogo. Escribir el nombre en el campo es texto libre, y el
     logo no se deduce de ahi. */
  useDocStore.getState().updateCoverInstitucion('UNAN');
  return render(<CarruselPortada />);
};

const miniatura = (id: string) => screen.getByTestId(`miniatura-${id}`);
/** La tarjeta entera: la hoja real vive acá, hermana del botón que elige. */
const tarjeta = (id: string) => screen.getByTestId(`tarjeta-${id}`);
const todasLasMiniaturas = () =>
  Array.from(document.querySelectorAll('[data-testid^="miniatura-"]')) as HTMLElement[];
const todasLasTarjetas = () =>
  Array.from(document.querySelectorAll('[data-testid^="tarjeta-"]')) as HTMLElement[];
/** La fila: reserva el alto de la tarjeta activa y aloja a las demás. */
const fila = () => screen.getByTestId('cover-carousel-row');

describe('carrusel de portada', () => {
  beforeEach(() => {
    useDocStore.setState({ portada: { ...defaultPortada }, acta: { ...defaultActa } } as never);
  });
  afterEach(() => {
    document.body.style.overflow = '';
  });

  it('la miniatura del diseño UNI es el render real de la hoja, no un dibujo aparte', () => {
    // El defecto: las cinco tarjetas eran líneas dibujadas con `div` y dos no
    // tenían componente. Lo que decide el usuario es lo que va a salir.
    montarCarrusel({ title: 'Titulo de la tesis' });
    const uni = tarjeta('uni');
    expect(within(uni).getByTestId('portada-uni-preview')).toBeTruthy();
    expect(uni.textContent).toContain('Titulo de la tesis');
    // El rótulo de autores es de la hoja real.
    expect(uni.textContent).toContain('Elaborado por');
  });

  it('la miniatura de APA 7 es el render real y no se puede editar desde el carrusel', () => {
    /* El render de APA es el mismo componente del editor (`APACoverEditor`), en
       modo lectura. Si trajera sus campos, la tarjeta tendría botones y campos
       dentro de otro control: el carrusel se elige, no se edita. */
    montarCarrusel();
    const apa7 = tarjeta('apa7');
    const hoja = within(apa7).getByTestId('portada-apa-sheet');
    /* La HOJA es la que no puede traer controles: el botón del rótulo es de la
       tarjeta, no del diseño. */
    expect(within(hoja).queryAllByRole('button')).toHaveLength(0);
    expect(within(hoja).queryAllByRole('textbox')).toHaveLength(0);
  });

  it('la miniatura de "conservar original" es la hoja real del documento', () => {
    // `original` es la recomendada y la única que no se puede generar: se
    // conserva. Su miniatura tiene que ser esa hoja, no una reconstrucción.
    montarCarrusel();
    expect(within(tarjeta('original')).getByTestId('canvas')).toBeTruthy();
  });

  it('la última tarjeta es una acción, no una hoja de diseño', () => {
    // Abrir el selector de archivos no es un diseño: no hay nada que dibujar.
    montarCarrusel();
    const custom = tarjeta('custom');
    expect(within(custom).queryByTestId('portada-uni-preview')).toBeNull();
    expect(within(custom).queryByTestId('canvas')).toBeNull();
    expect(custom.textContent).toContain('.docx');
  });

  it('la miniatura se actualiza con los datos de la portada', () => {
    // Si la miniatura no se actualiza, no sirve para decidir nada: el usuario
    // elige un diseño sin ver lo que va a salir con lo que escribió.
    const { unmount } = montarCarrusel({ title: 'Titulo viejo' });
    expect(tarjeta('uni').textContent).toContain('Titulo viejo');
    unmount();

    useDocStore.setState({
      portada: { ...useDocStore.getState().portada, title: 'Titulo nuevo' },
    } as never);
    render(<CarruselPortada />);
    expect(tarjeta('uni').textContent).toContain('Titulo nuevo');
  });

  it('la tarjeta activa queda siempre centrada y las demás se reparten alrededor', () => {
    /* El centro es FIJO: cada tarjeta se corre `(i - índice) * paso`. La activa
       tiene corrimiento 0 sin importar el índice, y las demás son simétricas. */
    montarCarrusel();
    const corrimiento = (id: string): number => {
      const m = /translateX\((-?[\d.]+)px\)/.exec(tarjeta(id).style.transform);
      return m ? Number(m[1]) : NaN;
    };

    // Índice inicial 0: 'original' al centro.
    expect(corrimiento('original')).toBeCloseTo(0, 5);
    const paso = Math.abs(corrimiento('apa7'));
    expect(paso).toBeGreaterThan(0);
    expect(corrimiento('uni')).toBeCloseTo(2 * paso, 5);
    expect(corrimiento('pro')).toBeCloseTo(3 * paso, 5);

    // Avanzar al centro (índice 2): 'uni' al centro y simetría.
    fireEvent.click(screen.getByLabelText(/siguiente diseño/i));
    fireEvent.click(screen.getByLabelText(/siguiente diseño/i));
    expect(corrimiento('uni')).toBeCloseTo(0, 5);
    expect(corrimiento('original')).toBeCloseTo(-2 * paso, 5);
    expect(corrimiento('custom')).toBeCloseTo(2 * paso, 5);
    expect(miniatura('uni').getAttribute('aria-current')).toBe('true');
  });

  it('la activa se resalta con escala 1 y las demás con escala menor y scrim', () => {
    montarCarrusel();
    expect(tarjeta('original').style.transform).toContain('scale(1)');
    expect(tarjeta('original').style.transform).not.toContain('rotateY');
    expect(tarjeta('apa7').style.transform).toMatch(/scale\(0\.\d+\)/);
    expect(tarjeta('apa7').style.transform).toContain('rotateY');

    // El scrim está SOLO en las no activas, y es la capa del canvas, no un filtro.
    expect(tarjeta('original').querySelector('[data-testid="scrim-original"]')).toBeNull();
    const scrim = tarjeta('apa7').querySelector('[data-testid="scrim-apa7"]') as HTMLElement;
    expect(scrim).toBeTruthy();
    expect(scrim.style.backgroundColor).toBe('var(--canvas-bg)');
  });

  it('la tarjeta recorta la hoja a su caja: el scrim no deja un filo de papel suelto', () => {
    /* El papel se dibuja con `anchoPx = anchoEfectivo`, así que con el padding
       de la tarjeta sobresale unos píxeles por la derecha. Sin recorte, en tema
       oscuro asoma un filo de papel fuera del scrim y del anillo de la activa. */
    montarCarrusel();
    expect(tarjeta('original').style.overflow).toBe('hidden');
    expect(tarjeta('apa7').style.overflow).toBe('hidden');
  });

  it('con ancho 320 y 560 la fila reserva un alto finito', () => {
    /* El alto de la fila sale de la miniatura activa: si la cuenta fallara,
       quedaría NaN/Infinity y las tarjetas absolutas se recortarían. */
    for (const ancho of [320, 560]) {
      useDocStore.setState({
        portada: { ...defaultPortada },
        acta: { ...defaultActa },
        doc: null,
      } as never);
      const { unmount } = render(<CarruselPortada anchoMiniatura={ancho} />);
      const alto = Number.parseFloat(fila().style.height);
      expect(Number.isFinite(alto)).toBe(true);
      expect(alto).toBeGreaterThan(0);
      unmount();
    }
  });

  it('ninguna tarjeta apaga el papel: el receso no usa filtro de brillo', () => {
    /* `filter: brightness(0.48)` sobre la hoja blanca la vuelve gris. La regla de
       `AGENTS.md` §1 dice que el papel es blanco puro con tinta nítida, así que el
       receso se hace con escala y opacidad, nunca apagando la hoja. */
    montarCarrusel();
    for (const t of todasLasTarjetas()) {
      expect(t.style.filter).not.toContain('brightness');
    }
    // Y la hoja que se dibuja dentro es la del papel, no un gris de interfaz.
    for (const id of ['original', 'apa7', 'uni', 'pro', 'custom']) {
      const papel = tarjeta(id).querySelector('[data-papel]') as HTMLElement;
      expect(papel).toBeTruthy();
      expect(papel.style.backgroundColor).toBe('var(--paper-white)');
    }
  });

  it('el arrastre mueve un paso, y por debajo del umbral no mueve', () => {
    /* El carrusel no tiene que depender del ratón: en táctil el gesto es
       arrastrar. Un temblor del pulgar no puede cambiar la portada elegida, así
       que hay un umbral. */
    expect(pasoDeArrastre(-120)).toBe(1); // dedo a la izquierda: avanza
    expect(pasoDeArrastre(120)).toBe(-1); // dedo a la derecha: retrocede
    expect(pasoDeArrastre(10)).toBe(0);
    expect(pasoDeArrastre(-UMBRAL_DE_ARRASTRE_PX + 1)).toBe(0);
    expect(pasoDeArrastre(-UMBRAL_DE_ARRASTRE_PX)).toBe(1);
  });

  it('arrastrar la pista cambia la tarjeta elegida', () => {
    montarCarrusel();
    const pista = screen.getByTestId('cover-model-track');
    fireEvent.pointerDown(pista, { clientX: 300 });
    fireEvent.pointerUp(pista, { clientX: 180 });
    expect(miniatura('apa7').getAttribute('aria-current')).toBe('true');
  });

  it('el arrastre corto no cambia nada', () => {
    montarCarrusel();
    const pista = screen.getByTestId('cover-model-track');
    fireEvent.pointerDown(pista, { clientX: 300 });
    fireEvent.pointerUp(pista, { clientX: 290 });
    expect(miniatura('original').getAttribute('aria-current')).toBe('true');
  });

  it('tiene controles para ir a izquierda y a derecha, con teclado', () => {
    montarCarrusel();
    fireEvent.click(screen.getByLabelText(/siguiente dise/));
    expect(miniatura('apa7').getAttribute('aria-current')).toBe('true');

    fireEvent.keyDown(screen.getByTestId('carrusel'), { key: 'ArrowLeft' });
    expect(miniatura('original').getAttribute('aria-current')).toBe('true');

    fireEvent.keyDown(screen.getByTestId('carrusel'), { key: 'ArrowRight' });
    expect(miniatura('apa7').getAttribute('aria-current')).toBe('true');
  });

  it('la flecha izquierda en la primera no se sale del rango', () => {
    // Un carrusel que al llegar al primero te tira al último no es un carrusel,
    // es un portal. Y uno que al llegar al último no hace nada deja al usuario
    // preguntándose si se rompió.
    montarCarrusel();
    fireEvent.keyDown(screen.getByTestId('carrusel'), { key: 'ArrowLeft' });
    expect(miniatura('original').getAttribute('aria-current')).toBe('true');
  });

  it('la hoja de datos aparece al elegir un diseno, con solo los datos', () => {
    // Sin estilos: los estilos viven en el carrusel. Repetirlos en el formulario
    // superior es exactamente el panel duplicado que el spec saca.
    montarCarrusel();
    expect(screen.queryByTestId(HOJA_DE_DATOS_TESTID)).toBeNull();

    fireEvent.click(miniatura('apa7'));

    const hoja = screen.getByTestId(HOJA_DE_DATOS_TESTID);
    expect(hoja.textContent).toContain('Br. Ana Pérez');
    // Y NO contiene los nombres de los estilos.
    for (const estilo of ['APA 7 Estándar', 'Institucional UNI', 'Profesional APA']) {
      expect(hoja.textContent).not.toContain(estilo);
    }
  });

  it('con prefers-reduced-motion no hay transformacion, y el carrusel sigue navegable', () => {
    const original = window.matchMedia;
    window.matchMedia = (() => ({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      media: '',
      onchange: null,
      dispatchEvent: vi.fn(),
    })) as never;
    try {
      montarCarrusel();
      for (const t of todasLasTarjetas()) {
        expect(t.style.transform).toBe('');
        expect(t.style.transition).toBe('');
      }
      // Sin transform tambien en la fila: no hay corrimiento animado.
      expect(fila().style.transform).toBe('');
      // Sin transform no hay carrusel, asi que tiene que quedar navegable de
      // otra manera: el strip con scroll y los mismos controles.
      // La pista, no el grupo: el `overflow` que se abre es el del STRIP.
      expect(screen.getByTestId('cover-model-track').style.overflowX).toBe('auto');
      fireEvent.click(screen.getByLabelText(/siguiente dise/));
      expect(miniatura('apa7').getAttribute('aria-current')).toBe('true');
    } finally {
      window.matchMedia = original;
    }
  });

  it('el logo que se pide es el de la institucion elegida, no el de UNI siempre', () => {
    montarCarrusel();
    const catalogo = CATALOGO_DE_UNIVERSIDADES.find((u) => u.codigo === 'UNAN')!;
    const imagenes = within(tarjeta('uni')).queryAllByRole('img');
    expect(imagenes.some((i) => i.getAttribute('src')?.includes(catalogo.logoUrl!))).toBe(true);
  });

  it('separa estudiantes y docente por DATO, no por el prefijo del nombre', () => {
    /* La heurística anterior (`/^(ing\.|dr\.|...)/`) clasificaba por el texto del
       nombre: un estudiante que se escribió "Ing. Ana Pérez" se volvía tutor y un
       docente sin título se volvía estudiante. Eso hacía que la preview mostrara
       u ocultara al tutor distinto de lo que escribe `portada_uni.py`. */
    const autores = [
      { nombre: 'Ing. Ana Pérez', carnet: '1' },
      { nombre: 'Br. Luis López', carnet: '2' },
      { nombre: 'Carlos Docente', carnet: '' },
    ];

    // Sin docente declarado: nadie es tutor, aunque un estudiante lleve "Ing.".
    const sinDocente = clasificarAutoresDePortada(autores, []);
    expect(sinDocente.estudiantes).toHaveLength(3);
    expect(sinDocente.tutor).toBe('');

    // El docente declarado se separa por dato y no se duplica como estudiante.
    const conDocente = clasificarAutoresDePortada(autores, ['Carlos Docente']);
    expect(conDocente.tutor).toBe('Carlos Docente');
    expect(conDocente.estudiantes.map((e) => e.nombre)).toEqual([
      'Ing. Ana Pérez',
      'Br. Luis López',
    ]);
  });
});

describe('volver a la portada desde otra etapa', () => {
  beforeEach(() => {
    useDocStore.setState({
      portada: { ...defaultPortada },
      acta: { ...defaultActa },
      wizardStep: 1,
      wizardStepAnterior: 1,
    } as never);
  });

  it('al salir a otra etapa y volver, se vuelve a la portada', () => {
    /* El bug que reporto el usuario: se va a otra etapa y no vuelve a la
       portada. `wizardStep` no tenia memoria de "de donde vine", asi que al
       volver aparecia en la etapa en la que estabas.

       `wizardStepAnterior` no existia; se agrego. `volverAPortada()` es la
       pregunta con respuesta, y con `viewMode: 'edit'` porque un destino del
       rail es una fase del editor (AGENTS.md). */
    useDocStore.getState().setWizardStep(3);
    expect(useDocStore.getState().wizardStep).toBe(3);
    expect(useDocStore.getState().wizardStepAnterior).toBe(3);

    useDocStore.getState().volverAPortada();
    expect(useDocStore.getState().wizardStep).toBe(1);
    expect(useDocStore.getState().viewMode).toBe('edit');
  });

  it('la hoja de datos se cierra sola al cambiar de fase', () => {
    /* Una hoja de datos de la portada abierta sobre la etapa de Revision es una
       hoja de datos de otra cosa. */
    const { unmount } = montarCarrusel();
    fireEvent.click(miniatura('apa7'));
    expect(screen.queryByTestId(HOJA_DE_DATOS_TESTID)).toBeTruthy();
    unmount();

    const { rerender } = render(<HojaDatosPortada pasoActual={3} pasoDePortada={1} />);
    expect(screen.queryByTestId(HOJA_DE_DATOS_TESTID)).toBeNull();
    rerender(<HojaDatosPortada pasoActual={1} pasoDePortada={1} />);
  });
});
