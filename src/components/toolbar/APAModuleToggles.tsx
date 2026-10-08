import React, { useState, useRef, useEffect } from 'react';
import { useDocStore } from '../../store/useDocStore';
import {
  GRUPOS_DE_MODULOS,
  MODULOS_APA,
  alcancesDe,
  modulosDe,
  type AlcanceDeModulo,
} from '../../lib/modulosApa';

/* ── Iconos SVG nativos a mano (sin dependencias, cero emojis) ── */
const SvgParagraph = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M13 4v16" />
    <path d="M17 4v16" />
    <path d="M19 4H9.5a4.5 4.5 0 0 0 0 9H13" />
  </svg>
);

const SvgTable = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z" />
    <path d="M3 10h18" />
    <path d="M10 3v18" />
  </svg>
);

const SvgReference = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  </svg>
);

const SvgCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const SvgChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

/* El icono es de la pantalla, no del dato: `modulosApa.ts` no depende de React.
   Si un día un módulo no tiene icono, se cae a ninguno y no se rompe nada. */
const ICONO_DE_MODULO: Record<AlcanceDeModulo, React.FC> = {
  texto: SvgParagraph,
  tablas_imagenes: SvgTable,
  bibliografia: SvgReference,
};

export const APAModuleToggles: React.FC = () => {
  const sessionScopes = useDocStore((s) => s.sessionScopes);
  const setSessionScopes = useDocStore((s) => s.setSessionScopes);
  const showToast = useDocStore((s) => s.showToast);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const idsDeTodos = MODULOS_APA.map((m) => m.id);

  // Mapear compatibilidad: si sessionScopes está vacío ([]), significa que todos están activos
  const isAllActive = sessionScopes.length === 0;

  /* Los alcances activos, normalizados: un estado guardado con los cinco ids
     viejos se lee como los tres del motor, no como "todos apagados". */
  const activos = isAllActive ? idsDeTodos : alcancesDe(sessionScopes);
  const isModuleActive = (id: AlcanceDeModulo) => activos.includes(id);

  const toggleModule = (id: AlcanceDeModulo) => {
    const next = activos.includes(id)
      ? activos.filter((s) => s !== id)
      : [...activos, id];

    // Si marcó todos, colapsar a [] para máxima compatibilidad con el motor
    const finalScopes = idsDeTodos.every((k) => next.includes(k)) ? [] : next;

    setSessionScopes(finalScopes);
    const mod = MODULOS_APA.find((m) => m.id === id);
    showToast(
      `Módulo "${mod?.etiqueta ?? id}" ${next.includes(id) ? 'activado' : 'omitido'}`,
      'info'
    );
  };

  // Cerrar al click afuera
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    if (menuOpen) {
      window.addEventListener('mousedown', handleOutside);
    }
    return () => window.removeEventListener('mousedown', handleOutside);
  }, [menuOpen]);

  const activeCount = activos.length;

  return (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        onClick={() => setMenuOpen(!menuOpen)}
        aria-label={`Módulos APA (${activeCount}/${MODULOS_APA.length} activos)`}
        aria-expanded={menuOpen}
        title={`Módulos APA (${activeCount}/${MODULOS_APA.length} activos) — configurar qué se estandariza`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '4px 8px',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${menuOpen ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
          backgroundColor: menuOpen ? 'var(--color-accent-soft)' : 'var(--surface-subtle)',
          color: 'var(--accent-primary)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'all 0.15s ease',
        }}
      >
        <SvgParagraph />
        <span
          style={{
            fontSize: '9px', fontWeight: 800, lineHeight: 1,
            backgroundColor: 'var(--accent-primary)', color: '#ffffff',
            borderRadius: 'var(--radius-full)', padding: '2px 4px',
          }}
        >
          {activeCount}
        </span>
        <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>
          <SvgChevronDown />
        </span>
      </button>

      {menuOpen && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            width: '320px',
            backgroundColor: 'var(--sidebar-bg)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
            zIndex: 1000,
            padding: '10px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px 6px', borderBottom: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)' }}>
              Módulos APA
            </span>
            <button
              type="button"
              onClick={() => {
                setSessionScopes([]);
                showToast('Todos los módulos APA 7 activos', 'success');
              }}
              style={{
                fontSize: '11px',
                color: 'var(--accent-primary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 700,
                padding: 0,
              }}
            >
              Marcar todos
            </button>
          </div>

          {/* Dos categorías declaradas en `modulosApa.ts`: el usuario pidió dejar
              de ver una lista plana, y el grupo lleva nombre para que el teclado
              anuncie de qué se está hablando. */}
          {GRUPOS_DE_MODULOS.map((grupo) => (
            <div
              key={grupo.id}
              role="group"
              aria-label={grupo.titulo}
              style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
            >
              <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-secondary)', padding: '0 4px' }}>
                {grupo.titulo}
              </span>
              {modulosDe(grupo.id).map((mod) => {
                const active = isModuleActive(mod.id);
                const Icon = ICONO_DE_MODULO[mod.id];
                return (
                  <div
                    key={mod.id}
                    onClick={() => toggleModule(mod.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      backgroundColor: active ? 'var(--color-accent-soft)' : 'transparent',
                      border: `1px solid ${active ? 'var(--accent-primary)' : 'transparent'}`,
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        border: `1.5px solid ${active ? 'var(--accent-primary)' : 'var(--border-strong)'}`,
                        backgroundColor: active ? 'var(--accent-primary)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        marginTop: '2px',
                        flexShrink: 0,
                      }}
                    >
                      {active && <SvgCheck />}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ color: active ? 'var(--accent-primary)' : 'var(--text-secondary)' }}>
                          <Icon />
                        </span>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: active ? 'var(--text-main)' : 'var(--text-secondary)',
                            textDecoration: active ? 'none' : 'line-through',
                          }}
                        >
                          {mod.etiqueta}
                        </span>
                      </div>
                      <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.3 }}>
                        {mod.descripcion}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default APAModuleToggles;
