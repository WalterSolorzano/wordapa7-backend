import { useEffect } from 'react';
import { useDocStore } from '../store/useDocStore';

const INTERVALO_MS = 30_000;

/**
 * Autoguardado periódico.
 *
 * El backend ya persiste en cada mutación; esto crea un punto de restauración
 * cada tanto y antes de cerrar/cambiar de pestaña, y solo si hay cambios. Nunca
 * dispara dos a la vez: `isSaving` es la guarda.
 */
export function useAutosave(intervaloMs = INTERVALO_MS): void {
  useEffect(() => {
    const guardarSiHaceFalta = () => {
      const { doc, hasUnsavedChanges, isSaving, saveSnapshot } = useDocStore.getState();
      if (doc && hasUnsavedChanges && !isSaving) void saveSnapshot();
    };
    const t = setInterval(guardarSiHaceFalta, intervaloMs);
    const onVisibilidad = () => {
      if (document.visibilityState === 'hidden') guardarSiHaceFalta();
    };
    window.addEventListener('beforeunload', guardarSiHaceFalta);
    document.addEventListener('visibilitychange', onVisibilidad);
    return () => {
      clearInterval(t);
      window.removeEventListener('beforeunload', guardarSiHaceFalta);
      document.removeEventListener('visibilitychange', onVisibilidad);
    };
  }, [intervaloMs]);
}
