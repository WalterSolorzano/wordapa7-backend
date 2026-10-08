/* WordAPA7 — la barra de balance: una rama medida CONTRA sus hermanas.
 *
 * POR QUÉ EXISTE. Un índice que dice "620 palabras" al lado de "12.400
 * palabras" le pide a la persona que haga la resta y que sepa si la diferencia
 * importa. No importa: 620 al lado de 12.400 es un capítulo que todavía no
 * está escrito, y eso es un problema de redacción, no de aritmética.
 *
 * Y la barra usa UNA sola escala para todas las hermanas: la de la más larga.
 * Si cada barra se midiera contra su propia rama, todas tendrían el mismo
 * ancho y la comparación no diría nada —que es el modo de fallo de un gráfico
 * de barras con eje propio por barra.
 *
 * CON MENOS DE DOS HERMANAS NO SE RENDERIZA. Un 100 % solo es un bug
 * esperando: parece una nota, y una rama sin comparable no tiene nota.
 */

import React from 'react';

export interface BarraBalanceProps {
  /** Las palabras de la rama que se está pintando. */
  palabras: number;
  /** La palabra de la hermana MÁS LARGA. Todas las barras usan esta escala. */
  escala: number;
  /** El nombre de esa hermana, para poder decir contra quién se mide. */
  laMasLarga: string;
  /** El nombre de la rama que se está pintando, para el nombre accesible. */
  nombre: string;
}

/** Los miles con punto, porque `12000` pegado a la palabra se lee como un año. */
export const miles = (n: number): string => n.toLocaleString('es-ES');

export const BarraBalance: React.FC<BarraBalanceProps> = ({ palabras, escala, laMasLarga, nombre }) => {
  const proporcion = escala > 0 ? Math.min(100, (palabras / escala) * 100) : 0;
  return (
    <div
      role="img"
      aria-label={`${nombre}: ${miles(palabras)} palabras; la rama más larga tiene ${miles(escala)}`}
      style={{
        width: '100%',
        minWidth: '72px',
        height: 'var(--space-2)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-subtle)',
        overflow: 'hidden',
      }}
    >
      <div
        data-testid="barra-relleno"
        style={{
          width: `${proporcion}%`,
          height: '100%',
          minWidth: proporcion > 0 ? '2px' : 0,
          borderRadius: 'var(--radius-sm)',
          background: 'var(--color-accent)',
        }}
      />
    </div>
  );
};

export default BarraBalance;
