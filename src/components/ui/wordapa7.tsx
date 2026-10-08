import React from 'react';

export const WORDAPA7_TOKENS = {
  colors: {
    appBg: 'var(--app-bg)',
    sidebarBg: 'var(--sidebar-bg)',
    canvasBg: 'var(--canvas-bg)',
    surfaceElevated: 'var(--surface-elevated)',
    surfaceSubtle: 'var(--surface-subtle)',
    textMain: 'var(--text-main)',
    textSecondary: 'var(--text-secondary)',
    textMuted: 'var(--text-muted)',
    accent: 'var(--accent-primary)',
    accentHover: 'var(--accent-primary-hover)',
    success: 'var(--color-success)',
    warning: 'var(--color-warning)',
    danger: 'var(--color-danger)',
    border: 'var(--border-subtle)',
  },
  radius: {
    sm: 'var(--radius-sm)',
    md: 'var(--radius-md)',
    lg: 'var(--radius-lg)',
    xl: 'var(--radius-xl)',
  },
  shadow: {
    card: 'var(--shadow-card)',
    md: 'var(--shadow-md)',
  },
  spacing: {
    xs: 'var(--space-1)',
    sm: 'var(--space-2)',
    md: 'var(--space-3)',
    lg: 'var(--space-4)',
    xl: 'var(--space-6)',
  },
};

export const Card: React.FC<React.PropsWithChildren<{ selected?: boolean; style?: React.CSSProperties; className?: string; onClick?: () => void }>> = ({ selected, style, className, onClick, children }) => (
  <div
    className={`card${selected ? ' selected' : ''}${className ? ` ${className}` : ''}`}
    style={onClick ? { cursor: 'pointer', ...style } : style}
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    tabIndex={onClick ? 0 : undefined}
    onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
  >
    {children}
  </div>
);

export const Panel: React.FC<React.PropsWithChildren<{ style?: React.CSSProperties; className?: string }>> = ({ style, className, children }) => (
  <div className={`panel${className ? ` ${className}` : ''}`} style={style}>
    {children}
  </div>
);

/* El backdrop es UNO en toda la app: lo trae este componente, con su velo y su
   animación de entrada en la hoja, y nadie escribe el suyo con un `rgba()` a
   mano. `zIndex` existe para el hub de Ajustes, que por DESIGN.md:123 tiene que
   ir en `var(--z-modal)`; el default deja los overlays viejos donde estaban.

   `full` es la pantalla completa: sin velo, sin padding y sin el marco de
   tarjeta flotante (borde, radio y sombra son el look de "ventana", no del
   fondo). El diálogo llena el viewport, así que ya no hay un "afuera" que
   clicar y el click-en-backdrop deja de cerrar. Lo usa el hub de Ajustes, que
   `App.tsx` monta EN LUGAR de la app: la hoja tapa lo mismo que la app tapaba. */
export const Modal: React.FC<React.PropsWithChildren<{ open: boolean; onClose?: () => void; style?: React.CSSProperties; zIndex?: number | string; full?: boolean }>> = ({ open, onClose, style, zIndex = 20000, full = false, children }) => {
  if (!open) return null;
  return (
    <div
      className="modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: full ? 'transparent' : 'rgba(0, 0, 0, 0.40)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: full ? 0 : '24px',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && onClose && !full) onClose();
      }}
    >
      <div
        className="modal-shell"
        style={full
          ? { width: '100%', height: '100%', border: 'none', borderRadius: 0, boxShadow: 'none', ...style }
          : { width: 'min(960px, 100%)', ...style }}
      >
        {children}
      </div>
    </div>
  );
};

export const Badge: React.FC<React.PropsWithChildren<{ tone?: 'accent' | 'success' | 'warning' | 'danger' | 'muted' | 'neutral' | 'info'; style?: React.CSSProperties }>> = ({ tone = 'muted', style, children }) => {
  const palette: Record<string, React.CSSProperties> = {
    accent: { background: 'rgba(79,124,255,0.16)', color: 'var(--accent-primary)', borderColor: 'rgba(79,124,255,0.2)' },
    success: { background: 'rgba(82,196,26,0.14)', color: 'var(--color-success)', borderColor: 'rgba(82,196,26,0.22)' },
    warning: { background: 'rgba(250,173,20,0.14)', color: 'var(--color-warning)', borderColor: 'rgba(250,173,20,0.24)' },
    danger: { background: 'rgba(255,77,79,0.14)', color: 'var(--color-danger)', borderColor: 'rgba(255,77,79,0.24)' },
    muted: { background: 'var(--surface-subtle)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' },
    neutral: { background: 'var(--surface-subtle)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' },
    info: { background: 'rgba(79,124,255,0.14)', color: 'var(--accent-primary)', borderColor: 'rgba(79,124,255,0.2)' },
  };

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '2px 8px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--font-medium)',
        letterSpacing: '0.01em',
        ...palette[tone],
        ...style,
      }}
    >
      {children}
    </span>
  );
};

export const StepperItem: React.FC<{
  number: number;
  title: string;
  description?: string;
  active?: boolean;
  complete?: boolean;
  onClick?: () => void;
}> = ({ number, title, description, active, complete, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      flex: '1 1 0',
      minWidth: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-3)',
      padding: 'var(--space-3) var(--space-4)',
      borderRadius: 'var(--radius-lg)',
      border: `1px solid ${complete ? 'var(--color-success)' : active ? 'rgba(79,124,255,0.38)' : 'var(--border-subtle)'}`,
      background: complete ? 'rgba(56,160,23,0.10)' : active ? 'rgba(79,124,255,0.12)' : 'transparent',
      color: 'var(--text-main)',
      cursor: onClick ? 'pointer' : 'default',
      textAlign: 'left',
      boxShadow: active ? '0 0 0 1px rgba(79,124,255,0.2) inset' : 'none',
    }}
  >
    <div
      className="wizard-step-pill"
      style={{
        background: complete ? 'var(--color-success)' : active ? 'var(--accent-primary)' : 'var(--surface-subtle)',
        color: active || complete ? '#fff' : 'var(--text-secondary)',
        flexShrink: 0,
      }}
    >
      {complete ? '' : number}
    </div>
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 'var(--text-sm)', fontWeight: 'var(--font-bold)', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
      {description && <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: 'var(--space-1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{description}</div>}
    </div>
  </button>
);

export const InputField = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ style, ...props }, ref) => (
    <input
      ref={ref}
      {...props}
      style={{
        width: '100%',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--surface-subtle)',
        color: 'var(--text-main)',
        padding: '11px 12px',
        fontSize: 'var(--text-sm)',
        outline: 'none',
        boxShadow: 'none',
        ...style,
      }}
    />
  )
);
InputField.displayName = 'InputField';

export const TextAreaField = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ style, ...props }, ref) => (
    <textarea
      ref={ref}
      {...props}
      style={{
        width: '100%',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-subtle)',
        background: 'var(--surface-subtle)',
        color: 'var(--text-main)',
        padding: '11px 12px',
        fontSize: 'var(--text-sm)',
        outline: 'none',
        resize: 'vertical',
        minHeight: '84px',
        ...style,
      }}
    />
  )
);
TextAreaField.displayName = 'TextAreaField';
