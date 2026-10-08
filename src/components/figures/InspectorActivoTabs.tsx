import React, { useEffect, useState } from 'react';
import type { ElementModel, DesignStyle } from '../../types';
import {
  Sliders,
  Type,
  Palette,
  ShieldCheck,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  FlipHorizontal2,
  FlipVertical2,
  LucideIcon,
} from 'lucide-react';
import { dpiEfectivo, ratioDeDimensiones, altoProporcional, esBajaResolucion, DPI_MIN } from '../../lib/imagenFormato';
import { TablaEstiloSelector } from './TablaEstiloSelector';
import { PRESETS_TABLA } from '../../lib/tablaRender';
import { suggestCaption } from '../../api/backend';
import { useDocStore } from '../../store/useDocStore';

export type InspectorTabKey = 'formato' | 'texto' | 'estilo' | 'calidad';

type BordeActivo = 'none' | 'subtle' | 'strong';
type EsquinasActivas = 'none' | 'sm' | 'md' | 'lg';

/** Ancho nativo en píxeles de una imagen, leído del propio archivo. */
function useAnchoPixeles(url?: string): number | null {
  const [ancho, setAncho] = useState<number | null>(null);
  useEffect(() => {
    if (!url) {
      setAncho(null);
      return;
    }
    let vivo = true;
    const img = new Image();
    img.onload = () => {
      if (vivo) setAncho(img.naturalWidth || null);
    };
    img.onerror = () => {
      if (vivo) setAncho(null);
    };
    img.src = url;
    return () => {
      vivo = false;
    };
  }, [url]);
  return ancho;
}

/** Parche de un activo: campos de imagen y de tabla, según el tipo del elemento. */
export type ActivoPatch = Partial<NonNullable<ElementModel['image_info']>> &
  Partial<NonNullable<ElementModel['table_info']>>;

export interface InspectorActivoTabsProps {
  elem: ElementModel;
  totalFiguras: number;
  totalTablas?: number;
  onUpdate: (id: string, patch: ActivoPatch) => void;
  onApplyToAll: () => void;
  onApplyTableToAll?: (patch: ActivoPatch) => void;
}

interface StylePreset {
  value: DesignStyle;
  label: string;
  desc: string;
  badge?: string;
  renderThumbnail: () => React.ReactNode;
}

/* Escala tipográfica deliberada del inspector: tres roles, no una colección
   de tamaños vecinos. El encabezado de sección retrocede (tertiary, versalitas),
   la etiqueta de campo guía (secondary) y el valor de control es el
   protagonista (primary, un paso mayor). */
const sectionLabel: React.CSSProperties = {
  fontSize: '10px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--color-text-tertiary)',
};
const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 500,
  color: 'var(--color-text-secondary)',
  marginBottom: '4px',
};
const fieldStyle: React.CSSProperties = {
  width: '100%',
  padding: '6px 8px',
  fontSize: '12px',
  fontFamily: 'var(--font-sans)',
  fontVariantNumeric: 'tabular-nums',
  border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-sm)',
  backgroundColor: 'var(--color-bg-surface-alt)',
  color: 'var(--color-text-primary)',
  boxSizing: 'border-box',
};
const hairline: React.CSSProperties = { height: '1px', backgroundColor: 'var(--color-border-subtle)' };

const STYLE_PRESETS: StylePreset[] = [
  {
    value: 'standard',
    label: 'APA Estándar',
    desc: 'Figura centrada con etiqueta y título en líneas separadas arriba.',
    badge: 'Oficial',
    renderThumbnail: () => (
      <svg width="48" height="30" viewBox="0 0 48 34" fill="none" aria-hidden>
        <rect x="2" y="2" width="44" height="30" rx="2" fill="var(--color-bg-surface-alt)" stroke="var(--color-border-subtle)" strokeWidth={1.75} />
        <rect x="8" y="5" width="16" height="2" rx="1" fill="var(--color-accent)" />
        <rect x="8" y="9" width="28" height="2" rx="1" fill="var(--color-text-secondary)" />
        <rect x="12" y="14" width="24" height="14" rx="2" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
      </svg>
    ),
  },
  {
    value: 'scientific',
    label: 'Científico',
    desc: 'Borde perimetral técnico con Figura N en negrita y nota al pie estructurada.',
    badge: 'Técnico',
    renderThumbnail: () => (
      <svg width="48" height="30" viewBox="0 0 48 34" fill="none" aria-hidden>
        <rect x="2" y="2" width="44" height="30" rx="2" fill="var(--color-bg-surface-alt)" stroke="var(--color-border-subtle)" strokeWidth={1.75} />
        <rect x="6" y="5" width="36" height="24" rx="2" fill="transparent" stroke="var(--color-border-subtle)" strokeWidth={1.75} strokeDasharray="2 2" />
        <rect x="10" y="8" width="28" height="14" rx="1" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
        <rect x="10" y="24" width="20" height="2" rx="1" fill="var(--color-text-tertiary)" />
      </svg>
    ),
  },
  {
    value: 'full_width',
    label: 'Ancho Completo',
    desc: 'Ocupa el 100% del margen útil de la página. Ideal para mapas o planos.',
    renderThumbnail: () => (
      <svg width="48" height="30" viewBox="0 0 48 34" fill="none" aria-hidden>
        <rect x="2" y="2" width="44" height="30" rx="2" fill="var(--color-bg-surface-alt)" stroke="var(--color-border-subtle)" strokeWidth={1.75} />
        <rect x="4" y="6" width="40" height="20" rx="2" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
        <rect x="4" y="28" width="26" height="2" rx="1" fill="var(--color-text-tertiary)" />
      </svg>
    ),
  },
  {
    value: 'sidebar',
    label: 'Compacto / Flotante',
    desc: 'Cuadro lateral estrecho con ajuste de texto continuo.',
    renderThumbnail: () => (
      <svg width="48" height="30" viewBox="0 0 48 34" fill="none" aria-hidden>
        <rect x="2" y="2" width="44" height="30" rx="2" fill="var(--color-bg-surface-alt)" stroke="var(--color-border-subtle)" strokeWidth={1.75} />
        <rect x="26" y="6" width="16" height="22" rx="2" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
        <rect x="6" y="8" width="16" height="2" rx="1" fill="var(--color-text-tertiary)" />
        <rect x="6" y="13" width="16" height="2" rx="1" fill="var(--color-text-tertiary)" />
        <rect x="6" y="18" width="16" height="2" rx="1" fill="var(--color-text-tertiary)" />
      </svg>
    ),
  },
  {
    value: 'multipanel',
    label: 'Doble Horizontal (a, b)',
    desc: 'Dos subfiguras en paralelo rotuladas como (a) y (b) lado a lado.',
    badge: 'Doble',
    renderThumbnail: () => (
      <svg width="48" height="30" viewBox="0 0 48 34" fill="none" aria-hidden>
        <rect x="2" y="2" width="44" height="30" rx="2" fill="var(--color-bg-surface-alt)" stroke="var(--color-border-subtle)" strokeWidth={1.75} />
        <rect x="6" y="7" width="16" height="15" rx="2" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
        <rect x="26" y="7" width="16" height="15" rx="2" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
        <rect x="12" y="25" width="4" height="2" rx="1" fill="var(--color-accent)" />
        <rect x="32" y="25" width="4" height="2" rx="1" fill="var(--color-accent)" />
      </svg>
    ),
  },
  {
    value: 'corner',
    label: 'Cuadrícula 2×2 (a, b, c, d)',
    desc: 'Malla compacta de subfiguras para estudios comparativos complejos.',
    badge: 'Malla',
    renderThumbnail: () => (
      <svg width="48" height="30" viewBox="0 0 48 34" fill="none" aria-hidden>
        <rect x="2" y="2" width="44" height="30" rx="2" fill="var(--color-bg-surface-alt)" stroke="var(--color-border-subtle)" strokeWidth={1.75} />
        <rect x="7" y="5" width="15" height="10" rx="1" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
        <rect x="26" y="5" width="15" height="10" rx="1" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
        <rect x="7" y="18" width="15" height="10" rx="1" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
        <rect x="26" y="18" width="15" height="10" rx="1" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth={1.75} />
      </svg>
    ),
  },
];

export const InspectorActivoTabs: React.FC<InspectorActivoTabsProps> = ({
  elem,
  totalFiguras,
  totalTablas = 1,
  onUpdate,
  onApplyToAll,
  onApplyTableToAll,
}) => {
  const [tabActiva, setTabActiva] = useState<InspectorTabKey>('formato');
  const [alcance, setAlcance] = useState<'esta' | 'todas'>('esta');
  const [alcanceTabla, setAlcanceTabla] = useState<'esta' | 'todas'>('esta');

  // Las tablas no tienen imagen: ocultar todo control exclusivo de figura.
  const esTabla = elem.type === 'table';

  const imgInfo = (elem.image_info || {}) as Partial<NonNullable<ElementModel['image_info']>>;
  const tablaInfo = (elem.table_info || {}) as Partial<NonNullable<ElementModel['table_info']>>;
  const infoTexto = esTabla ? tablaInfo : imgInfo;
  const widthCm = typeof imgInfo.width_cm === 'number' ? imgInfo.width_cm : 14.5;
  const heightCm = typeof imgInfo.height_cm === 'number' ? imgInfo.height_cm : 9.0;
  const alignment = imgInfo.alignment || 'center';
  const caption = infoTexto.caption || '';
  const note = infoTexto.note || '';
  const altText = esTabla ? '' : imgInfo.alt_text || '';
  const numeroActivo = esTabla ? tablaInfo.table_number ?? null : imgInfo.figure_number ?? null;
  const currentStyle: DesignStyle = imgInfo.design_style || 'standard';
  const constrain = imgInfo.constrain_proportions !== false;
  const border: BordeActivo = imgInfo.border || 'none';
  const shadow = Boolean(imgInfo.shadow);
  const esquinas: EsquinasActivas = imgInfo.corner_radius || 'none';
  const rotation = typeof imgInfo.rotation === 'number' ? imgInfo.rotation : 0;
  const flipH = Boolean(imgInfo.flip_h);
  const flipV = Boolean(imgInfo.flip_v);
  const pixelesAncho = useAnchoPixeles(esTabla ? undefined : imgInfo.relative_url);
  const dpi = pixelesAncho ? dpiEfectivo(pixelesAncho, widthCm) : null;

  const checks: { id: string; passed: boolean; label: string; failMessage: string }[] = [
    {
      id: 'caption',
      passed: Boolean(caption && caption.trim().length > 0),
      label: 'Título breve y descriptivo en cursiva',
      failMessage: 'Falta título o leyenda en la figura.',
    },
    ...(!esTabla
      ? [
          {
            id: 'width',
            passed: widthCm <= 16.5,
            label: 'Ancho dentro del margen útil (≤ 16.5 cm)',
            failMessage: `Excede ancho de caja útil (${widthCm.toFixed(1)} cm > 16.5 cm).`,
          },
          {
            id: 'alt',
            passed: Boolean(altText && altText.trim().length > 0),
            label: 'Texto alternativo para lectores de pantalla',
            failMessage: 'Sin texto alternativo accesible.',
          },
          ...(dpi !== null
            ? [
                {
                  id: 'dpi',
                  passed: !esBajaResolucion(dpi),
                  label: `Resolución suficiente (≥ ${DPI_MIN} ppp)`,
                  failMessage: `Imagen de baja resolución (${dpi} ppp < ${DPI_MIN} ppp).`,
                },
              ]
            : []),
        ]
      : []),
  ];
  const cumpidos = checks.filter((c) => c.passed).length;
  const todoConforme = cumpidos === checks.length;

  const handleUpdate = (patch: ActivoPatch) => {
    onUpdate(elem.id, patch);
  };

  const [autocompletando, setAutocompletando] = useState(false);

  const handleAutocompletar = async () => {
    let tituloSugerido = caption;
    if (!tituloSugerido) {
      setAutocompletando(true);
      try {
        const doc = useDocStore.getState().doc;
        const apiKey = useDocStore.getState().apiKey;
        if (doc?.session_id) {
          const res = await suggestCaption(
            doc.session_id,
            elem.id,
            altText || 'Figura o imagen académica',
            apiKey ?? undefined
          );
          if (res) tituloSugerido = res;
        }
      } catch (err) {
        console.warn('No se pudo generar leyenda con IA para autocompletar:', err);
      } finally {
        setAutocompletando(false);
      }
    }

    handleUpdate({
      width_cm: Math.min(widthCm, 15.0),
      alignment: 'center',
      design_style: 'standard',
      caption: tituloSugerido || 'Figura de estudio',
      note: note || 'Nota. Adaptado para cumplimiento de formato general APA 7ma edición.',
      alt_text: altText || 'Gráfico informativo del documento.',
    });
  };

  // Al cambiar el ancho con proporción bloqueada, el alto acompaña.
  const cambiarAncho = (v: number) => {
    const patch: ActivoPatch = { width_cm: v };
    const r = ratioDeDimensiones(widthCm, heightCm);
    if (constrain && r) patch.height_cm = altoProporcional(v, r);
    handleUpdate(patch);
  };

  const btnMarco: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    padding: '7px 4px',
    fontSize: '11px',
    cursor: 'pointer',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--color-border-subtle)',
    backgroundColor: 'var(--color-bg-surface-alt)',
    color: 'var(--color-text-secondary)',
    transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
  };
  const activoMarco: React.CSSProperties = {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-soft)',
    color: 'var(--color-accent)',
  };

  const tabs: { key: InspectorTabKey; label: string; icon: LucideIcon }[] = [
    ...(esTabla ? [] : [{ key: 'formato' as const, label: 'Formato', icon: Sliders }]),
    { key: 'texto', label: 'Texto', icon: Type },
    { key: 'estilo', label: 'Estilo', icon: Palette },
    { key: 'calidad', label: 'Calidad', icon: ShieldCheck },
  ];
  // Si el cambio de activo deja la pestaña activa fuera de las disponibles
  // (p. ej. estaba en Estilo y ahora es una tabla), caer a la primera válida.
  const tabEfectiva: InspectorTabKey = tabs.some((t) => t.key === tabActiva)
    ? tabActiva
    : tabs[0].key;

  const alignBtn = (valor: 'left' | 'center' | 'right', label: string, Icon: LucideIcon) => {
    const activo = alignment === valor;
    return (
      <button
        type="button"
        aria-label={`Alinear ${label}`}
        onClick={() => handleUpdate({ alignment: valor })}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '4px',
          padding: '7px 4px',
          fontSize: '11px',
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${activo ? 'var(--color-accent)' : 'var(--color-border-subtle)'}`,
          backgroundColor: activo ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
          color: activo ? 'var(--color-accent)' : 'var(--color-text-secondary)',
          transition: 'background-color var(--transition-fast), border-color var(--transition-fast)',
        }}
      >
        <Icon size={13} />
        <span>{label === 'Izquierda' ? 'Izq' : label === 'Derecha' ? 'Der' : 'Centro'}</span>
      </button>
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        minWidth: 0,
        flexShrink: 0,
        backgroundColor: 'var(--color-bg-surface)',
        borderLeft: '1px solid var(--color-border-subtle)',
        fontFamily: 'var(--font-sans)',
        fontSize: '12px',
        color: 'var(--color-text-primary)',
      }}
    >
      {/* Pestañas planas, sin tarjeta */}
      <div
        role="tablist"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${tabs.length}, 1fr)`,
          borderBottom: '1px solid var(--color-border-subtle)',
          backgroundColor: 'var(--color-bg-surface)',
        }}
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActiva = tabEfectiva === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActiva}
              onClick={() => setTabActiva(tab.key)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '9px 4px',
                border: 'none',
                borderBottom: isActiva ? '2px solid var(--color-accent)' : '2px solid transparent',
                backgroundColor: isActiva ? 'var(--color-accent-soft)' : 'transparent',
                color: isActiva ? 'var(--color-accent)' : 'var(--color-text-tertiary)',
                fontWeight: isActiva ? 600 : 500,
                fontSize: '11px',
                cursor: 'pointer',
                transition: 'background-color var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast)',
              }}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Contenido */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: 'var(--space-4)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
        }}
      >
        {/* ── FORMATO ── */}
        {tabEfectiva === 'formato' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={sectionLabel}>Dimensiones</span>
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>
                  {widthCm.toFixed(1)} × {heightCm.toFixed(1)} cm
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <div>
                  <label htmlFor="field-ancho-cm" style={fieldLabel}>
                    Ancho (cm)
                  </label>
                  <input
                    id="field-ancho-cm"
                    type="number"
                    step="0.1"
                    min="3"
                    max="20"
                    value={widthCm}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!Number.isNaN(v)) cambiarAncho(v);
                    }}
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label htmlFor="field-alto-cm" style={fieldLabel}>
                    Alto (cm)
                  </label>
                  <input
                    id="field-alto-cm"
                    type="number"
                    step="0.1"
                    min="2"
                    max="25"
                    value={heightCm}
                    readOnly={constrain}
                    aria-readonly={constrain}
                    title={constrain ? 'Se calcula desde el ancho (proporción bloqueada)' : undefined}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value);
                      if (!Number.isNaN(v)) handleUpdate({ height_cm: v });
                    }}
                    style={{ ...fieldStyle, opacity: constrain ? 0.6 : 1, cursor: constrain ? 'not-allowed' : 'text' }}
                  />
                </div>
              </div>

              <input
                aria-label="Slider de ancho"
                type="range"
                min="5"
                max="17"
                step="0.5"
                value={widthCm}
                onChange={(e) => cambiarAncho(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--color-accent)', marginTop: '2px' }}
              />

              <label htmlFor="field-proporcion" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '2px' }}>
                <input
                  id="field-proporcion"
                  type="checkbox"
                  checked={constrain}
                  onChange={(e) => handleUpdate({ constrain_proportions: e.target.checked })}
                  style={{ accentColor: 'var(--color-accent)' }}
                />
                <span style={{ ...fieldLabel, marginBottom: 0 }}>Alto automático (conservar proporción)</span>
              </label>
            </div>

            <div style={hairline} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <span style={sectionLabel}>Alineación</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                {alignBtn('left', 'Izquierda', AlignLeft)}
                {alignBtn('center', 'Centro', AlignCenter)}
                {alignBtn('right', 'Derecha', AlignRight)}
              </div>
            </div>

            <div style={hairline} />

            {/* Marco: borde, sombra y esquinas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={sectionLabel}>Marco</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <div>
                  <label htmlFor="field-borde" style={fieldLabel}>Borde</label>
                  <select
                    id="field-borde"
                    value={border}
                    onChange={(e) => handleUpdate({ border: e.target.value as BordeActivo })}
                    style={fieldStyle}
                  >
                    <option value="none">Sin borde</option>
                    <option value="subtle">Sutil</option>
                    <option value="strong">Marcado</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="field-esquinas" style={fieldLabel}>Esquinas</label>
                  <select
                    id="field-esquinas"
                    value={esquinas}
                    onChange={(e) => handleUpdate({ corner_radius: e.target.value as EsquinasActivas })}
                    style={fieldStyle}
                  >
                    <option value="none">Rectas</option>
                    <option value="sm">Suaves</option>
                    <option value="md">Redondeadas</option>
                    <option value="lg">Muy redondeadas</option>
                  </select>
                </div>
              </div>
              <label htmlFor="field-sombra" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input
                  id="field-sombra"
                  type="checkbox"
                  checked={shadow}
                  onChange={(e) => handleUpdate({ shadow: e.target.checked })}
                  style={{ accentColor: 'var(--color-accent)' }}
                />
                <span style={{ ...fieldLabel, marginBottom: 0 }}>Sombra</span>
              </label>
            </div>

            <div style={hairline} />

            {/* Rotación y espejo */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={sectionLabel}>Rotación</span>
                <span style={{ fontSize: '12px', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-accent)' }}>
                  {rotation}°
                </span>
              </div>
              <input
                aria-label="Rotación (grados)"
                type="range"
                min="-180"
                max="180"
                step="1"
                value={rotation}
                onChange={(e) => handleUpdate({ rotation: parseInt(e.target.value, 10) })}
                style={{ width: '100%', accentColor: 'var(--color-accent)' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <button
                  type="button"
                  aria-label="Voltear horizontal"
                  aria-pressed={flipH}
                  onClick={() => handleUpdate({ flip_h: !flipH })}
                  style={{ ...btnMarco, ...(flipH ? activoMarco : {}) }}
                >
                  <FlipHorizontal2 size={13} />
                  <span>Voltear H</span>
                </button>
                <button
                  type="button"
                  aria-label="Voltear vertical"
                  aria-pressed={flipV}
                  onClick={() => handleUpdate({ flip_v: !flipV })}
                  style={{ ...btnMarco, ...(flipV ? activoMarco : {}) }}
                >
                  <FlipVertical2 size={13} />
                  <span>Voltear V</span>
                </button>
              </div>
            </div>

            <div style={hairline} />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <label htmlFor="select-alcance" style={sectionLabel}>
                Alcance
              </label>
              <select
                id="select-alcance"
                aria-label="Alcance"
                value={alcance}
                onChange={(e) => setAlcance(e.target.value as 'esta' | 'todas')}
                style={fieldStyle}
              >
                <option value="esta">Solo esta figura</option>
                <option value="todas">Todas las figuras ({totalFiguras})</option>
              </select>

              {alcance === 'todas' && (
                <button type="button" onClick={onApplyToAll} className="fig-apply-btn" style={{ justifyContent: 'center' }}>
                  <Sliders size={13} />
                  <span>Aplicar a todas las figuras</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── TEXTO ── */}
        {tabEfectiva === 'texto' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                <label htmlFor="field-caption" style={{ ...fieldLabel, fontWeight: 600 }}>
                  Título / Leyenda
                </label>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-tertiary)' }}>
                  {caption.length} caracteres
                </span>
              </div>
              <input
                id="field-caption"
                type="text"
                value={caption}
                onChange={(e) => handleUpdate({ caption: e.target.value })}
                placeholder="Ej. Distribución de respuestas según cohorte..."
                style={fieldStyle}
              />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' }}>
                <label htmlFor="field-note" style={{ ...fieldLabel, fontWeight: 600 }}>
                  Nota al pie
                </label>
                <span style={{ fontSize: '11px', fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', color: 'var(--color-text-tertiary)' }}>
                  {note.length} caracteres
                </span>
              </div>
              <textarea
                id="field-note"
                rows={3}
                value={note}
                onChange={(e) => handleUpdate({ note: e.target.value })}
                placeholder="Nota. Datos obtenidos mediante muestreo aleatorio estratificado..."
                style={{ ...fieldStyle, resize: 'vertical' }}
              />
            </div>
            {!esTabla && (
              <div>
                <label htmlFor="field-alt-text" style={{ ...fieldLabel, fontWeight: 600 }}>
                  Texto alternativo
                </label>
                <input
                  id="field-alt-text"
                  type="text"
                  value={altText}
                  onChange={(e) => handleUpdate({ alt_text: e.target.value })}
                  placeholder="Descripción para lectores de pantalla..."
                  style={fieldStyle}
                />
              </div>
            )}

            {/* Mini vista previa: rótulo, título en cursiva y nota, como se leen en la hoja */}
            <div
              data-testid="texto-preview"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                padding: 'var(--space-3)',
                border: '1px dashed var(--color-border-subtle)',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--color-bg-surface-alt)',
              }}
            >
              <span style={sectionLabel}>Vista previa</span>
              <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--color-text-primary)' }}>
                {esTabla ? 'Tabla' : 'Figura'} {numeroActivo}
              </span>
              {caption ? (
                <span style={{ fontStyle: 'italic', fontSize: '12px', color: 'var(--color-text-primary)' }}>{caption}</span>
              ) : (
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>Sin título todavía</span>
              )}
              {note && (
                <span style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>Nota. {note}</span>
              )}
            </div>

          </div>
        )}

        {/* ── ESTILO: malla 2 columnas; la miniatura es la descripción ── */}
        {tabEfectiva === 'estilo' && esTabla && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={sectionLabel}>Diseño y Estilo APA ({PRESETS_TABLA.length})</span>
              <TablaEstiloSelector
                valor={(tablaInfo.style as any) || 'apa'}
                onChange={(p) => handleUpdate({ style: p } as ActivoPatch)}
              />
            </div>

            {/* Orientación de página: opción para tablas anchas */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
              <span style={sectionLabel}>Orientación de la página</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
                <button
                  type="button"
                  aria-pressed={(tablaInfo.orientation || 'portrait') === 'portrait'}
                  onClick={() => handleUpdate({ orientation: 'portrait' } as ActivoPatch)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1.5px solid ${(tablaInfo.orientation || 'portrait') === 'portrait' ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    backgroundColor: (tablaInfo.orientation || 'portrait') === 'portrait' ? 'var(--color-accent-soft)' : 'var(--surface-subtle)',
                    color: 'var(--text-main)',
                    fontSize: '11px',
                    fontWeight: (tablaInfo.orientation || 'portrait') === 'portrait' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="18" viewBox="0 0 14 18" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1" y="1" width="12" height="16" rx="2" />
                  </svg>
                  <span>Vertical</span>
                </button>
                <button
                  type="button"
                  aria-pressed={tablaInfo.orientation === 'landscape'}
                  onClick={() => handleUpdate({ orientation: 'landscape' } as ActivoPatch)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1.5px solid ${tablaInfo.orientation === 'landscape' ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    backgroundColor: tablaInfo.orientation === 'landscape' ? 'var(--color-accent-soft)' : 'var(--surface-subtle)',
                    color: 'var(--text-main)',
                    fontSize: '11px',
                    fontWeight: tablaInfo.orientation === 'landscape' ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  <svg width="18" height="14" viewBox="0 0 18 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="1" y="1" width="16" height="12" rx="2" />
                  </svg>
                  <span>Horizontal (Ancha)</span>
                </button>
              </div>
              <span style={{ fontSize: '10.5px', color: 'var(--color-text-tertiary)', lineHeight: 1.3 }}>
                Gira la hoja a apaisada para tablas con muchas columnas según APA 7.
              </span>
            </div>

            {/* Alcance de estilo de tabla */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', paddingTop: 'var(--space-2)', borderTop: '1px solid var(--border-subtle)' }}>
              <label htmlFor="select-alcance-tabla" style={sectionLabel}>
                Alcance
              </label>
              <select
                id="select-alcance-tabla"
                aria-label="Alcance de tabla"
                value={alcanceTabla}
                onChange={(e) => setAlcanceTabla(e.target.value as 'esta' | 'todas')}
                style={fieldStyle}
              >
                <option value="esta">Solo esta tabla</option>
                <option value="todas">Todas las tablas ({totalTablas})</option>
              </select>

              {alcanceTabla === 'todas' && onApplyTableToAll && (
                <button
                  type="button"
                  onClick={() => onApplyTableToAll({
                    style: (tablaInfo.style as any) || 'apa',
                    orientation: tablaInfo.orientation || 'portrait',
                  } as ActivoPatch)}
                  className="fig-apply-btn"
                  style={{ justifyContent: 'center' }}
                >
                  <Sliders size={13} />
                  <span>Aplicar a todas las tablas</span>
                </button>
              )}
            </div>
          </div>
        )}
        {tabEfectiva === 'estilo' && !esTabla && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
            <span style={sectionLabel}>Presets APA 7 ({STYLE_PRESETS.length})</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-2)' }}>
              {STYLE_PRESETS.map((preset) => {
                const isSelected = currentStyle === preset.value;
                return (
                  <button
                    key={preset.value}
                    type="button"
                    className="fig-preset"
                    title={preset.desc}
                    aria-pressed={isSelected}
                    onClick={() => handleUpdate({ design_style: preset.value })}
                  >
                    {preset.renderThumbnail()}
                    <span className="fig-preset-label">{preset.label}</span>
                    {preset.badge && <span className="fig-preset-badge">{preset.badge}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── CALIDAD: diagnóstico sin amarillos ── */}
        {tabEfectiva === 'calidad' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={sectionLabel}>Diagnóstico APA 7</span>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: todoConforme ? 'var(--color-success-a12)' : 'var(--color-ink-a08)',
                  color: todoConforme ? 'var(--color-success)' : 'var(--color-text-secondary)',
                }}
              >
                {cumpidos}/{checks.length} criterios
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {checks.map((chk, i) => (
                <div
                  key={chk.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 'var(--space-2)',
                    padding: '10px 2px',
                    borderTop: i === 0 ? 'none' : '1px solid var(--color-border-subtle)',
                  }}
                >
                  {chk.passed ? (
                    <CheckCircle2 size={15} style={{ color: 'var(--color-success)', flexShrink: 0, marginTop: '1px' }} />
                  ) : (
                    <AlertCircle size={15} style={{ color: 'var(--color-danger)', flexShrink: 0, marginTop: '1px' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: '12px', fontWeight: 500 }}>{chk.label}</p>
                    {!chk.passed && (
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--color-danger)' }}>
                        {chk.failMessage}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {!esTabla && (
              <button
                type="button"
                onClick={handleAutocompletar}
                disabled={autocompletando}
                className="fig-apply-btn"
                style={{ justifyContent: 'center', opacity: autocompletando ? 0.7 : 1, cursor: autocompletando ? 'wait' : 'pointer' }}
              >
                <Sparkles size={13} />
                <span>{autocompletando ? 'Consultando IA...' : 'Autocompletar recomendación APA'}</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
export default InspectorActivoTabs;
