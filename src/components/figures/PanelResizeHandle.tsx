import React, { useEffect, useRef, useState } from 'react';

interface Props {
  /** Etiqueta accesible del tirador (describe qué columna ajusta). */
  ariaLabel: string;
  /**
   * Recibe el desplazamiento incremental en píxeles desde el último evento.
   * El consumidor decide si el gesto suma o resta a su ancho.
   */
  onDrag: (dx: number) => void;
}

/**
 * Tirador vertical para redimensionar una columna del taller.
 *
 * Emite deltas incrementales en `window` mientras se arrastra, de modo que la
 * columna puede seguir el puntero aunque el cursor salga del tirador. El delta
 * acumulado lo aplica el padre sobre su propio ancho.
 */
export const PanelResizeHandle: React.FC<Props> = ({ ariaLabel, onDrag }) => {
  const [activo, setActivo] = useState(false);
  const ultimoX = useRef(0);

  useEffect(() => {
    if (!activo) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - ultimoX.current;
      ultimoX.current = e.clientX;
      if (dx !== 0) onDrag(dx);
    };
    const onUp = () => setActivo(false);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [activo, onDrag]);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      data-activo={activo}
      onMouseDown={(e) => {
        e.preventDefault();
        ultimoX.current = e.clientX;
        setActivo(true);
      }}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: '7px',
        cursor: 'col-resize',
        zIndex: 5,
        backgroundColor: activo ? 'var(--color-accent)' : 'transparent',
        transition: activo ? 'none' : 'background-color var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        if (!activo) e.currentTarget.style.backgroundColor = 'var(--color-border-strong)';
      }}
      onMouseLeave={(e) => {
        if (!activo) e.currentTarget.style.backgroundColor = 'transparent';
      }}
    />
  );
};
