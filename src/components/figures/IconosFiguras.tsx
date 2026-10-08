/**
 * Iconos del Taller de Activos Gráficos.
 *
 * Los glifos salen de `lucide-react` (AGENTS §1 y el lint de tokens T20/R6: un
 * icono no se dibuja a mano). Este módulo es el único lugar donde se decide QUÉ
 * glifo representa cada concepto del dominio —figura, tabla, ecuación, leyenda y
 * conformidad—; si un concepto cambia de icono, se cambia acá y no en cada
 * pantalla que lo muestra. El grosor lo pone la hoja global
 * (`svg.lucide { stroke-width: var(--icon-stroke) }`), así que no se repite.
 */
export {
  Image as IconoFigura,
  Table2 as IconoTabla,
  Sigma as IconoEcuacion,
  Tag as IconoLeyenda,
  CheckCircle2 as IconoConformidad,
} from 'lucide-react';
