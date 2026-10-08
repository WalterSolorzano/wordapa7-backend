import { Folder } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Entradas del rail de navegación.
 * Cada entrada tiene id, ícono, label y opcionalmente un conteo de pendientes.
 */
export interface RailItem {
  id: string;
  icon: LucideIcon;
  label: string;
  step: number;
  pendingCount?: () => number;
}

export const railItems: RailItem[] = [
  {
    id: 'proyectos',
    icon: Folder,
    label: 'Proyectos',
    step: -1,
    pendingCount: () => {
      // TODO: integrar con store cuando types.ts esté disponible
      return 0;
    },
  },
];
