import React, { act } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { Step0QuickStart } from '../components/wizard/Step0QuickStart';

vi.mock('../api/backend', () => ({
  listSessions: vi.fn().mockResolvedValue([]),
  listProfiles: vi.fn().mockResolvedValue([]),
  downloadTemplate: vi.fn(),
  downloadTemplateAsync: vi.fn(),
  applyTemplate: vi.fn().mockResolvedValue({ status: 'ok' }),
  getSideloadStatus: vi.fn().mockResolvedValue({ installed: true, up_to_date: true, path: '', installed_at: null }),
  repairSideload: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

describe('Step0QuickStart cleanup', () => {
  it('no longer shows "Home / Quick Start" or "Estado del flujo"', async () => {
    useDocStore.setState({ isBackendReady: true, error: null });
    await act(async () => {
      render(<Step0QuickStart />);
    });
    expect(screen.queryByText('Home / Quick Start')).toBeNull();
    expect(screen.queryByText(/Estado del flujo/i)).toBeNull();
    expect(screen.queryByText(/sesiones recientes disponibles/i)).toBeNull();
  });

  it('no repite la configuración de formato: la edición vive en Ajustes', async () => {
    /* Inicio tenía "Configuración de Formato APA Activo": un segundo selector de
       perfil (además del de la barra) y el tipo de portada. Es el mismo dato en
       dos pantallas, y el perfil ya está en Ajustes → Documento mientras la
       portada está en Ajustes → Formato. Se va el bloque y se queda el atajo. */
    useDocStore.setState({ isBackendReady: true, error: null });
    await act(async () => {
      render(<Step0QuickStart />);
    });
    expect(screen.queryByText('Configuración de Formato APA Activo')).toBeNull();
    expect(screen.queryByText('Tipo de Portada por Defecto')).toBeNull();
    // El atajo de perfil del primer paso sí se queda: es cómo se elige antes de subir.
    expect(document.querySelector('#apa-profile-select')).not.toBeNull();
  });

  it('no longer has the redundant "Ajustes y vista previa" button (settings live in the rail)', async () => {
    useDocStore.setState({ isBackendReady: true, error: null });
    await act(async () => {
      render(<Step0QuickStart />);
    });
    // The "Ajustes y vista previa" button was removed from the top bar.
    // Settings are now accessed exclusively via the rail's "Ajustes" button,
    // which replaced the old 64px sidebar's "Configuraciones" button.
    expect(screen.queryByRole('button', { name: /Ajustes y vista previa/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Ajustes' })).toBeTruthy();
  });
});
