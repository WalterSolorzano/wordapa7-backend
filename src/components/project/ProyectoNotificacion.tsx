import React from 'react';
import { X } from 'lucide-react';
import { EditorialMascot } from '../layout/EditorialMascot';
import { useDocStore } from '../../store/useDocStore';

/**
 * Notificación de esquina post-upload.
 * Pregunta si crear un proyecto o agregar una versión. No bloquea el editor.
 */
export const ProyectoNotificacion: React.FC = () => {
  const notificacion = useDocStore(s => (s as any).notificacionProyecto);
  const ocultar = useDocStore(s => (s as any).ocultarNotificacionProyecto);
  const crearProyecto = useDocStore(s => (s as any).crearProyecto);
  const agregarVersion = useDocStore(s => (s as any).agregarVersion);
  const proyectos = useDocStore(s => (s as any).proyectos);

  if (!notificacion?.visible) return null;

  const esNuevaVersion = notificacion.modo === 'nueva-version';
  const proyectoExistente = esNuevaVersion
    ? proyectos.find((p: any) => p.id === notificacion.proyectoExistenteId)
    : null;

  const handleAhoraNo = () => {
    ocultar();
  };

  const handleCrearProyecto = async () => {
    await crearProyecto(notificacion.filename.replace(/\.docx$/i, ''), notificacion.filename);
  };

  const handleAgregarVersion = async () => {
    if (notificacion.proyectoExistenteId) {
      await agregarVersion(notificacion.proyectoExistenteId, notificacion.filename);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'var(--space-6)',
        right: 'var(--space-6)',
        zIndex: 'var(--z-toast)',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-4)',
        background: 'var(--paper-white)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        maxWidth: 380,
      }}
    >
      <EditorialMascot kind="reference" expression="curious" size={40} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
        <strong style={{ fontSize: 'var(--text-sm)', color: 'var(--text-main)' }}>
          {esNuevaVersion
            ? `Parece una nueva versión de "${proyectoExistente?.nombre ?? 'proyecto'}"`
            : '¿Creamos un proyecto para este documento?'}
        </strong>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
          {esNuevaVersion
            ? '¿La agregamos al proyecto como la versión más reciente?'
            : 'Esto organizará tus versiones y exportaciones en una carpeta.'}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)' }}>
          <button
            onClick={handleAhoraNo}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-xs)',
              color: 'var(--text-muted)',
              background: 'transparent',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
          >
            Ahora no
          </button>
          <button
            onClick={esNuevaVersion ? handleAgregarVersion : handleCrearProyecto}
            style={{
              padding: 'var(--space-2) var(--space-3)',
              fontSize: 'var(--text-xs)',
              color: 'var(--paper-white)',
              background: 'var(--accent-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              cursor: 'pointer',
            }}
          >
            {esNuevaVersion ? 'Agregar al proyecto' : 'Crear proyecto'}
          </button>
        </div>
      </div>
      <button
        onClick={handleAhoraNo}
        aria-label="Cerrar"
        style={{
          padding: 'var(--space-1)',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
        }}
      >
        <X size={16} strokeWidth="var(--icon-stroke)" />
      </button>
    </div>
  );
};
