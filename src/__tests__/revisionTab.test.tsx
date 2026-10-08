/**
 * La pestaña Revisión: los tres interruptores del motor y la calibración de la
 * rampa del mapa de IA.
 *
 * Lo que se prueba acá es lo que no se ve en una captura:
 *
 *  - QUE LOS INTERRUPTORES ESCRIBEN Y SEGUEN. Los tres van al store, no a un
 *    estado local: el primero y el segundo además se guardan en localStorage,
 *    y el tercero lo leen los DOS canales que subrayan una cita, que es la
 *    razón de que el interruptor viva en el store.
 *  - QUE LA MARCA DE CITA TIENE DUEÑO. `showCitationMarks` existía sin
 *    setter, con un comentario que pedía uno; esta prueba es la que dice que
 *    el control existe y que los dos canales lo siguen.
 *  - QUE LA CALIBRACIÓN SE DICE Y SE DESHACE. El aviso de que editar cambia el
 *    mapa está, la cuenta de cuántos escalones quedan vivos está calculada, y
 *    el botón de volver al automático deja el mosaico como estaba.
 */
import React, { act } from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook } from '@testing-library/react';
import { RevisionTab } from '../components/settings/tabs/RevisionTab';
import { useDocStore } from '../store/useDocStore';
import { useMarkSourceBase } from '../hooks/useMarkSource';
import { CORTES_AUTOMATICOS } from '../lib/aiMosaic';

const PonerEstado = (estado: Record<string, unknown>) =>
  act(() => {
    useDocStore.setState({
      sugerenciasProactivas: true,
      marcasVisibles: true,
      showCitationMarks: true,
      iaCortes: null,
      dismissedCommentIds: [],
      aiProviderConfig: { nimUrl: '', useLocal: false, providerId: '' },
      ...estado,
    } as never);
  });

const interruptor = (id: string) => screen.getByTestId(id) as HTMLInputElement;

beforeEach(() => {
  localStorage.clear();
  PonerEstado({});
});

describe('Revisión — los interruptores del motor', () => {
  it('los tres están, y dicen qué pasa cuando se apagan', () => {
    render(<RevisionTab />);
    for (const titulo of ['Sugerencias proactivas', 'Marcas de cambio', 'Subrayado de citas']) {
      expect(screen.getByText(titulo)).toBeTruthy();
    }
    /* El texto prometía "resaltado en la vista previa" en el menú viejo, y la
       vista previa no era donde se veían: el control tiene que decir el
       lugar, o no dice nada. */
    expect(screen.getByText(/etiqueta al lado de cada párrafo modificado/)).toBeTruthy();
    expect(screen.getByText(/no se lanzan las auditorías proactivas/)).toBeTruthy();
  });

  it('los tres arrancan como la app los tiene por defecto', () => {
    render(<RevisionTab />);
    expect(interruptor('interruptor-proactivas').checked).toBe(true);
    expect(interruptor('interruptor-marcas').checked).toBe(true);
    expect(interruptor('interruptor-citas').checked).toBe(true);
  });

  it('apagar sugerencias proactivas escribe en el store Y en el equipo', async () => {
    render(<RevisionTab />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Sugerencias proactivas/));
    });
    expect(useDocStore.getState().sugerenciasProactivas).toBe(false);
    expect(localStorage.getItem('wordapa7_proactivas')).toBe('false');
  });

  it('apagar las marcas de cambio también se guarda', async () => {
    render(<RevisionTab />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Marcas de cambio/));
    });
    expect(useDocStore.getState().marcasVisibles).toBe(false);
    expect(localStorage.getItem('wordapa7_marcas')).toBe('false');
  });

  it('LAS MARCAS DE CITA: el control que el comentario pedía', async () => {
    /* `uiSlice` decía, literalmente, "sin setter a propósito: hoy no hay ningún
       control que lo apague... cuando exista el control, escribe acá". Este es
       el control, y la prueba mira lo que viene detrás: el interruptor es de
       a poco útil si los canales que leen la bandera no la siguen. */
    render(<RevisionTab />);
    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Subrayado de citas/));
    });
    expect(useDocStore.getState().showCitationMarks).toBe(false);
    /* `useMarkSourceBase` es lo que lee la bandera para el lienzo y para la
       tarjeta de lectura: los dos canales salen de acá. Es un hook, así que se
       lee con `renderHook` y no llamándolo suelto. */
    const fuente = renderHook(() => useMarkSourceBase());
    expect(fuente.result.current.showCitations).toBe(false);

    await act(async () => {
      fireEvent.click(screen.getByLabelText(/Subrayado de citas/));
    });
    expect(useDocStore.getState().showCitationMarks).toBe(true);
    expect(fuente.result.current.showCitations).toBe(true);
  });
});

describe('Revisión — la calibración de la rampa', () => {
  const corte = (nivel: 2 | 3 | 4) => screen.getByTestId(`corte-nivel-${nivel}`) as HTMLInputElement;

  it('arranca en los valores por defecto, y el botón de volver está apagado', () => {
    render(<RevisionTab />);
    expect(corte(2).value).toBe('30');
    expect(corte(3).value).toBe('60');
    expect(corte(4).value).toBe('90');
    /* Nada escrito = automático = nada que deshacer. Un botón que se puede
       apretar sin que haga nada es un control mudo, y estos son la clase de
       control que el plan vino a matar. */
    expect((screen.getByTestId('boton-cortes-automaticos') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/P30, P60 y P90 de cada documento/)).toBeTruthy();
  });

  it('el aviso de que editar cambia el mapa está, siempre', () => {
    render(<RevisionTab />);
    expect(screen.getByTestId('aviso-cortes').textContent).toMatch(/cambia cómo se ve el mapa de calor/);
  });

  it('escribir un corte lo guarda y enciende el botón de volver', async () => {
    render(<RevisionTab />);
    await act(async () => {
      fireEvent.change(corte(2), { target: { value: '10' } });
    });
    expect(useDocStore.getState().iaCortes).toEqual([0.1, 0.6, 0.9]);
    expect((screen.getByTestId('boton-cortes-automaticos') as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(/Ahora la rampa usa los cortes escritos/)).toBeTruthy();
  });

  it('CON LOS TRES CORTES EN 95 DICE CUÁNTOS ESCALONES QUEDAN, y no lo afirma a ciegas', async () => {
    /* El caso que el plan nombra: si los cortes colapsan, el mapa deja de usar
       la rampa entera. El número sale de `nivelesAlcanzables`, que es la misma
       cuenta que hace el mapa — si el texto dijera "un solo nivel" y el mapa
       mostrara dos, la pantalla estaría mintiendo. */
    render(<RevisionTab />);
    await act(async () => {
      fireEvent.change(corte(2), { target: { value: '95' } });
    });
    await act(async () => {
      fireEvent.change(corte(3), { target: { value: '95' } });
    });
    await act(async () => {
      fireEvent.change(corte(4), { target: { value: '95' } });
    });
    expect(useDocStore.getState().iaCortes).toEqual([0.95, 0.95, 0.95]);
    const aviso = screen.getByTestId('cortes-sin-escalon');
    expect(aviso.textContent).toMatch(/2 de los 4 escalones/);
    expect(aviso.textContent).toMatch(/el nivel 2 y el nivel 3 no tienen/);
  });

  it('con los cuatro escalones vivos, el aviso de escalones muertos no aparece', async () => {
    render(<RevisionTab />);
    expect(screen.queryByTestId('cortes-sin-escalon')).toBeNull();
    await act(async () => {
      fireEvent.change(corte(2), { target: { value: '10' } });
    });
    await act(async () => {
      fireEvent.change(corte(3), { target: { value: '20' } });
    });
    await act(async () => {
      fireEvent.change(corte(4), { target: { value: '95' } });
    });
    expect(screen.queryByTestId('cortes-sin-escalon')).toBeNull();
  });

  it('un triple desordenado NO se aplica, y se dice que no se aplicó', async () => {
    /* Si el nivel 2 fuera mayor que el nivel 3, la banda del 2 se quedaría sin
       ningún valor y la rampa mentiría. La pantalla no lo corrige en
       silencio: avisa que lo escrito todavía no llegó al mosaico. */
    render(<RevisionTab />);
    await act(async () => {
      fireEvent.change(corte(2), { target: { value: '90' } });
    });
    expect(screen.getByTestId('cortes-desordenados')).toBeTruthy();
    /* Lo que se ve sigue siendo lo de antes, y el mosaico también. */
    expect(useDocStore.getState().iaCortes).toBeNull();
    expect(screen.getByText(/el mapa sigue con los cortes que había/)).toBeTruthy();

    /* Y apenas se ordena, se aplica y el aviso desaparece. */
    await act(async () => {
      fireEvent.change(corte(3), { target: { value: '95' } });
    });
    await act(async () => {
      fireEvent.change(corte(4), { target: { value: '98' } });
    });
    expect(screen.queryByTestId('cortes-desordenados')).toBeNull();
    expect(useDocStore.getState().iaCortes).toEqual([0.9, 0.95, 0.98]);
  });

  it('VOLVER AL AUTOMÁTICO deshace lo escrito, en el store y en los campos', async () => {
    render(<RevisionTab />);
    await act(async () => {
      fireEvent.change(corte(2), { target: { value: '95' } });
    });
    await act(async () => {
      fireEvent.change(corte(3), { target: { value: '95' } });
    });
    await act(async () => {
      fireEvent.change(corte(4), { target: { value: '95' } });
    });
    expect(screen.getByTestId('cortes-sin-escalon')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByTestId('boton-cortes-automaticos'));
    });
    expect(useDocStore.getState().iaCortes).toBeNull();
    expect(corte(2).value).toBe('30');
    expect(corte(3).value).toBe('60');
    expect(corte(4).value).toBe('90');
    expect(screen.queryByTestId('cortes-sin-escalon')).toBeNull();
    expect((screen.getByTestId('boton-cortes-automaticos') as HTMLButtonElement).disabled).toBe(true);
  });

  it('una calibracion escrita desde afuera la siguen los campos', async () => {
    /* El `useEffect` que resincroniza: si el store cambia por fuera, un campo
       que muestra otra cosa es un campo que miente. */
    render(<RevisionTab />);
    await act(async () => {
      useDocStore.getState().setIaCortes([0.2, 0.4, 0.8]);
    });
    expect(corte(2).value).toBe('20');
    expect(corte(3).value).toBe('40');
    expect(corte(4).value).toBe('80');
    /* Y el botón de deshacer se enciende solo, sin que nadie lo pida. */
    expect((screen.getByTestId('boton-cortes-automaticos') as HTMLButtonElement).disabled).toBe(false);
    /* Los que no se tocan siguen siendo los de siempre: el token del color no
       se edita, y el corte de referencia tampoco se inventa. */
    expect(CORTES_AUTOMATICOS).toEqual([0.3, 0.6, 0.9]);
  });
});

describe('Revisión — la pestaña no está muda', () => {
  it('sin ninguna clave lo DICE, y la cara preocupada viene del estado', () => {
    render(<RevisionTab />);
    expect(screen.getByTestId('revision-estado').textContent).toMatch(/Sin claves de proveedor/);
    expect(document.querySelector('.editorial-mascot-expression-worried')).not.toBeNull();
  });

  it('con una clave puesta, deja de decir que no hay motor', () => {
    localStorage.setItem('wordapa7-provider-key:NVIDIA_API_KEY', 'clave-nvidia');
    render(<RevisionTab />);
    expect(screen.getByTestId('revision-estado').textContent).toMatch(/1 clave puesta/);
    expect(document.querySelector('.editorial-mascot-expression-worried')).toBeNull();
  });

  it('con el servidor local no hace falta ninguna clave para no estar preocupado', () => {
    /* `llm_classifier._get_active_providers` arma el proveedor local con
       `local-no-key`: la worried por "0 claves" sería mentira con el servidor
       local activado. */
    PonerEstado({ aiProviderConfig: { nimUrl: 'http://localhost:8000', useLocal: true, providerId: '' } });
    render(<RevisionTab />);
    expect(screen.getByTestId('revision-estado').textContent).toMatch(/servidor local/);
    expect(document.querySelector('.editorial-mascot-expression-worried')).toBeNull();
  });
});
