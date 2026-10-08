/* WordAPA7 — shell: estado de cada destino del rail.
   Concentra aquí el cálculo de "listo" y "pendientes" para que el rail de 56px,
   su flyout y el atajo de teclado no puedan discrepar entre sí.

   Y ahora también lo que el atajo de teclado de `App.tsx` necesita: la cuenta
   sale de `lib/railPending`, la misma que usa el workbench de Revisión a través
   de `lib/auditItems`. El rail no puede prometer menos trabajo del que la
   pantalla abre, ni más del que la pantalla resuelve. */

import { useMemo } from 'react';
import { useDocStore } from '../store/useDocStore';
import type { DocState } from '../store/types';
import { EDITOR_RAIL_ITEMS, type RailDestination, type RailStatus } from '../components/shell/railItems';
import { readPhaseStates, type PhaseState, type RailPendingInput } from '../lib/railPending';

/** Lee el estado del store y arma la entrada de `lib/railPending`. Sirve para el
 *  rail (con `useRailDestinations`) y para el atajo de teclado de `App.tsx`,
 *  que no puede usar un hook. Elhiaje de campos va acá, no en quien llama: dos
 *  llamadas que arman la entrada a mano vuelven a ser dos verdades. */
export function railPendingInputFrom(state: DocState): RailPendingInput {
  return {
    hasDoc: !!state.doc,
    portada: state.portada,
    acta: state.acta,
    coverSetupDone: state.coverSetupDone,
    elements: state.doc?.elements || [],
    hasReferences: (state.doc?.referencias?.length || 0) > 0,
    reviewResult: state.reviewResult,
    proofreadFindings: state.proofreadFindings,
    citationAuditResult: state.citationAuditResult,
    dismissedFindingIds: state.dismissedFindingIds,
  };
}

export function useRailDestinations(): RailDestination[] {
  const doc = useDocStore((s) => s.doc);
  const portada = useDocStore((s) => s.portada);
  const acta = useDocStore((s) => s.acta);
  const coverSetupDone = useDocStore((s) => s.coverSetupDone);
  const reviewResult = useDocStore((s) => s.reviewResult);
  const proofreadFindings = useDocStore((s) => s.proofreadFindings);
  const citationAuditResult = useDocStore((s) => s.citationAuditResult);
  const dismissedFindingIds = useDocStore((s) => s.dismissedFindingIds);

  const viewMode = useDocStore((s) => s.viewMode);

  return useMemo<RailDestination[]>(() => {
    const states: Record<number, PhaseState> = readPhaseStates({
      hasDoc: !!doc,
      portada,
      acta,
      coverSetupDone,
      elements: doc?.elements || [],
      hasReferences: (doc?.referencias?.length || 0) > 0,
      reviewResult,
      proofreadFindings,
      citationAuditResult,
      dismissedFindingIds,
    });

    return EDITOR_RAIL_ITEMS.map(({ id, step, label, shortLabel, Icon, showOutline, showFlyout }) => {
      /* Un destino sin fase NO se cuenta. Se devuelve temprano, sin `status` ni
         `pending`, y no es una faltan del derivation: es que `readPhaseStates` no
         sabe de el y no deberia. Calcular `?? 0` aca seria poner un cero
         inventado sobre un modulo, y `RailFlyout` lo dibujaria como "Sin
         pendientes" —un estado que afirma que no hay nada que hacer en una
         pantalla que no es una tarea. El control vive en el test: las fases si
         cuentan, y el proyecto no. */
      if (step === null) {
        return {
          id,
          step: null,
          label,
          shortLabel,
          Icon,
          showOutline,
          showFlyout,
          /* 'Mis proyectos' es una PANTALLA, no una capa, y se enciende con
             `viewMode` igual que Exportar con su tunel: entrar no deja una fase
             de fondo "a la vista". Sin esto el rail quedaba apuntando a la
             ultima fase que se vio —que no es la que esta en pantalla—, que es
             justo la contradiccion que `AGENTS.md` prohibe. */
          current: viewMode === 'proyectos' ? true : undefined,
        };
      }

      // La 6 (Exportar) no tiene clave: exportarle algo al usuario no es una
      // tarea con estado, y una fase sin clave tiene 0 pendientes. Antes se
      // inventaba un "Listo" para un destino que no se puede terminar.
      const state = states[step];
      const pending = state?.pending ?? 0;
      const status: RailStatus = !doc
        ? 'idle'
        : !state
          ? 'idle'
          : state.done
            ? 'done'
            : pending > 0
              ? 'pending'
              : 'idle';
      /* Con el túnel de export abierto, el destino a la vista es Exportar, y
         no la fase que quedó de fondo. Sin esto, entrar al túnel por el paleta
         de comandos dejaba el acento del rail en una fase cuya vista ni
         siquiera está montada. */
      return {
        id,
        step,
        label,
        shortLabel,
        Icon,
        status,
        pending,
        showOutline,
        showFlyout,
        /* El tunel de exportacion es una pantalla entera, y `viewMode` ya dice
           cual esta a la vista: si es 'export', el destino a la vista es Exportar
           y no la fase que quedo de fondo. */
        current: step === 6 && viewMode === 'export' ? true : undefined,
      };
    });
  }, [doc, portada, acta, coverSetupDone, reviewResult, proofreadFindings, citationAuditResult, dismissedFindingIds, viewMode]);
}
