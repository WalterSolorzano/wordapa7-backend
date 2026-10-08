import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ProyectoNotificacion } from '../components/project/ProyectoNotificacion';
import { useDocStore } from '../store/useDocStore';

describe('ProyectoNotificacion', () => {
  beforeEach(() => {
    // Reset store
    useDocStore.setState({
      notificacionProyecto: null,
      proyectos: [],
    } as any);
  });

  it('no aparece si notificacionProyecto es null', () => {
    useDocStore.setState({ notificacionProyecto: null } as any);
    render(<ProyectoNotificacion />);
    expect(screen.queryByText(/creamos un proyecto/i)).toBeNull();
  });

  it('modo nuevo muestra texto de crear proyecto', () => {
    useDocStore.setState({
      notificacionProyecto: {
        visible: true,
        filename: 'Tesis.docx',
        versionesDetectadas: [],
        modo: 'nuevo',
      },
    } as any);
    render(<ProyectoNotificacion />);
    expect(screen.getByText(/creamos un proyecto/i)).toBeInTheDocument();
  });

  it('modo nueva-version muestra nombre del proyecto existente', () => {
    useDocStore.setState({
      proyectos: [
        {
          id: 'p1',
          nombre: 'Tesis de Maestría',
          carpeta: '/tmp/proyecto',
          versiones: [],
          creadoEn: Date.now(),
          cerrado: false,
        },
      ],
      notificacionProyecto: {
        visible: true,
        filename: 'Tesis_final.docx',
        versionesDetectadas: ['Tesis.docx'],
        modo: 'nueva-version',
        proyectoExistenteId: 'p1',
      },
    } as any);
    render(<ProyectoNotificacion />);
    expect(screen.getByText(/versión de/i)).toBeInTheDocument();
  });

  it('X llama ocultarNotificacionProyecto', () => {
    useDocStore.setState({
      notificacionProyecto: {
        visible: true,
        filename: 'Tesis.docx',
        versionesDetectadas: [],
        modo: 'nuevo',
      },
    } as any);
    render(<ProyectoNotificacion />);
    const xButton = screen.getByRole('button', { name: /cerrar/i });
    fireEvent.click(xButton);
    expect((useDocStore.getState() as any).notificacionProyecto).toBeNull();
  });

  it('la card tiene position fixed y zIndex menor a 1000', async () => {
    const src = await import('../components/project/ProyectoNotificacion.tsx?raw');
    expect(src.default).not.toMatch(/zIndex.*[1-9]\d{3,}/);
    expect(src.default).toMatch(/position.*fixed/);
  });

  it('mascota tiene kind reference y expression curious', () => {
    useDocStore.setState({
      notificacionProyecto: {
        visible: true,
        filename: 'Tesis.docx',
        versionesDetectadas: [],
        modo: 'nuevo',
      },
    } as any);
    render(<ProyectoNotificacion />);
    expect(document.querySelector('.editorial-mascot-kind-reference')).not.toBeNull();
    expect(document.querySelector('.editorial-mascot-expression-curious')).not.toBeNull();
  });
});
