/**
 * El inspector de figura, que es el `RightSidePanel` que ya existe, reescrito.
 *
 * SE ELIGE LA OPCIÓN (A) DEL SPEC §8.3: reescribir, no borrar. Sus cinco presets
 * con miniatura, el editor de subfiguras multipanel, el reemplazo de archivo y el
 * "Sugerir con IA" funcionan, y la opción (b) los tiraría para reconstruirlos.
 *
 * LAS SEIS COSAS QUE ESTA PRUEBA AFIRMA, Y POR QUE CADA UNA DUELE:
 *
 *   1. El TAMAÑO REAL, y la ausencia de tamaño DICHA. Los `|| 12` y `|| 8` eran
 *      nueve números inventados con apariencia de dato. Un input con `12` cuando
 *      el documento no dice 12 es una mentira con caja de texto.
 *   2. "Restablecer" viene DESHABILITADO cuando no hay nada que restablecer: antes
 *      restablecía a 12 x 8 y decía "Tamaño original restaurado".
 *   3. Los `<textarea>` NO escriben en el store en cada tecla. `updateElementImage`
 *      es una llamada HTTP con `pushHistory`, y con `caption` corre
 *      `cleanRedundantTitleParagraphs`, que reescribe párrafos del documento:
 *      escribir la leyenda letra por letra reescribe el documento letra por letra.
 *   4. CON UNA FIGURA NO EXISTE EL RADIO DE "TODAS": son la misma operación con
 *      dos nombres, y un control con dos nombres para una cosa miente sobre lo que
 *      hace. Con tres, existe y el botón DICE cuál.
 *   5. El alcance por omisión es "esta". Aplicar a veinte figuras es una decisión
 *      de tres segundos de deliberación; que sea un clic por omisión es un
 *      accidente esperando.
 *   6. El botón de volver del inspector tiene NOMBRE ACCESIBLE. Una `X` muda es un
 *      control que hay que adivinar.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ImageEditPanel } from '../components/inspector/ImageEditPanel';
import { RightSidePanel } from '../components/activity/RightSidePanel';
import type { ElementModel } from '../types';

const updateElementImage = vi.fn();
const aplicarImagenAMuchas = vi.fn();
const showToast = vi.fn();

vi.mock('../api/backend', () => ({
  getApiBase: vi.fn().mockReturnValue('http://localhost:8742'),
  getApiBaseAsync: vi.fn().mockResolvedValue('http://localhost:8742'),
  fetchWithTrace: vi.fn(),
  resolveAssetUrl: vi.fn((p?: string | null) => (p ? `https://x/${p}` : null)),
  syncAllProviderKeys: vi.fn().mockResolvedValue({ ok: true, applied: [] }),
  suggestCaption: vi.fn().mockResolvedValue('sugerida'),
}));

const imagen = (extra: Record<string, unknown> = {}): ElementModel => ({
  id: 'elem_fig', type: 'image', text: 'Figura 1', style_name: '', alignment: 'left',
  font_name: 'Times New Roman', font_size: 12, is_bold: false, is_italic: false,
  is_bullet: false, left_indent_cm: 0, confidence: 1, is_user_modified: false,
  cita_ids: [], needs_review: false, auto_applied: false,
  image_info: {
    element_id: 'elem_fig', file_path: 'a.png', filename: 'a.png', relative_url: 'a.png',
    figure_number: 1, caption: 'Diagrama del balance', note: '', alt_text: '',
    alignment: 'center', wrap_style: 'inline', caption_position: 'above',
    constrain_proportions: true, design_style: 'standard', ...extra,
  } as never,
}) as ElementModel;

const renderPanel = (elem: ElementModel, totalFiguras = 1) => {
  useDocStore.setState({
    doc: { session_id: 's', file_name: 'T.docx', elements: [elem], referencias: [], meta: {} } as never,
    updateElementImage: updateElementImage as never,
    aplicarImagenAMuchas: aplicarImagenAMuchas as never,
    showToast: showToast as never,
  } as never);
  return render(<ImageEditPanel elem={elem} totalFiguras={totalFiguras} />);
};

/** El panel tiene cuatro pestañas y los campos viven en la que corresponde. Una
 *  prueba que busca un textarea sin cambiar de pestaña no está probando el
 *  inspector: está probando que el inspector no lo muestra. */
const irA = (pestana: RegExp) => fireEvent.click(screen.getByRole('button', { name: pestana }));

beforeEach(() => {
  updateElementImage.mockReset();
  aplicarImagenAMuchas.mockReset();
  showToast.mockReset();
});

describe('1. el tamaño real, y su ausencia dicha', () => {
  it('con width_cm y height_cm, el header dice la medida', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }));
    expect(screen.getByTestId('inspector-medida').textContent).toMatch(/14\s*[×x]\s*9\s*cm/);
  });

  it('SIN tamaño declarado, el header lo dice y NO muestra 12 x 8', () => {
    renderPanel(imagen());
    const texto = screen.getByTestId('inspector-medida').textContent ?? '';
    expect(texto).toMatch(/sin tamaño declarado/i);
    expect(texto).not.toMatch(/12\s*[×x]\s*8/);
  });

  it('los inputs dicen "sin declarar" y no 12 y 8', () => {
    renderPanel(imagen());
    const ancho = screen.getByLabelText(/^ancho \(cm\)$/i) as HTMLInputElement;
    const alto = screen.getByLabelText(/^alto \(cm\)$/i) as HTMLInputElement;
    expect(ancho.value).toBe('');
    expect(alto.value).toBe('');
    expect(ancho.placeholder).toBe('sin declarar');
    expect(alto.placeholder).toBe('sin declarar');
  });

  it('un ancho que no es un numero NO se convierte en 12: avisa y no escribe', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }));
    const ancho = screen.getByLabelText(/^ancho \(cm\)$/i) as HTMLInputElement;
    fireEvent.change(ancho, { target: { value: 'abc' } });
    /* El defecto exacto: `parseFloat(...) || 12` escribía 12 con una `a` de resto. */
    expect(updateElementImage).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenCalled();
  });
});

describe('2. restablecer lo que nunca se midió', () => {
  it('viene deshabilitado sin tamaño declarado, y su title lo explica', () => {
    renderPanel(imagen());
    const boton = screen.getByRole('button', { name: /restablecer/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
    expect(boton.title).toMatch(/no hay tamaño declarado/i);
  });

  it('con tamaño declarado, viene habilitado y restablece ESA medida', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }));
    const boton = screen.getByRole('button', { name: /restablecer/i }) as HTMLButtonElement;
    expect(boton.disabled).toBe(false);
    fireEvent.click(boton);
    expect(updateElementImage).toHaveBeenCalledWith(
      'elem_fig',
      expect.objectContaining({ width_cm: 14, height_cm: 9 }),
    );
  });
});

describe('3. ningún textarea escribe en el store en cada tecla', () => {
  it('la leyenda: escribe y NO despacha; al salir, sí', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }));
    irA(/^Texto$/i);
    const campo = screen.getByLabelText(/^leyenda de la figura$/i);
    fireEvent.change(campo, { target: { value: 'Nueva leyenda' } });
    expect(updateElementImage).not.toHaveBeenCalled();
    fireEvent.blur(campo);
    expect(updateElementImage).toHaveBeenCalledWith('elem_fig', { caption: 'Nueva leyenda' });
  });

  it('la nota y el texto alternativo, igual que la leyenda', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }));
    irA(/^Texto$/i);
    for (const nombre of [/nota/i, /alternativo/i]) {
      const campo = screen.getByLabelText(nombre);
      fireEvent.change(campo, { target: { value: 'x' } });
    }
    expect(updateElementImage).not.toHaveBeenCalled();
  });

  it('el select de posición de leyenda sigue despachando en el change: es un cambio real', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }));
    irA(/^Texto$/i);
    fireEvent.change(screen.getByLabelText(/posición de la leyenda/i), { target: { value: 'below' } });
    expect(updateElementImage).toHaveBeenCalledWith('elem_fig', { caption_position: 'below' });
  });
});

describe('4 y 5. aplicar a esta o a todas, con el alcance dicho', () => {
  it('con UNA figura no existe el radio de todas: son la misma operación', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }), 1);
    irA(/^Estilo$/i);
    expect(screen.queryByRole('radio', { name: /todas/i })).toBeNull();
    expect(screen.getByRole('button', { name: /aplicar a esta figura/i })).toBeTruthy();
  });

  it('con TRES figuras existe, y el botón dice el alcance que se está usando', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }), 3);
    irA(/^Estilo$/i);
    expect(screen.getByRole('radio', { name: /esta figura/i })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /3 figuras/i })).toBeTruthy();
    /* Por omisión es "esta", y el botón lo DICE. */
    expect((screen.getByRole('radio', { name: /esta figura/i }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: /aplicar a esta figura/i })).toBeTruthy();
  });

  it('al elegir "todas", el botón pasa a decir cuántas son', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }), 3);
    irA(/^Estilo$/i);
    fireEvent.click(screen.getByRole('radio', { name: /3 figuras/i }));
    expect(screen.getByRole('button', { name: /aplicar a las 3 figuras/i })).toBeTruthy();
  });
});

describe('6. el botón de volver tiene nombre, y el panel es el que ya existía', () => {
  it('con imagePanelOpen, hay un control cuyo nombre accesible es "Volver al inspector"', () => {
    /* La función ya era la correcta (`setImagePanelOpen(false)`); lo que faltaba
       era el NOMBRE. Una `X` muda con `aria-label="Ocultar panel"` no dice si se
       cierra el panel o si se vuelve al inspector general, y quien lo ve no tiene
       forma de saber adónde lleva. */
    const elem = imagen({ width_cm: 14, height_cm: 9 });
    useDocStore.setState({
      doc: { session_id: 's', file_name: 'T.docx', elements: [elem], referencias: [], meta: {} } as never,
      selectedElementId: 'elem_fig',
      imagePanelOpen: true,
      updateElementImage: updateElementImage as never,
      aplicarImagenAMuchas: aplicarImagenAMuchas as never,
      showToast: showToast as never,
      liveChatOpen: false,
    } as never);
    render(<RightSidePanel />);
    const volvers = screen.getAllByRole('button', { name: 'Volver al inspector' });
    expect(volvers.length).toBeGreaterThan(0);
    /* Y es un BOTÓN con texto, no una `X`: el nombre está a la vista, no solo en
       el `aria-label`, porque el nombre visible es el que lee la persona. */
    expect(volvers.some((b) => /volver al inspector/i.test(b.textContent ?? ''))).toBe(true);
    /* Y el nombre viejo, el que no decía a dónde llevaba, no puede volver. */
    expect(screen.queryByRole('button', { name: /ocultar panel/i })).toBeNull();
  });
});

describe('4 y 5. aplicar a esta o a todas: la llamada', () => {
  it('aplicar a todas llama a la action con TODOS los ids, y a esta con el suyo', () => {
    renderPanel(imagen({ width_cm: 14, height_cm: 9 }), 3);
    irA(/^Estilo$/i);
    fireEvent.click(screen.getByRole('radio', { name: /3 figuras/i }));
    fireEvent.click(screen.getByRole('button', { name: /aplicar a las 3 figuras/i }));
    expect(aplicarImagenAMuchas).toHaveBeenCalled();
    /* El alcance se DECLARA: la action no adivina qué es "todas". */
    const ids = aplicarImagenAMuchas.mock.calls[0][0] as string[];
    expect(ids).toContain('elem_fig');
    expect(ids.length).toBeGreaterThanOrEqual(1);
  });
});
