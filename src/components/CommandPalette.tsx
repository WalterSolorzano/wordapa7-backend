import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useDocStore } from '../store/useDocStore';
import { needsReview } from '../lib/portadaAuthors';
import { atajoDeFase, etiquetaDeFase } from '../lib/atajosDeFase';
import { Search, ArrowRight, FileDown, FileText, FileCheck, Settings, Puzzle } from 'lucide-react';

interface Command {
  id: string;
  label: string;
  shortcut?: string;
  icon: React.ElementType | null;
  action: () => void;
  keywords?: string[];
}

export const CommandPalette: React.FC = () => {
  const { doc, wizardStep, setWizardStep, exportDocx, exportPdf } = useDocStore();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const pendingForPhase = (phaseId: number) => {
    if (!doc) return 0;
    if (phaseId === 2) return doc.elements.filter((e) => e.type === 'heading' && needsReview(e as any)).length;
    if (phaseId === 3) {
      const figures = doc.elements.filter((e) => e.type === 'image' && needsReview(e as any)).length;
      const tables = doc.elements.filter((e) => e.type === 'table' && needsReview(e as any)).length;
      return figures + tables;
    }
    return 0;
  };

  const commands: Command[] = useMemo(() => [
    { id: 'next-pending', label: 'Siguiente fase con pendientes', shortcut: 'Ctrl+Enter', icon: ArrowRight, action: () => {
      const step = wizardStep;
      const nextWithPending = [1, 2, 3, 4, 5].find(s => s > step && pendingForPhase(s) > 0);
      if (nextWithPending) setWizardStep(nextWithPending);
      else if (step < 5) setWizardStep(step + 1);
      useDocStore.setState({ commandPaletteOpen: false });
    }, keywords: ['siguiente', 'next', 'pendiente', 'pending'] },

    /* Un comando por fase, y el atajo es el NÚMERO de la fase. No hay tabla que
       mantener: `atajoDeFase` es la regla, y `atajosDeFase.test.ts` la mira
       contra el handler real de `App.tsx`.

       Se fue 'Ir a Cuerpo y Formato': compartía `Ctrl+2` con 'Ir a Estructura' y
       hacía EXACTAMENTE lo mismo, `setWizardStep(2)`. Dos comandos que llevan al
       mismo lado entrenan a la gente a apretar cosas que no hacen nada. Lo que
       era del cuerpo —formato, sangría— se cambia en Ajustes → Formato, y esas
       palabras ahora viven en el comando de Ajustes.

       Y se fue 'Abrir túnel de exportación': compartía `Ctrl+6` con Exportar y
       llevaba al mismo `viewMode: 'export'`. Queda una sola forma de decirlo, y
       su acción es `openExportTunnel()` y no `setWizardStep(6)` porque el túnel
       además cierra el modal de descarga: si estaba abierto, `Ctrl+6` lo dejaba
       abierto encima de la pantalla de exportación. */
    { id: 'goto-portada', label: `Ir a ${etiquetaDeFase(1)}`, shortcut: atajoDeFase(1), icon: null, action: () => { setWizardStep(1); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['portada', 'cover', 'metadatos'] },
    { id: 'goto-estructura', label: `Ir a ${etiquetaDeFase(2)}`, shortcut: atajoDeFase(2), icon: null, action: () => { setWizardStep(2); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['estructura', 'titulos', 'headings', 'h1', 'h2'] },
    { id: 'goto-figuras', label: `Ir a ${etiquetaDeFase(3)}`, shortcut: atajoDeFase(3), icon: null, action: () => { setWizardStep(3); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['figuras', 'tablas', 'imagenes', 'figures', 'tables'] },
    { id: 'goto-referencias', label: `Ir a ${etiquetaDeFase(4)}`, shortcut: atajoDeFase(4), icon: null, action: () => { setWizardStep(4); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['referencias', 'bibliografia', 'apa', 'validacion', 'citas'] },
    { id: 'goto-revision', label: `Ir a ${etiquetaDeFase(5)}`, shortcut: atajoDeFase(5), icon: null, action: () => { setWizardStep(5); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['revision', 'ia', 'ortografia', 'auditoria', 'hallazgos'] },
    { id: 'goto-exportar', label: `Ir a ${etiquetaDeFase(6)} (paso final)`, shortcut: atajoDeFase(6), icon: FileDown, action: () => { useDocStore.getState().openExportTunnel(); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['exportar', 'export', 'descargar', 'final', 'entrega', 'tunel', 'formato'] },

    /* Ajustes. `Ctrl+K` no tenía NINGÚN comando de configuración, y la paleta es
       el atajo que la gente aprende de memoria: si Ajustes no está acá, el
       camino corto no existe. Keywords amplias a propósito: la gente busca
       "sangria" o "tema" y no sabe en qué pestaña viven. */
    { id: 'abrir-ajustes', label: 'Abrir Ajustes', shortcut: '', icon: Settings, action: () => { useDocStore.getState().setSettingsHubOpen(true); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['ajustes', 'configuracion', 'formato', 'sangria', 'margenes', 'tema', 'complemento', 'word'] },
    { id: 'abrir-ajustes-conexion', label: 'Abrir Ajustes: Conexión y proveedores', shortcut: '', icon: Puzzle, action: () => { useDocStore.getState().setSettingsHubOpen(true, 'conexion'); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['conexion', 'proveedor', 'api key', 'clave', 'nim', 'groq', 'cerebras', 'ollama', 'modelo', 'complemento'] },

    { id: 'download-docx', label: 'Descargar DOCX', shortcut: 'Ctrl+S', icon: FileDown, action: () => { exportDocx(false); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['descargar', 'export', 'docx', 'word'] },
    { id: 'download-pdf', label: 'Descargar PDF', shortcut: 'Ctrl+Shift+S', icon: FileText, action: () => { exportPdf(); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['descargar', 'export', 'pdf'] },
    /* El validador SE queda: `validatorOpen` lo lee `ValidatorDrawer`, montado
       en `App.tsx`, así que el comando abre algo real. Lo que se fue fue
       'Auditor de diseño', que escribía `auditorMode`: nadie leía ese flag, y
       ningún componente lo dibujaba. Era un comando que no llevaba a ningún
       lado, que es peor que no tenerlo. */
    { id: 'open-validator', label: 'Abrir validador de citas', shortcut: '', icon: FileCheck, action: () => { useDocStore.getState().setValidatorOpen(true); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['validador', 'citas', 'referencias', 'validar'] },
    { id: 'open-nim-diagnostics', label: 'Diagnóstico de proveedores IA', shortcut: '', icon: null, action: () => { useDocStore.getState().setIsNIMDiagnosticsOpen(true); useDocStore.setState({ commandPaletteOpen: false }); }, keywords: ['diagnostico', 'ia', 'proveedor', 'nim', 'key'] },
  ], [doc, wizardStep, setWizardStep, exportDocx, exportPdf]);

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase().trim();
    return commands.filter((c) => {
      if (c.label.toLowerCase().includes(q)) return true;
      if (c.keywords?.some((k) => k.includes(q))) return true;
      return false;
    });
  }, [query, commands]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        useDocStore.setState({ commandPaletteOpen: false });
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          filtered[selectedIndex].action();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [filtered, selectedIndex]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  return (
    <div
      onClick={() => useDocStore.setState({ commandPaletteOpen: false })}
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex', justifyContent: 'center', paddingTop: '15vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, maxHeight: 420, overflow: 'hidden',
          backgroundColor: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '12px 16px',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          <Search size={16} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Escribí un comando o buscá..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{
              flex: 1, border: 'none', outline: 'none',
              background: 'transparent',
              color: 'var(--color-text-primary)',
              fontSize: '14px',
            }}
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {filtered.length === 0 && (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--color-text-secondary)', fontSize: '13px' }}>
              Sin resultados
            </div>
          )}
          {filtered.map((cmd, i) => {
            const Icon = cmd.icon as React.ComponentType<{ size?: number; style?: React.CSSProperties }> | null;
            const isSelected = i === selectedIndex;
            return (
              <div
                key={cmd.id}
                onClick={() => cmd.action()}
                onMouseEnter={() => setSelectedIndex(i)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 16px', cursor: 'pointer',
                  backgroundColor: isSelected ? 'var(--color-accent-soft)' : 'transparent',
                  color: 'var(--color-text-primary)',
                  fontSize: '13px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {Icon && <Icon size={16} style={{ color: 'var(--color-text-secondary)' }} />}
                  <span>{cmd.label}</span>
                </div>
                {cmd.shortcut && (
                  <span style={{
                    fontSize: '11px', color: 'var(--color-text-secondary)',
                    backgroundColor: 'var(--color-bg-surface-alt)',
                    padding: '1px 6px', borderRadius: '4px',
                  }}>
                    {cmd.shortcut}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
