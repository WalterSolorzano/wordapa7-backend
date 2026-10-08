/* WordAPA7 — Estudio de portada: se ELIGE en el carrusel y se EDITA a la derecha.
 *
 * UNA SOLA SUPERFICIE DE ELECCIÓN. Antes había, además del carrusel, una tira de
 * 44px arriba con un chip de texto por estrategia y el botón "Usar este diseño y
 * Continuar". La tira repetía las cinco opciones que cada tarjeta ya dibuja con
 * su miniatura REAL, y encima se montaba SIEMPRE (recibía `visible` y lo
 * ignoraba). Su único aporte propio —el nombre de la plantilla cargada y el
 * aviso de un `cover_mode` que la app no reconoce— es honestidad, no decoración,
 * y por eso vive ahora donde el usuario la necesita: el rótulo del encabezado del
 * editor y una línea de estado en el propio carrusel.
 *
 * EL FLUJO DEL PASO, y no hay un segundo camino que diga lo mismo:
 *   1. se elige una tarjeta en el carrusel;
 *   2. su CTA "Seleccionar esta portada" entra al editor de 320px;
 *   3. el editor tiene su "Continuar a Estructura".
 *
 * Reglas que este archivo sigue respetando:
 * - La portada es INDIVISIBLE, y eso lo sostiene `PaperCanvas`, no esta vista.
 *   La paginación sale de `computeRenderedPages`: la geometría del documento
 *   (`geom.pageW/pageH`) y el alto de cada elemento (`offsetHeight`), con la
 *   portada agrupada en la página 1. El `overflow` de un ancestro no entra en esa
 *   cuenta —`offsetHeight` es alto de contenido y `PaperCanvas` no lee
 *   `clientHeight` en ningún lado—, así que este archivo no re-declara paginación
 *   ni vuelve a medir la hoja. Lo que SÍ tiene que hacer es dejarle un alto
 *   DEFINIDO (abajo) para que el panel de la derecha se pueda desplazar.
 * - La cadena de alto no se rompe. `Step1PortadaWizard` envuelve esto en una
 *   caja de BLOQUE (`position: relative; height: 100%`), y un hijo de bloque no
 *   es ítem flexible: sin `height: '100%'` aquí, el `flex: 1` de la raíz es
 *   inerte, el árbol se dimensiona por contenido, el editor de 320px crece sin
 *   tope, su cuerpo nunca se desplaza y el `overflow: hidden` del envoltorio se
 *   lleva por delante el botón "Continuar a Estructura".
 * - `use_original_cover: true` jamás muta la portada del documento: elegir
 *   "Conservar original" solo escribe banderas, nunca campos de texto. */

import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ChevronLeft } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import { APACoverEditor } from '../layout/APACoverEditor';
import { UNICoverPreview } from '../layout/UNICoverPreview';
import { PaperCanvas } from '../layout/PaperCanvas';
import { CoverEditorPanel } from './CoverEditorPanel';
import { CarruselPortada } from './portada/CarruselPortada';
import { ANCHO_HOJA_PX } from '../layout/UNICoverPreview';
import { useIsMobile } from '../../hooks/useMediaQuery';
import type { Hoja } from '../../lib/portada/geometria';

/** Los modos de portada que la app sabe construir. `original` gana sobre los
 *  demás porque conservar la portada del documento no es un estilo más. */
type CoverMode = 'original' | 'apa7' | 'uni' | 'pro' | 'custom';

/** La hoja A4 es la más alargada que el carrusel dibuja (297/210 ≈ 1.414); se
 *  usa 1.42 como cota superior para que ninguna portada desborde su tarjeta. */
const ASPECTO_DE_HOJA_MAX = 1.42;
/** Piso de usabilidad: por debajo de esto la miniatura deja de leerse. No es un
 *  tope — la tarjeta crece con el área de la fase. */
const ANCHO_MINIMO_DE_TARJETA_PX = 240;

export const CoverCarouselStudio: React.FC = () => {
  const isMobile = useIsMobile();
  const { portada, acta, rules, setPortada, setActa, setCoverSetupDone, setWizardStep, showToast } = useDocStore();
  const [uploading, setUploading] = useState<boolean>(false);
  const [isImportingCover, setIsImportingCover] = useState<boolean>(false);
  const [vista, setVista] = useState<'carrusel' | 'editor'>('carrusel');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ancho de la tarjeta activa, medido sobre la CAJA REAL de la fase (no sobre
  // `window`): así el carrusel ocupa el espacio que tiene, no el que supone.
  //
  // El ancho es una PROPORCIÓN del área, no un tope fijo. Antes se acotaba a
  // 300–360px y en una ventana grande la tarjeta quedaba rodeada de un desierto:
  // el espacio de la fase es inmenso, así que la activa crece con él. El alto
  // manda sobre el ancho (la hoja es 1.42:1 en A4) y el ancho se limita a algo
  // más de la mitad para que las vecinas se asomen por los costados. Solo un
  // piso evita una tarjeta inservible en ventanas chicas.
  const faseRef = useRef<HTMLDivElement>(null);
  const [anchoCalculado, setAnchoCalculado] = useState<number>(320);

  useEffect(() => {
    const el = faseRef.current;
    if (!el) return;
    const calcular = () => {
      const alto = el.clientHeight;
      const ancho = el.clientWidth;
      // Descontar overhead vertical (mascota badge ~56px + rótulo tarjeta ~72px + padding ~36px + botón CTA ~56px)
      const altoDisponible = Math.max(220, alto - 220);
      const porAlto = Math.round((altoDisponible * 0.92) / ASPECTO_DE_HOJA_MAX);
      const porAncho = Math.round(ancho * 0.52);
      const optimo = Math.min(porAlto, porAncho);
      setAnchoCalculado(Math.max(ANCHO_MINIMO_DE_TARJETA_PX, optimo));
    };
    calcular();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(calcular);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* Modo actual derivado, o `null` si el documento trae un `cover_mode` que la
     app no reconoce.

     El backend habla otro vocabulario (`python/generation/generator.py`:
     `keep_original`, `keep_design_update_data`, `generate_apa7_template`), así
     que un valor desconocido no es hipotético: llega. La lista de abajo es todo
     lo que esta pantalla sabe afirmar. Lo que cae fuera se DICE en vez de
     encender "APA 7" para un documento que no es APA 7. */
  const currentMode: CoverMode | null = useMemo(() => {
    if (portada.use_original_cover !== false) return 'original';
    if (portada.cover_mode === 'generate_uni_cover') return 'uni';
    if (portada.cover_mode === 'apa_pro') return 'pro';
    if (portada.cover_template_id) return 'custom';
    /* La app escribe APA 7 como `cover_mode: ''`; el backend lo llama
       `generate_apa7_template`. Los dos son el mismo estado. */
    if (!portada.cover_mode || portada.cover_mode === 'generate_apa7_template') return 'apa7';
    return null;
  }, [portada.use_original_cover, portada.cover_mode, portada.cover_template_id]);

  const coverModeDesconocido = currentMode === null ? (portada.cover_mode ?? null) : null;
  const plantilla = portada.cover_template_id || null;

  /* La hoja de la preview es la MISMA que escribe el `.docx`. Sin esto la
     preview carta y el documento A4 se ven distintos y la preview miente. */
  const hojaDeLaSesion: Hoja = rules.page_size === 'a4' ? 'a4' : 'carta';

  const selectMode = (mode: CoverMode, templateId?: string) => {
    if (mode === 'original') {
      setPortada({
        use_original_cover: true,
        force_skip_cover: false,
        cover_mode: '',
      });
    } else if (mode === 'uni') {
      setPortada({
        use_original_cover: false,
        force_skip_cover: false,
        cover_mode: 'generate_uni_cover',
      });
    } else if (mode === 'pro') {
      setPortada({
        use_original_cover: false,
        force_skip_cover: false,
        cover_mode: 'apa_pro',
      });
    } else if (mode === 'custom') {
      setPortada({
        use_original_cover: false,
        force_skip_cover: false,
        cover_mode: '',
        cover_template_id: templateId || 'custom-1',
      });
    } else {
      setPortada({
        use_original_cover: false,
        force_skip_cover: false,
        cover_mode: '',
        cover_template_id: '',
      });
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setIsImportingCover(true);
    try {
      const { uploadCoverDocx } = await import('../../api/backend');
      const templateInfo = await uploadCoverDocx(
        file,
        file.name.replace(/\.[^.]+$/, ''),
        'Portada importada desde documento Word'
      );

      const importedFields = templateInfo.fields || {};
      setPortada({
        use_original_cover: false,
        force_skip_cover: false,
        cover_mode: '',
        cover_template_id: templateInfo.template.name,
        title: importedFields.title || portada.title || '',
        institution: importedFields.institution || portada.institution || '',
        course: importedFields.course || portada.course || '',
        date: importedFields.date || portada.date || '',
      });
      /* Autor y docente van al acta. La razon esta escrita en `models.py` y en
         el tipo `PortadaData`: son del documento, y con la portada original
         conservada un dato guardado dentro de la portada no sale nunca. Lo que
         llega de la plantilla gana, que es el documento que el usuario acaba de
         subir. */
      setActa({
        autor: importedFields.author || acta.autor,
        profesor_asesor: importedFields.instructor
          ? [importedFields.instructor]
          : acta.profesor_asesor,
      });

      if (templateInfo.detected) {
        showToast('Estamos haciendo editable tu portada…', 'success');
      } else {
        showToast('La portada se agregó a la biblioteca y quedó lista para editar', 'info');
      }
      selectMode('custom', templateInfo.template.name);
    } catch (error: any) {
      showToast(error?.message || 'Error al cargar la plantilla', 'error');
    } finally {
      setUploading(false);
      setIsImportingCover(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const abrirSelector = () => fileInputRef.current?.click();

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, minHeight: 0,
      /* `height: '100%'` NO es opcional aquí. `Step1PortadaWizard` envuelve esto
         en una caja de BLOQUE, y un hijo de bloque no es ítem flexible: sin un
         alto definido el `flex: 1` de arriba es inerte, el árbol se dimensiona
         por contenido, el editor de 320px crece sin tope (su cuerpo nunca se
         desplaza) y el `overflow: hidden` del envoltorio recorta el botón
         "Continuar a Estructura" fuera de pantalla. */
      height: '100%',
      overflow: 'hidden', backgroundColor: 'var(--color-bg-canvas)',
    }}>
      {isImportingCover && (
        <div aria-live="polite" style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--scrim-overlay)', backdropFilter: 'blur(2px)', zIndex: 30,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)',
            padding: '14px 18px', boxShadow: 'var(--shadow-card)', color: 'var(--color-text-primary)',
          }}>
            <span aria-hidden="true" style={{
              width: '16px', height: '16px', borderRadius: 'var(--radius-full)',
              border: '2px solid var(--color-border-subtle)',
              borderTopColor: 'var(--color-accent)', display: 'inline-block', animation: 'spin 0.9s linear infinite',
            }} />
            <span style={{ fontSize: 'var(--text-sm)', fontWeight: 700 }}>Estamos haciendo editable tu portada…</span>
          </div>
        </div>
      )}

      {/* ── CUERPO: carrusel a pantalla completa o editor dividido ── */}
      <div style={{
        display: 'flex', flex: 1, minHeight: 0,
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Columna Izquierda / Centro: Carrusel Grande o Preview */}
        <div
          data-testid="cover-carousel"
          ref={faseRef}
          style={{
            flex: 1, minWidth: 0, minHeight: 0,
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            backgroundColor: 'var(--color-bg-canvas)',
          }}
        >
          {vista === 'carrusel' ? (
            <div style={{
              flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              padding: 'var(--space-2) var(--space-4)', width: '100%',
            }}>
              {/* Honestidad: un modo que la app no conoce no se disfraza de APA 7.
                  El `role="status"` lo anuncia sin robarle el foco a nadie. */}
              {coverModeDesconocido !== null && (
                <p
                  role="status"
                  style={{
                    margin: '0 0 var(--space-3)', maxWidth: '72ch', textAlign: 'center',
                    fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
                  }}
                >
                  Este documento trae un modo de portada que la app no reconoce ({coverModeDesconocido}): elegí una estrategia.
                </p>
              )}

              <div style={{ width: '100%', maxWidth: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <CarruselPortada
                  modoActivo={currentMode}
                  hoja={hojaDeLaSesion}
                  anchoMiniatura={anchoCalculado}
                  onSelect={(id) => selectMode(id as CoverMode)}
                  onUpload={abrirSelector}
                  onConfirmSelect={(id) => {
                    selectMode(id as CoverMode);
                    setVista('editor');
                  }}
                />
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{
                padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '1px solid var(--color-border-subtle)', background: 'var(--color-bg-surface)', flexShrink: 0,
              }}>
                <button
                  type="button"
                  onClick={() => setVista('carrusel')}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                    fontSize: 'var(--text-xs)', fontWeight: 700, color: 'var(--color-accent)',
                    background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  <ChevronLeft size={16} strokeWidth="var(--icon-stroke)" />
                  Cambiar plantilla
                </button>
                {/* Qué plantilla está puesta. Sin esto, quien sube un .docx ve la
                    misma vista de siempre y no tiene cómo saber que su archivo ya
                    está en uso. */}
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
                  {plantilla ? `Vista previa de portada · ${plantilla}` : 'Vista previa de portada'}
                </span>
              </div>

              {/* Previsualizador Dinámico en Vivo */}
              <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
                {currentMode === 'uni' ? (
                  <div style={{ height: '100%', overflowY: 'auto', padding: 'var(--space-5)', display: 'flex', justifyContent: 'center' }}>
                    <div style={{
                      width: ANCHO_HOJA_PX, backgroundColor: 'var(--paper-white)',
                      boxShadow: 'var(--shadow-card)', borderRadius: 'var(--radius-sm)', overflow: 'hidden',
                    }}>
                      <UNICoverPreview hoja={hojaDeLaSesion} anchoPx={ANCHO_HOJA_PX} />
                    </div>
                  </div>
                ) : currentMode === 'apa7' || currentMode === 'pro' ? (
                  <div style={{ height: '100%', overflowY: 'auto', padding: 'var(--space-5)', display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: ANCHO_HOJA_PX, backgroundColor: 'var(--paper-white)', boxShadow: 'var(--shadow-card)', borderRadius: 'var(--radius-sm)', overflow: 'hidden' }}>
                      <APACoverEditor />
                    </div>
                  </div>
                ) : (
                  <PaperCanvas onlyCover />
                )}
              </div>
            </div>
          )}

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportFile}
            accept=".docx"
            style={{ display: 'none' }}
          />
        </div>

        {/* COLUMNA DERECHA: el editor de verdad, 320px en desktop o 100% en móvil. */}
        <aside
          data-testid="cover-editor"
          aria-label="Editor de portada"
          style={{
            width: isMobile ? '100%' : 320,
            flexShrink: 0,
            display: vista === 'editor' ? 'flex' : 'none',
            flexDirection: 'column',
            minHeight: 0,
            borderLeft: isMobile ? 'none' : '1px solid var(--color-border-subtle)',
            backgroundColor: 'var(--color-bg-surface)',
          }}
        >
          <CoverEditorPanel />
        </aside>
      </div>
    </div>
  );
};

export default CoverCarouselStudio;
