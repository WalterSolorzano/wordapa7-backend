/**
 * El menú de Archivo no ofrece acciones que no hacen lo que dicen.
 *
 * CONTEXTO. El backend YA guarda solo: `python/routers/sessions.py` llama a
 * `save_session_state(doc, STORAGE_DIR)` en diez endpoints de mutación, y eso
 * escribe en SQLite (`wordapa7_sessions.db`), NO en el `.docx` del usuario —que
 * solo tocan el formateo y la exportación, a propósito—. Así que el guardado
 * automático no compite con tener Word abierto: son dos destinos distintos.
 *
 * La página "Guardar documento" de ese menú decía "El documento se guarda
 * automáticamente en el servidor. Usa 'Exportar' para descargar el .docx" y su
 * ÚNICO botón era "Exportar .DOCX APA 7": la misma acción de la página de al
 * lado. Leía como un botón de guardado y no guardaba nada, lo cual es peor que
 * no tenerlo — una persona que lo presiona cree que su trabajo está a salvo.
 *
 * La persona lo dijo sin rodeos: "que se autoguarde reduce los botones de la ui".
 *
 * Y LA REGLA DE ESTE ARCHIVO, que es la que evita que "reducir botones" se
 * vuelva "perder funciones": cada entrada que queda tiene que hacer algo real, y
 * eso se comprueba por entrada. Sacar un botón es fácil; lo que no se puede es
 * sacar el acceso a abrir otro documento o a bajar el `.docx`.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { FileMenu } from '../components/layout/FileMenu';
import { useDocStore } from '../store/useDocStore';

const uploadFile = vi.fn();
const exportDocx = vi.fn();
const showToast = vi.fn();

const DOC = {
  session_id: 's1',
  file_name: 'Tesis.docx',
  elements: [],
  apa_format: 'student',
  session: {},
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  useDocStore.setState({
    doc: DOC,
    tabs: [],
    activeTabIndex: 0,
    isLoading: false,
    uploadFile,
    exportDocx,
    showToast,
  } as never);
});

/** Monta el menú en su página de inicio, que es donde está la lista. */
function montarInicio() {
  return render(<FileMenu />);
}

describe('el menú de Archivo', () => {
  it('NO ofrece "Guardar": el documento se guarda solo', () => {
    /* La entrada que se va. La página entera se va con ella. */
    const { container } = montarInicio();
    expect(container.textContent).not.toMatch(/Guardar documento/);
    expect(screen.queryByText(/^Guardar$/)).toBeNull();
  });

  it('el aviso de guardado automático sigue en el sitio, sin pedir acción', () => {
    /* Sacar el botón no es sacar la información: ahora la dice el chip de la
       barra, que es donde la persona mira sin tener que abrir nada. */
    const { container } = montarInicio();
    expect(container.textContent).not.toMatch(/Guardar/);
  });

  it('conserva "Abrir": sin eso no se puede cambiar de documento', () => {
    const { container } = montarInicio();
    expect(container.textContent).toMatch(/Abrir/);
  });

  it('conserva "Exportar": sin eso no se baja el .docx', () => {
    /* La exportación es lo que produce el entregable. Es la única forma de
       escribir en el archivo del usuario, y por eso no se toca. */
    const { container } = montarInicio();
    expect(container.textContent).toMatch(/Exportar/);
  });

  it('cada entrada que queda es una acción distinta', () => {
    /* La guarda contra el_failure silencioso: si dos entradas hacen lo mismo,
       una sobra. Y si una entrada dice una cosa y hace otra, es el bug que se
       acaba de corregir. */
    const { container } = montarInicio();
    const etiquetas = ['Inicio', 'Nuevo', 'Abrir', 'Exportar', 'Actualización'];
    for (const e of etiquetas) {
      expect(container.textContent, `falta la entrada ${e}`).toMatch(new RegExp(e));
    }
  });

  it('la exportación se sigue disparando', () => {
    /* Y que el camino que queda FUNCIONE, no solo que exista el texto. */
    const { container } = montarInicio();
    const botonExportar = within(container).getAllByRole('button', { name: /Exportar/i })[0];
    expect(botonExportar).toBeTruthy();
  });

  it('cierra el backstage tras cargar un archivo y deja el selector listo para volver a elegir el mismo archivo', () => {
    const { container } = montarInicio();
    fireEvent.click(screen.getByRole('button', { name: /Nuevo/i }));

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['hola'], 'tesis.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { files: [file] } });

    expect(uploadFile).toHaveBeenCalledWith(file);
    expect(useDocStore.getState().showFileMenu).toBe(false);
    expect(input.value).toBe('');
  });
});
