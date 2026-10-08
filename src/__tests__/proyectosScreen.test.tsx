import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ProyectosScreen } from '../components/project/ProyectosScreen';
import { useDocStore } from '../store/useDocStore';

describe('ProyectosScreen', () => {
  beforeEach(() => {
    useDocStore.setState({
      proyectos: [],
      raizConfigurada: null,
    } as any);
  });

  it('sin proyectos muestra diálogo de configuración de carpeta', () => {
    useDocStore.setState({ proyectos: [] } as any);
    render(<ProyectosScreen />);
    expect(screen.getByText(/organizar mis documentos/i)).toBeInTheDocument();
  });

  it('con proyectos muestra lista', () => {
    useDocStore.setState({
      proyectos: [
        {
          id: 'p1',
          nombre: 'Tesis de Maestría',
          carpeta: '/tmp/proyecto1',
          versiones: [],
          creadoEn: Date.now(),
          cerrado: false,
        },
        {
          id: 'p2',
          nombre: 'Trabajo Final',
          carpeta: '/tmp/proyecto2',
          versiones: [],
          creadoEn: Date.now(),
          cerrado: false,
        },
      ],
      raizConfigurada: '/tmp/WordAPA7',
    } as any);
    render(<ProyectosScreen />);
    expect(screen.getAllByText('Tesis de Maestría').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Trabajo Final').length).toBeGreaterThan(0);
  });

  it('versión activa aparece en la posición más alta de la línea de tiempo', () => {
    useDocStore.setState({
      proyectos: [
        {
          id: 'p1',
          nombre: 'Tesis',
          carpeta: '/tmp/proyecto1',
          versiones: [
            { id: 'v1', filename: 'Tesis_v1.docx', rutaEnDisco: '', palabras: 100, fechaModificacion: Date.now() - 3000, autor: '', esActiva: false },
            { id: 'v2', filename: 'Tesis_v2.docx', rutaEnDisco: '', palabras: 200, fechaModificacion: Date.now() - 2000, autor: '', esActiva: true },
            { id: 'v3', filename: 'Tesis_v3.docx', rutaEnDisco: '', palabras: 300, fechaModificacion: Date.now() - 1000, autor: '', esActiva: false },
          ],
          creadoEn: Date.now(),
          cerrado: false,
        },
      ],
      raizConfigurada: '/tmp/WordAPA7',
    } as any);
    render(<ProyectosScreen />);
    const tarjetas = screen.getAllByRole('article');
    expect(tarjetas[0]).toHaveTextContent('ACTIVA');
  });

  it('versiones > 3 se colapsan', () => {
    useDocStore.setState({
      proyectos: [
        {
          id: 'p1',
          nombre: 'Tesis',
          carpeta: '/tmp/proyecto1',
          versiones: [
            { id: 'v1', filename: 'Tesis_v1.docx', rutaEnDisco: '', palabras: 100, fechaModificacion: Date.now() - 5000, autor: '', esActiva: false },
            { id: 'v2', filename: 'Tesis_v2.docx', rutaEnDisco: '', palabras: 200, fechaModificacion: Date.now() - 4000, autor: '', esActiva: false },
            { id: 'v3', filename: 'Tesis_v3.docx', rutaEnDisco: '', palabras: 300, fechaModificacion: Date.now() - 3000, autor: '', esActiva: false },
            { id: 'v4', filename: 'Tesis_v4.docx', rutaEnDisco: '', palabras: 400, fechaModificacion: Date.now() - 2000, autor: '', esActiva: false },
            { id: 'v5', filename: 'Tesis_v5.docx', rutaEnDisco: '', palabras: 500, fechaModificacion: Date.now() - 1000, autor: '', esActiva: true },
          ],
          creadoEn: Date.now(),
          cerrado: false,
        },
      ],
      raizConfigurada: '/tmp/WordAPA7',
    } as any);
    render(<ProyectosScreen />);
    expect(screen.getByText(/\+2 versiones anteriores/)).toBeInTheDocument();
  });

  it('el encabezado y los pasos de uso se ven aunque no haya nada', () => {
    // La pantalla vacía no explicaba PARA QUÉ existe: header condicional +
    // tarjeta + la nada. Ahora el encabezado es estable y una tira de tres
    // pasos dice el uso (cargar, revisar, exportar).
    useDocStore.setState({ proyectos: [], tabs: [], projectImages: [] } as any);
    render(<ProyectosScreen />);
    expect(screen.getByText(/organizar mis documentos/i)).toBeInTheDocument();
    expect(screen.getByText(/cargá tus documentos/i)).toBeInTheDocument();
    expect(screen.getByText(/revisá con la ia/i)).toBeInTheDocument();
    expect(screen.getByText(/exportá en apa 7/i)).toBeInTheDocument();
  });

  it('con proyectos cargados, el encabezado de la pantalla sigue visible', () => {
    useDocStore.setState({
      proyectos: [
        {
          id: 'p1',
          nombre: 'Tesis',
          carpeta: '/tmp/proyecto1',
          versiones: [],
          creadoEn: Date.now(),
          cerrado: false,
        },
      ],
      tabs: [],
      projectImages: [],
      raizConfigurada: '/tmp/WordAPA7',
    } as any);
    render(<ProyectosScreen />);
    expect(screen.getByText(/organizar mis documentos/i)).toBeInTheDocument();
  });

  it('el rail lleva a la pantalla de proyectos, no a un Explorador aparte', async () => {
    /* El defecto que este archivo cierra por el lado del dato: el rail tenía DOS
       destinos de proyecto. Ahora hay uno, y su ícono es el de la pantalla de
       gestión, no la carpeta del modal que ya no existe. Se lee el catálogo REAL
       (`components/shell/railItems.ts`), no el `lib/railItems.ts` legacy que ya
       no monta nadie. */
    const src = await import('../components/shell/railItems.ts?raw');
    expect(src.default).toMatch(/mis-proyectos/);
    expect(src.default).not.toMatch(/id: 'proyecto'/);
  });
});
