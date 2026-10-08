/* WordAPA7 — File Menu (Word-style Backstage, Fluent Design) */

import React, { useState, useEffect, useRef } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { listSessions, recoverSession } from '../../api/backend';
import { SessionRecovery } from '../../types';
import {
  FileText, FilePlus, FolderOpen, Download, X, ArrowLeft,
  Upload, File, Clock, Plus, HardDrive, RefreshCw, LayoutTemplate, Settings,
  Type, Image, Table, ListOrdered, Quote,
} from 'lucide-react';

type FileMenuPage = 'home' | 'new' | 'open' | 'export' | 'update';

interface SidebarItem {
  id: FileMenuPage;
  label: string;
  icon: React.ReactNode;
}

/* Sin entrada "Guardar". El documento se guarda solo —el backend persiste en
   cada mutación, a SQLite, no al `.docx`— y la página que había decía
   "Guardar documento" tenía por única acción "Exportar .DOCX APA 7", la misma
   de la página de al lado. Leía como un botón de guardado y no guardaba nada,
   que es peor que no tenerlo: una persona que lo aprieta cree que su trabajo
   está a salvo.

   Lo que queda es Inicio, Nuevo, Abrir, Exportar y Actualización, y cada una
   hace algo distinto. Exportar no se toca: es lo único que escribe en el
   archivo del usuario, y es deliberado. `fileMenu.test.tsx` lo verifica. */
const SIDEBAR_ITEMS: SidebarItem[] = [
  { id: 'home', label: 'Inicio', icon: <FileText size={18} /> },
  { id: 'new', label: 'Nuevo', icon: <FilePlus size={18} /> },
  { id: 'open', label: 'Abrir', icon: <FolderOpen size={18} /> },
  { id: 'export', label: 'Exportar', icon: <Download size={18} /> },
  { id: 'update', label: 'Actualización', icon: <RefreshCw size={18} /> },
];

export const FileMenu: React.FC = () => {
  const {
    doc, tabs, activeTabIndex,
    setShowFileMenu, uploadFile, exportDocx, exportPdf, exportLatex,
    isLoading,
  } = useDocStore();
  /* El formato y el control de cambios son del store, no de esta pantalla.
     Antes el menú tenía los suyos: dos tarjetas fijas, y la segunda llamaba
     `exportDocx(true)` sin preguntar nada. Con `format` en el store, la
     persona elige PDF en la vista de Exportar y el menú lo dice y lo hace. */
  const format = useDocStore((s) => s.format);
  const setFormat = useDocStore((s) => s.setFormat);
  const tracked = useDocStore((s) => s.tracked);
  const setTracked = useDocStore((s) => s.setTracked);
  const FORMATOS_MENU: { id: typeof format; label: string; ext: string; desc: string }[] = [
    { id: 'docx', label: 'APA 7 .DOCX', ext: '.docx', desc: 'Documento formateado con margenes, interlineado, portada, encabezados y referencias segun APA 7' },
    { id: 'pdf', label: 'PDF Listo', ext: '.pdf', desc: 'PDF listo para entrega o para imprimir' },
    { id: 'latex', label: 'LaTeX', ext: '.tex', desc: 'Codigo fuente .tex para compilar donde quieras' },
  ];
  const formatoElegido = FORMATOS_MENU.find((f) => f.id === format)!;
  /* Para la página de Actualización: la tarjeta vive en Ajustes → App y desde
     acá se abre esa pantalla, no se la reimprime. */
  const setSettingsHubOpen = useDocStore((s) => s.setSettingsHubOpen);
  const [page, setPage] = useState<FileMenuPage>('home');
  const [sessions, setSessions] = useState<SessionRecovery[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openFileInputRef = useRef<HTMLInputElement>(null);

  const clearFileInputs = () => {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (openFileInputRef.current) openFileInputRef.current.value = '';
  };

  // Load sessions for "Open" page
  useEffect(() => {
    if (page === 'open') {
      setSessionsLoading(true);
      listSessions()
        .then(setSessions)
        .catch(() => setSessions([]))
        .finally(() => setSessionsLoading(false));
    }
  }, [page]);

  const handleFileSelect = (file: File) => {
    uploadFile(file);
    clearFileInputs();
    setPage('home');
    setShowFileMenu(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith('.docx') || file.name.endsWith('.doc'))) {
      handleFileSelect(file);
    }
  };

  const handleClose = () => {
    clearFileInputs();
    setShowFileMenu(false);
    setPage('home');
  };

  /* Exporta el formato ELEGIDO, no uno fijo. Con el store, el menú y la vista
     de Exportar dicen lo mismo; antes el menú siempre sacaba un .docx. */
  const handleExportStandard = () => {
    if (format === 'pdf') exportPdf();
    else if (format === 'latex') exportLatex();
    else exportDocx(tracked);
    handleClose();
  };

  /* La segunda tarjeta dejó de EXPORTAR con control de cambios y pasó a SER el
     control de cambios. Antes llamaba `exportDocx(true)` fijo: activaba las
     marcas sin preguntar y salía del menú, y la vista de Exportar no se
     enteraba. Ahora la persona la enciende una vez y los dos lados la obey. */
  const handleToggleTracked = () => {
    setTracked(!tracked);
  };

  const handleOpenSession = async (sessionId: string) => {
    try {
      const recovered = await recoverSession(sessionId);
      useDocStore.setState({
        doc: recovered,
        showFileMenu: false,
        wizardStep: 1,
      });
      setPage('home');
    } catch {
      // Session recovery failed
    }
  };

  // ── Render page content ──────────────────────────────────────────────────
  const renderPageContent = () => {
    switch (page) {
      case 'home':
        return (
          <div className="filemenu-content">
            <h2 className="filemenu-heading">Informacion</h2>
            {doc ? (
              <>
                <div className="filemenu-info-card">
                  <div className="filemenu-info-row">
                    <span className="filemenu-info-label">Documento:</span>
                    <span className="filemenu-info-value">{doc.file_name}</span>
                  </div>
                  <div className="filemenu-info-row">
                    <span className="filemenu-info-label">Sesion:</span>
                    <span className="filemenu-info-value filemenu-mono">{doc.session_id.slice(0, 8)}...</span>
                  </div>
                  <div className="filemenu-info-row">
                    <span className="filemenu-info-label">Formato:</span>
                    <span className="filemenu-info-value">APA 7 ({doc.apa_format === 'student' ? 'Estudiante' : 'Profesional'})</span>
                  </div>
                  <div className="filemenu-info-row">
                    <span className="filemenu-info-label">Elementos:</span>
                    <span className="filemenu-info-value">{doc.elements.length}</span>
                  </div>
                  <div className="filemenu-info-row">
                    <span className="filemenu-info-label">Pestanas abiertas:</span>
                    <span className="filemenu-info-value">{tabs.length}</span>
                  </div>
                </div>

                {/* Resumen de estructura del documento */}
                <h3 className="filemenu-section-title">Estructura del documento</h3>
                <div className="filemenu-stats-grid">
                  {[
                    { label: 'Titulos', value: doc.elements.filter(e => e.type === 'heading').length, icon: <Type size={14} /> },
                    { label: 'Parrafos', value: doc.elements.filter(e => e.type === 'paragraph').length, icon: <FileText size={14} /> },
                    { label: 'Figuras', value: doc.elements.filter(e => e.type === 'image' && e.image_info).length, icon: <Image size={14} /> },
                    { label: 'Tablas', value: doc.elements.filter(e => e.type === 'table' && e.table_info).length, icon: <Table size={14} /> },
                    { label: 'Listas', value: doc.elements.filter(e => e.type === 'bullet' || e.type === 'numbered_list').length, icon: <ListOrdered size={14} /> },
                    { label: 'Citas', value: doc.elements.filter(e => e.cita_ids && e.cita_ids.length).length, icon: <Quote size={14} /> },
                  ].map(stat => (
                    <div key={stat.label} className="filemenu-stat">
                      <div className="filemenu-stat-icon">{stat.icon}</div>
                      <div className="filemenu-stat-value">{stat.value}</div>
                      <div className="filemenu-stat-label">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Acciones rapidas */}
                <h3 className="filemenu-section-title">Acciones rapidas</h3>
                <div className="filemenu-actions-row">
                  <button className="btn btn-primary" onClick={handleExportStandard} disabled={isLoading}>
                    <Download size={16} /> {`Exportar ${formatoElegido.ext}`}
                  </button>
                  <button
                    className="btn btn-secondary"
                    onClick={handleToggleTracked}
                    disabled={isLoading}
                    aria-pressed={tracked}
                  >
                    <FileText size={16} /> Control de Cambios
                  </button>
                </div>
              </>
            ) : (
              <p className="filemenu-empty-text">No hay ningun documento abierto.</p>
            )}
          </div>
        );

      case 'new':
        return (
          <div className="filemenu-content">
            <h2 className="filemenu-heading">Nuevo documento</h2>
            <div className="filemenu-new-options">
              <button
                className="filemenu-new-card"
                onClick={async () => {
                  useDocStore.setState({ showFileMenu: false });
                  try {
                    await useDocStore.getState().startBlankDocument();
                    setPage('home');
                  } catch {
                    useDocStore.getState().showToast('Error al crear documento en blanco', 'error');
                  }
                }}
              >
                <div className="filemenu-new-card-icon">
                  <File size={28} />
                </div>
                <div className="filemenu-new-card-title">Documento en blanco</div>
                <div className="filemenu-new-card-desc">Comienza con un documento vacio con formato APA 7</div>
              </button>

              <button
                className="filemenu-new-card"
                onClick={() => {
                  useDocStore.setState({ showTemplateDialog: true, showFileMenu: false });
                  setPage('home');
                }}
                title="Abrir el selector de plantillas de estructura"
              >
                <div className="filemenu-new-card-icon">
                  <LayoutTemplate size={28} />
                </div>
                <div className="filemenu-new-card-title">Abrir plantilla</div>
                <div className="filemenu-new-card-desc">Elige una plantilla de estructura pre-diseñada</div>
              </button>

              <div
                className={`filemenu-dropzone${dragOver ? ' dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="filemenu-dropzone-icon">
                  <Upload size={24} />
                </div>
                <div className="filemenu-dropzone-title">Subir archivo .docx</div>
                <div className="filemenu-dropzone-subtitle">
                  Arrastra un archivo aqui o haz clic para seleccionarlo
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx,.doc"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>
          </div>
        );

      case 'open':
        return (
          <div className="filemenu-content">
            <h2 className="filemenu-heading">Abrir</h2>

            {/* ── Primary action: open a file from disk (like Word's File → Open) ── */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '16px 20px', borderRadius: 'var(--radius-lg)',
                border: '2px dashed var(--color-accent-a65)', backgroundColor: 'var(--color-accent-a08)',
                cursor: 'pointer', marginBottom: '24px',
                transition: 'background 0.2s',
              }}
              onClick={() => openFileInputRef.current?.click()}
            >
              <FolderOpen size={28} color="var(--accent-primary)" />
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--accent-primary)' }}>Abrir archivo desde tu computadora</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Selecciona un .docx para cargarlo y formatearlo en APA 7</div>
              </div>
              <input
                ref={openFileInputRef}
                type="file"
                accept=".docx,.doc"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(file);
                }}
              />
            </div>

            {/* ── Sessions from server (recent docs) ── */}
            <h3 style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sesiones recientes</h3>
            {sessionsLoading ? (
              <div className="filemenu-loading">
                <div className="loading-spinner" />
                <span>Cargando sesiones...</span>
              </div>
            ) : sessions.length === 0 ? (
              <p className="filemenu-empty-text">No hay sesiones recientes disponibles.</p>
            ) : (
              <div className="filemenu-sessions-list">
                {sessions.map((session) => (
                  <button
                    key={session.session.session_id}
                    className="filemenu-session-item"
                    onClick={() => handleOpenSession(session.session.session_id)}
                  >
                    <div className="filemenu-session-icon">
                      <Clock size={18} />
                    </div>
                    <div className="filemenu-session-info">
                      <div className="filemenu-session-name">
                        {session.session.file_name}
                      </div>
                      <div className="filemenu-session-meta">
                        {session.session.element_count} elementos
                        {session.session.validation_score != null && (
                          <> — Puntuacion: {session.session.validation_score}</>
                        )}
                      </div>
                    </div>
                    <div className="filemenu-session-date">
                      {new Date(session.session.last_saved || session.session.parsed_at).toLocaleDateString('es-MX', {
                        year: 'numeric', month: 'short', day: 'numeric',
                      })}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );

      /* No hay `case 'save'`. La página entera se fue con la entrada, y no solo
         el botón: la página decía "Guardar documento" y ofrecía Exportar, así
         que era la página de Exportar con otro nombre. Dejarla como página
         huérfana sin entrada sería código muerto con ruta de entrada. */

      case 'export':
        return (
          <div className="filemenu-content">
            <h2 className="filemenu-heading">Exportar documento</h2>
            <p className="filemenu-description">
              Descarga el documento formateado segun las normas APA 7ma edicion.
            </p>
            <div className="filemenu-export-cards">
              <button
                className="filemenu-export-card"
                onClick={handleExportStandard}
                disabled={isLoading || !doc}
              >
                <div className="filemenu-export-card-icon">
                  <FileText size={24} />
                </div>
                {/* El formato elegido, CON su extension. Antes la tarjeta decía
                    "APA 7 .DOCX" fijo y la persona iba al menú después de haber
                    elegido PDF en la vista de Exportar. */}
                <div className="filemenu-export-card-title">{`${formatoElegido.label} ${formatoElegido.ext}`}</div>
                <div className="filemenu-export-card-desc">
                  {formatoElegido.desc}
                </div>
              </button>

              {/* El control de cambios. Dice si está encendido, porque es un
                  estado compartido con la vista de Exportar: si no lo dijera,
                  la persona no sabría si el archivo va a salir con marcas. */}
              <button
                className="filemenu-export-card"
                onClick={handleToggleTracked}
                disabled={isLoading || !doc}
                aria-pressed={tracked}
              >
                <div className="filemenu-export-card-icon">
                  <FileText size={24} />
                </div>
                <div className="filemenu-export-card-title">
                  {tracked ? 'Control de Cambios: encendido' : 'Control de Cambios: apagado'}
                </div>
                <div className="filemenu-export-card-desc">
                  {tracked
                    ? 'El archivo sale con marcas de revision mostrando las diferencias con el original. Aplicalo solo al .docx.'
                    : 'El archivo sale limpio, sin marcas. Aplicalo solo al .docx: PDF y LaTeX no llevan marcas.'}
                </div>
              </button>
            </div>
          </div>
        );

      default:
        return (
          <div className="filemenu-content">
            <h2 className="filemenu-heading">Actualización</h2>
            {/* La tarjeta de actualización vive en UNA pantalla: la pestaña App
                de Ajustes. Acá había una segunda copia, sin `compact`, y dos
                copias de la misma tarjeta divergen: una se actualiza y la otra
                miente. Esta página no desaparece —quedaría un enlace sin
                destino— pero deja de prometer lo que no puede mostrar. */}
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6, marginTop: '4px' }}>
              La app se actualiza automáticamente desde GitHub Releases. Si hay una
              versión nueva, se descarga en segundo plano y se instala desde
              Ajustes → App, que es donde vive la tarjeta.
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setShowFileMenu(false);
                setSettingsHubOpen(true, 'app');
              }}
              style={{ marginTop: '16px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <Settings size={13} strokeWidth="var(--icon-stroke)" />
              Abrir Ajustes
            </button>
          </div>
        );
    }
  };

  return (
    <div className="filemenu-backstage">
      {/* Back button */}
      <div className="filemenu-topbar">
        <button className="filemenu-back-btn" onClick={handleClose} title="Volver al editor">
          <ArrowLeft size={18} />
        </button>
        <span className="filemenu-topbar-title">Archivo</span>
      </div>

      <div className="filemenu-body">
        {/* Left sidebar */}
        <div className="filemenu-sidebar">
          {SIDEBAR_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`filemenu-sidebar-btn${page === item.id ? ' active' : ''}`}
              onClick={() => setPage(item.id)}
            >
              <span className="filemenu-sidebar-icon">{item.icon}</span>
              <span className="filemenu-sidebar-label">{item.label}</span>
            </button>
          ))}

          <div className="filemenu-sidebar-spacer" />

          <button
            className="filemenu-sidebar-btn filemenu-sidebar-close"
            onClick={handleClose}
          >
            <span className="filemenu-sidebar-icon"><X size={18} /></span>
            <span className="filemenu-sidebar-label">Cerrar</span>
          </button>
        </div>

        {/* Right content area */}
        <div className="filemenu-main">
          {renderPageContent()}
        </div>
      </div>
    </div>
  );
};
