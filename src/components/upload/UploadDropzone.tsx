import React, { useState, useRef } from 'react';
import { FileUp } from 'lucide-react';
import { Progress } from '../ui/progress';
import { useDocStore } from '../../store/useDocStore';

interface UploadDropzoneProps {
  onFileSelected: (file: File) => void;
  accept?: string;
  maxSize?: number;
  isLoading?: boolean;
}

export function UploadDropzone({ onFileSelected, accept = '.docx', maxSize = 50 * 1024 * 1024, isLoading = false }: UploadDropzoneProps) {
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isLoading) setDragging(true);
  };

  const handleDragLeave = () => {
    setDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (isLoading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFile(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLoading) return;
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (file.size > maxSize) {
      useDocStore.getState().showToast(`El archivo excede el tamaño máximo permitido de ${Math.round(maxSize / 1024 / 1024)}MB`, 'error');
      return;
    }
    // Simulate progress for UI feedback before passing to parent
    setProgress(0);
    const interval = setInterval(() => {
      setProgress(p => {
        if (p >= 90) {
          clearInterval(interval);
          return 90;
        }
        return p + 10;
      });
    }, 100);

    // Call parent handler
    onFileSelected(file);
  };

  const inputRef = useRef<HTMLInputElement>(null);

  const handleClick = () => {
    if (!isLoading && inputRef.current) {
      inputRef.current.click();
    }
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        minHeight: '300px',
        border: dragging ? '2px dashed var(--accent-primary)' : '2px dashed var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        transition: 'all 0.2s ease',
        cursor: isLoading ? 'wait' : 'pointer',
        overflow: 'hidden',
        backgroundColor: dragging ? 'var(--color-accent-a08)' : 'var(--surface-subtle)',
        transform: dragging ? 'scale(1.02)' : 'scale(1)',
        opacity: isLoading ? 0.75 : 1,
        pointerEvents: isLoading ? 'none' : 'auto'
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileInput}
        style={{ display: 'none' }}
        disabled={isLoading}
      />
      
      <FileUp 
        size={64} 
        style={{ 
          marginBottom: '16px', 
          transition: 'color 0.2s ease', 
          color: dragging ? 'var(--accent-primary)' : 'var(--text-muted)' 
        }} 
      />
      
      <h3 style={{ fontSize: '20px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px', textAlign: 'center' }}>
        {isLoading ? 'Procesando documento...' : 'Arrastra tu documento .docx aquí'}
      </h3>
      
      {!isLoading && (
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '24px' }}>
          o haz clic para seleccionar un archivo
        </p>
      )}

      {(progress > 0 || isLoading) && (
        <div style={{ width: '100%', maxWidth: '28rem', marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Progress value={isLoading && progress === 90 ? 100 : progress} style={{ height: '8px', width: '100%' }} />
          <p style={{ fontSize: '12px', textAlign: 'center', color: 'var(--text-secondary)' }}>
            {isLoading ? 'Subiendo y analizando estructura...' : 'Preparando entorno...'}
          </p>
        </div>
      )}
    </div>
  );
}
