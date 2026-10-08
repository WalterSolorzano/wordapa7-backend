import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { SnapshotHistory } from '../components/toolbar/SnapshotHistory';

describe('SnapshotHistory', () => {
  const cargar = vi.fn().mockResolvedValue(undefined);
  const restaurar = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    useDocStore.setState({
      doc: { session_id: 's1', elements: [], referencias: [] } as never,
      snapshots: [
        { id: 5, created_at: '2026-10-06 10:00:00', element_count: 12, file_name: 'T.docx' },
        { id: 4, created_at: '2026-10-06 09:00:00', element_count: 11, file_name: 'T.docx' },
      ],
      loadSnapshots: cargar,
      restoreSnapshot: restaurar,
    });
  });

  it('pide el historial al abrirse', () => {
    render(<SnapshotHistory />);
    expect(cargar).toHaveBeenCalled();
  });

  it('lista los snapshots y restaura el elegido', async () => {
    render(<SnapshotHistory />);
    expect(screen.getAllByRole('button', { name: /Restaurar/i })).toHaveLength(2);
    fireEvent.click(screen.getAllByRole('button', { name: /Restaurar/i })[0]);
    await waitFor(() => expect(restaurar).toHaveBeenCalledWith(5));
  });

  it('la barra abre y cierra el panel con su boton', async () => {
    /* El panel no vive solo en una prueba: la barra es la que lo muestra. Si
       el botón no existiera o no abriera nada, la función estaría sin cablear. */
    const { UnifiedToolbar } = await import('../components/toolbar/UnifiedToolbar');
    render(<UnifiedToolbar />);
    const boton = screen.getByRole('button', { name: 'Historial de versiones' });
    fireEvent.click(boton);
    await waitFor(() => expect(screen.getByTestId('panel-historial')).toBeTruthy());
    fireEvent.click(boton);
    expect(screen.queryByTestId('panel-historial')).toBeNull();
  });
});
