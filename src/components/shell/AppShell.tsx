/* WordAPA7 — shell: el marco de la aplicación.
   TopBar 48px → rail de 56px + workbench → StatusBar. El rail vive siempre,
   también en la vista de exportación: la navegación no desaparece al cambiar
   de fase, que es justo lo que hacía el rail por fases anterior con sus casos
   condicionales. */

import React, { useCallback } from 'react';
import { UnifiedToolbar } from '../toolbar/UnifiedToolbar';
import { ProjectTabs } from '../layout/ProjectTabs';
import { StatusBar } from '../layout/StatusBar';
import { IconRail } from './IconRail';
import { RailFlyout } from './RailFlyout';
import { MobileBottomNav } from './MobileBottomNav';
import { useRailDestinations } from '../../hooks/useRailDestinations';
import { useRailFlyout } from '../../hooks/useRailFlyout';
import { useIsMobile } from '../../hooks/useMediaQuery';
import { useDocStore } from '../../store/useDocStore';
import type { RailDestination } from './railItems';

export function AppShell({ children }: { children: React.ReactNode }) {
  const items = useRailDestinations();
  const setWizardStep = useDocStore((s) => s.setWizardStep);
  const viewMode = useDocStore((s) => s.viewMode);
  const setViewMode = useDocStore((s) => s.setViewMode);

  // La navegación del rail: un destino es una FASE del editor. Si el centro que
  // está a la vista no es el editor (túnel de export, vista nativa, split),
  // quedarse ahí repinta el acento sobre una fase que no se ve: el rail
  // afirmaría dónde está el trabajo mientras la pantalla muestra otra cosa. Por
  // eso el clic también vuelve a 'edit', igual que el atajo `Ctrl+Shift+[` de
  // App.tsx. La máquina de abrir/cerrar/anclar vive en `useRailFlyout`, el
  // mismo hook que usa Inicio: los dos rails escriben el mismo flag global.
  const navigate = useCallback(
    (item: RailDestination) => {
      /* Un destino sin fase abre lo suyo en vez de saltar de fase. Hoy el unico
         es 'mis-proyectos': no avanza el asistente, monta su pantalla
         (`viewMode: 'proyectos'`). Y el `return` temprano de antes lo dejaba
         muerto sin decir nada si no se contemplaba —el rail dibujaba el boton,
         aceptaba el clic y no pasaba nada, que es peor que no dibujarlo. */
      if (item.step === null) {
        if (item.id === 'mis-proyectos') setViewMode('proyectos');
        return;
      }
      if (viewMode !== 'edit') setViewMode('edit');
      setWizardStep(item.step);
    },
    [viewMode, setViewMode, setWizardStep],
  );

  const flyout = useRailFlyout(navigate);

  const isMobile = useIsMobile();
  const wizardStep = useDocStore((s) => s.wizardStep);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: 'var(--color-bg-canvas)',
        position: 'relative',
      }}
    >
      <UnifiedToolbar />
      <ProjectTabs />

      {/* En desktop (>768px): Rail lateral + flyout. En móvil: ocupación total. */}
      <div
        className="app-main"
        style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0, position: 'relative' }}
      >
        {!isMobile && (
          <>
            <IconRail
              items={items}
              onEnterRail={flyout.onEnterRail}
              onLeaveRail={flyout.onLeaveRail}
              onSelect={flyout.selectItem}
              onTogglePin={flyout.togglePin}
              pinned={flyout.railPinned}
            />
            <RailFlyout
              item={flyout.item}
              onClose={flyout.close}
              onEnter={flyout.onEnterPanel}
              onLeave={flyout.onLeavePanel}
            />
          </>
        )}
        <main style={{ flex: 1, minWidth: 0, display: 'flex', overflow: 'hidden' }}>
          {children}
        </main>
      </div>

      {isMobile ? (
        <MobileBottomNav
          items={items}
          activeStep={wizardStep}
          onSelect={navigate}
        />
      ) : (
        <StatusBar />
      )}
    </div>
  );
}
