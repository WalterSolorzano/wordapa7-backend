/* WordAPA7 — el molde de una sección dentro de una pestaña de Ajustes.
 *
 * Vive en `word/` y no en cada pestaña porque el borde, el fondo y los tres
 * tamaños de texto los decide el molde, no la pestaña: dos copias del mismo
 * `<section>` divergen en la primera corrección de estilo, y entonces Ajustes
 * parece cinco pestañas pegadas con cinta.
 *
 * El borde y el fondo salen de tokens: un color escrito a mano acá sería una
 * excepción, y una excepción es como muere un lint de tokens.
 */
import React from 'react';

export const Seccion: React.FC<{
  titulo: string;
  descripcion?: string;
  children: React.ReactNode;
}> = ({ titulo, descripcion, children }) => (
  <section
    style={{
      display: 'flex', flexDirection: 'column', gap: 'var(--space-3)',
      padding: 'var(--space-4)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--color-bg-surface)',
    }}
  >
    <div>
      <h3 style={{ margin: 0, fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--color-text-primary)' }}>
        {titulo}
      </h3>
      {descripcion && (
        <p style={{ margin: 'var(--space-1) 0 0', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', lineHeight: 'var(--leading-normal)' }}>
          {descripcion}
        </p>
      )}
    </div>
    {children}
  </section>
);

export default Seccion;
