/**
 * Una institucion, y solo una.
 *
 * El fallo grave que reporto el usuario. El estado "seleccionado" de los chips de
 * institucion se derivaba con `String.includes` sobre TEXTO LIBRE:
 *
 *   const isSelected = institution.toLowerCase().includes(u.codigo.toLowerCase())
 *                   || institution.toLowerCase().includes(u.nombre.toLowerCase());
 *
 * Con dos instituciones escritas en el campo, los dos chips quedaban encendidos a
 * la vez, y ademas el valor guardado no era el de ninguno: era lo que el usuario
 * habia escrito. El estado no era de la UI, era del DATO, y un dato con dos
 * respuestas no es un dato.
 *
 * Ahora es estado controlado: un `institucionSeleccionada: string | null` en el
 * store, comparado por igualdad EXACTA contra el codigo del preset. Y hacer clic
 * en el ya elegido lo deselecciona, que es lo que hace un control de ese tipo y lo
 * que antes no habia forma de hacer.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((u: string) => u),
  triggerDownload: vi.fn(),
}));

import { useDocStore } from '../store/useDocStore';
import { defaultPortada, defaultActa } from '../store/slices/coverSlice';
import { CoverEditorPanel } from '../components/wizard/CoverEditorPanel';
import { useRosterStore } from '../store/useRosterStore';

const NOMBRES = {
  UNI: 'Universidad Nacional de Ingeniería',
  UNAN: 'Universidad Nacional Autónoma de Nicaragua (UNAN-Managua)',
};

/* Los chips de institucion. Se buscan por su `aria-label`, que es el nombre
   completo: el texto visible del chip es el código ("UNI", "UNAN") y con un
   `/UNI/` sobre el nombre accesible no se encontraría nada, porque
   "Universidad" no contiene "UNI" en mayúsculas. Un control de un solo valor
   necesita un nombre accesible de un solo valor. */
const chipUNI = () => screen.getByRole('button', { name: NOMBRES.UNI });
const chipUNAN = () => screen.getByRole('button', { name: NOMBRES.UNAN });

/** Cuantos chips estan encendidos. Esta es la cuenta del fallo. */
const chipsActivos = () =>
  [chipUNI(), chipUNAN()].filter((b) => b.getAttribute('aria-pressed') === 'true');

const estado = () => useDocStore.getState();
const campoDeInstitucion = () => screen.getByPlaceholderText('Universidad o institución');

const chipDeCarrera = (label: string) =>
  screen.getAllByRole('button').find((b) => (b.textContent || '').trim() === label)!;

/* El editor ahora agrupa todo en secciones plegables y arranca cerrado: para
   llegar a los chips hay que abrir "Institución y carrera" y, cuando el campo
   está vacío, pedir explícitamente el control con "Agregar institución /
   carrera". Esto NO cambia lo que el archivo prueba —que el estado de selección
   es de un solo valor—, solo el camino para llegar a él. */
const abrirInstitucionYCarrera = () => {
  fireEvent.click(screen.getByRole('button', { name: /Institución y carrera/i }));
  const agregarInstitucion = screen.queryByRole('button', { name: /Agregar institución/i });
  if (agregarInstitucion) fireEvent.click(agregarInstitucion);
  const agregarCarrera = screen.queryByRole('button', { name: /Agregar carrera/i });
  if (agregarCarrera) fireEvent.click(agregarCarrera);
};

const montarPanel = (institution = '') => {
  useDocStore.setState({
    portada: { ...defaultPortada, institution },
    acta: { ...defaultActa },
    doc: null,
    wizardStep: 1,
  } as never);
  useRosterStore.setState({ integrantes: [], profesores: [], grupos: [] } as never);
  const rendered = render(<CoverEditorPanel />);
  abrirInstitucionYCarrera();
  return rendered;
};

describe('seleccion de institucion', () => {
  beforeEach(() => {
    useDocStore.setState({ portada: { ...defaultPortada }, acta: { ...defaultActa } } as never);
  });

  it('elegir dos instituciones deja exactamente una activa', () => {
    // El fallo grave que reporto el usuario. Con `includes` sobre texto libre,
    // con las dos instituciones escritas en el campo los dos chips quedaban
    // encendidos a la vez.
    //
    // Con el estado controlado, escribir las dos a mano NO enciende ninguno: el
    // estado dice "nadie elegido" y el texto libre es texto libre. Y elegir una
    // por clic deja exactamente una.
    montarPanel(
      'Universidad Nacional de Ingeniería, Universidad Nacional Autónoma de Nicaragua (UNAN-Managua)',
    );
    expect(chipsActivos()).toHaveLength(0);

    fireEvent.click(chipUNAN());

    expect(estado().portada.institucionSeleccionada).toBe('UNAN');
    expect(chipsActivos()).toHaveLength(1);
    expect(chipsActivos()[0].textContent).toContain('UNAN');

    fireEvent.click(chipUNI());

    expect(estado().portada.institucionSeleccionada).toBe('UNI');
    expect(chipsActivos()).toHaveLength(1);
    expect(chipsActivos()[0].textContent).toContain('UNI');
  });

  it('el valor guardado es exactamente el nombre del ultimo, no una concatenacion', async () => {
    // El estado controlado: `institution` es un string, no un `includes`. Con
    // dos clics, el valor es el nombre de la institucion elegida, entero.
    montarPanel();
    fireEvent.click(chipUNI());
    expect(estado().portada.institucionSeleccionada).toBe('UNI');
    expect(estado().portada.institution).toBe(NOMBRES.UNI);

    fireEvent.click(chipUNAN());
    expect(estado().portada.institucionSeleccionada).toBe('UNAN');
    expect(estado().portada.institution).toBe(NOMBRES.UNAN);
    expect(chipsActivos()).toHaveLength(1);
  });

  it('elegir la ya elegida la deselecciona y devuelve el campo de texto libre', async () => {
    // Un control de un solo valor sin forma de quitar la eleccion esta a medio
    // hacer: el usuario eligio UNI, se arrepintio, y no habia salida.
    montarPanel();
    fireEvent.click(chipUNI());
    expect(estado().portada.institucionSeleccionada).toBe('UNI');

    fireEvent.click(chipUNI());
    expect(estado().portada.institucionSeleccionada).toBeNull();
    expect(estado().portada.institution).toBe('');
    expect(chipsActivos()).toHaveLength(0);
  });

  it('escribir en el campo a mano deselecciona el chip', async () => {
    // El campo de texto libre sigue siendo el campo de texto libre: si el
    // usuario escribe, lo escribio es lo que vale, y el chip que se apague
    // porque el estado ya no dice "UNI".
    montarPanel();
    fireEvent.click(chipUNI());
    fireEvent.change(campoDeInstitucion(), { target: { value: 'Mi Universidad' } });

    expect(estado().portada.institucionSeleccionada).toBeNull();
    expect(estado().portada.institution).toBe('Mi Universidad');
    expect(chipsActivos()).toHaveLength(0);
  });

  it('elegir una carrera no borra la institucion escrita a mano', async () => {
    // El defecto parejo: `CARRERAS_PRESETS.onClick` escribia `departamento`, y
    // como el nombre de la carrera no matcheaba con el de la institucion, elegir
    // una carrera dejaba la institucion en un estado que no era el que el
    // usuario habia escrito. Ademas el chip de la carrera se encendia por
    // `includes` sobre `departamento`, con el mismo problema.
    montarPanel('Mi Universidad written a mano');
    fireEvent.click(chipDeCarrera('Sistemas'));

    expect(estado().portada.institution).toBe('Mi Universidad written a mano');
    expect(estado().portada.departamento).toBe('Ingeniería en Sistemas');
    // Y la carrera elegida queda marcada como ella sola.
    const chipsDeCarrera = screen
      .getAllByRole('button')
      .filter((b) => ['Electrónica', 'Sistemas', 'Civil', 'Industrial', 'Química'].includes((b.textContent || '').trim()));
    expect(chipsDeCarrera.filter((b) => b.getAttribute('aria-pressed') === 'true')).toHaveLength(1);
  });

  it('los chips de carrera se deseleccionan tambien', async () => {
    montarPanel();
    const sistemas = chipDeCarrera('Sistemas');
    fireEvent.click(sistemas);
    expect(estado().portada.carreraSeleccionada).toBe('sistemas');
    fireEvent.click(sistemas);
    expect(estado().portada.carreraSeleccionada).toBeNull();
    expect(estado().portada.departamento).toBe('');
  });

  it('el logo de UNAN se pide por el nombre que el backend sirve', async () => {
    // El 404: el preset pedía `logo_anan.png` con doble `a` y lo que se sirve
    // es `logo_unan.png`. Elegías UNAN y no había logo. El `<img>` tiene que
    // apuntar al archivo que existe.
    montarPanel();
    const imagen = within(chipUNAN()).getByRole('img');
    expect(imagen.getAttribute('src')).toBe('/api/assets/logo_unan.png');
  });

  it('un logo que no carga se dice, en vez de desaparecer en silencio', async () => {
    // `onError` con `display: none` dejaba la portada sin logo y sin que nadie se
    // enterara. Un logo que se pidió y no llegó es un dato faltante.
    montarPanel();
    const imagen = within(chipUNI()).getByRole('img');
    // `fireEvent.error` y no `dispatchEvent`: el evento `error` no sube por el
    // arbol, asi que React (que lo escucha en la raiz) no lo ve con un
    // `dispatchEvent` pelado.
    fireEvent.error(imagen);

    expect(
      screen.getByText(/no se pudo cargar/i),
    ).toBeTruthy();
  });
});

describe('el formulario se agrupa en secciones plegables', () => {
  it('la entrega arranca cerrada y se abre con su disparador', () => {
    /* El editor tenía ocho campos sueltos en una columna, cada uno con su roster
       de chips debajo: un muro. La sección de entrega es la que menos se toca al
       elegir la portada, así que arranca cerrada y el resto del trabajo —título,
       integrantes, institución, carrera— queda a la vista. */
    montarPanel();
    const disparador = screen.getByRole('button', { name: /Docente y entrega/i });
    expect(disparador.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByPlaceholderText('Nombre de la asignatura')).toBeNull();

    fireEvent.click(disparador);
    expect(disparador.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByPlaceholderText('Nombre de la asignatura')).toBeTruthy();
  });

  it('la institución y la carrera arrancan cerradas y se abren con su disparador', () => {
    /* Antes arrancaban abiertas porque eran "el trabajo del paso". El usuario
       pidió que TODO arranque cerrado: el editor deja de ser un muro de campos y
       el que sabe qué falta lo abre. */
    useDocStore.setState({ portada: { ...defaultPortada }, acta: { ...defaultActa } } as never);
    render(<CoverEditorPanel />);
    const disparador = screen.getByRole('button', { name: /Institución y carrera/i });
    expect(disparador.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByPlaceholderText('Universidad o institución')).toBeNull();

    fireEvent.click(disparador);
    expect(disparador.getAttribute('aria-expanded')).toBe('true');
    // Y con el campo vacío, el control se pide: no se dibuja solo.
    expect(screen.getByRole('button', { name: /Agregar institución/i })).toBeTruthy();
  });
});
