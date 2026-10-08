import React from 'react';
import { RotateCw, Image as ImageIcon, ImagePlus } from 'lucide-react';
import { IconoLeyenda } from './IconosFiguras';
import { TablaRender } from './TablaRender';
import { MascotaLeyendaIA } from './MascotaLeyendaIA';
import { medidaDeFigura, type TipoFigura } from '../../lib/figuras';
import type { DesignStyle, TableModel, CellSpan, TableStylePreset } from '../../types';

export interface AISuggestionData {
  suggestedTitle: string;
  suggestedNote: string;
  /** Opcional: el endpoint de sugerencia devuelve solo el texto, y un número de
   *  confianza inventado sería un dato falso. Cuando no viene, no se pinta. */
  confidence?: number;
}

export interface LienzoEditorialActivoProps {
  figureNumber: number;
  figureTitle: string;
  figureNote?: string;
  imageUrl?: string;
  /** El tipo de activo. Decide el rótulo (Figura/Tabla) y qué cuerpo se pinta. */
  tipo?: TipoFigura;
  /** Datos de la tabla cuando `tipo` es `'table'`. */
  tabla?: {
    headers: string[];
    rows: string[][];
    header_spans?: CellSpan[];
    row_spans?: CellSpan[][];
    style?: TableStylePreset;
  } | null;
  /** Tamaño DECLARADO en el `.docx`, para pintar la imagen a escala real. */
  anchoCm?: number | null;
  altoCm?: number | null;
  prevParagraph?: string;
  nextParagraph?: string;
  aiSuggestion?: AISuggestionData;
  aiLoading?: boolean;
  aiError?: string;
  onRotate?: () => void;
  onReplaceImage?: () => void;
  onApplyCaption?: (caption: { title: string; note: string }) => void;
  /** Edición de una celda de tabla: devuelve el patch de encabezados o filas. */
  onEditarCeldaTabla?: (patch: { headers?: string[]; rows?: string[][] }) => void;
  /** Vuelve a pedir la sugerencia al motor de IA para el activo actual. */
  onRegenerateSuggestion?: () => void;
  /** Genera la sugerencia bajo demanda (opt-in; sin gasto automático de tokens). */
  onGenerarSuggestion?: () => void;
  /** Presentación del marco (tokens, no valores crudos). */
  border?: 'none' | 'subtle' | 'strong';
  shadow?: boolean;
  cornerRadius?: 'none' | 'sm' | 'md' | 'lg';
  /** Rotación exacta en grados (0 por defecto). */
  rotation?: number;
  flipH?: boolean;
  flipV?: boolean;
  /** Preset de diseño; multipanel y corner dibujan malla de subfiguras. */
  designStyle?: DesignStyle;
  /** Paneles adicionales ya resueltos: (b), (c), (d)... */
  subfiguras?: SubfiguraVista[];
  /** Abre el selector de archivo para llenar el slot indicado. */
  onImportSubfigure?: (slot: number) => void;
}

export interface SubfiguraVista {
  label: string;
  title?: string;
  url?: string;
}

const BORDE_MARCO: Record<'none' | 'subtle' | 'strong', string> = {
  none: 'none',
  subtle: '1px solid var(--color-border-subtle)',
  strong: '1px solid var(--color-border-strong)',
};
const RADIO_MARCO: Record<'none' | 'sm' | 'md' | 'lg', string> = {
  none: '0px',
  sm: 'var(--radius-sm)',
  md: 'var(--radius-md)',
  lg: 'var(--radius-lg)',
};

export const LienzoEditorialActivo: React.FC<LienzoEditorialActivoProps> = ({
  figureNumber,
  figureTitle,
  figureNote,
  imageUrl,
  tipo = 'image',
  tabla,
  anchoCm,
  altoCm,
  prevParagraph,
  nextParagraph,
  aiSuggestion,
  aiLoading,
  aiError,
  onRotate,
  onReplaceImage,
  onApplyCaption,
  onEditarCeldaTabla,
  onRegenerateSuggestion,
  onGenerarSuggestion,
  border = 'none',
  shadow = false,
  cornerRadius = 'none',
  rotation = 0,
  flipH = false,
  flipV = false,
  designStyle,
  subfiguras,
  onImportSubfigure,
}) => {
  const esTabla =
    tipo === 'table' &&
    Array.isArray(tabla?.headers) &&
    Array.isArray(tabla?.rows) &&
    (tabla!.headers.length > 0 || tabla!.rows.length > 0);
  const tablaCompleta: TableModel | null =
    esTabla && tabla
      ? {
          element_id: 'lienzo-activo',
          headers: tabla.headers,
          rows: tabla.rows,
          caption: figureTitle,
          table_number: figureNumber,
          header_spans: tabla.header_spans,
          row_spans: tabla.row_spans,
          style: tabla.style,
        }
      : null;
  const rotulo = tipo === 'table' ? 'Tabla' : tipo === 'equation' ? 'Ecuación' : 'Figura';
  const medida = medidaDeFigura({ width_cm: anchoCm ?? undefined, height_cm: altoCm ?? undefined });
  // Multipanel: la imagen principal ocupa (a) y los demás paneles se importan.
  const esMultipanel = tipo === 'image' && (designStyle === 'multipanel' || designStyle === 'corner');
  const numeroSlots = designStyle === 'corner' ? 4 : 2;
  const renderSlot = (i: number) => {
    const etiqueta = `(${String.fromCharCode(97 + i)})`;
    const sub = i === 0 ? undefined : subfiguras?.[i - 1];
    const url = i === 0 ? imageUrl : sub?.url;
    if (url) {
      return (
        <figure key={i} style={{ margin: 0, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <img
            src={url}
            alt={sub?.title || `Subfigura ${etiqueta}`}
            style={{ width: '100%', maxHeight: '220px', objectFit: 'contain', display: 'block' }}
          />
          <figcaption style={{ textAlign: 'center', fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
            {etiqueta}{sub?.title ? ` ${sub.title}` : ''}
          </figcaption>
        </figure>
      );
    }
    return (
      <button
        key={i}
        type="button"
        aria-label={`Importar subfigura ${etiqueta}`}
        onClick={() => onImportSubfigure?.(i)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          minHeight: '140px',
          padding: 'var(--space-3)',
          border: '1px dashed var(--color-border-subtle)',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--color-bg-surface)',
          color: 'var(--color-text-tertiary)',
          cursor: 'pointer',
          fontSize: '12px',
        }}
      >
        <ImagePlus size={22} />
        <span>{etiqueta} Importar</span>
      </button>
    );
  };
  return (
    <div
      data-testid="editorial-reading-canvas"
      className="fig-taller fig-paper"
      style={{
        padding: 'var(--space-8)',
        margin: '0 auto',
        maxWidth: '820px',
        backgroundColor: 'var(--paper-white)',
        color: 'var(--paper-ink)',
        fontFamily: 'var(--font-sans)',
        border: '1px solid var(--color-border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      {/* Párrafo anterior: prosa del manuscrito, serif de papel */}
      {prevParagraph && (
        <p
          className="font-serif indent-8 text-justify mb-6"
          style={{ fontSize: '15px', lineHeight: 1.7, color: 'var(--paper-ink)' }}
        >
          {prevParagraph}
        </p>
      )}

      {/* Bloque APA 7 de Figura — sin tarjeta: jerarquía por tinta y hairlines */}
      <figure style={{ margin: '0 0 var(--space-6)' }}>
        {/* Rótulo: negrita, línea propia (APA 7) */}
        <div
          className="font-bold"
          style={{ fontSize: '14px', color: 'var(--paper-ink)', letterSpacing: '0.01em' }}
        >
          {rotulo} {figureNumber}
        </div>

        {/* Título: cursiva, línea separada (APA 7) */}
        <div
          className="italic"
          style={{ fontSize: '14px', color: 'var(--paper-ink)', margin: '2px 0 var(--space-3)' }}
        >
          {figureTitle}
        </div>

        {esTabla && tablaCompleta ? (
          <TablaRender
            tabla={tablaCompleta}
            editable
            mostrarLeyenda={false}
            onEditarCelda={(fila, col, texto) => {
              if (fila === 0) {
                const headers = [...tablaCompleta.headers];
                headers[col] = texto;
                onEditarCeldaTabla?.({ headers });
              } else {
                const rows = tablaCompleta.rows.map((r) => [...r]);
                if (rows[fila - 1]) rows[fila - 1][col] = texto;
                onEditarCeldaTabla?.({ rows });
              }
            }}
          />
        ) : (
          <>
        {/* Marco de imagen plano con controles flotantes */}
        <div
          data-testid="figura-marco"
          style={{
            position: 'relative',
            border: BORDE_MARCO[border],
            borderRadius: RADIO_MARCO[cornerRadius],
            boxShadow: shadow ? 'var(--shadow-sm)' : 'none',
            backgroundColor: 'var(--color-bg-surface-alt)',
            minHeight: '220px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          {esMultipanel ? (
            <div
              data-testid="marco-multipanel"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 'var(--space-2)',
                width: '100%',
                alignContent: 'center',
              }}
            >
              {Array.from({ length: numeroSlots }, (_, i) => renderSlot(i))}
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt={`Figura ${figureNumber}`}
              className="fig-media-img"
              style={{
                width: medida.declarada ? `${medida.anchoPx}px` : undefined,
                maxHeight: medida.declarada ? undefined : '380px',
                height: medida.declarada ? `${medida.altoPx}px` : 'auto',
                maxWidth: '100%',
                objectFit: 'contain',
                display: 'block',
                margin: '0 auto',
                transform:
                  rotation || flipH || flipV
                    ? `rotate(${rotation}deg) scaleX(${flipH ? -1 : 1}) scaleY(${flipV ? -1 : 1})`
                    : undefined,
              }}
            />
          ) : (
            <div
              style={{
                padding: 'var(--space-10) var(--space-4)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 'var(--space-2)',
                color: 'var(--color-text-tertiary)',
                fontSize: '12px',
              }}
            >
              <IconoLeyenda size={28} color="var(--color-text-tertiary)" />
              <span>Sin vista previa</span>
            </div>
          )}

          {(onRotate || onReplaceImage) && (
            <div
              style={{
                position: 'absolute',
                top: 'var(--space-2)',
                right: 'var(--space-2)',
                display: 'flex',
                alignItems: 'center',
                gap: '2px',
                padding: '2px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'var(--color-bg-surface)',
                border: '1px solid var(--color-border-subtle)',
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {onRotate && (
                <button
                  type="button"
                  onClick={onRotate}
                  title="Rotar 90°"
                  aria-label="Rotar imagen"
                  className="fig-media-btn"
                >
                  <RotateCw size={15} />
                </button>
              )}
              {onReplaceImage && (
                <button
                  type="button"
                  onClick={onReplaceImage}
                  title="Reemplazar archivo"
                  aria-label="Reemplazar imagen"
                  className="fig-media-btn"
                >
                  <ImageIcon size={15} />
                </button>
              )}
            </div>
          )}
        </div>
          </>
        )}

        {/* Nota de la figura */}
        {figureNote && (
          <figcaption
            style={{
              fontSize: '12px',
              lineHeight: 1.5,
              color: 'var(--color-text-secondary)',
              marginTop: 'var(--space-2)',
            }}
          >
            {figureNote}
          </figcaption>
        )}
      </figure>

      {/* Leyenda IA — la mascota propone; el botón es la única puerta (D-8) */}
      <MascotaLeyendaIA
        sugerida={
          aiSuggestion
            ? {
                titulo: aiSuggestion.suggestedTitle,
                nota: aiSuggestion.suggestedNote,
                confianza: aiSuggestion.confidence,
              }
            : undefined
        }
        cargando={aiLoading}
        error={aiError}
        onGenerar={onGenerarSuggestion ?? (() => {})}
        onAplicar={
          onApplyCaption
            ? (s) => onApplyCaption({ title: s.titulo, note: s.nota ?? '' })
            : undefined
        }
        onRegenerar={onRegenerateSuggestion}
      />

      {/* Párrafo posterior */}
      {nextParagraph && (
        <p
          className="font-serif indent-8 text-justify mt-6"
          style={{ fontSize: '15px', lineHeight: 1.7, color: 'var(--paper-ink)' }}
        >
          {nextParagraph}
        </p>
      )}
    </div>
  );
};
