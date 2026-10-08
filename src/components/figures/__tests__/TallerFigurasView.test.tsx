import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, within, waitFor } from '@testing-library/react';
import { TallerFigurasView } from '../TallerFigurasView';
import { useDocStore } from '../../../store/useDocStore';
import type { DocumentModel } from '../../../types';

vi.mock('../../../api/backend', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../api/backend')>();
  return { ...actual, suggestCaption: vi.fn(), subirImagenDeProyecto: vi.fn() };
});

const mockDoc: DocumentModel = {
  id: 'doc-test',
  filename: 'tesis.docx',
  session_id: 'sess-123',
  total_pages: 10,
  elements: [
    {
      id: 'h1_1',
      type: 'heading',
      heading_level: 1,
      text: 'Capítulo 1: Introducción',
    },
    {
      id: 'p_1',
      type: 'paragraph',
      text: 'Este es el párrafo contextual anterior a la primera figura del estudio.',
    },
    {
      id: 'img_1',
      type: 'image',
      image_info: {
        url: 'blob:http://localhost/figura1.png',
        caption: 'Distribución de variables de rendimiento',
        note: 'Nota. Valores calculados a partir de la muestra piloto.',
        width_cm: 14.0,
        height_cm: 8.5,
        alignment: 'center',
        design_style: 'standard',
        rotation: 0,
      },
    },
    {
      id: 'p_2',
      type: 'paragraph',
      text: 'Párrafo posterior donde se discute la gráfica presentada anteriormente.',
    },
    {
      id: 'tbl_1',
      type: 'table',
      table_info: {
        caption: 'Resumen descriptivo',
        note: 'Nota. Muestra n=120.',
        rows: 2,
        cols: 2,
      },
    },
  ],
};

describe('TallerFigurasView', () => {
  beforeEach(() => {
    useDocStore.setState({
      doc: mockDoc,
      apiKey: 'test-key',
    });
  });

  it('orquesta el rail vertical, la galería, el lienzo editorial y el inspector de 4 pestañas', () => {
    render(<TallerFigurasView />);

    // Header principal
    expect(screen.getByText(/Taller de Activos Gráficos/i)).toBeInTheDocument();

    // 1. RailTipoActivos
    expect(screen.getByRole('complementary', { name: /Selector de tipos de activos/i })).toBeInTheDocument();
    expect(screen.getByTitle(/Figuras \(1\)/i)).toBeInTheDocument();
    expect(screen.getByTitle(/Tablas \(1\)/i)).toBeInTheDocument();

    // 2. GaleriaActivosColumna
    expect(screen.getByRole('complementary', { name: /Galería de activos/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Distribución de variables de rendimiento/i).length).toBeGreaterThanOrEqual(1);

    // 3. LienzoEditorialActivo
    expect(screen.getByTestId('editorial-reading-canvas')).toBeInTheDocument();
    expect(screen.getByText(/Este es el párrafo contextual anterior/i)).toBeInTheDocument();
    expect(screen.getByText(/Párrafo posterior donde se discute la gráfica/i)).toBeInTheDocument();

    // 4. InspectorActivoTabs
    expect(screen.getByRole('tab', { name: /Formato/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Texto/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Estilo/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Calidad/i })).toBeInTheDocument();
  });

  it('permite cambiar a la pestaña de tablas en el rail', () => {
    render(<TallerFigurasView />);

    const tablaBtn = screen.getByTitle(/Tablas \(1\)/i);
    fireEvent.click(tablaBtn);

    // En galería y/o lienzo debe verse la tabla
    expect(screen.getAllByText(/Resumen descriptivo/i).length).toBeGreaterThanOrEqual(1);
  });

  it('permite conmutar pestañas del inspector y modificar dimensiones', () => {
    render(<TallerFigurasView />);

    const tabTexto = screen.getByRole('tab', { name: /Texto/i });
    fireEvent.click(tabTexto);
    expect(screen.getByLabelText(/Título \/ Leyenda/i)).toBeInTheDocument();

    const tabEstilo = screen.getByRole('tab', { name: /Estilo/i });
    fireEvent.click(tabEstilo);
    expect(screen.getByText(/APA Estándar/i)).toBeInTheDocument();
  });

  it('mantiene la selección sobre el mismo activo cuando los índices del documento se corren', () => {
    const conDosImagenes: DocumentModel = {
      ...mockDoc,
      elements: [
        { id: 'h1_1', type: 'heading', heading_level: 1, text: 'Capítulo 1: Introducción' },
        { id: 'p_1', type: 'paragraph', text: 'Párrafo que se eliminará para correr los índices.' },
        {
          id: 'img_1',
          type: 'image',
          image_info: { url: 'a.png', caption: 'Leyenda de la primera figura', width_cm: 10, height_cm: 5, alignment: 'center' },
        },
        {
          id: 'img_2',
          type: 'image',
          image_info: { url: 'b.png', caption: 'Leyenda de la segunda figura', width_cm: 10, height_cm: 5, alignment: 'center' },
        },
      ],
    };
    useDocStore.setState({ doc: conDosImagenes, apiKey: 'test-key' });

    render(<TallerFigurasView />);

    // Seleccionar explícitamente la primera figura en la galería
    const galeria = screen.getByRole('complementary', { name: /Galería de activos/i });
    fireEvent.click(within(galeria).getByText('Leyenda de la primera figura'));

    const lienzoAntes = screen.getByTestId('editorial-reading-canvas');
    expect(within(lienzoAntes).getByText('Leyenda de la primera figura')).toBeInTheDocument();

    // Eliminar un elemento previo corre los índices de los activos
    act(() => {
      useDocStore.setState({
        doc: { ...conDosImagenes, elements: conDosImagenes.elements.filter((e) => e.id !== 'p_1') },
      });
    });

    // La selección NO debe saltar a la segunda figura
    const lienzoDespues = screen.getByTestId('editorial-reading-canvas');
    expect(within(lienzoDespues).getByText('Leyenda de la primera figura')).toBeInTheDocument();
    expect(within(lienzoDespues).queryByText('Leyenda de la segunda figura')).toBeNull();
  });

  it('enruta la edición de una tabla a updateElementTable sin marcarla como imagen', () => {
    const updateElementImage = vi.fn();
    const updateElementTable = vi.fn();
    useDocStore.setState({ doc: mockDoc, apiKey: 'test-key', updateElementImage, updateElementTable });

    render(<TallerFigurasView />);

    // Ir al activo tabla y editar su leyenda desde la pestaña Texto
    fireEvent.click(screen.getByTitle(/Tablas \(1\)/i));
    fireEvent.click(screen.getByRole('tab', { name: /Texto/i }));
    fireEvent.change(screen.getByLabelText(/Título \/ Leyenda/i), {
      target: { value: 'Nueva leyenda de tabla' },
    });

    expect(updateElementTable).toHaveBeenCalledWith(
      'tbl_1',
      expect.objectContaining({ caption: 'Nueva leyenda de tabla' })
    );
    expect(updateElementImage).not.toHaveBeenCalled();
  });

  it('muestra el estilo y oculta el formato exclusivo de imagen cuando el activo es una tabla', () => {
    render(<TallerFigurasView />);

    fireEvent.click(screen.getByTitle(/Tablas \(1\)/i));

    expect(screen.getByRole('tab', { name: /Estilo/i })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Formato/i })).toBeNull();
    expect(screen.getByRole('tab', { name: /Texto/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Calidad/i })).toBeInTheDocument();
  });

  const definirAnchoVentana = (ancho: number) => {
    Object.defineProperty(window, 'innerWidth', { value: ancho, configurable: true, writable: true });
    fireEvent(window, new Event('resize'));
  };

  it('etiqueta el modo de layout según el ancho disponible', () => {
    definirAnchoVentana(1400);
    render(<TallerFigurasView />);

    expect(screen.getByTestId('taller-figuras-view')).toHaveAttribute('data-modo', 'ancho');

    act(() => definirAnchoVentana(900));
    expect(screen.getByTestId('taller-figuras-view')).toHaveAttribute('data-modo', 'medio');

    act(() => definirAnchoVentana(600));
    expect(screen.getByTestId('taller-figuras-view')).toHaveAttribute('data-modo', 'angosto');
  });

  it('permite escalar la galería con el tirador y persiste el ancho', () => {
    localStorage.clear();
    definirAnchoVentana(1400);
    render(<TallerFigurasView />);

    const galeria = screen.getByRole('complementary', { name: /Galería de activos/i });
    const columnaGaleria = galeria.parentElement as HTMLElement;
    expect(columnaGaleria).toHaveStyle({ width: '320px' });

    const tirador = screen.getByRole('separator', { name: /Ajustar ancho de galería/i });
    fireEvent.mouseDown(tirador, { clientX: 300 });
    fireEvent.mouseMove(window, { clientX: 360 });
    fireEvent.mouseUp(window);

    expect(columnaGaleria).toHaveStyle({ width: '380px' });
    expect(localStorage.getItem('wordapa7-figuras-galeria-width')).toBe('380');
  });

  it('genera la leyenda a demanda y no al montar (cero tokens automaticos)', async () => {
    const { suggestCaption } = await import('../../../api/backend');
    const mockSuggest = suggestCaption as unknown as ReturnType<typeof vi.fn>;
    mockSuggest.mockClear();
    mockSuggest.mockResolvedValue('Leyenda regenerada');
    useDocStore.setState({
      doc: {
        ...mockDoc,
        elements: mockDoc.elements.map((e) =>
          e.id === 'img_1'
            ? { ...e, image_info: { ...e.image_info, caption: '' } }
            : e
        ),
      },
      apiKey: 'test-key',
    });
    definirAnchoVentana(1400);
    render(<TallerFigurasView />);

    // D-8: nada de IA al montar.
    expect(mockSuggest).not.toHaveBeenCalled();

    const generar = await screen.findByRole('button', { name: /generar leyenda con ia/i });
    fireEvent.click(generar);

    await waitFor(() =>
      expect(mockSuggest).toHaveBeenCalledWith(
        'sess-123',
        'img_1',
        expect.any(String),
        'test-key'
      )
    );
  });

  it('importa una subfigura al slot elegido de la malla multipanel', async () => {
    const backend = await import('../../../api/backend');
    const mockSubir = backend.subirImagenDeProyecto as unknown as ReturnType<typeof vi.fn>;
    mockSubir.mockResolvedValue({ assetId: 'asset-9', name: 'detalle.png' });
    const updateElementImage = vi.fn();
    useDocStore.setState({
      doc: {
        ...mockDoc,
        elements: mockDoc.elements.map((e) =>
          e.id === 'img_1'
            ? { ...e, image_info: { ...e.image_info, caption: '', design_style: 'corner' } }
            : e
        ),
      },
      apiKey: 'test-key',
      updateElementImage,
    });
    definirAnchoVentana(1400);
    render(<TallerFigurasView />);

    fireEvent.click(screen.getByRole('button', { name: 'Importar subfigura (b)' }));

    const input = screen.getByTestId('hidden-subfig-input') as HTMLInputElement;
    const archivo = new File(['x'], 'detalle.png', { type: 'image/png' });
    fireEvent.change(input, { target: { files: [archivo] } });

    await waitFor(() => expect(mockSubir).toHaveBeenCalledWith(archivo));
    await waitFor(() =>
      expect(updateElementImage).toHaveBeenCalledWith(
        'img_1',
        expect.objectContaining({
          subfigures: [
            expect.objectContaining({ label: '(b)', title: 'detalle.png' }),
          ],
        })
      )
    );
  });
});
