import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { RailTipoActivos } from './RailTipoActivos';
import { GaleriaActivosColumna } from './GaleriaActivosColumna';
import { LienzoEditorialActivo, AISuggestionData, type SubfiguraVista } from './LienzoEditorialActivo';
import { InspectorActivoTabs, type ActivoPatch } from './InspectorActivoTabs';
import { PanelResizeHandle } from './PanelResizeHandle';
import {
  contextosDeFiguras,
  figuraActiva,
  type TipoFigura,
} from '../../lib/figuras';
import {
  modoDeAncho,
  clampAncho,
  leerAnchoGuardado,
  ANCHO_GALERIA_KEY,
  ANCHO_INSPECTOR_KEY,
  GALERIA_DEFAULT,
  GALERIA_MIN,
  GALERIA_MAX,
  INSPECTOR_DEFAULT,
  INSPECTOR_MIN,
  INSPECTOR_MAX,
} from '../../lib/layoutTaller';
import { resolveAssetUrl, suggestCaption, subirImagenDeProyecto } from '../../api/backend';
import type { ElementModel } from '../../types';

export const TallerFigurasView: React.FC = () => {
  const doc = useDocStore((s) => s.doc);
  const apiKey = useDocStore((s) => s.apiKey);
  const updateElementImage = useDocStore((s) => s.updateElementImage);
  const updateElementTable = useDocStore((s) => s.updateElementTable);
  const aplicarImagenAMuchas = useDocStore((s) => s.aplicarImagenAMuchas);
  const replaceImage = useDocStore((s) => s.replaceImage);
  const showToast = useDocStore((s) => s.showToast);

  const [tipoActivo, setTipoActivo] = useState<TipoFigura>('image');
  const [indiceActivo, setIndiceActivo] = useState<number | null>(null);
  const [idActivo, setIdActivo] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, AISuggestionData>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});
  const [aiErrors, setAiErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subfigInputRef = useRef<HTMLInputElement>(null);
  // Slot (b, c, d...) que se llenará con el próximo archivo importado.
  const slotPendiente = useRef<number | null>(null);

  // Ancho real disponible para decidir el modo de layout. El rect del contenedor
  // manda; si aún no tiene medida (primer render o jsdom) se usa la ventana.
  const rootRef = useRef<HTMLDivElement>(null);
  const [anchoDisponible, setAnchoDisponible] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const medir = () => {
      const rect = rootRef.current?.getBoundingClientRect().width ?? 0;
      setAnchoDisponible(rect > 0 ? rect : window.innerWidth);
    };
    medir();
    window.addEventListener('resize', medir);
    let observador: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined' && rootRef.current) {
      observador = new ResizeObserver(medir);
      observador.observe(rootRef.current);
    }
    return () => {
      window.removeEventListener('resize', medir);
      observador?.disconnect();
    };
  }, []);

  const modo = modoDeAncho(anchoDisponible);

  // Anchos escalables de galería e inspector, recordados entre sesiones.
  const [galeriaAncho, setGaleriaAncho] = useState<number>(() =>
    leerAnchoGuardado(ANCHO_GALERIA_KEY, GALERIA_DEFAULT, GALERIA_MIN, GALERIA_MAX)
  );
  const [inspectorAncho, setInspectorAncho] = useState<number>(() =>
    leerAnchoGuardado(ANCHO_INSPECTOR_KEY, INSPECTOR_DEFAULT, INSPECTOR_MIN, INSPECTOR_MAX)
  );

  useEffect(() => {
    try {
      localStorage.setItem(ANCHO_GALERIA_KEY, String(galeriaAncho));
    } catch {
      /* almacenamiento no disponible: el ancho vive solo en memoria */
    }
  }, [galeriaAncho]);

  useEffect(() => {
    try {
      localStorage.setItem(ANCHO_INSPECTOR_KEY, String(inspectorAncho));
    } catch {
      /* almacenamiento no disponible: el ancho vive solo en memoria */
    }
  }, [inspectorAncho]);

  // Derivar contextos de figuras según elementos actuales
  const todosContextos = useMemo(
    () => contextosDeFiguras(doc?.elements ?? []),
    [doc?.elements]
  );

  // Conteos para el rail
  const conteos = useMemo(() => {
    return {
      image: todosContextos.filter((c) => c.tipo === 'image').length,
      table: todosContextos.filter((c) => c.tipo === 'table').length,
      equation: todosContextos.filter((c) => c.tipo === 'equation').length,
    };
  }, [todosContextos]);

  // Contextos filtrados por el tipo activo
  const contextosDelTipo = useMemo(
    () => todosContextos.filter((c) => c.tipo === tipoActivo),
    [todosContextos, tipoActivo]
  );

  // Contexto activo actual
  const contextoActual = useMemo(() => {
    if (indiceActivo !== null) {
      const elegida = figuraActiva(contextosDelTipo, indiceActivo);
      if (elegida) return elegida;
    }
    return contextosDelTipo[0] ?? null;
  }, [contextosDelTipo, indiceActivo]);

  // Elemento actual en base a contextoActual
  const elementoActual: ElementModel | null = useMemo(() => {
    if (!contextoActual || !doc?.elements) return null;
    return doc.elements.find((e) => e.id === contextoActual.id) ?? doc.elements[contextoActual.indice] ?? null;
  }, [contextoActual, doc?.elements]);

  // Subfiguras resueltas a URL para el lienzo multipanel.
  const subfigurasVista: SubfiguraVista[] | undefined = useMemo(() => {
    const lista = elementoActual?.image_info?.subfigures;
    if (!lista || lista.length === 0) return undefined;
    return lista.map((s) => ({
      label: s.label,
      title: s.title,
      url: s.relative_url ? resolveAssetUrl(s.relative_url) : undefined,
    }));
  }, [elementoActual]);

  const handleTipoChange = useCallback((nuevoTipo: TipoFigura) => {
    setTipoActivo(nuevoTipo);
    setIndiceActivo(null);
    setIdActivo(null);
  }, []);

  const handleSelectIndice = useCallback((idx: number) => {
    setIndiceActivo(idx);
    const item = todosContextos.find((c) => c.indice === idx);
    setIdActivo(item?.id ?? null);
    if (item) {
      useDocStore.getState().setSelectedElementId(item.id);
      useDocStore.getState().setScrollTargetId(item.id);
    }
  }, [todosContextos]);

  // Re-anclar la selección por ID: si al guardar se elimina el párrafo "Figura N"
  // anterior, los índices del documento corren y la posición deja de apuntar al
  // activo elegido. El ID es la identidad estable; el índice solo se re-deriva.
  useEffect(() => {
    if (idActivo === null) return;
    const pos = contextosDelTipo.findIndex((c) => c.id === idActivo);
    if (pos === -1) {
      setIdActivo(null);
      setIndiceActivo(null);
      return;
    }
    const indiceReal = contextosDelTipo[pos].indice;
    setIndiceActivo((prev) => (prev === indiceReal ? prev : indiceReal));
  }, [contextosDelTipo, idActivo]);

  // Lectura unificada de caption/nota: imágenes y tablas guardan en sitios distintos.
  const esTablaActual = elementoActual?.type === 'table';
  const infoTextoActual = esTablaActual ? elementoActual?.table_info : elementoActual?.image_info;
  const captionActual = infoTextoActual?.caption ?? '';
  const parrafoActual = contextoActual?.parrafoAnterior ?? '';

  // Rotación de imagen (+90 grados)
  const handleRotate = useCallback(() => {
    if (!elementoActual || elementoActual.type !== 'image') return;
    const currentRotation = elementoActual.image_info?.rotation ?? 0;
    const nextRotation = (currentRotation + 90) % 360;
    updateElementImage(elementoActual.id, { rotation: nextRotation });
  }, [elementoActual, updateElementImage]);

  // Reemplazar imagen mediante selector de archivos nativo
  const handleReplaceImageClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !elementoActual) return;
      try {
        await replaceImage(elementoActual.id, file);
      } catch (err) {
        console.error('Error al reemplazar imagen:', err);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [elementoActual, replaceImage]
  );

  // Importar una subfigura a un slot de la malla (b, c, d...).
  const handleImportSubfigure = useCallback((slot: number) => {
    slotPendiente.current = slot;
    subfigInputRef.current?.click();
  }, []);

  const handleSubfigInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const slot = slotPendiente.current;
      if (!file || slot === null || !elementoActual || elementoActual.type !== 'image') return;
      try {
        const { assetId, name } = await subirImagenDeProyecto(file);
        const etiqueta = `(${String.fromCharCode(97 + slot)})`;
        const actuales = elementoActual.image_info?.subfigures ?? [];
        const siguientes = [...actuales];
        // El slot (a) es la imagen principal; (b) en adelante viven en subfigures.
        siguientes[slot - 1] = {
          id: `sub-${slot}-${Date.now()}`,
          label: etiqueta,
          title: name,
          relative_url: `/api/assets/archivo/${encodeURIComponent(assetId)}`,
        };
        updateElementImage(elementoActual.id, { subfigures: siguientes });
      } catch (err) {
        console.error('Error al importar subfigura:', err);
      } finally {
        slotPendiente.current = null;
        if (subfigInputRef.current) {
          subfigInputRef.current.value = '';
        }
      }
    },
    [elementoActual, updateElementImage]
  );

  // Aplicar sugerencia de IA
  const handleApplyCaption = useCallback(
    ({ title, note }: { title: string; note: string }) => {
      if (!elementoActual) return;
      if (elementoActual.type === 'table') {
        updateElementTable(elementoActual.id, { caption: title, note });
        return;
      }
      updateElementImage(elementoActual.id, {
        caption: title,
        note: note,
      });
    },
    [elementoActual, updateElementImage, updateElementTable]
  );

  // Volver a pedir la leyenda al motor de IA desde el globo de la mascota.
  const handleRegenerateSuggestion = useCallback(async () => {
    if (!doc?.session_id || !elementoActual) return;
    if (elementoActual.type !== 'image' && elementoActual.type !== 'table') return;

    const elId = elementoActual.id;
    setAiLoading((prev) => ({ ...prev, [elId]: true }));
    setAiErrors((prev) => ({ ...prev, [elId]: '' }));

    try {
      // Si el párrafo anterior inmediato está vacío, construir contexto con los elementos circundantes
      let ctxText = parrafoActual;
      if (!ctxText && doc.elements) {
        const idx = doc.elements.findIndex((e) => e.id === elId);
        if (idx !== -1) {
          const partes: string[] = [];
          for (let i = Math.max(0, idx - 2); i < Math.min(doc.elements.length, idx + 3); i++) {
            if (i === idx) continue;
            const t = (doc.elements[i].text || '').trim();
            if (t) partes.push(t);
          }
          ctxText = partes.join('\n');
        }
      }

      const texto = await suggestCaption(
        doc.session_id,
        elId,
        ctxText || 'Figura o tabla académica del documento',
        apiKey ?? undefined
      );

      if (!texto) {
        throw new Error('El modelo no devolvió una sugerencia válida');
      }

      setAiSuggestions((prev) => ({
        ...prev,
        [elId]: { suggestedTitle: texto, suggestedNote: '' },
      }));
      showToast('Leyenda generada con éxito', 'success');
    } catch (err: any) {
      const msg = err?.message || 'Error al generar leyenda con IA';
      setAiErrors((prev) => ({ ...prev, [elId]: msg }));
      showToast(msg, 'error');
    } finally {
      setAiLoading((prev) => ({ ...prev, [elId]: false }));
    }
  }, [doc, elementoActual, parrafoActual, apiKey, showToast]);

  // Edición de una celda de tabla: el patch va directo al elemento tabla.
  const handleEditarCeldaTabla = useCallback(
    (patch: { headers?: string[]; rows?: string[][] }) => {
      if (!elementoActual || elementoActual.type !== 'table') return;
      updateElementTable(elementoActual.id, patch);
    },
    [elementoActual, updateElementTable]
  );

  // Enrutar el parche según el tipo del activo: una tabla nunca se envía como
  // imagen. Sin esto, el campo `type` del request convertía la tabla en imagen
  // y el lienzo saltaba al siguiente activo (bug del botón de estilo).
  const handleUpdateActivo = useCallback(
    (id: string, patch: ActivoPatch) => {
      const el = doc?.elements.find((e) => e.id === id);
      if (el?.type === 'table') {
        updateElementTable(id, patch);
      } else {
        updateElementImage(id, patch);
      }
    },
    [doc?.elements, updateElementImage, updateElementTable]
  );

  // Aplicar estilo o configuración a todas las imágenes
  const handleApplyToAll = useCallback(async () => {    if (!elementoActual?.image_info) return;
    const imageIds = todosContextos
      .filter((c) => c.tipo === 'image')
      .map((c) => c.id);
    if (imageIds.length === 0) return;

    await aplicarImagenAMuchas(imageIds, {
      width_cm: elementoActual.image_info.width_cm,
      alignment: elementoActual.image_info.alignment,
      design_style: elementoActual.image_info.design_style,
    });
  }, [elementoActual, todosContextos, aplicarImagenAMuchas]);

  // Aplicar estilo o configuración a todas las tablas
  const handleApplyTableToAll = useCallback(
    async (patch: ActivoPatch) => {
      const tableIds = todosContextos.filter((c) => c.tipo === 'table').map((c) => c.id);
      if (tableIds.length === 0) return;
      for (const id of tableIds) {
        updateElementTable(id, patch);
      }
    },
    [todosContextos, updateElementTable]
  );

  const handleDragGaleria = useCallback((dx: number) => {
    setGaleriaAncho((w) => clampAncho(w + dx, GALERIA_MIN, GALERIA_MAX));
  }, []);

  const handleDragInspector = useCallback((dx: number) => {
    setInspectorAncho((w) => clampAncho(w - dx, INSPECTOR_MIN, INSPECTOR_MAX));
  }, []);

  const galeria = (
    <GaleriaActivosColumna
      contextos={contextosDelTipo}
      indiceActivo={contextoActual ? contextoActual.indice : null}
      onSelectIndice={handleSelectIndice}
    />
  );

  const inspector = elementoActual ? (
    <InspectorActivoTabs
      elem={elementoActual}
      totalFiguras={conteos.image}
      totalTablas={conteos.table}
      onUpdate={handleUpdateActivo}
      onApplyToAll={handleApplyToAll}
      onApplyTableToAll={handleApplyTableToAll}
    />
  ) : (
    <aside
      style={{
        width: '100%',
        borderLeft: '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-bg-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--color-text-tertiary)',
        fontSize: '13px',
      }}
    >
      Selecciona un activo para inspeccionar
    </aside>
  );

  const lienzo = (
    <main
      style={{
        flex: modo === 'angosto' ? undefined : 1,
        width: modo === 'angosto' ? '100%' : undefined,
        height: modo === 'angosto' ? 'auto' : '100%',
        overflowY: modo === 'angosto' ? 'visible' : 'auto',
        padding: '32px 24px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 0,
      }}
    >
      <div style={{ width: '100%', maxWidth: '850px' }}>
        <header style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--color-text-primary)' }}>
              Taller de Activos Gráficos
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
              Ajusta cada figura y tabla del documento con criterios APA 7.
            </p>
          </div>
          {contextoActual && (
            <span
              style={{
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                fontVariantNumeric: 'tabular-nums',
                padding: '4px 8px',
                borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--color-bg-surface-alt)',
                color: 'var(--color-text-secondary)',
              }}
            >
              Activo {contextoActual.posicionEnTipo} de {contextosDelTipo.length}
            </span>
          )}
        </header>

        {contextoActual && elementoActual ? (
          <LienzoEditorialActivo
            figureNumber={contextoActual.posicionEnTipo}
            figureTitle={captionActual || contextoActual.leyenda || 'Sin título'}
            figureNote={infoTextoActual?.note}
            imageUrl={(() => {
              const cruda = elementoActual.image_info?.relative_url || contextoActual.url || '';
              return cruda ? resolveAssetUrl(cruda) : undefined;
            })()}
            tipo={contextoActual.tipo}
            tabla={contextoActual.tabla}
            anchoCm={contextoActual.anchoCm}
            altoCm={contextoActual.altoCm}
            prevParagraph={contextoActual.parrafoAnterior ?? undefined}
            nextParagraph={contextoActual.parrafoSiguiente ?? undefined}
            aiSuggestion={aiSuggestions[elementoActual.id]}
            aiLoading={Boolean(aiLoading[elementoActual.id])}
            aiError={aiErrors[elementoActual.id]}
            onRotate={esTablaActual ? undefined : handleRotate}
            onReplaceImage={esTablaActual ? undefined : handleReplaceImageClick}
            onApplyCaption={handleApplyCaption}
            onRegenerateSuggestion={handleRegenerateSuggestion}
            onGenerarSuggestion={handleRegenerateSuggestion}
            onEditarCeldaTabla={handleEditarCeldaTabla}
            border={elementoActual.image_info?.border}
            shadow={elementoActual.image_info?.shadow}
            cornerRadius={elementoActual.image_info?.corner_radius}
            rotation={elementoActual.image_info?.rotation}
            flipH={elementoActual.image_info?.flip_h}
            flipV={elementoActual.image_info?.flip_v}
            designStyle={contextoActual.designStyle}
            subfiguras={subfigurasVista}
            onImportSubfigure={esTablaActual ? undefined : handleImportSubfigure}
          />
        ) : (
          <div
            style={{
              padding: '48px 24px',
              textAlign: 'center',
              backgroundColor: 'var(--color-bg-surface)',
              border: '1px dashed var(--color-border-subtle)',
              borderRadius: 'var(--radius-lg)',
              color: 'var(--color-text-secondary)',
            }}
          >
            <p style={{ margin: 0, fontSize: '14px' }}>
              No se encontraron {tipoActivo === 'image' ? 'figuras' : tipoActivo === 'table' ? 'tablas' : 'ecuaciones'} en este documento.
            </p>
          </div>
        )}
      </div>
    </main>
  );

  return (
    <div
      ref={rootRef}
      data-testid="taller-figuras-view"
      data-modo={modo}
      className="fig-taller"
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        backgroundColor: 'var(--canvas-bg)',
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        style={{ display: 'none' }}
        data-testid="hidden-file-input"
      />
      <input
        type="file"
        ref={subfigInputRef}
        onChange={handleSubfigInputChange}
        accept="image/*"
        style={{ display: 'none' }}
        data-testid="hidden-subfig-input"
      />

      {/* 1. Rail de tipos (extrema izquierda, 56px) */}
      <RailTipoActivos
        tipoActivo={tipoActivo}
        conteos={conteos}
        onTipoChange={handleTipoChange}
      />

      {modo === 'ancho' && (
        <>
          <div
            style={{
              position: 'relative',
              flexShrink: 0,
              width: `${galeriaAncho}px`,
              minWidth: 0,
              height: '100%',
              display: 'flex',
            }}
          >
            {galeria}
            <PanelResizeHandle ariaLabel="Ajustar ancho de galería" onDrag={handleDragGaleria} />
          </div>
          {lienzo}
          <div
            style={{
              position: 'relative',
              flexShrink: 0,
              width: `${inspectorAncho}px`,
              minWidth: 0,
              height: '100%',
              display: 'flex',
            }}
          >
            <PanelResizeHandle ariaLabel="Ajustar ancho del inspector" onDrag={handleDragInspector} />
            {inspector}
          </div>
        </>
      )}

      {modo === 'medio' && (
        <>
          <div
            style={{
              position: 'relative',
              flexShrink: 0,
              width: `${galeriaAncho}px`,
              minWidth: 0,
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <div style={{ flex: '1 1 0', minHeight: 0, display: 'flex', overflow: 'hidden' }}>
              {galeria}
            </div>
            <div
              style={{
                flex: '1 1 0',
                minHeight: 0,
                display: 'flex',
                overflow: 'hidden',
                borderTop: '1px solid var(--color-border-subtle)',
              }}
            >
              {inspector}
            </div>
            <PanelResizeHandle ariaLabel="Ajustar ancho de galería" onDrag={handleDragGaleria} />
          </div>
          {lienzo}
        </>
      )}

      {modo === 'angosto' && (
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: '100%',
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              minHeight: '260px',
              display: 'flex',
              flexShrink: 0,
              borderBottom: '1px solid var(--color-border-subtle)',
            }}
          >
            {galeria}
          </div>
          {lienzo}
          <div
            style={{
              display: 'flex',
              flexShrink: 0,
              borderTop: '1px solid var(--color-border-subtle)',
            }}
          >
            {inspector}
          </div>
        </div>
      )}
    </div>
  );
};
