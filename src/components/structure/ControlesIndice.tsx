/* Controles de diseño del Índice: profundidad, numeración e insertar/quitar.
 *
 * El índice es el único destino de la fase que ESCRIBE en el documento, así que
 * sus controles viven pegados a la previsualización que los refleja. Los
 * controles son botones con `aria-pressed`, como el resto de la fase: nunca un
 * desplegable nativo.
 *
 * La mini-preview de arriba muestra el efecto de las dos decisiones
 * —profundidad y notación— usando la MISMA numeración que el índice real
 * (`muestraIndice`), para que elegir «I. II. III.» se vea antes de aplicarlo.
 *
 * TOKENS, NO HEX.
 */

import React from 'react';
import { ListTree, Plus, Trash2 } from 'lucide-react';
import { muestraIndice } from '../../lib/numeracionTitulos';

export type ProfundidadIndice = 1 | 2 | 3 | 4;

export interface ControlesIndiceProps {
  profundidad: ProfundidadIndice;
  onProfundidad: (p: ProfundidadIndice) => void;
  onRegla: (clave: string, valor: string) => void;
  hayIndice: boolean;
  onInsertar: () => void;
  onQuitar: () => void;
  numeracionH1: string;
  numeracionH2: string;
}

const PROFUNDIDADES: Array<{ valor: ProfundidadIndice; label: string }> = [
  { valor: 1, label: 'Hasta H1' },
  { valor: 2, label: 'Hasta H2' },
  { valor: 3, label: 'Hasta H3' },
  { valor: 4, label: 'Todo' },
];

/** Notación de numeración de títulos. Espejo de `NUMERACIONES_DE_TITULO`. */
export const NUMERACIONES_DE_TITULO: Array<{ valor: string; label: string }> = [
  { valor: 'none', label: 'Sin numerar' },
  { valor: 'decimal', label: '1. 2. 3.' },
  { valor: 'upperRoman', label: 'I. II. III.' },
  { valor: 'lowerRoman', label: 'i. ii. iii.' },
  { valor: 'upperLetter', label: 'A. B. C.' },
  { valor: 'lowerLetter', label: 'a. b. c.' },
];

/** Glifo de niveles: barras que se ensanchan, como el árbol del índice. */
const GlifoProfundidad: React.FC<{ niveles: number }> = ({ niveles }) => (
  <svg width={16} height={15} viewBox="0 0 16 15" aria-hidden focusable="false">
    {Array.from({ length: Math.min(niveles, 4) }, (_, i) => (
      <rect
        key={i}
        x={1 + i * 2}
        y={1 + i * 3.4}
        width={14 - i * 4}
        height={2}
        rx={1}
        fill="currentColor"
        opacity={1 - i * 0.16}
      />
    ))}
  </svg>
);

export const ControlesIndice: React.FC<ControlesIndiceProps> = ({
  profundidad,
  onProfundidad,
  onRegla,
  hayIndice,
  onInsertar,
  onQuitar,
  numeracionH1,
  numeracionH2,
}) => {
  const filas = muestraIndice(profundidad, numeracionH1, numeracionH2);

  return (
    <section
      data-testid="controles-indice"
      aria-label="Diseño del índice"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        padding: 'var(--space-3)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <ListTree
          size={16}
          strokeWidth="var(--icon-stroke)"
          aria-hidden
          style={{ color: 'var(--color-accent)' }}
        />
        <h2
          style={{
            margin: 0,
            fontSize: 'var(--text-sm)',
            fontWeight: 700,
            color: 'var(--color-text-primary)',
          }}
        >
          Diseño del índice
        </h2>
      </header>

      {/* Mini-preview viva: refleja profundidad y notación. */}
      <div aria-hidden style={estiloHoja}>
        {filas.map((fila) => (
          <div
            key={fila.nivel}
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 'var(--space-2)',
              paddingLeft: `${(fila.nivel - 1) * 12}px`,
            }}
          >
            <span
              style={{
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                ...estiloFilaMuestra(fila.nivel),
              }}
            >
              {fila.texto}
            </span>
            <span
              style={{
                flex: 1,
                minWidth: 8,
                borderBottom: '1px dotted var(--color-border-subtle)',
                transform: 'translateY(-2px)',
              }}
            />
          </div>
        ))}
      </div>

      <div style={estiloTarjeta}>
        <span style={estiloEtiqueta}>Profundidad visible</span>
        <p style={estiloAyuda}>Cuántos niveles de título entran al índice.</p>
        <div role="group" aria-label="Profundidad" style={estiloGrupoProfundidad}>
          {PROFUNDIDADES.map(({ valor, label }) => (
            <button
              key={valor}
              type="button"
              aria-pressed={profundidad === valor}
              onClick={() => onProfundidad(valor)}
              style={estiloOpcionProfundidad(profundidad === valor)}
            >
              <GlifoProfundidad niveles={valor} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div style={estiloTarjeta}>
        <span style={estiloEtiqueta}>Numeración de H1</span>
        <p style={estiloAyuda}>Cómo se numeran los capítulos.</p>
        <div role="group" aria-label="Numeración de H1" style={estiloGrupoNumeracion}>
          {NUMERACIONES_DE_TITULO.map(({ valor, label }) => (
            <button
              key={valor}
              type="button"
              aria-pressed={numeracionH1 === valor}
              onClick={() => onRegla('heading_numbering_style_lvl1', valor)}
              style={estiloChip(numeracionH1 === valor)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={estiloTarjeta}>
        <span style={estiloEtiqueta}>Numeración de H2</span>
        <p style={estiloAyuda}>Cómo se numeran las secciones.</p>
        <div role="group" aria-label="Numeración de H2" style={estiloGrupoNumeracion}>
          {NUMERACIONES_DE_TITULO.map(({ valor, label }) => (
            <button
              key={valor}
              type="button"
              aria-pressed={numeracionH2 === valor}
              onClick={() => onRegla('heading_numbering_style_lvl2', valor)}
              style={estiloChip(numeracionH2 === valor)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={hayIndice ? onQuitar : onInsertar}
        style={estiloBotonPrincipal(hayIndice)}
      >
        {hayIndice ? (
          <Trash2 size={14} strokeWidth="var(--icon-stroke)" aria-hidden />
        ) : (
          <Plus size={14} strokeWidth="var(--icon-stroke)" aria-hidden />
        )}
        {hayIndice ? 'Quitar índice' : 'Insertar índice'}
      </button>
    </section>
  );
};

const estiloHoja: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  padding: 'var(--space-3)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--paper-white)',
  color: 'var(--paper-ink)',
};

const estiloFilaMuestra = (nivel: number): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)',
  fontSize: nivel === 1 ? '12px' : '11.5px',
  fontWeight: nivel === 1 ? 700 : 400,
});

const estiloTarjeta: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  padding: 'var(--space-3)',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)',
  background: 'var(--color-bg-surface)',
};

const estiloEtiqueta: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  fontWeight: 600,
  color: 'var(--color-text-primary)',
};

const estiloAyuda: React.CSSProperties = {
  margin: 0,
  fontSize: '11px',
  color: 'var(--color-text-tertiary)',
};

const estiloGrupoProfundidad: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 'var(--space-1)',
  marginTop: 'var(--space-2)',
};

const estiloOpcionProfundidad = (activo: boolean): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 'var(--space-2)',
  padding: 'var(--space-2)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-xs)',
  fontWeight: activo ? 600 : 400,
  color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
  background: activo ? 'var(--color-accent-soft)' : 'transparent',
  border: '1px solid ' + (activo ? 'var(--color-accent)' : 'var(--color-border-subtle)'),
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
});

const estiloGrupoNumeracion: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 'var(--space-1)',
  marginTop: 'var(--space-2)',
};

const estiloChip = (activo: boolean): React.CSSProperties => ({
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--text-xs)',
  fontWeight: activo ? 600 : 400,
  color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
  background: activo ? 'var(--color-accent-soft)' : 'transparent',
  border: '1px solid ' + (activo ? 'var(--color-accent)' : 'var(--color-border-subtle)'),
  borderRadius: 'var(--radius-sm)',
  padding: 'var(--space-1) var(--space-2)',
  cursor: 'pointer',
});

const estiloBotonPrincipal = (hayIndice: boolean): React.CSSProperties =>
  hayIndice
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        alignSelf: 'flex-start',
        padding: 'var(--space-2) var(--space-3)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-md)',
        background: 'transparent',
        color: 'var(--color-text-secondary)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        cursor: 'pointer',
      }
    : {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-1)',
        alignSelf: 'flex-start',
        padding: 'var(--space-2) var(--space-3)',
        border: '1px solid var(--color-accent)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-accent)',
        color: 'var(--paper-white)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--text-xs)',
        fontWeight: 600,
        cursor: 'pointer',
      };

export default ControlesIndice;
