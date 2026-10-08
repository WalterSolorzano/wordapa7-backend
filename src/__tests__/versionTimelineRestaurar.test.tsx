import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { VersionTimeline } from '../components/project/VersionTimeline';

const versiones = [
  { id: 'v1', filename: 'tesis_v1.docx', palabras: 100, esActiva: true, fechaModificacion: 2 },
  { id: 'v2', filename: 'tesis_v2.docx', palabras: 120, esActiva: false, fechaModificacion: 1 },
] as never;

describe('VersionTimeline restaurar', () => {
  it('ofrece restaurar las versiones no activas', () => {
    const onRestaurar = vi.fn();
    render(<VersionTimeline versiones={versiones} onRestaurar={onRestaurar} />);
    const botones = screen.getAllByRole('button', { name: /Restaurar/i });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]);
    expect(onRestaurar).toHaveBeenCalledWith('v2');
  });
});

describe('ProyectosScreen cablea el restaurar con el backend', () => {
  const fetchFalso = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchFalso);
    useDocStore.setState({
      tabs: [],
      projectImages: [],
      proyectos: [
        {
          id: 'p1',
          nombre: 'Tesis',
          carpeta: '/tmp/proyecto1',
          versiones: [
            { id: 'v1', filename: 'Tesis_v1.docx', rutaEnDisco: '', palabras: 100, fechaModificacion: 2, autor: '', esActiva: true },
            { id: 'v2', filename: 'Tesis_v2.docx', rutaEnDisco: '', palabras: 200, fechaModificacion: 1, autor: '', esActiva: false },
          ],
          creadoEn: Date.now(),
          cerrado: false,
        },
      ],
      raizConfigurada: '/tmp/WordAPA7',
      showToast: vi.fn(),
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('al restaurar llama al endpoint y deja la version como activa', async () => {
    fetchFalso.mockResolvedValue({
      ok: true,
      json: async () => ({ archivo_destino: '/tmp/proyecto1/Tesis_v2.docx' }),
    });

    const { ProyectosScreen } = await import('../components/project/ProyectosScreen');
    render(<ProyectosScreen />);
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Restaurar/i })[0]);
    });

    expect(fetchFalso).toHaveBeenCalledWith(
      '/api/proyectos-archivo/restaurar-version',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ proyecto_id: 'p1', archivo: 'Tesis_v2.docx' }),
      }),
    );
    const versiones = useDocStore.getState().proyectos[0].versiones as never[];
    expect((versiones[1] as { esActiva?: boolean }).esActiva).toBe(true);
    expect((versiones[0] as { esActiva?: boolean }).esActiva).toBe(false);
  });

  it('si el backend no tiene la version, avisa y no marca nada como activa', async () => {
    fetchFalso.mockResolvedValue({ ok: false, json: async () => ({ detail: 'no está en la papelera' }) });

    const { ProyectosScreen } = await import('../components/project/ProyectosScreen');
    render(<ProyectosScreen />);
    await act(async () => {
      fireEvent.click(screen.getAllByRole('button', { name: /Restaurar/i })[0]);
    });

    const versiones = useDocStore.getState().proyectos[0].versiones as never[];
    expect((versiones[0] as { esActiva?: boolean }).esActiva).toBe(true);
    expect((versiones[1] as { esActiva?: boolean }).esActiva).toBe(false);
  });
});
