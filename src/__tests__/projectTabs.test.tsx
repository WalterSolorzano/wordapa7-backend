/**
 * WordAPA7 — el strip de pestañas y la barra de acciones son dos cosas.
 *
 * Con un solo documento el strip no sirve para nada (su único trabajo es
 * navegar entre proyectos) y su nombre ya vive en la topbar. Pero el botón de
 * desborde lleva a la pantalla de proyectos (`viewMode: 'proyectos'`, donde vive
 * el Explorador) y abre el cajón de imágenes (`ProjectImagesDrawer`), y no hay
 * ningún otro montaje de esos dos módulos en `src/`: un guard `tabs.length < 2`
 * antes del return los dejaba inalcanzables en el estado más común de la app.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useDocStore } from '../store/useDocStore';
import { ProjectTabs } from '../components/layout/ProjectTabs';

vi.mock('../components/project/ProjectImagesDrawer', () => ({
  ProjectImagesDrawer: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="images" /> : null),
}));
vi.mock('../components/project/MergeDocumentsModal', () => ({
  MergeDocumentsModal: ({ isOpen }: { isOpen: boolean }) => (isOpen ? <div data-testid="merge" /> : null),
}));

const tab = (n: number) => ({ session_id: `s${n}`, file_name: `Doc ${n}.docx`, elements: [] });
const conTabs = (n: number) => Array.from({ length: n }, (_, i) => tab(i + 1)) as never;

const abrirDesborde = () => fireEvent.click(screen.getByRole('button', { name: 'Más acciones del proyecto' }));

describe('ProjectTabs — el guard es del strip, no de la pantalla', () => {
  beforeEach(() => {
    /* `viewMode` se limpia: es estado de un store singleton y sobrevive entre
       tests. Sin este reset, un test que navega a 'proyectos' lo deja así para
       el siguiente — el mismo modo de fallo que hace que un guardián dependa
       del orden en que corre. */
    useDocStore.setState({
      tabs: conTabs(1), activeTabIndex: 0, isLoading: false, projectImages: [],
      viewMode: 'edit',
    } as never);
  });

  it('con un documento no hay lista de pestañas: su nombre ya vive en la topbar', () => {
    render(<ProjectTabs />);
    expect(screen.queryByText('Doc 1.docx')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir otra versión (.docx)' })).toBeNull();
  });

  it('con un documento, el boton de Carpeta lleva a la pantalla de proyectos', () => {
    /* `AGENTS.md` §5 nombra este módulo como principal: es el lugar desde donde
       se abre la carpeta de trabajo y se combinan retazos.

       LO QUE CAMBIO Y POR QUE: antes este botón abría el `ProjectFolderModal`,
       una ventana externa. Ahora el Explorador vive DENTRO de la pantalla de
       proyectos, así que el botón navega a esa pantalla (`viewMode`) con el
       MISMO destino que el rail. Dos caminos a una sola verdad, y no dos
       ventanas al mismo dato. */
    render(<ProjectTabs />);
    expect(useDocStore.getState().viewMode).toBe('edit');
    abrirDesborde();
    fireEvent.click(screen.getByTitle('Explorador de archivos y carpeta del proyecto'));
    expect(useDocStore.getState().viewMode).toBe('proyectos');
  });

  it('con un documento, el cajón de imágenes también', () => {
    render(<ProjectTabs />);
    abrirDesborde();
    fireEvent.click(screen.getByTitle('Abrir carpeta de imágenes del proyecto'));
    expect(screen.getByTestId('images')).toBeTruthy();
  });

  it('con un documento, "Combinar Retazos" no aparece: no hay con qué combinar', () => {
    render(<ProjectTabs />);
    abrirDesborde();
    expect(screen.queryByText('Combinar Retazos')).toBeNull();
  });

  it('con dos documentos vuelve el strip completo', () => {
    useDocStore.setState({ tabs: conTabs(2), activeTabIndex: 0 } as never);
    render(<ProjectTabs />);
    expect(screen.getByText('Doc 1.docx')).toBeTruthy();
    expect(screen.getByText('Doc 2.docx')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abrir otra versión (.docx)' })).toBeTruthy();
    abrirDesborde();
    expect(screen.getByText('Combinar Retazos')).toBeTruthy();
  });

  it('sin ningún documento, el botón de desborde tampoco se dibuja', () => {
    // Con cero pestañas no hay proyecto al que abrirle la carpeta: el botón
    // sería una promesa sin destino.
    useDocStore.setState({ tabs: [], activeTabIndex: 0 } as never);
    render(<ProjectTabs />);
    expect(screen.queryByRole('button', { name: 'Más acciones del proyecto' })).toBeNull();
  });
});
