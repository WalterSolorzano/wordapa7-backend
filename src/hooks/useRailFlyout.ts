/* WordAPA7 — shell: la máquina de la unión rail + flyout.
   El cierre es de la UNIÓN, no de un componente: el rail y el panel están
   separados por un hueco de 8px y si cada uno cerrara por su cuenta, el puntero
   no podría cruzar sin perder el panel por el camino. El timer de 120ms
   (FLYOUT_CLOSE_GRACE_MS) lo programa la salida de cualquiera de los dos y lo
   cancela la entrada en cualquiera de los dos.

   Vivía duplicado —verbo y medio— en `AppShell` y en `Step0QuickStart`, y son
   los dos ESCRITORES del mismo flag global `railPinned`. Dos copias de una
   máquina de estados que decide si un panel se va es exactamente donde las dos
   divergen sin que nada lo diga. Esta es la copia única.

   `clearPinOnMount` existe para Inicio: la pantalla de inicio no tiene un
   panel que sobreviva a la pantalla, así que un pin puesto en el editor sería un
   fantasma que aparece en el siguiente documento. No se silencia el pin, se
   suelta en el borde de entrar y en el de salir. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDocStore } from '../store/useDocStore';
import { FLYOUT_CLOSE_GRACE_MS } from '../components/shell/RailFlyout';
import type { RailDestination } from '../components/shell/railItems';

export interface RailFlyoutState {
  /** El destino cuyo detalle está a la vista, o `null` si el panel está cerrado. */
  item: RailDestination | null;
  railPinned: boolean;
  /** Reporta la entrada del puntero hacia arriba: cancela el cierre en vuelo. */
  onEnterPanel: () => void;
  /** Reporta la salida del puntero hacia arriba: programa la gracia. */
  onLeavePanel: () => void;
  /** El puntero ENTRÓ al rail. Es lo que cancela el cierre cuando vuelve desde
   *  el panel; sin esto el panel se iría con el puntero encima. El puntero
   *  entrando a un BOTÓN ya no abre nada: el hover dejó de ser un disparador
   *  del detalle, y el clic es el único que queda. */
  onEnterRail: () => void;
  /** El puntero SALIÓ del rail: programa la gracia de la unión. */
  onLeaveRail: () => void;
  /** Clic en un destino: navega y, si el destino tiene detalle, abre y ancla el panel. */
  selectItem: (item: RailDestination) => void;
  close: () => void;
  togglePin: () => void;
}

export function useRailFlyout(onSelect?: (item: RailDestination) => void): RailFlyoutState {
  const railPinned = useDocStore((s) => s.railPinned);
  const setRailPinned = useDocStore((s) => s.setRailPinned);
  const [item, setItem] = useState<RailDestination | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancelClose = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelClose();
    setItem(null);
  }, [cancelClose]);

  const scheduleClose = useCallback(() => {
    if (railPinned) return;
    cancelClose();
    closeTimer.current = setTimeout(() => {
      closeTimer.current = null;
      setItem(null);
    }, FLYOUT_CLOSE_GRACE_MS);
  }, [railPinned, cancelClose]);

  // El timer en vuelo no sobrevive al desmontaje: cerraría un panel que ya no
  // existe (y en tests, escribiría estado de un componente muerto).
  useEffect(() => cancelClose, [cancelClose]);

  // El ancla es un flag GLOBAL: entra limpia desde esta pantalla y sale limpia
  // también. Inicio no tiene un panel que sobreviva a la pantalla, así que un
  // pin puesto acá sería un fantasma que aparece en el editor al abrir el
  // siguiente documento.
  useEffect(() => {
    const soltar = () => {
      const st = useDocStore.getState();
      if (st.railPinned) st.setRailPinned(false);
    };
    soltar();
    return soltar;
  }, []);

  /* El clic es la acción deliberada: lleva a la fase y, si el destino TIENE
     detalle, abre el panel y lo ancla.
     *
     * ANTES el hover también lo abría, y por eso el panel aparecía solo con
     * pasar el puntero por encima: el reporte literal del usuario, "al pasar el
     * mouse por una fase que no salga la ventana flotante". Navegar desde el hover
     * ya estaba descartado por el motivo de siempre —montaría y desmontaría la
     * fase que se está leyendo—, pero ABRIR sin navegar era un superconjunto
     * inútil: 240px de panel encima del documento, ofrecidos sobre fases cuyo
     * detalle no es el árbol de estructura.
     *
     * Y UN DESTINO SIN DETALLE NO ABRE PANEL. 'Mis proyectos' es una pantalla,
     * no una fase con descripción: `RailFlyout` no dibuja nada sin
     * `description`/`status`/`showOutline`, así que abrir el panel sería
     * reservar 240px para un componente que devuelve `null`. El clic navega y
     * cierra el panel que hubiera: dejar la descripción de una fase al lado de
     * la pantalla de proyectos es la contradicción rail/pantalla que el §1
     * prohibe. */
  const selectItem = useCallback(
    (next: RailDestination) => {
      cancelClose();
      onSelect?.(next);
      if (next.showFlyout === false) {
        setItem(null);
        return;
      }
      const hasDetails = Boolean(next.description || next.status || next.showOutline);
      if (hasDetails) {
        setItem(next);
        setRailPinned(true);
      } else {
        setItem(null);
      }
    },
    [cancelClose, onSelect, setRailPinned],
  );

  const togglePin = useCallback(() => {
    setRailPinned(!useDocStore.getState().railPinned);
  }, [setRailPinned]);

  return {
    item,
    railPinned,
    onEnterPanel: cancelClose,
    onLeavePanel: scheduleClose,
    onEnterRail: cancelClose,
    onLeaveRail: scheduleClose,
    selectItem,
    close,
    togglePin,
  };
}
