import React, { useState } from 'react';
import {
  Zap,
  CheckCircle2,
  FileText,
  ShieldCheck,
  FolderOpen,
  FileCheck,
  Maximize2,
  X,
  Loader2,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';
import * as api from '../../api/backend';
/* La lista de "qué adaptar" sale de `modulosApa.ts`: el menú de la barra y este
   modal ofrecen EXACTAMENTE lo mismo, y el motor solo entiende tres alcances. */
import { ALCANCES_DEL_MOTOR, GRUPOS_DE_MODULOS, modulosDe } from '../../lib/modulosApa';

interface ExpressQuickTransformModalProps {
  fileName: string;
  fileBuffer?: Uint8Array;
  filePath?: string;
  onClose?: () => void;
  onOpenFullEditor?: () => void;
}

export const ExpressQuickTransformModal: React.FC<ExpressQuickTransformModalProps> = ({
  fileName,
  filePath,
  onClose,
  onOpenFullEditor,
}) => {
  const [isFullQuality, setIsFullQuality] = useState(true);
  const [scopes, setScopes] = useState<string[]>([...ALCANCES_DEL_MOTOR]);
  const [status, setStatus] = useState<'idle' | 'processing' | 'done' | 'error'>('idle');
  const [currentStep, setCurrentStep] = useState<string>('');
  const [resultFileUrl, setResultFileUrl] = useState<string | null>(null);
  const [resultFilePath, setResultFilePath] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const doc = useDocStore((s) => s.doc);
  const isBackendReady = useDocStore((s) => s.isBackendReady);

  const toggleScope = (scopeId: string) => {
    setIsFullQuality(false);
    setScopes((prev) =>
      prev.includes(scopeId) ? prev.filter((s) => s !== scopeId) : [...prev, scopeId]
    );
  };

  const handleStartTransform = async () => {
    if (status === 'processing') return;
    setStatus('processing');
    setErrorMessage(null);

    try {
      setCurrentStep('Analizando estructura del documento...');
      await new Promise((r) => setTimeout(r, 600));

      const activeDoc = useDocStore.getState().doc;
      if (!activeDoc) {
        throw new Error('No se pudo inicializar la sesión del documento.');
      }

      setCurrentStep('Aplicando formato oficial APA 7 (márgenes, sangrías, interlineado)...');
      
      // Aplicar reglas y scopes seleccionados
      const activeScopes = isFullQuality ? [] : scopes;
      useDocStore.getState().setSessionScopes(activeScopes);

      // Generar documento APA7 in-place con máxima fidelidad y portada original intacta
      setCurrentStep('Generando archivo final con portada original intacta...');
      const genRes = await api.generateDocx(activeDoc.session_id);
      
      if (genRes && genRes.download_url) {
        /* Root-relative (`/api/download-artifact/...`); en Electron el renderer
           vive en `app://`, así que hay que prefijar el host del backend. */
        setResultFileUrl(api.resolveAssetUrl(genRes.download_url));
        setResultFilePath(genRes.saved_path || null);
        setStatus('done');
        setCurrentStep('');
      } else {
        throw new Error('El motor no devolvió la URL de descarga.');
      }
    } catch (err: any) {
      setStatus('error');
      setErrorMessage(err.message || 'Error al procesar el documento en modo express.');
    }
  };

  const handleOpenInWord = async () => {
    if (resultFilePath) {
      const ew = window as any;
      if (ew.electronAPI?.openPath) {
        ew.electronAPI.openPath(resultFilePath);
        return;
      }
    }
    const activeDoc = useDocStore.getState().doc;
    if (activeDoc) {
      try {
        await api.openInWord(activeDoc.session_id);
      } catch {
        if (resultFileUrl) window.open(resultFileUrl, '_blank');
      }
    } else if (resultFileUrl) {
      window.open(resultFileUrl, '_blank');
    }
  };

  const handleShowInFolder = () => {
    if (resultFilePath) {
      const ew = window as any;
      if (ew.electronAPI?.showItemInFolder) {
        ew.electronAPI.showItemInFolder(resultFilePath);
        return;
      }
    }
    if (resultFileUrl) {
      window.open(resultFileUrl, '_blank');
    }
  };

  const handleExpandFull = () => {
    const ew = window as any;
    if (ew.electronAPI?.expandToFullEditor) {
      ew.electronAPI.expandToFullEditor();
    }
    if (onOpenFullEditor) {
      onOpenFullEditor();
    }
  };

  return (
    <div
      style={{
        width: '100%',
        minHeight: '100vh',
        backgroundColor: 'var(--canvas-bg, #f8f9fa)',
        fontFamily: 'var(--font-sans, system-ui, -apple-system, sans-serif)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        color: 'var(--text-main, #1a1a2e)',
        overflow: 'hidden',
      }}
    >
      {/* Barra superior compacta */}
      <div
        style={{
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          backgroundColor: 'var(--sidebar-bg, #ffffff)',
          borderBottom: '1px solid var(--border-subtle, #e5e7eb)',
          WebkitAppRegion: 'drag',
        } as any}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', WebkitAppRegion: 'no-drag' } as any}>
          <div
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: 'var(--accent-primary, #4f7cff)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
            }}
          >
            <Zap size={14} />
          </div>
          <span style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '-0.01em' }}>WordAPA7 Express</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', WebkitAppRegion: 'no-drag' } as any}>
          <button
            type="button"
            onClick={handleExpandFull}
            title="Abrir editor completo"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-secondary, #6b7280)',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
            }}
          >
            <Maximize2 size={15} />
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Cerrar"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--text-secondary, #6b7280)',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
              }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Contenido Principal */}
      <div
        style={{
          flex: 1,
          padding: '20px 24px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '16px',
          overflowY: 'auto',
        }}
      >
        {/* Cabecera del archivo */}
        <div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 14px',
              backgroundColor: 'var(--surface-elevated, #ffffff)',
              border: '1px solid var(--border-subtle, #e5e7eb)',
              borderRadius: '12px',
              boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.05))',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: 'rgba(79, 124, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary, #4f7cff)',
                flexShrink: 0,
              }}
            >
              <FileText size={20} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: 'var(--text-main, #1a1a2e)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={fileName}
              >
                {fileName}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  color: 'var(--color-success)',
                  fontWeight: 600,
                  marginTop: '2px',
                }}
              >
                <ShieldCheck size={13} />
                <span>Portada original 100% protegida e intacta</span>
              </div>
            </div>
          </div>
        </div>

        {/* Estado IDLE: Opciones de transformación */}
        {status === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary, #6b7280)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              ¿Qué adaptar a formato APA 7?
            </div>

            {/* Opción Máxima Calidad */}
            <button
              type="button"
              onClick={() => {
                setIsFullQuality(true);
                setScopes([...ALCANCES_DEL_MOTOR]);
              }}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: '10px',
                border: `2px solid ${isFullQuality ? 'var(--accent-primary, #4f7cff)' : 'var(--border-subtle, #e5e7eb)'}`,
                backgroundColor: isFullQuality ? 'rgba(79, 124, 255, 0.06)' : 'var(--surface-elevated, #ffffff)',
                cursor: 'pointer',
                textAlign: 'left',
                fontFamily: 'inherit',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: `2px solid ${isFullQuality ? 'var(--accent-primary, #4f7cff)' : 'var(--border-strong, #9ca3af)'}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: '2px',
                  flexShrink: 0,
                }}
              >
                {isFullQuality && (
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent-primary, #4f7cff)' }} />
                )}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 800, color: 'var(--text-main, #1a1a2e)' }}>
                  <Sparkles size={14} color="var(--accent-primary, #4f7cff)" />
                  <span>Máxima Calidad (Recomendado)</span>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #6b7280)', marginTop: '2px', lineHeight: 1.4 }}>
                  Márgenes 2.54 cm, sangrías 1.27 cm, interlineado doble 2.0, títulos estructurados, tablas/figuras y bibliografía ordenada.
                </div>
              </div>
            </button>

            {/* Opciones individuales, en las mismas dos categorías que el menú
                de la barra. El rótulo del grupo va antes de sus módulos. */}
            <div
              style={{
                backgroundColor: 'var(--surface-elevated, #ffffff)',
                border: '1px solid var(--border-subtle, #e5e7eb)',
                borderRadius: '10px',
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              {GRUPOS_DE_MODULOS.map((grupo) => (
                <div
                  key={grupo.id}
                  role="group"
                  aria-label={grupo.titulo}
                  style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
                >
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      color: 'var(--text-secondary, #6b7280)',
                    }}
                  >
                    {grupo.titulo}
                  </span>
                  {modulosDe(grupo.id).map((s) => {
                    const checked = isFullQuality || scopes.includes(s.id);
                    return (
                      <label
                        key={s.id}
                        onClick={() => toggleScope(s.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          padding: '6px 4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent-primary, #4f7cff)' }}
                        />
                        <div style={{ flex: 1 }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-main, #1a1a2e)' }}>{s.etiqueta}</span>
                          <span style={{ display: 'block', fontSize: '10px', color: 'var(--text-secondary, #6b7280)' }}>{s.descripcion}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Estado PROCESSING: Barra de progreso animada */}
        {status === 'processing' && (
          <div
            style={{
              padding: '24px 16px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '16px',
            }}
          >
            <div
              style={{
                width: '54px',
                height: '54px',
                borderRadius: '50%',
                backgroundColor: 'rgba(79, 124, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--accent-primary, #4f7cff)',
              }}
            >
              <Loader2 size={28} style={{ animation: 'spin 1s linear infinite' }} />
            </div>

            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--text-main, #1a1a2e)', marginBottom: '4px' }}>
                Transformando a APA 7 en segundo plano
              </div>
              <div style={{ fontSize: '12px', color: 'var(--accent-primary, #4f7cff)', fontWeight: 600 }}>
                {currentStep || 'Procesando archivo...'}
              </div>
            </div>

            <div
              style={{
                width: '100%',
                height: '6px',
                backgroundColor: 'var(--border-subtle, #e5e7eb)',
                borderRadius: '999px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: '70%',
                  backgroundColor: 'var(--accent-primary, #4f7cff)',
                  borderRadius: '999px',
                  animation: 'pulse 1.5s ease-in-out infinite',
                }}
              />
            </div>
          </div>
        )}

        {/* Estado DONE: Resultado con botones de apertura directa */}
        {status === 'done' && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              padding: '12px 0',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '14px',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '12px',
              }}
            >
              <CheckCircle2 size={26} color="var(--color-success)" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-main, #1a1a2e)' }}>
                  ¡Documento transformado con éxito!
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary, #6b7280)', marginTop: '2px' }}>
                  Normas APA 7 aplicadas al 100% respetando la portada original.
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
              <button
                type="button"
                onClick={handleOpenInWord}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: 'var(--accent-primary, #4f7cff)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: 'var(--shadow-md, 0 4px 6px rgba(0,0,0,0.1))',
                }}
              >
                <FileCheck size={16} />
                Abrir documento en Microsoft Word
              </button>

              <button
                type="button"
                onClick={handleShowInFolder}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '10px 16px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-subtle, #e5e7eb)',
                  backgroundColor: 'var(--surface-elevated, #ffffff)',
                  color: 'var(--text-main, #1a1a2e)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <FolderOpen size={15} />
                Ver en carpeta contenedora
              </button>
            </div>
          </div>
        )}

        {/* Estado ERROR */}
        {status === 'error' && (
          <div
            style={{
              padding: '14px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '10px',
              color: 'var(--color-danger)',
              fontSize: '12px',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>No se pudo completar la transformación</div>
            <div>{errorMessage}</div>
            <button
              type="button"
              onClick={() => setStatus('idle')}
              style={{
                marginTop: '10px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid currentColor',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontWeight: 700,
                fontSize: '11px',
              }}
            >
              Reintentar
            </button>
          </div>
        )}

        {/* Botones de acción inferiores */}
        <div style={{ borderTop: '1px solid var(--border-subtle, #e5e7eb)', paddingTop: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
          {status === 'idle' && (
            <>
              <button
                type="button"
                onClick={handleExpandFull}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--text-secondary, #6b7280)',
                  fontSize: '12px',
                  fontWeight: 600,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Abrir editor completo <ChevronRight size={13} />
              </button>

              <button
                type="button"
                onClick={handleStartTransform}
                disabled={!isBackendReady}
                style={{
                  padding: '11px 20px',
                  borderRadius: '10px',
                  border: 'none',
                  backgroundColor: 'var(--accent-primary, #4f7cff)',
                  color: '#ffffff',
                  fontSize: '13px',
                  fontWeight: 800,
                  cursor: isBackendReady ? 'pointer' : 'wait',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  boxShadow: 'var(--shadow-md, 0 4px 6px rgba(0,0,0,0.1))',
                }}
              >
                <Zap size={15} />
                Transformar a APA 7
              </button>
            </>
          )}

          {status === 'done' && (
            <>
              <button
                type="button"
                onClick={handleExpandFull}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--accent-primary, #4f7cff)',
                  fontSize: '12px',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                Revisar en editor completo <ChevronRight size={13} />
              </button>

              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle, #e5e7eb)',
                    backgroundColor: 'transparent',
                    color: 'var(--text-secondary, #6b7280)',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Cerrar
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
