/* WordAPA7 — TablaRender
 *
 * El render compartido de tablas (spec D-6). Pinta una `TableModel` con
 * `matrizDeTabla` (spans y defaults) y `estiloDePreset` (claves de estilo),
 * nunca con un mapa efímero del store. `editable={false}` en el lienzo y en la
 * prosa; `editable` en el Taller.
 *
 * TOKENS, NO HEX. La leyenda se pinta UNA vez: si el `caption` ya trae el rótulo
 * «Tabla N.» se separa para no duplicarlo.
 */

import React, { useState } from 'react';
import { Table2 } from 'lucide-react';
import { estiloDePreset, matrizDeTabla } from '../../lib/tablaRender';
import type { TableModel } from '../../types';

export interface TablaRenderProps {
  tabla: TableModel;
  /** Preset de estilo; si falta se usa `tabla.style` o `apa`. */
  estilo?: ReturnType<typeof estiloDePreset>;
  /** Habilita la edición de celdas con clic (Taller). */
  editable?: boolean;
  /** `fila` = 0 encabezado / 1..n cuerpo; `col` = índice lógico de la celda. */
  onEditarCelda?: (fila: number, col: number, texto: string) => void;
  /** Muestra el rótulo «Tabla N.» + leyenda (default true; false en fragmentos continuados). */
  mostrarLeyenda?: boolean;
  /** Marca este fragmento como continuación de una tabla partida entre páginas. */
  esContinuacion?: boolean;
  /** Este fragmento es el último de la tabla; solo ahí se pinta la nota (default true). */
  esUltima?: boolean;
}

/** Quita un prefijo «Tabla N.» del caption para no repetir el rótulo. */
function sinRotulo(caption: string, numero: number): string {
  const re = new RegExp(`^\\s*Tabla\\s+${numero}\\s*[.:]?\\s*`, 'i');
  return caption.replace(re, '').trim();
}

export const TablaRender: React.FC<TablaRenderProps> = ({
  tabla,
  estilo,
  editable = false,
  onEditarCelda,
  mostrarLeyenda = true,
  esContinuacion = false,
  esUltima = true,
}) => {
  const est = estilo ?? estiloDePreset(tabla.style ?? 'apa');
  const filas = matrizDeTabla(tabla);
  const puedeEditar = editable && typeof onEditarCelda === 'function';
  const [editando, setEditando] = useState<{ fila: number; col: number } | null>(null);
  const [borrador, setBorrador] = useState('');

  const confirmar = () => {
    if (editando && borrador !== '') onEditarCelda!(editando.fila, editando.col, borrador);
    setEditando(null);
  };

  const anchoPorColumna = Array.isArray(tabla.column_widths) && tabla.column_widths.length > 0;

  return (
    <figure style={{ margin: 0, color: 'var(--paper-ink)' }} data-testid="tabla-render">
      {mostrarLeyenda ? (
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 'var(--space-1)',
            marginBottom: 'var(--space-2)',
            fontSize: 'var(--text-xs)',
          }}
        >
          <Table2 size={13} strokeWidth="var(--icon-stroke)" aria-hidden style={{ color: 'var(--color-text-tertiary)' }} />
          <span style={{ fontWeight: 700 }}>Tabla {tabla.table_number}.</span>
          <span>{sinRotulo(tabla.caption || '', tabla.table_number)}</span>
        </div>
      ) : null}

      <div data-testid="tabla-scroll" style={{ overflowX: 'auto' }}>
        <table
          style={{
            borderCollapse: 'collapse',
            tableLayout: 'fixed',
            width: '100%',
            wordBreak: 'break-word',
            overflowWrap: 'break-word',
            fontSize: est.fontSize,
          }}
        >
          {anchoPorColumna ? (
            <colgroup>
              {tabla.column_widths!.map((w, i) => (
                <col key={`col-${i}`} style={{ width: `${Math.round(w * 10000) / 100}%` }} />
              ))}
            </colgroup>
          ) : null}
          <tbody>
            {filas.map((fila, fi) => (
              <tr
                key={`fila-${fi}`}
                style={
                  est.zebra && !fila.esHeader && fi % 2 === 0
                    ? { background: 'var(--color-bg-surface-alt)' }
                    : undefined
                }
              >
                {fila.celdas.map((celda, ci) => {
                  const esCeldaEditando =
                    puedeEditar && editando && editando.fila === celda.filaIndice && editando.col === celda.celdaIndice;
                  const borde = `${est.pesoBorde} solid var(--color-border-strong)`;
                  const comun: React.CSSProperties = {
                    padding: `${est.paddingY} ${est.paddingX}`,
                    borderBottom: borde,
                    borderTop: fila.esHeader || est.rejilla ? borde : undefined,
                    borderLeft: est.rejilla ? borde : undefined,
                    borderRight: est.rejilla ? borde : undefined,
                    verticalAlign: 'top',
                    textAlign: 'left',
                    fontWeight: fila.esHeader ? 700 : 400,
                    background: est.sombreadoEncabezado && fila.esHeader ? 'var(--color-bg-surface-alt)' : undefined,
                  };
                  return (
                    <td key={`c-${fi}-${ci}`} colSpan={celda.colSpan} rowSpan={celda.rowSpan} style={comun}>
                      {esCeldaEditando ? (
                        <input
                          autoFocus
                          value={borrador}
                          aria-label={`Editar celda ${celda.filaIndice}-${celda.celdaIndice}`}
                          onChange={(e) => setBorrador(e.target.value)}
                          onBlur={confirmar}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') confirmar();
                            if (e.key === 'Escape') setEditando(null);
                          }}
                          style={{
                            width: '100%',
                            font: 'inherit',
                            color: 'var(--paper-ink)',
                            background: 'var(--paper-white)',
                            border: '1px solid var(--color-accent)',
                            borderRadius: 'var(--radius-xs)',
                            padding: '2px 4px',
                          }}
                        />
                      ) : (
                        <span
                          onClick={
                            puedeEditar
                              ? () => {
                                  setBorrador(celda.texto);
                                  setEditando({ fila: celda.filaIndice, col: celda.celdaIndice });
                                }
                              : undefined
                          }
                          onKeyDown={
                            puedeEditar
                              ? (e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    setBorrador(celda.texto);
                                    setEditando({ fila: celda.filaIndice, col: celda.celdaIndice });
                                  }
                                }
                              : undefined
                          }
                          role={puedeEditar ? 'button' : undefined}
                          tabIndex={puedeEditar ? 0 : undefined}
                          aria-label={puedeEditar ? `Editar celda ${celda.filaIndice}-${celda.celdaIndice}` : undefined}
                          style={puedeEditar ? { cursor: 'text', display: 'block' } : { display: 'block' }}
                        >
                          {celda.texto}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {esContinuacion ? (
        <div
          style={{
            marginTop: 'var(--space-1)',
            fontSize: 'var(--text-xs)',
            fontStyle: 'italic',
            color: 'var(--color-text-tertiary)',
          }}
        >
          Continúa
        </div>
      ) : null}

      {tabla.note && esUltima ? (
        <div style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)' }}>
          <span style={{ fontStyle: 'italic', fontWeight: 600 }}>Nota.</span> {tabla.note}
        </div>
      ) : null}
    </figure>
  );
};

export default TablaRender;
