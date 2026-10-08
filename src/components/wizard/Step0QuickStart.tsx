import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useDocStore } from '../../store/useDocStore';
import * as api from '../../api/backend';
import { SessionRecovery, FormatProfile, APARuleSet } from '../../types';
import {
  FileText, Loader2, Clock, FolderOpen, ArrowLeft,
  FileUp, Menu, Lock, AlertTriangle, MousePointerClick, BadgeCheck, ShieldCheck, FileCheck, Plug, FlaskConical, Sparkles, Download, Layers,
  Sliders, AlignLeft, Check
} from 'lucide-react';
import { UploadDropzone } from '../upload/UploadDropzone';
import { Card } from '../ui/wordapa7';
import { HomeHero } from '../layout/HomeHero';
import { IconRail } from '../shell/IconRail';
import { useRailFlyout } from '../../hooks/useRailFlyout';
import { HOME_RAIL_ITEMS } from '../shell/railItems';
import type { RailDestination } from '../shell/railItems';
import { EditorialMascot } from '../layout/EditorialMascot';
import { AppBrandLogo } from '../shared/AppBrandLogo';

type ChromeStyle = React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' };
const dragRegion = { WebkitAppRegion: 'drag' } as ChromeStyle;
const noDragRegion = { WebkitAppRegion: 'no-drag' } as ChromeStyle;

// Fallback mientras /api/profiles aún no respondió (el campo rules nunca se usa acá)
const FALLBACK_PROFILES: FormatProfile[] = [{
  profile_id: 'apa7',
  display_name: 'APA 7ª edición',
  description: 'Norma APA 7 por defecto',
  cover_required_fields: ['title', 'author', 'institution'],
  latex_documentclass: 'apa7',
  latex_options: 'stu, 12pt',
  cover_apa_format: 'student',
  rules: {} as APARuleSet,
}];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

/** Los destinos del rail de Inicio que son pestañas y no acciones. El resto
 *  (nueva transformación, complemento, ajustes, tema) no se encienden nunca. */
const HOME_PESTANAS: Record<string, 'inicio' | 'recientes'> = {
  'home-inicio': 'inicio',
  'home-recientes': 'recientes',
};

/** DEV: diagnóstico del complemento de Word (sideload System Feed). */
const AddinDiagnosticCard: React.FC = () => {
  const [status, setStatus] = useState<api.SideloadStatus | null>(null);
  const [repairing, setRepairing] = useState(false);

  const refresh = () => {
    if (typeof api.getSideloadStatus !== 'function') return;
    api.getSideloadStatus().then(setStatus).catch(() => setStatus(null));
  };
  useEffect(() => { refresh(); }, []);

  const installed = !!status?.installed;
  let installedAt = '';
  try {
    if (installed && status?.installed_at) installedAt = new Date(status.installed_at).toLocaleString();
  } catch { /* noop */ }
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '14px',
      padding: '12px 16px', borderRadius: 'var(--radius-lg)',
      background: 'var(--surface-elevated)', border: '1px solid var(--border-subtle)',
      marginBottom: '20px', maxWidth: '620px', marginInline: 'auto',
    }}>
      <Plug size={18} color={installed ? 'var(--color-success)' : 'var(--color-danger)'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--text-sm)', fontWeight: 700, color: 'var(--text-main)' }}>
          Complemento de Word: {installed ? 'instalado' : 'no instalado'}
          {installed && status?.up_to_date === false ? ' (desactualizado)' : ''}
        </div>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginTop: '2px' }}>
          {installed
            ? (installedAt ? `System Feed · ${installedAt}` : 'Instalado en System Feed')
            : 'Ejecutá "Reintentar" y luego cerrá Word completo (revisá la bandeja) y abrilo de nuevo.'}
        </div>
      </div>
      <button
        type="button"
        disabled={repairing}
        onClick={() => {
          setRepairing(true);
          api.repairSideload()
            .then(() => useDocStore.getState().showToast('Complemento reinstalado. Cerrá Word y volvé a abrirlo.', 'success'))
            .catch((e) => useDocStore.getState().showToast(`Fallo reparación: ${String(e)}`, 'error'))
            .finally(() => { setRepairing(false); refresh(); });
        }}
        style={{
          fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'inherit',
          padding: '5px 12px', cursor: repairing ? 'wait' : 'pointer',
          borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-primary)',
          background: 'transparent', color: 'var(--accent-primary)',
        }}
      >
        Reintentar instalación
      </button>
    </div>
  );
};

function timeAgo(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 3600) return `Hace ${Math.floor(diff / 60)} minutos`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} horas`;
  const days = Math.floor(diff / 86400);
  if (days === 1) return 'Ayer';
  return `Hace ${days} días`;
}

export const Step0QuickStart: React.FC = () => {
  const {
    uploadFile, setActiveProfile, isLoading, isBackendReady, error, openSession,
    profiles, activeProfileId,
  } = useDocStore();
  const [activeTab, setActiveTab] = useState<'inicio' | 'recientes'>('inicio');
  const [greeting] = useState(getGreeting());
  const [dragging, setDragging] = useState(false);
  const [recentSessions, setRecentSessions] = useState<SessionRecovery[]>([]);
  const [loadingRecents, setLoadingRecents] = useState(false);
  const [recoveringId, setRecoveringId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  // Load real sessions from backend when it's ready
  useEffect(() => {
    if (!isBackendReady) return;
    setLoadingRecents(true);
    api.listSessions()
      .then(sessions => setRecentSessions(sessions || []))
      .catch(() => setRecentSessions([]))
      .finally(() => setLoadingRecents(false));
  }, [isBackendReady]);

  // ── Subida inmediata: al soltar o elegir un archivo arranca el proceso ──
  // No hay paso intermedio de previsualización. Siempre Modo Guiado (review).
  // CRITICAL: dar feedback al usuario cuando el backend no está listo en lugar
  // de retornar silenciosamente — antes "no hace nada" al arrastrar un archivo.
  const [scopeFilterOpen, setScopeFilterOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);

  const doUpload = (file: File) => {
    uploadFile(file, { profileId: activeProfileId, mode: 'review' });
  };

  const handleUploadFile = (file: File) => {
    if (isLoading) return;
    if (!isBackendReady) {
      useDocStore.getState().showToast(
        'El motor está iniciando. Aguardá unos segundos e intentá de nuevo.',
        'warning'
      );
      return;
    }
    if (!file.name.toLowerCase().endsWith('.docx')) {
      useDocStore.getState().showToast('Solo se aceptan archivos .docx', 'warning');
      return;
    }
    // Entrada directa al editor: sin modal invasivo previo
    doUpload(file);
  };

  const handleFilePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    handleUploadFile(file);
  };

  const handleFolderPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    const docxFiles = files.filter(f => f.name.toLowerCase().endsWith('.docx'));
    const imgFiles = files.filter(f => /\.(png|jpe?g|webp|svg)$/i.test(f.name));

    for (const img of imgFiles) {
      /* La F7 hizo `addProjectImage` asincrona: la imagen sube a
         `/api/assets`. Sin el `await`, el aviso de abajo contaria imagenes que
         todavia no estan en disco. */
      await useDocStore.getState().addProjectImage(img);
    }

    if (docxFiles.length > 0) {
      uploadFile(docxFiles[0], { profileId: activeProfileId, mode: 'review' });
      for (let i = 1; i < docxFiles.length; i++) {
        uploadFile(docxFiles[i], { profileId: activeProfileId, mode: 'review' });
      }
      useDocStore.getState().showToast(`Carpeta vinculada: ${docxFiles.length} documento(s) y ${imgFiles.length} imágenes detectadas`, 'success');
    } else {
      useDocStore.getState().showToast('No se encontraron documentos .docx en la carpeta seleccionada', 'warning');
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (isLoading) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.toLowerCase().endsWith('.docx')) {
      handleUploadFile(file);
    } else if (file) {
      useDocStore.getState().showToast('Solo se aceptan archivos .docx', 'warning');
    }
  };

  const triggerFilePicker = () => {
    if (isLoading) return;    if (!isBackendReady) {
      useDocStore.getState().showToast(
        'El motor está iniciando. Aguardá unos segundos e intentá de nuevo.',
        'warning'
      );
      return;
    }
    fileInputRef.current?.click();
  };

  const handleRecoverSession = async (sessionId: string, _fileName: string) => {
    setRecoveringId(sessionId);
    try {
      await openSession(sessionId);
    } catch (e) {
      console.error('Error recovering session:', e);
    } finally {
      setRecoveringId(null);
    }
  };

  // ── RAIL COMPARTIDO ──────────────────────────────────────────────────────
  // Inicio ya no tiene columna propia: usa el mismo IconRail que el editor, con
  // su propio juego de destinos. Toda la máquina de abrir/cerrar el detalle —
  //incluido que el ancla entre limpia, porque es un flag global y Inicio no
  // tiene un panel que sobreviva a la pantalla— vive en `useRailFlyout`, el
  // MISMO hook que usa `AppShell`. La copia de acá era la segunda, y dos copias
  // de una máquina de estados que comparte un flag global es donde se separan.
  const flyout = useRailFlyout();

  /* Los destinos de Inicio son datos, pero dos de ellos son pestañas: el "dónde
     estás" lo pone la pantalla, que es la única que sabe cuál está a la vista.
     El resto de destinos son acciones y no se encienden nunca. */
  const homeItems = useMemo(
    () =>
      HOME_RAIL_ITEMS.map((item) => {
        const tab = HOME_PESTANAS[item.id];
        return tab ? { ...item, current: tab === activeTab } : item;
      }),
    [activeTab],
  );

  // Cada destino hace lo mismo que su botón del sidebar de 64px, y los tres
  // destinos nuevos llevan a la misma acción que ya ofrece el resto de la app.
  // Sin useCallback a propósito: el picker de archivos se decide con el estado
  // del render actual (¿ya arrancó el motor?), y una versión congelada respondería
  // con el `isBackendReady` del primer render para siempre.
  const handleSelect = (item: RailDestination) => {
    const st = useDocStore.getState();
    // Igual que `AppShell`: el clic también abre y ancla el detalle, porque con
    // teclado no hay hover que lo haya abierto. Si acá solo ejecutara la
    // acción, el flyout y su pin quedarían solo con ratón y los dos rails se
    // comportarían distinto siendo el mismo componente.
    flyout.selectItem(item);

    switch (item.id) {
      case 'home-inicio':
        setActiveTab('inicio');
        break;
      case 'home-recientes':
        setActiveTab('recientes');
        break;
      case 'home-nueva':
        triggerFilePicker();
        break;
      case 'home-ajustes':
        /* Un destino, no tres. 'home-addin', 'home-ajustes' y 'home-tema' eran
           tres filas del mismo hub en tres iconos, y cada una abría una pantalla
           distinta: el complemento en el estudio viejo, Ajustes en un panel que
           era INALCANZABLE con un documento abierto, y el tema en un toggle sin
           memoria. Ahora las tres están en el hub, en Conexión y App. */
        st.setSettingsHubOpen(true, 'conexion');
        break;
    }
  };

  const busy = isLoading || !isBackendReady;
  const isElectron = !!(window as any).electronAPI;

  return (
    <div style={{
      display: 'flex', width: '100%', height: '100vh',
      backgroundColor: 'var(--canvas-bg)', fontFamily: 'var(--font-sans)',
      position: 'relative', flexDirection: 'column',
    }}>
      {/* ── Franja superior de arrastre (ventana) ──
          Simplificada: solo branding + Archivo. El botón "Ajustes y vista
          previa" fue eliminado porque duplica los Ajustes del rail. */}
      <div style={{
        height: '44px', flexShrink: 0, display: 'flex', alignItems: 'center',
        gap: '8px', padding: '0 16px 0 20px',
        backgroundColor: 'var(--sidebar-bg)',
        borderBottom: '1px solid var(--border-subtle)',
        position: 'relative', zIndex: 20,
        ...dragRegion,
      }}>
        {/* Branding: logo formal WordAPA7 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
          <AppBrandLogo size={22} />
        </div>

        <div style={{ flex: 1 }} />

        {/* Botón: Volver al documento abierto */}
        {(() => {
          const s = useDocStore.getState();
          if (s.atHome && s.tabs && s.tabs.length > 0) {
            return (
              <button
                type="button"
                onClick={() => useDocStore.getState().switchToTab(s.activeTabIndex || 0)}
                title="Volver al documento abierto"
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '4px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                  backgroundColor: 'var(--color-accent-soft)', color: 'var(--accent-primary)',
                  border: '1px solid var(--accent-primary)', fontFamily: 'inherit',
                  fontSize: 'var(--text-xs)', fontWeight: 700,
                  marginRight: isElectron ? 140 : 0, // reserva para botones nativos
                  ...noDragRegion,
                }}
              >
                <ArrowLeft size={13} /> Volver a {s.tabs[s.activeTabIndex || 0]?.file_name || 'documento'}
              </button>
            );
          }
          // Spacer para reservar espacio de los botones nativos de la ventana
          return isElectron ? <div style={{ width: '140px', flexShrink: 0, ...noDragRegion }} /> : null;
        })()}
      </div>

      {/* Hidden file inputs */}
      <input type="file" ref={fileInputRef} onChange={handleFilePicked} accept=".docx" style={{ display: 'none' }} />
      <input
        type="file"
        ref={folderInputRef}
        onChange={handleFolderPicked}
        // @ts-expect-error atributo no estandar webkitdirectory fuera de los tipos de React
        webkitdirectory="true"
        directory=""
        multiple
        style={{ display: 'none' }}
      />

      {/* ── CONTENIDO (rail + principal) ── */}
      {/* `position: relative` es el bloque contenedor del flyout: sin él, el
          `top: 12` del panel se mediría desde el borde de la ventana y la
          franja de 44px de arriba se comería su primera fila. */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
      {/* ── RAIL DE ICONOS (mismo componente que el editor) ─── */}
      <IconRail
        items={homeItems}
        ariaLabel="Navegación principal"
        onEnterRail={flyout.onEnterRail}
        onLeaveRail={flyout.onLeaveRail}
        onSelect={handleSelect}
      />

      {/* El hub de Ajustes se abre desde `App.tsx`, no desde acá: es un flag del
          store y un solo montaje. Este archivo ya no sabe qué hay dentro. */}

      {/* ── ÁREA PRINCIPAL ─── */}
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '60px 48px' }}>

        {/* Error global */}
        {error && (
          <div role="alert" style={{
            padding: '12px 20px',
            marginBottom: '20px',
            backgroundColor: 'var(--color-danger-a12)', border: '1px solid var(--color-danger)',
            color: 'var(--color-danger)', borderRadius: 'var(--radius-md)', fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            <AlertTriangle size={16} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>{error}</span>
            <button
              type="button"
              aria-label="Cerrar error"
              onClick={() => useDocStore.setState({ error: null })}
              style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'var(--text-lg)', padding: '2px' }}
            >
              ×
            </button>
          </div>
        )}

        {/* ── INICIO ── */}
        {activeTab === 'inicio' && (
          <div style={{ maxWidth: '880px', margin: '0 auto' }}>
            {/* Hero Editorial Académico */}
            <HomeHero />

            {/* ── ACCIÓN PRIMARIA: Focus Dropzone Editorial Fluent ── */}
            <div style={{
              background: 'var(--surface-elevated)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-card)',
              overflow: 'hidden',
              marginBottom: '32px',
            }}>
              {/* Barra superior integrada: solo el selector de perfil.

                  Se fueron "Norma APA 7ma Edición" y "· Motor editorial local"
                  porque el usuario los nombró como texto que se repite demasiado,
                  y porque la barra queda a la derecha con un solo hijo: con dos
                  justificaba el espacio repartido, con uno no, y el espacio
                  sobrante se va.

                  Y con el rótulo "Perfil:" pasó lo mismo: el `<select>` ya
                  muestra el nombre del perfil elegido, así que la etiqueta sólo
                  decía lo obvio. El CONTROL se queda, que es otra cosa: es el
                  atajo para cambiar de perfil sin abrir Ajustes.

                  Antes este comentario decía que el `<select>` era "la única
                  forma de cambiar de perfil sin entrar a Ajustes", y era
                  verdad cuando se escribió. Hoy la pestaña Documento de Ajustes
                  tiene el mismo control CON SU DESCRIPCIÓN, así que la frase
                  era falsa y este `<select>` es lo que se llama: un atajo. */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                padding: '12px 24px',
                borderBottom: '1px solid var(--border-subtle)',
                background: 'var(--surface-subtle)',
                flexWrap: 'wrap',
                gap: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    id="apa-profile-select"
                    value={activeProfileId}
                    onChange={(e) => setActiveProfile(e.target.value)}
                    disabled={isLoading}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border-subtle)',
                      backgroundColor: 'var(--surface-elevated)',
                      color: 'var(--text-main)',
                      fontFamily: 'inherit',
                      fontSize: 'var(--text-xs)',
                      fontWeight: 600,
                      cursor: isLoading ? 'wait' : 'pointer',
                      boxShadow: '0 1px 3px var(--surface-subtle)',
                    }}
                  >
                    {(profiles.length > 0 ? profiles : FALLBACK_PROFILES).map((p) => (
                      <option key={p.profile_id} value={p.profile_id}>
                        {p.display_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Zona interactiva de arrastrar o hacer clic */}
              <div
                onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={triggerFilePicker}
                role="button"
                tabIndex={0}
                aria-label="Seleccionar o arrastrar documento .docx"
                onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !busy) { e.preventDefault(); triggerFilePicker(); } }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '36px 24px 30px',
                  cursor: busy ? 'wait' : 'pointer',
                  backgroundColor: dragging ? 'var(--color-accent-soft)' : 'transparent',
                  transition: 'all 0.2s ease',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <div style={{
                  width: '60px',
                  height: '60px',
                  borderRadius: 'var(--radius-full)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: dragging ? 'var(--accent-primary)' : 'var(--color-accent-soft)',
                  marginBottom: '16px',
                  transition: 'all 0.25s ease',
                  boxShadow: dragging ? '0 0 0 6px var(--color-accent-soft)' : 'none',
                }}>
                  <FileUp size={28} color={dragging ? 'var(--color-text-on-accent)' : 'var(--accent-primary)'} />
                </div>

                <div style={{ fontSize: 'var(--text-xl)', fontWeight: 800, color: 'var(--text-main)', marginBottom: '6px', textAlign: 'center' }}>
                  {isLoading ? 'Analizando documento…' : 'Arrastrá tu documento Word (.docx) aquí'}
                </div>

                <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: '20px', textAlign: 'center', maxWidth: '460px' }}>
                  Ajuste automático de portada, títulos jerárquicos, márgenes, tablas, figuras y referencias sin alterar tu texto original.
                </div>

                {/* Botones de acción integrados */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); triggerFilePicker(); }}
                    disabled={busy}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '11px 24px',
                      borderRadius: 'var(--radius-lg)',
                      border: 'none',
                      cursor: busy ? 'wait' : 'pointer',
                      backgroundColor: 'var(--accent-primary)',
                      color: 'var(--color-text-on-accent)',
                      fontFamily: 'inherit',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 700,
                      boxShadow: '0 4px 14px var(--color-accent-a30)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 6px 18px var(--color-accent-a40)'; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = '0 4px 14px var(--color-accent-a30)'; }}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Procesando documento…
                      </>
                    ) : !isBackendReady ? (
                      <>
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Iniciando motor editorial…
                      </>
                    ) : (
                      <>
                        <FileUp size={16} />
                        Abrir documento de Word
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!busy) folderInputRef.current?.click();
                    }}
                    disabled={busy}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '11px 20px',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid var(--border-subtle)',
                      cursor: busy ? 'wait' : 'pointer',
                      backgroundColor: 'var(--surface-elevated)',
                      color: 'var(--text-main)',
                      fontFamily: 'inherit',
                      fontSize: 'var(--text-sm)',
                      fontWeight: 600,
                      boxShadow: '0 2px 6px var(--surface-subtle)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { if (!busy) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.borderColor = 'var(--accent-primary)'; } }}
                    onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                    title="Vincular la carpeta de tu tesis o trabajo para detectar todos los .docx y figuras"
                  >
                    <FolderOpen size={16} color="var(--accent-primary)" />
                    <span>Abrir carpeta de proyecto...</span>
                  </button>
                </div>
              </div>

              {/* Mensaje de garantía al pie de la dropzone */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '10px 20px',
                background: 'var(--surface-subtle)',
              }}>
                <BadgeCheck size={14} color="var(--color-success)" style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', fontWeight: 500 }}>
                  Procesamiento local y privado. El texto de tu documento original nunca se pierde ni se altera.
                </span>
              </div>
            </div>

            {/* ── RECIENTES INMEDIATOS (visible sin scroll cuando existen) ── */}
            {recentSessions.length > 0 && (
              <div style={{ marginBottom: '32px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} color="var(--accent-primary)" />
                    <h2 style={{ fontSize: 'var(--text-lg)', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                      Continuar documento reciente
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('recientes')}
                    style={{
                      fontSize: 'var(--text-sm)', color: 'var(--accent-primary)', cursor: 'pointer',
                      background: 'none', border: 'none', padding: 0, fontFamily: 'inherit', fontWeight: 600,
                    }}
                  >
                    Ver todos ({recentSessions.length}) →
                  </button>
                </div>
                <div style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px var(--color-ink-a05)',
                }}>
                  <RecentsList
                    sessions={recentSessions.slice(0, 4)}
                    loading={loadingRecents}
                    backendReady={isBackendReady}
                    recoveringId={recoveringId}
                    onOpen={handleRecoverSession}
                  />
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── RECIENTES ── */}
        {activeTab === 'recientes' && (
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <h1 style={{ fontSize: 'var(--text-2xl)', fontWeight: 800, color: 'var(--text-main)', marginBottom: '24px', marginTop: 0 }}>
              Documentos Recientes
            </h1>
            <RecentsList
              sessions={recentSessions}
              loading={loadingRecents}
              backendReady={isBackendReady}
              recoveringId={recoveringId}
              onOpen={handleRecoverSession}
              showEmpty
            />
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

// ── SUB-COMPONENTES ──────────────────────────────────────────────────────────

const RecentsList: React.FC<{
  sessions: any[];
  loading: boolean;
  backendReady: boolean;
  recoveringId: string | null;
  onOpen: (id: string, name: string) => void;
  showEmpty?: boolean;
}> = ({ sessions, loading, backendReady, recoveringId, onOpen, showEmpty }) => {
  if (!backendReady) {
    return (
      <Card style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>
        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', marginRight: '8px', display: 'inline-block', verticalAlign: 'middle' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <span style={{ verticalAlign: 'middle' }}>Conectando...</span>
      </Card>
    );
  }
  if (loading) {
    return <Card style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>Cargando documentos recientes...</Card>;
  }
  if (sessions.length === 0) {
    if (!showEmpty) return <Card style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-base)' }}>Sin documentos recientes.</Card>;
    return (
      <Card style={{ textAlign: 'center', padding: '36px 24px', color: 'var(--text-secondary)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px', opacity: 0.5 }}>
          <Clock size={48} color="var(--accent-primary)" />
        </div>
        <p style={{ fontSize: 'var(--text-lg)', margin: '0 0 8px', fontWeight: 600 }}>Sin documentos recientes</p>
        <p style={{ fontSize: 'var(--text-sm)', margin: 0 }}>Los documentos que abras o proceses aparecerán aquí.</p>
      </Card>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', padding: '8px 12px', color: 'var(--text-secondary)', fontSize: 'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ flex: 2 }}>Nombre</div>
        <div style={{ flex: 1 }}>Modificado</div>
      </div>
      {sessions.map((item: SessionRecovery) => {
        const session = item.session;
        const isRecovering = recoveringId === session.session_id;
        return (
          <button
            type="button"
            key={session.session_id}
            disabled={isRecovering}
            onClick={() => !isRecovering && onOpen(session.session_id, session.file_name)}
            style={{
              display: 'flex', padding: '12px', alignItems: 'center', width: '100%',
              border: 'none', borderBottom: '1px solid var(--border-subtle)',
              cursor: isRecovering ? 'wait' : 'pointer', background: 'none',
              transition: 'background 0.15s', opacity: isRecovering ? 0.7 : 1,
              fontFamily: 'inherit', textAlign: 'left',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-subtle)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            <div style={{ flex: 2, display: 'flex', alignItems: 'center', gap: '12px' }}>
              {isRecovering
                ? <Loader2 size={20} color="var(--accent-primary)" style={{ animation: 'spin 1s linear infinite', flexShrink: 0 }} />
                : <FileText size={20} color="var(--accent-primary)" />
              }
              <div>
                <div style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-main)' }}>
                  {session.file_name || 'Documento sin nombre'}
                </div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' }}>
                  {session.element_count} elementos · APA {session.apa_format}
                </div>
              </div>
            </div>
            <div style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
              {session.last_saved ? timeAgo(session.last_saved) : '—'}
            </div>
          </button>
        );
      })}
    </>
  );
};

export default Step0QuickStart;
