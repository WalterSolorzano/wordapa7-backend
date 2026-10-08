/* WordAPA7 — ImageEditPanel: panel modular de edición de imágenes
   Organizado en 4 secciones funcionales: Formato, Texto, Estilo y Revisión.
   Cero emojis — tokens de diseño del sistema. */

import React, { useState, useRef, useEffect } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { SubfigureItem } from '../../types';
import { suggestCaption } from '../../api/backend';
import { medidaDeFigura } from '../../lib/figuras';
import {
  UploadCloud, Loader2, Image as ImageIcon, RefreshCw, Plus, Trash2,
  CheckCircle2, AlertCircle, Sparkles, Sliders, Type, Palette, ShieldCheck,
} from 'lucide-react';

type TabKey = 'formato' | 'texto' | 'estilo' | 'revision';

interface DesignStyleOption {
  value: string;
  label: string;
  desc: string;
  badge?: string;
  renderThumbnail: () => React.ReactNode;
}

const DESIGN_STYLES: DesignStyleOption[] = [
  {
    value: 'standard',
    label: 'APA Estándar',
    desc: 'Figura centrada con etiqueta y título en líneas separadas arriba.',
    badge: 'Oficial',
    renderThumbnail: () => (
      <svg width="48" height="34" viewBox="0 0 48 34" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2" width="44" height="30" rx="3" fill="var(--color-bg-surface-alt)" stroke="var(--border-subtle)" strokeWidth="var(--icon-stroke)" />
        <rect x="8" y="5" width="16" height="2" rx="1" fill="var(--accent-primary)" />
        <rect x="8" y="9" width="28" height="2" rx="1" fill="var(--text-secondary)" />
        <rect x="12" y="14" width="24" height="14" rx="2" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
      </svg>
    ),
  },
  {
    value: 'scientific',
    label: 'Científico',
    desc: 'Borde perimetral técnico con Figura N en negrita y nota al pie estructurada.',
    badge: 'Técnico',
    renderThumbnail: () => (
      <svg width="48" height="34" viewBox="0 0 48 34" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2" width="44" height="30" rx="3" fill="var(--color-bg-surface-alt)" stroke="var(--border-subtle)" strokeWidth="var(--icon-stroke)" />
        <rect x="6" y="5" width="36" height="24" rx="2" fill="transparent" stroke="var(--border-subtle)" strokeWidth="var(--icon-stroke)" strokeDasharray="2 2" />
        <rect x="10" y="8" width="28" height="14" rx="1" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
        <rect x="10" y="24" width="20" height="2" rx="1" fill="var(--text-muted)" />
      </svg>
    ),
  },
  {
    value: 'full_width',
    label: 'Ancho Completo',
    desc: 'Ocupa el 100% del margen útil de la página. Ideal para mapas o planos.',
    renderThumbnail: () => (
      <svg width="48" height="34" viewBox="0 0 48 34" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2" width="44" height="30" rx="3" fill="var(--color-bg-surface-alt)" stroke="var(--border-subtle)" strokeWidth="var(--icon-stroke)" />
        <rect x="4" y="6" width="40" height="20" rx="2" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
        <rect x="4" y="28" width="26" height="2" rx="1" fill="var(--text-muted)" />
      </svg>
    ),
  },
  {
    value: 'sidebar',
    label: 'Compacto / Flotante',
    desc: 'Cuadro lateral estrecho con ajuste de texto continuo.',
    renderThumbnail: () => (
      <svg width="48" height="34" viewBox="0 0 48 34" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2" width="44" height="30" rx="3" fill="var(--color-bg-surface-alt)" stroke="var(--border-subtle)" strokeWidth="var(--icon-stroke)" />
        <rect x="26" y="6" width="16" height="22" rx="2" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
        <rect x="6" y="8" width="16" height="2" rx="1" fill="var(--text-muted)" />
        <rect x="6" y="13" width="16" height="2" rx="1" fill="var(--text-muted)" />
        <rect x="6" y="18" width="16" height="2" rx="1" fill="var(--text-muted)" />
        <rect x="6" y="23" width="12" height="2" rx="1" fill="var(--text-muted)" />
      </svg>
    ),
  },
  {
    value: 'multipanel',
    label: 'Doble Horizontal (a, b)',
    desc: 'Dos subfiguras en paralelo rotuladas como (a) y (b) lado a lado.',
    badge: 'Doble',
    renderThumbnail: () => (
      <svg width="48" height="34" viewBox="0 0 48 34" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2" width="44" height="30" rx="3" fill="var(--color-bg-surface-alt)" stroke="var(--border-subtle)" strokeWidth="var(--icon-stroke)" />
        <rect x="6" y="7" width="16" height="15" rx="2" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
        <rect x="26" y="7" width="16" height="15" rx="2" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
        <rect x="12" y="25" width="4" height="2" rx="1" fill="var(--accent-primary)" />
        <rect x="32" y="25" width="4" height="2" rx="1" fill="var(--accent-primary)" />
      </svg>
    ),
  },
  {
    value: 'grid_2x2',
    label: 'Cuadrícula 2×2 (a, b, c, d)',
    desc: 'Malla simétrica de 4 subfiguras para estudios comparativos complejos.',
    badge: 'Malla',
    renderThumbnail: () => (
      <svg width="48" height="34" viewBox="0 0 48 34" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2" width="44" height="30" rx="3" fill="var(--color-bg-surface-alt)" stroke="var(--border-subtle)" strokeWidth="var(--icon-stroke)" />
        <rect x="7" y="5" width="15" height="10" rx="1" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
        <rect x="26" y="5" width="15" height="10" rx="1" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
        <rect x="7" y="18" width="15" height="10" rx="1" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
        <rect x="26" y="18" width="15" height="10" rx="1" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
      </svg>
    ),
  },
  {
    value: 'vertical_stack',
    label: 'Vertical Apilado (a, b)',
    desc: 'Secuencia longitudinal una sobre otra con rótulo independiente.',
    badge: 'Serie',
    renderThumbnail: () => (
      <svg width="48" height="34" viewBox="0 0 48 34" fill="none" style={{ flexShrink: 0 }}>
        <rect x="2" y="2" width="44" height="30" rx="3" fill="var(--color-bg-surface-alt)" stroke="var(--border-subtle)" strokeWidth="var(--icon-stroke)" />
        <rect x="8" y="5" width="32" height="10" rx="2" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
        <rect x="8" y="18" width="32" height="10" rx="2" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
      </svg>
    ),
  },
];

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label style={{
    fontSize: '10px', fontWeight: 700, display: 'block',
    marginBottom: '4px', color: 'var(--color-text-secondary)',
    textTransform: 'uppercase', letterSpacing: '0.04em',
  }}>
    {children}
  </label>
);

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', fontSize: '11px',
  backgroundColor: 'var(--color-bg-surface-alt)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
  color: 'var(--color-text-primary)', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box',
};

const sectionCardStyle: React.CSSProperties = {
  backgroundColor: 'var(--color-bg-surface)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 'var(--radius-md)',
  padding: '12px',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
};

/** Cuántas figuras del documento hay. Lo cuenta quien compone, no este panel: el
 *  panel no sabe qué es "todas" y no lo deduce. Con una sola, el radio de "todas"
 *  no se pinta, porque serían la misma operación con dos nombres. */
export const ImageEditPanel: React.FC<{ elem: any; totalFiguras?: number }> = ({ elem, totalFiguras = 1 }) => {
  const updateElementImage = useDocStore((s) => s.updateElementImage);
  const aplicarImagenAMuchas = useDocStore((s) => s.aplicarImagenAMuchas);
  const doc = useDocStore((s) => s.doc);
  const showToast = useDocStore((s) => s.showToast);
  const setImagePanelOpen = useDocStore((s) => s.setImagePanelOpen);

  /* EL ALCANCE POR OMISIÓN ES "ESTA". Aplicar a veinte figuras es una acción de
     tres segundos de deliberación; que sea un clic por omisión es un accidente
     esperando. */
  const [alcance, setAlcance] = useState<'esta' | 'todas'>('esta');
  const [aplicando, setAplicando] = useState(false);
  const [hechos, setHechos] = useState(0);
  const [activeTab, setActiveTab] = useState<TabKey>('formato');
  const [replacing, setReplacing] = useState(false);
  const [suggestingIA, setSuggestingIA] = useState(false);
  const [subfiguraAbierta, setSubfiguraAbierta] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [constrain, setConstrain] = useState(elem.image_info?.constrain_proportions !== false);

  const img = elem.image_info || {};

  /* EL TAMAÑO, O SU AUSENCIA DICHA.
   *
   * Antes eran un "o 12" y un "o 8" sobre `width_cm` y `height_cm`, en NUEVE
   * lugares de este archivo. Un default así sobre un campo que el documento no
   * declara no es un default: es una cifra inventada con la apariencia de un dato, y quien va a
   * exportar mide lo que dice el `.docx`, no lo que dice la pantalla. Una figura
   * sin tamaño declarado no es una figura de 12 x 8: es una figura SIN TAMAÑO
   * DECLARADO, y el panel lo dice.
   *
   * `medidaDeFigura` es la geometría de la hoja de la F2: lo que se ve es lo que
   * sale. Acá se usa solo para el aviso de "no declarada"; el ancho y el alto que
   * se escriben son los que dice el documento. */
  const declaradoAncho = typeof img.width_cm === 'number' && img.width_cm > 0 ? img.width_cm : null;
  const declaradoAlto = typeof img.height_cm === 'number' && img.height_cm > 0 ? img.height_cm : null;
  const hayTamanoDeclarado = declaradoAncho !== null && declaradoAlto !== null;
  const medida = medidaDeFigura(
    hayTamanoDeclarado ? { width_cm: declaradoAncho, height_cm: declaradoAlto } : null,
  );
  const aspectRatio = hayTamanoDeclarado ? declaradoAncho! / declaradoAlto! : 1;
  const rotation = img.rotation || 0;
  const currentDesign = img.design_style || 'standard';

  const setProp = (p: string, v: any) => updateElementImage(elem.id, { [p]: v });

  /* UN CAMPO DE TEXTO QUE NO ESCRIBE EN EL STORE EN CADA TECLA.
   *
   * `updateElementImage` es una llamada HTTP con `pushHistory`
   * (`documentSlice.ts:808`), y además con `caption` corre
   * `cleanRedundantTitleParagraphs` (`:815-817`), que REESCRIBE párrafos del
   * documento. Escribir la leyenda letra por letra era un PATCH por letra que
   * reescribía el documento letra por letra. Los cuatro textos de este panel
   * (leyenda, nota, alternativo y título de subfigura) van a estado local y se
   * confirman al perder el foco. */
  const [borrador, setBorrador] = useState<string>(img.caption ?? '');
  const [nota, setNota] = useState<string>(img.note ?? '');
  const [alt, setAlt] = useState<string>(img.alt_text ?? '');
  const [titulosSub, setTitulosSub] = useState<Record<number, string>>({});

  /* Se resincroniza cuando cambia la FIGURA, y no mientras la persona escribe: sin
     esto el campo queda con el texto de la figura anterior, que es peor que un
     PATCH por letra. */
  useEffect(() => {
    setBorrador(img.caption ?? '');
    setNota(img.note ?? '');
    setAlt(img.alt_text ?? '');
    setTitulosSub({});
  }, [elem.id]);

  const confirmar = (campo: 'caption' | 'note' | 'alt_text', valor: string) => {
    if (valor === (img[campo] ?? '')) return;   // no se escribe lo que no cambió
    setProp(campo, valor);
  };

  /* "APLICAR A ESTA / A TODAS": lo que el usuario pidió y lo que no existía de
     ninguna manera. El patch se manda a la action con el alcance ya resuelto, y
     durante la corrida el botón dice "7 de 20" en vez de freezing. */
  const aplicarEstilo = async () => {
    const valor = currentDesign;
    if (alcance === 'esta') {
      setProp('design_style', valor);
      showToast('Diseño aplicado a esta figura', 'success');
      return;
    }
    const ids = (doc?.elements ?? [])
      .filter((e: any) => e.type === 'image' && !e.is_cover_section)
      .map((e: any) => e.id);
    if (ids.length === 0) return;
    setAplicando(true);
    setHechos(0);
    try {
      await aplicarImagenAMuchas(ids, { design_style: valor }, (h) => setHechos(h));
    } finally {
      setAplicando(false);
    }
  };

  // Debounce (280ms)
  const debounceTimerW = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounceTimerH = useRef<ReturnType<typeof setTimeout> | null>(null);
  const DEBOUNCE_MS = 280;

  const setWidth = (crudo: string) => {
    const w = parseFloat(crudo);
    /* SIN EL DEFAULT DE 12. Un campo con "abc" no se convierte en 12 cm: se avisa
       y no se escribe. Poner 12 ahí es inventar una medida que el documento no
       tiene, y el `parseFloat` de un campo vacío daba exactamente eso. */
    if (!Number.isFinite(w) || w <= 0) {
      showToast('El ancho tiene que ser un número en centímetros', 'warning');
      return;
    }
    if (debounceTimerW.current) clearTimeout(debounceTimerW.current);
    debounceTimerW.current = setTimeout(() => {
      if (constrain) updateElementImage(elem.id, { width_cm: w, height_cm: Math.round((w / aspectRatio) * 10) / 10 });
      else updateElementImage(elem.id, { width_cm: w });
    }, DEBOUNCE_MS);
  };

  const setHeight = (crudo: string) => {
    const h = parseFloat(crudo);
    if (!Number.isFinite(h) || h <= 0) {
      showToast('El alto tiene que ser un número en centímetros', 'warning');
      return;
    }
    if (debounceTimerH.current) clearTimeout(debounceTimerH.current);
    debounceTimerH.current = setTimeout(() => {
      if (constrain) updateElementImage(elem.id, { height_cm: h, width_cm: Math.round((h * aspectRatio) * 10) / 10 });
      else updateElementImage(elem.id, { height_cm: h });
    }, DEBOUNCE_MS);
  };

  const restoreSize = () => {
    /* Deshabilitado sin tamaño declarado, y con el `title` que lo explica: no se
       puede restablecer algo que nunca se midió. Antes "Restablecer" ponía 12 x 8
       y decía "Tamaño original restaurado", que era una mentira en el toast. */
    if (!hayTamanoDeclarado) return;
    if (debounceTimerW.current) clearTimeout(debounceTimerW.current);
    if (debounceTimerH.current) clearTimeout(debounceTimerH.current);
    updateElementImage(elem.id, {
      width_cm: declaradoAncho, height_cm: declaradoAlto, width_inches: null, height_inches: null,
    });
    showToast(`Tamaño restaurado a ${declaradoAncho} × ${declaradoAlto} cm`, 'success');
  };

  const replaceFile = async (file: File) => {
    if (!doc) return;
    setReplacing(true);
    try {
      await useDocStore.getState().replaceImage(elem.id, file);
      showToast('Imagen reemplazada', 'success');
    } catch (err: any) {
      showToast(err.message || 'Error al reemplazar la imagen', 'error');
    } finally {
      setReplacing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const runSuggestCaption = async () => {
    if (!doc) return;
    setSuggestingIA(true);
    try {
      const idx = doc.elements.findIndex((e: any) => e.id === elem.id);
      const ctx: string[] = [];
      for (let i = Math.max(0, idx - 2); i < Math.min(doc.elements.length, idx + 3); i++) {
        const e: any = doc.elements[i];
        if (e.id === elem.id) continue;
        const t = (e.text || '').trim();
        if (t) ctx.push(t);
      }
      const suggestion = await suggestCaption(
        doc.session_id, elem.id, ctx.join('\n'), useDocStore.getState().apiKey,
      );
      if (suggestion) {
        updateElementImage(elem.id, { caption: suggestion });
        showToast('Leyenda sugerida por IA aplicada', 'success');
      }
    } catch (err: any) {
      showToast(err.message || 'Error al generar sugerencia con IA', 'error');
    } finally {
      setSuggestingIA(false);
    }
  };

  const needsAttention = !img.caption || img.caption.trim().length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px' }}>
      {/* Cabecera del Inspector de Figura */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '2px 4px 6px', borderBottom: '1px solid var(--border-subtle)' }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '28px', height: '28px', borderRadius: 'var(--radius-sm)',
          backgroundColor: 'var(--color-accent-soft)', color: 'var(--accent-primary)',
          flexShrink: 0,
        }}>
          <ImageIcon size={15} strokeWidth={1.75} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '13px', fontWeight: 800, color: 'var(--color-text-primary)' }}>
              Figura {img.figure_number || 1}
            </span>
            <span style={{
              fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: 'var(--radius-full)',
              backgroundColor: needsAttention ? 'var(--color-warning-a12)' : 'var(--color-success-a14)',
              color: needsAttention ? 'var(--color-warning)' : 'var(--color-success)',
            }}>
              {needsAttention ? 'Sin leyenda' : 'APA 7'}
            </span>
          </div>
          <div data-testid="inspector-medida" style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '1px' }}>
            {hayTamanoDeclarado
              ? `${declaradoAncho} × ${declaradoAlto} cm`
              : 'Sin tamaño declarado'}
            {' · '}
            {img.alignment === 'center' ? 'Centrada' : img.alignment === 'left' ? 'Izquierda' : 'Derecha'}
          </div>
        </div>
      </div>

      {/* ── 4 PESTAÑAS PRINCIPALES: Formato | Texto | Estilo | Revisión ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '2px', backgroundColor: 'var(--color-bg-surface-alt)',
        padding: '3px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)',
      }}>
        {[
          { key: 'formato' as TabKey, label: 'Formato', Icon: Sliders },
          { key: 'texto' as TabKey, label: 'Texto', Icon: Type },
          { key: 'estilo' as TabKey, label: 'Estilo', Icon: Palette },
          { key: 'revision' as TabKey, label: 'Revisión', Icon: ShieldCheck },
        ].map((tab) => {
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: '3px', padding: '6px 2px', border: 'none', cursor: 'pointer',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: active ? 'var(--color-bg-surface)' : 'transparent',
                color: active ? 'var(--accent-primary)' : 'var(--color-text-secondary)',
                boxShadow: active ? 'var(--shadow-sm)' : 'none',
                transition: 'all var(--transition-fast)',
                fontFamily: 'inherit',
              }}
            >
              <tab.Icon size={13} strokeWidth={1.75} />
              <span style={{ fontSize: '10px', fontWeight: active ? 700 : 500 }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── 1. FORMATO ────────────────────────────────────────── */}
      {activeTab === 'formato' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={sectionCardStyle}>
            <div>
              <FieldLabel>Alineación en la página</FieldLabel>
              <div style={{ display: 'flex', gap: '4px' }}>
                {[
                  { value: 'left', label: 'Izquierda' },
                  { value: 'center', label: 'Centrada (APA)' },
                  { value: 'right', label: 'Derecha' },
                ].map((opt) => {
                  const active = (img.alignment || 'center') === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setProp('alignment', opt.value)}
                      style={{
                        flex: 1, padding: '6px 4px', fontSize: '10px', fontWeight: active ? 700 : 500,
                        cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                        backgroundColor: active ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
                        color: active ? 'var(--accent-primary)' : 'var(--color-text-secondary)',
                        fontFamily: 'inherit',
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <FieldLabel>Distribución Imagen - Texto</FieldLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                {[
                  {
                    value: 'inline',
                    label: 'En línea (Oficial)',
                    desc: 'Bloque continuo, texto arriba y abajo.',
                    icon: (
                      <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
                        <rect x="2" y="2" width="32" height="3" rx="1" fill="var(--color-text-secondary)" />
                        <rect x="8" y="7" width="20" height="10" rx="1" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
                        <rect x="2" y="19" width="32" height="3" rx="1" fill="var(--color-text-secondary)" />
                      </svg>
                    ),
                  },
                  {
                    value: 'square_left',
                    label: 'Flotante Izquierda',
                    desc: 'Texto fluye por el costado derecho.',
                    icon: (
                      <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
                        <rect x="2" y="4" width="14" height="16" rx="1" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
                        <rect x="19" y="5" width="15" height="2.5" rx="1" fill="var(--color-text-secondary)" />
                        <rect x="19" y="10" width="15" height="2.5" rx="1" fill="var(--color-text-secondary)" />
                        <rect x="19" y="15" width="11" height="2.5" rx="1" fill="var(--color-text-secondary)" />
                      </svg>
                    ),
                  },
                  {
                    value: 'square',
                    label: 'Flotante Derecha',
                    desc: 'Texto fluye por el costado izquierdo.',
                    icon: (
                      <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
                        <rect x="2" y="5" width="15" height="2.5" rx="1" fill="var(--color-text-secondary)" />
                        <rect x="2" y="10" width="15" height="2.5" rx="1" fill="var(--color-text-secondary)" />
                        <rect x="2" y="15" width="11" height="2.5" rx="1" fill="var(--color-text-secondary)" />
                        <rect x="20" y="4" width="14" height="16" rx="1" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
                      </svg>
                    ),
                  },
                  {
                    value: 'banner',
                    label: 'Margen Completo',
                    desc: 'Ocupa 100% de caja sin texto lateral.',
                    icon: (
                      <svg width="36" height="24" viewBox="0 0 36 24" fill="none">
                        <rect x="2" y="2" width="32" height="2" rx="1" fill="var(--color-text-secondary)" />
                        <rect x="2" y="6" width="32" height="12" rx="1" fill="var(--color-accent-soft)" stroke="var(--accent-primary)" strokeWidth="var(--icon-stroke)" />
                        <rect x="2" y="20" width="32" height="2" rx="1" fill="var(--color-text-secondary)" />
                      </svg>
                    ),
                  },
                ].map((wrapOpt) => {
                  const active = (img.wrap_style || 'inline') === wrapOpt.value || (wrapOpt.value === 'square_left' && img.wrap_style === 'square' && img.alignment === 'left');
                  return (
                    <div
                      key={wrapOpt.value}
                      onClick={() => {
                        if (wrapOpt.value === 'square_left') {
                          setProp('wrap_style', 'square');
                          setProp('alignment', 'left');
                        } else if (wrapOpt.value === 'banner') {
                          setProp('wrap_style', 'top_and_bottom');
                          setProp('design_style', 'full_width');
                        } else {
                          setProp('wrap_style', wrapOpt.value);
                        }
                      }}
                      style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                        padding: '6px 4px', borderRadius: 'var(--radius-sm)',
                        backgroundColor: active ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
                        border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                        cursor: 'pointer', textAlign: 'center',
                      }}
                    >
                      {wrapOpt.icon}
                      <span style={{ fontSize: '10px', fontWeight: active ? 700 : 600, color: active ? 'var(--accent-primary)' : 'var(--text-main)' }}>
                        {wrapOpt.label}
                      </span>
                      <span style={{ fontSize: '8px', color: 'var(--color-text-secondary)', lineHeight: 1.2 }}>
                        {wrapOpt.desc}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <FieldLabel>Dimensiones físicas</FieldLabel>
            {/* Sin tamaño declarado se lo dice arriba del todo, una vez, y los
                campos quedan vacíos con su placeholder: un `12` adentro de un
                input cuando el documento no dice 12 es un dato falso con caja. */}
            {!hayTamanoDeclarado && (
              <div style={{ fontSize: '10px', color: 'var(--color-warning)', lineHeight: 1.4 }}>
                Esta figura no declara tamaño en el documento. Escribí el ancho y el
                alto reales, o dejalos vacíos para que el tamaño lo ponga la
                proporción natural del archivo.
              </div>
            )}
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <label htmlFor="ancho-cm" style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', display: 'block' }}>Ancho (cm)</label>
                <input
                  id="ancho-cm"
                  type="number"
                  step="0.5"
                  min={2}
                  max={25}
                  style={inputStyle}
                  placeholder="sin declarar"
                  value={declaradoAncho ?? ''}
                  onChange={(e) => setWidth(e.target.value)}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="alto-cm" style={{ fontSize: '9px', color: 'var(--color-text-tertiary)', display: 'block' }}>Alto (cm)</label>
                <input
                  id="alto-cm"
                  type="number"
                  step="0.5"
                  min={2}
                  max={25}
                  style={inputStyle}
                  placeholder="sin declarar"
                  value={declaradoAlto ?? ''}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </div>
            </div>

            <div>
              <input
                type="range"
                min={3}
                max={20}
                step={0.5}
                aria-label="Ancho en centímetros"
                value={declaradoAncho ?? medida.anchoPx > 0 ? declaradoAncho ?? 3 : 3}
                onChange={(e) => setWidth(e.target.value)}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent-primary)' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--color-text-tertiary)' }}>
                <span>3 cm</span>
                <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>
                  {declaradoAncho !== null ? `${declaradoAncho} cm` : 'sin declarar'}
                </span>
                <span>20 cm (página)</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer', color: 'var(--color-text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={constrain}
                  onChange={(e) => { setConstrain(e.target.checked); setProp('constrain_proportions', e.target.checked); }}
                />
                Mantener proporción
              </label>

              <button
                type="button"
                onClick={restoreSize}
                disabled={!hayTamanoDeclarado}
                title={hayTamanoDeclarado
                  ? `Restablecer a ${declaradoAncho} × ${declaradoAlto} cm, la medida declarada`
                  : 'No hay tamaño declarado que restablecer: esta figura no trae medida en el documento'}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'none', border: 'none', fontSize: '10px',
                  color: hayTamanoDeclarado ? 'var(--accent-primary)' : 'var(--color-text-tertiary)',
                  cursor: hayTamanoDeclarado ? 'pointer' : 'not-allowed', fontWeight: 600,
                }}
              >
                <RefreshCw size={11} strokeWidth="var(--icon-stroke)" /> Restablecer
              </button>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <FieldLabel>Rotación de imagen</FieldLabel>
            <div style={{ display: 'flex', gap: '4px' }}>
              {[0, 90, 180, 270].map((deg) => {
                const active = rotation === deg;
                return (
                  <button
                    key={deg}
                    type="button"
                    onClick={() => setProp('rotation', deg)}
                    style={{
                      flex: 1, padding: '5px 0', fontSize: '10px', fontWeight: active ? 700 : 500,
                      cursor: 'pointer', borderRadius: 'var(--radius-sm)',
                      border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                      backgroundColor: active ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
                      color: active ? 'var(--accent-primary)' : 'var(--color-text-secondary)',
                      fontFamily: 'inherit',
                    }}
                  >
                    {deg === 0 ? '0°' : `${deg}°`}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── 2. TEXTO & LEYENDA APA 7 ──────────────────────────── */}
      {activeTab === 'texto' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={sectionCardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <FieldLabel>Título de la figura (Leyenda)</FieldLabel>
              <button
                type="button"
                onClick={runSuggestCaption}
                disabled={suggestingIA}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: '4px',
                  background: 'var(--color-accent-soft)', color: 'var(--accent-primary)',
                  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                  padding: '3px 8px', fontSize: '10px', fontWeight: 700, cursor: 'pointer',
                }}
                title="Generar leyenda APA 7 con base en el texto cercano"
              >
                {suggestingIA ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <Sparkles size={11} />}
                <span>Sugerir con IA</span>
              </button>
            </div>

            {/* Tarjetas rápidas de sugerencia IA de 1 clic */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px', marginBottom: '4px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Estilos Rápidos sugeridos por IA
              </span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '4px' }}>
                {[
                  { estilo: 'Técnico/Formal', texto: borrador ? `Análisis estructural de ${borrador.toLowerCase().replace(/^(figura \d+:?|diagrama de)/i, '').trim()}` : 'Diagrama metodológico del proceso experimental' },
                  { estilo: 'Descriptivo corto', texto: borrador ? borrador.split('.')[0] : 'Vista general de variables del estudio' },
                  { estilo: 'Analítico detallado', texto: borrador ? `Comparativa y distribución de ${borrador.toLowerCase()}` : 'Distribución y correlación de resultados observados' },
                ].map((sug, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px',
                      padding: '4px 6px', borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-bg-surface-alt)', border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '9px', fontWeight: 700, color: 'var(--accent-primary)' }}>{sug.estilo}</div>
                      <div style={{ fontSize: '10px', color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {sug.texto}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setBorrador(sug.texto);
                        confirmar('caption', sug.texto);
                        showToast(`Leyenda aplicada (${sug.estilo})`, 'success');
                      }}
                      style={{
                        padding: '2px 6px', fontSize: '9px', fontWeight: 700, cursor: 'pointer',
                        borderRadius: 'var(--radius-xs)', backgroundColor: 'var(--surface-subtle)',
                        border: '1px solid var(--border-subtle)', color: 'var(--color-text-primary)',
                      }}
                    >
                      Aplicar
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <textarea
              id="leyenda-cm"
              rows={2}
              aria-label="Leyenda de la figura"
              style={{ ...inputStyle, resize: 'vertical' }}
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onBlur={() => confirmar('caption', borrador)}
              placeholder="Ej: Diagrama de flujo del balance de materia y energía"
            />

            <div>
              <label htmlFor="pos-leyenda" style={{ fontSize: '10px', fontWeight: 700, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Posición de la leyenda
              </label>
              <select
                id="pos-leyenda"
                aria-label="Posición de la leyenda"
                style={inputStyle}
                value={img.caption_position || 'above'}
                onChange={(e) => setProp('caption_position', e.target.value)}
              >
                <option value="above">Sobre la imagen (Oficial APA 7)</option>
                <option value="below">Debajo de la imagen</option>
              </select>
            </div>
          </div>

          <div style={sectionCardStyle}>
            <label htmlFor="nota-cm" style={{ fontSize: '10px', fontWeight: 700, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Nota al pie de figura
            </label>
            <textarea
              id="nota-cm"
              aria-label="Nota al pie de la figura"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              onBlur={() => confirmar('note', nota)}
              placeholder="Ej: Nota. Adaptado de Guía Metodológica de Balance (p. 42), por..."
            />
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
              En APA 7, la nota explica abreviaturas, fuentes o permisos de reproducción.
            </span>
          </div>

          <div style={sectionCardStyle}>
            <label htmlFor="alt-cm" style={{ fontSize: '10px', fontWeight: 700, display: 'block', marginBottom: '4px', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Texto alternativo (Accesibilidad)
            </label>
            <textarea
              id="alt-cm"
              aria-label="Texto alternativo de la figura"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              value={alt}
              onChange={(e) => setAlt(e.target.value)}
              onBlur={() => confirmar('alt_text', alt)}
              placeholder="Descripción breve y precisa para lectores de pantalla"
            />
          </div>
        </div>
      )}

      {/* ── 3. ESTILO & PRESETS VISUALES ────────────────────────── */}
      {activeTab === 'estilo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Selecciona un preset con diseño editorial APA:
          </div>

          {/* EL ALCANCE, ANTES DE LOS PRESETS Y pegado a lo que aplica.
              "Aplicar a todas" es lo que el usuario pidió y lo que no existía de
              ninguna manera: no había endpoint en lote y `updateElementImage` es de
              a una. Ahora es N llamadas contra el endpoint que ya existe, con el
              alcance DECLARADO en el botón y no escondido en un `for`. */}
          <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: '8px 10px' }}>
            <legend style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 4px' }}>
              Alcance
            </legend>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="alcance-figura"
                  checked={alcance === 'esta'}
                  onChange={() => setAlcance('esta')}
                />
                Esta figura
              </label>
              {/* CON UNA SOLA FIGURA, "todas" Y "esta" SON LA MISMA OPERACIÓN: dos
                  nombres para un mismo botón es un control que miente sobre lo que
                  hace, así que el radio no aparece. */}
              {totalFiguras > 1 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="alcance-figura"
                    checked={alcance === 'todas'}
                    onChange={() => setAlcance('todas')}
                  />
                  Las {totalFiguras} figuras del documento
                </label>
              )}
            </div>
            <button
              type="button"
              onClick={aplicarEstilo}
              disabled={aplicando}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                width: '100%', marginTop: '8px', padding: '6px 10px',
                fontSize: '11px', fontWeight: 700, fontFamily: 'inherit', cursor: aplicando ? 'wait' : 'pointer',
                backgroundColor: 'var(--color-accent-soft)', color: 'var(--accent-primary)',
                border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)',
              }}
            >
              {aplicando
                ? `Aplicando… ${hechos} de ${totalFiguras}`
                : alcance === 'todas'
                  ? `Aplicar a las ${totalFiguras} figuras`
                  : 'Aplicar a esta figura'}
            </button>
          </fieldset>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {DESIGN_STYLES.map((style) => {
              const selected = currentDesign === style.value;
              return (
                <div
                  key={style.value}
                  onClick={() => {
                    if (style.value === 'multipanel' && (!img.subfigures || img.subfigures.length === 0)) {
                      const initialSubs: SubfigureItem[] = [
                        { id: `sub_${Date.now()}_a`, label: '(a)', title: img.caption || 'Vista principal', relative_url: img.relative_url || '', file_path: img.file_path || '', filename: img.filename || '' },
                        { id: `sub_${Date.now()}_b`, label: '(b)', title: 'Detalle o grupo experimental', relative_url: img.relative_url || '', file_path: img.file_path || '', filename: img.filename || '' },
                      ];
                      updateElementImage(elem.id, { design_style: 'multipanel', subfigures: initialSubs });
                    } else if (style.value === 'grid_2x2' && (!img.subfigures || img.subfigures.length < 4)) {
                      const initialSubs: SubfigureItem[] = [
                        { id: `sub_${Date.now()}_a`, label: '(a)', title: 'Control', relative_url: img.relative_url || '', file_path: img.file_path || '', filename: img.filename || '' },
                        { id: `sub_${Date.now()}_b`, label: '(b)', title: 'Tratamiento A', relative_url: img.relative_url || '', file_path: img.file_path || '', filename: img.filename || '' },
                        { id: `sub_${Date.now()}_c`, label: '(c)', title: 'Tratamiento B', relative_url: img.relative_url || '', file_path: img.file_path || '', filename: img.filename || '' },
                        { id: `sub_${Date.now()}_d`, label: '(d)', title: 'Resultados comparados', relative_url: img.relative_url || '', file_path: img.file_path || '', filename: img.filename || '' },
                      ];
                      updateElementImage(elem.id, { design_style: 'corner', subfigures: initialSubs });
                    } else if (style.value === 'vertical_stack' && (!img.subfigures || img.subfigures.length === 0)) {
                      const initialSubs: SubfigureItem[] = [
                        { id: `sub_${Date.now()}_a`, label: '(a)', title: 'Fase inicial', relative_url: img.relative_url || '', file_path: img.file_path || '', filename: img.filename || '' },
                        { id: `sub_${Date.now()}_b`, label: '(b)', title: 'Fase final', relative_url: img.relative_url || '', file_path: img.file_path || '', filename: img.filename || '' },
                      ];
                      updateElementImage(elem.id, { design_style: 'multipanel', subfigures: initialSubs });
                    } else {
                      setProp('design_style', style.value);
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '8px 10px', borderRadius: 'var(--radius-md)',
                    backgroundColor: selected ? 'var(--color-accent-soft)' : 'var(--color-bg-surface)',
                    border: `1px solid ${selected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                    cursor: 'pointer', transition: 'all var(--transition-fast)',
                  }}
                >
                  {style.renderThumbnail()}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', fontWeight: 800, color: selected ? 'var(--accent-primary)' : 'var(--text-main)' }}>
                        {style.label}
                      </span>
                      {style.badge && (
                        <span style={{
                          fontSize: '8px', fontWeight: 800, padding: '1px 5px', borderRadius: 'var(--radius-full)',
                          backgroundColor: selected ? 'var(--accent-primary)' : 'var(--surface-subtle)',
                          color: selected ? 'var(--color-text-on-accent)' : 'var(--text-secondary)',
                        }}>
                          {style.badge}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '2px', lineHeight: 1.35 }}>
                      {style.desc}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Subfiguras si está en modo Multipanel */}
          {currentDesign === 'multipanel' && (
            <div style={sectionCardStyle}>
              <FieldLabel>Subfiguras multipanel APA (a, b, c)</FieldLabel>
              {((img.subfigures as SubfigureItem[]) || []).map((sub, idx) => (
                <div
                  key={sub.id || idx}
                  style={{
                    padding: '8px', backgroundColor: 'var(--color-bg-surface-alt)',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)',
                    display: 'flex', flexDirection: 'column', gap: '6px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                      Panel {sub.label || `(${String.fromCharCode(97 + idx)})`}
                    </span>
                    {((img.subfigures?.length || 0) > 1) && (
                      <button
                        type="button"
                        onClick={() => {
                          const newSubs = img.subfigures!.filter((_: SubfigureItem, i: number) => i !== idx);
                          setProp('subfigures', newSubs);
                        }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    aria-label={`Título del panel ${sub.label || `(${String.fromCharCode(97 + idx)})`}`}
                    style={inputStyle}
                    value={titulosSub[idx] ?? sub.title ?? ''}
                    placeholder="Título del panel..."
                    onChange={(e) => setTitulosSub({ ...titulosSub, [idx]: e.target.value })}
                    onBlur={() => {
                      /* El quinto texto que escribía por pulsación. Ahora se
                         confirma al salir del campo, como los otros cuatro. */
                      const nuevo = titulosSub[idx];
                      if (nuevo === undefined || nuevo === (sub.title ?? '')) return;
                      const newSubs = [...(img.subfigures || [])];
                      newSubs[idx] = { ...newSubs[idx], title: nuevo };
                      setProp('subfigures', newSubs);
                    }}
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={() => {
                  const nextChar = String.fromCharCode(97 + (img.subfigures?.length || 0));
                  const newSubs: SubfigureItem[] = [
                    ...(img.subfigures || []),
                    {
                      id: `sub_${Date.now()}_${nextChar}`,
                      label: `(${nextChar})`,
                      title: `Panel ${nextChar.toUpperCase()}`,
                      relative_url: img.relative_url || '',
                      file_path: img.file_path || '',
                      filename: img.filename || '',
                    },
                  ];
                  setProp('subfigures', newSubs);
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                  padding: '6px 8px', fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  backgroundColor: 'transparent', border: '1px dashed var(--accent-primary)',
                  borderRadius: 'var(--radius-sm)', color: 'var(--accent-primary)', fontFamily: 'inherit',
                }}
              >
                <Plus size={12} /> Añadir subfigura ({String.fromCharCode(97 + (img.subfigures?.length || 0))})
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── 4. REVISIÓN & ARCHIVO ───────────────────────────────── */}
      {activeTab === 'revision' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={sectionCardStyle}>
            <FieldLabel>Estado de conformidad APA 7</FieldLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {needsAttention ? (
                <AlertCircle size={18} color="var(--color-warning)" style={{ flexShrink: 0 }} />
              ) : (
                <CheckCircle2 size={18} color="var(--color-success)" style={{ flexShrink: 0 }} />
              )}
              <div style={{ fontSize: '11px', color: 'var(--text-main)', lineHeight: 1.4 }}>
                {needsAttention ? (
                  <span><strong>Falta leyenda o título:</strong> APA 7 exige que toda figura tenga una etiqueta y descripción breve.</span>
                ) : (
                  <span><strong>Cumple con la norma:</strong> La figura cuenta con leyenda formal configurada.</span>
                )}
              </div>
            </div>

            {needsAttention && (
              <button
                type="button"
                onClick={runSuggestCaption}
                disabled={suggestingIA}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  width: '100%', padding: '7px 10px', fontSize: '11px', fontWeight: 700,
                  backgroundColor: 'var(--color-accent-soft)', color: 'var(--accent-primary)',
                  border: '1px solid var(--accent-primary)', borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
              >
                <Sparkles size={12} /> Autocompletar con IA
              </button>
            )}
          </div>

          <div style={sectionCardStyle}>
            <FieldLabel>Reemplazar archivo de imagen</FieldLabel>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) await replaceFile(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={replacing || !doc}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                width: '100%', padding: '8px 12px', fontSize: '11px', fontWeight: 600,
                backgroundColor: 'transparent', border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-sm)', cursor: replacing ? 'wait' : 'pointer',
                color: 'var(--accent-primary)', fontFamily: 'inherit',
              }}
            >
              {replacing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <UploadCloud size={14} />}
              {replacing ? 'Reemplazando archivo...' : 'Cargar nueva versión de imagen'}
            </button>
            <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
              Conserva el tamaño y las anotaciones APA configuradas previamente.
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageEditPanel;
