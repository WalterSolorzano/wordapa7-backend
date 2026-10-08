/* WordAPA7 — Cajón/Panel de Recursos e Imágenes del Proyecto */

import React, { useRef } from 'react';
import { X } from 'lucide-react';
import { useDocStore } from '../../store/useDocStore';

export const ProjectImagesDrawer: React.FC<{ isOpen: boolean; onClose: () => void }> = ({ isOpen, onClose }) => {
  const { projectImages, addProjectImage, removeProjectImage, showToast } = useDocStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    /* `addProjectImage` es `async` desde la F7: sube a disco. La cuenta del
       aviso es la de los archivos ACEPTADOS, no la del `FileList`: el drawer
       recibe arrastres mezclados y prometer "cinco imagenes agregadas" sobre un
       arrastre de cinco archivos con dos `.txt` seria mentir. */
    let aceptadas = 0;
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      if (f.type.startsWith('image/')) {
        void addProjectImage(f);
        aceptadas++;
      }
    }
    if (aceptadas > 0) showToast(`${aceptadas} imagen(es) agregadas al proyecto`, 'success');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '64px',
        right: '16px',
        width: '320px',
        maxHeight: 'calc(100vh - 100px)',
        backgroundColor: 'var(--color-bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        zIndex: 150,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--color-text-primary)' }}>Recursos del Proyecto</span>
          <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', display: 'block' }}>{projectImages.length} imagen(es) en carpeta</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
        >
          <X size={13} strokeWidth="var(--icon-stroke)" />
        </button>
      </div>

      <div style={{ padding: '10px 14px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Zona drop/upload */}
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handleFiles(e.dataTransfer.files);
          }}
          style={{
            border: '1px dashed var(--border-strong)',
            borderRadius: 'var(--radius-md)',
            padding: '16px 10px',
            textAlign: 'center',
            backgroundColor: 'var(--color-bg-surface-alt)',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
        >
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--accent-primary)', display: 'block' }}>
            + Soltar o seleccionar imágenes
          </span>
          <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '2px', display: 'block' }}>
            PNG, JPG para asignación APA 7
          </span>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => handleFiles(e.target.files)}
          />
        </div>

        {/* Lista de imágenes */}
        {projectImages.length === 0 ? (
          <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textAlign: 'center', margin: '20px 0' }}>
            No hay imágenes en la carpeta del proyecto.
          </span>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
            {projectImages.map((img) => (
              <div
                key={img.id}
                style={{
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  overflow: 'hidden',
                  backgroundColor: 'var(--color-bg-surface)',
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  style={{ width: '100%', height: '70px', objectFit: 'contain' }}
                />
                <div style={{ padding: '4px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span
                    style={{ fontSize: '9px', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '85px' }}
                    title={img.name}
                  >
                    {img.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeProjectImage(img.id)}
                    title="Eliminar del proyecto"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--color-danger)', padding: '2px' }}
                  >
                    <X size={10} strokeWidth="var(--icon-stroke)" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
