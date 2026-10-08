/* WordAPA7 — el editor de UNA ecuación.
 *
 * POR QUÉ EXISTE. La presentación de una ecuación —si lleva número, con qué
 * formato, su alineación y la tipografía de apoyo— vivía dentro del
 * `ElementInspector` general, que se borró por ser una UI sobre la UI de cada
 * fase. Pero la capacidad no era ruido: el usuario confirmó que usa ecuaciones y
 * que son prioridad. Se rescata como un editor PROPIO, con el mismo patrón que
 * el editor de figura: es el DESTINO de una selección deliberada, no un volcado
 * de propiedades de cualquier cosa que toques.
 *
 * DÓNDE DEBERÍA VIVIR. Por la regla de fases sagradas, una ecuación es contenido
 * del cuerpo y su casa natural es la fase de Figuras y tablas (que pasa a ser
 * "Figuras, tablas y ecuaciones"). Mientras esa fase se rediseña, el editor vive
 * donde el patrón ya está resuelto: el panel derecho, al seleccionar la ecuación.
 *
 * EL XML DE LA ECUACIÓN NO SE TOCA. El contenido matemático (OMML) se preserva
 * intacto; acá solo se configura cómo se presenta. La persistencia va por
 * `updateElementEquation`, que es un PATCH con `pushHistory`, así que entra en el
 * deshacer.
 */

import React, { useEffect, useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import type { ElementModel, EquationConfig } from '../../types';

const PREDETERMINADO: EquationConfig = {
  show_number: false,
  number_format: '(1)',
  number: undefined,
  alignment: 'center',
  font_name: 'Times New Roman',
  font_size_pt: 12,
};

const ALINEACIONES: ReadonlyArray<{ valor: string; etiqueta: string }> = [
  { valor: 'left', etiqueta: 'Izquierda' },
  { valor: 'center', etiqueta: 'Centrada' },
  { valor: 'right', etiqueta: 'Derecha' },
];

const FORMATOS = ['(1)', '[1]', '1.', '(1.1)', 'Ecuación {n}'];
const FUENTES = ['Times New Roman', 'Cambria Math', 'Arial', 'Calibri'];
const TAMANOS = [10, 11, 12, 13, 14];

const rotulo: React.CSSProperties = {
  display: 'block',
  fontSize: 'var(--text-xs)',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  color: 'var(--text-secondary)',
  marginBottom: '6px',
};

const campo: React.CSSProperties = {
  width: '100%',
  minHeight: '30px',
  fontFamily: 'inherit',
  fontSize: 'var(--text-xs)',
  color: 'var(--text-main)',
  background: 'var(--color-bg-surface-alt)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-sm)',
  padding: '5px 8px',
  boxSizing: 'border-box',
};

const nota: React.CSSProperties = {
  fontSize: '10px',
  color: 'var(--text-muted)',
  margin: '6px 0 0',
  lineHeight: 1.5,
};

export interface EquationEditorProps {
  elemento: ElementModel;
}

export const EquationEditor: React.FC<EquationEditorProps> = ({ elemento }) => {
  const updateElementEquation = useDocStore((s) => s.updateElementEquation);

  /* El control responde YA y el PATCH va detrás. Un checkbox que espera al
     servidor para moverse es un control que se siente roto. El borrador se
     resetea cuando cambia la ecuación elegida —no en cada respuesta del backend,
     que volvería a pisar lo que el usuario está tocando—. */
  const [borrador, setBorrador] = useState<EquationConfig>(() => ({
    ...PREDETERMINADO,
    ...(elemento.equation ?? {}),
  }));
  useEffect(() => {
    setBorrador({ ...PREDETERMINADO, ...(elemento.equation ?? {}) });
  }, [elemento.id]);

  const eq = borrador;
  const set = (patch: Partial<EquationConfig>) => {
    const siguiente = { ...borrador, ...patch };
    setBorrador(siguiente);
    updateElementEquation(elemento.id, siguiente);
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
        padding: 'var(--space-4)',
        overflowY: 'auto',
        minHeight: 0,
      }}
    >
      <p style={{ ...nota, margin: 0 }}>
        Ecuación de Word (OMML). El contenido matemático se preserva intacto; acá
        configurás su presentación en el documento APA 7.
      </p>

      {/* Lo detectado, tal cual, para que se vea sobre qué se está decidiendo. */}
      <div>
        <span style={rotulo}>Ecuación detectada</span>
        <div
          style={{
            ...campo,
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            overflowX: 'auto',
            color: 'var(--text-secondary)',
          }}
        >
          {elemento.text || '[Ecuación OMML]'}
        </div>
      </div>

      <section>
        <span style={rotulo}>Numeración</span>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          <input
            type="checkbox"
            checked={eq.show_number}
            onChange={(e) => set({ show_number: e.target.checked })}
            style={{ accentColor: 'var(--accent-primary)' }}
          />
          Mostrar número
        </label>

        {eq.show_number && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
            <label>
              <span style={{ ...rotulo, marginBottom: '4px' }}>Formato del número</span>
              <select
                value={eq.number_format}
                onChange={(e) => set({ number_format: e.target.value })}
                style={campo}
              >
                {FORMATOS.map((f) => (
                  <option key={f} value={f}>{f.replace('{n}', eq.number || '1')}</option>
                ))}
              </select>
            </label>

            <label>
              <span style={{ ...rotulo, marginBottom: '4px' }}>Número (opcional)</span>
              <input
                type="text"
                value={eq.number ?? ''}
                placeholder="Auto (1, 2, 3…)"
                onChange={(e) => set({ number: e.target.value || undefined })}
                style={campo}
              />
            </label>
            <p style={nota}>
              Vacío = numeración automática secuencial en el orden del documento.
            </p>
          </div>
        )}
      </section>

      <section>
        <span style={rotulo}>Alineación</span>
        <div style={{ display: 'flex', gap: '6px' }}>
          {ALINEACIONES.map((a) => (
            <button
              key={a.valor}
              type="button"
              aria-pressed={eq.alignment === a.valor}
              onClick={() => set({ alignment: a.valor })}
              style={{
                flex: 1,
                minHeight: '30px',
                padding: '6px 4px',
                fontFamily: 'inherit',
                fontSize: '10px',
                cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                background: eq.alignment === a.valor ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
                color: eq.alignment === a.valor ? 'var(--accent-primary)' : 'var(--text-main)',
                fontWeight: eq.alignment === a.valor ? 700 : 500,
              }}
            >
              {a.etiqueta}
            </button>
          ))}
        </div>
        <p style={nota}>
          APA 7 no fija una regla estricta; por convención las ecuaciones se
          centran y el número va al margen derecho.
        </p>
      </section>

      <section>
        <span style={rotulo}>Tipografía de apoyo</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <select
            value={eq.font_name}
            onChange={(e) => set({ font_name: e.target.value })}
            style={campo}
          >
            {FUENTES.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            value={eq.font_size_pt}
            onChange={(e) => set({ font_size_pt: Number(e.target.value) })}
            style={campo}
          >
            {TAMANOS.map((s) => <option key={s} value={s}>{s} pt</option>)}
          </select>
        </div>
        <p style={nota}>
          Aplica solo al número y al texto de apoyo; el XML de la ecuación se
          mantiene intacto.
        </p>
      </section>
    </div>
  );
};

export default EquationEditor;
