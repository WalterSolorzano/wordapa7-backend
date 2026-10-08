/* WordAPA7 — CoverEditorPanel (Paso 4: Portada): editor de portada refinado.
   Formulario de portada APA 7 (student cover page) con:
   - Título del trabajo
   - Integrantes: chips clicables del roster (se añaden al campo autor,
     separados por comas) + escritura libre del campo autor.
   - Institución, Curso
   - Fecha: date picker nativo con formato "DD de mes de YYYY" en español.
   - Docente/Profesor: chips clicables del roster + escritura libre.
   - Grupo: chips clicables del roster.
   - Checkbox "Conservar portada original": al marcarlo, los campos se atenúan
     (opacity 0.45 + pointerEvents none) y se respetan los datos del documento.
   - Two-way binding real: cada input dispara un highlight azul de ~1s sobre el
     campo correspondiente en la hoja (PaperCanvas).
   Sigue la regla de tokens del design-system: sin hex duro. */

import React, { useMemo, useState } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { useRosterStore } from '../../store/useRosterStore';
import {
  School, FileText, Check, ChevronRight, ChevronDown, Users, Calendar,
  GraduationCap, X, Hash, Cpu, Laptop, Building2, Factory, FlaskConical, Search, Plus,
} from 'lucide-react';
import {
  CATALOGO_DE_CARRERAS as CARRERAS_PRESETS,
  CATALOGO_DE_UNIVERSIDADES as UNIVERSIDADES_PRESETS,
} from '../../lib/portada/catalogo';
import { resolveAssetUrl } from '../../api/backend';
import { requestCoverFieldHighlight, parseAuthorEntries, serializeAuthorEntries } from '../../lib/portadaAuthors';

/* ── Helpers ────────────────────────────────────────────────────────────── */

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** Convierte un valor de <input type="date"> (YYYY-MM-DD) a texto en español.
 *  Ej: "2026-03-15" → "15 de marzo de 2026". */
function formatFechaES(dateISO: string): string {
  if (!dateISO) return '';
  const parts = dateISO.split('-');
  if (parts.length !== 3) return dateISO;
  const [year, month, day] = parts;
  const idx = parseInt(month, 10) - 1;
  if (idx < 0 || idx > 11) return dateISO;
  return `${parseInt(day, 10)} de ${MESES_ES[idx]} de ${year}`;
}

/** Divide el campo author en una lista de nombres (separados por coma o
 *  salto de línea), eliminando duplicados y espacios. */
function parseAuthors(raw: string): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** Vuelve a unir la lista de nombres en un solo string separado por comas. */
function joinAuthors(list: string[]): string {
  return list.join(', ');
}

/** Obtiene las iniciales de 2 letras de un nombre (ej: "Walter Solórzano" -> "WS"). */
function getInitials(name: string): string {
  const clean = name.replace(/^(Br\.|Ing\.|Lic\.|Dr\.|Msc\.)\s*/i, '').trim().split(/\s+/);
  if (clean.length >= 2) return `${clean[0][0]}${clean[1][0]}`.toUpperCase();
  return (clean[0]?.[0] || 'A').toUpperCase();
}

/** Obtiene primer nombre y primer apellido para chips limpios. */
function getShortName(name: string): string {
  const clean = name.replace(/^(Br\.|Ing\.|Lic\.|Dr\.|Msc\.)\s*/i, '').trim().split(/\s+/);
  if (clean.length >= 2) return `${clean[0]} ${clean[1]}`;
  return clean[0] || name;
}

/* ── Estilos compartidos (design tokens, sin hex duro) ─────────────────── */

/* Los iconos de carrera son PRESENTACION y viven aca, no en el catalogo de
   `lib/portada/catalogo.ts`: ese lo lee el store, y un store que importa un
   `.tsx` para resolver un nombre es un store que depende de React. El dato del
   catálogo es el texto; el dibujo es del componente. */
const ICONO_DE_CARRERA: Record<string, React.ReactNode> = {
  electronica: <Cpu size={12} strokeWidth="var(--icon-stroke)" />,
  sistemas: <Laptop size={12} strokeWidth="var(--icon-stroke)" />,
  civil: <Building2 size={12} strokeWidth="var(--icon-stroke)" />,
  industrial: <Factory size={12} strokeWidth="var(--icon-stroke)" />,
  quimica: <FlaskConical size={12} strokeWidth="var(--icon-stroke)" />,
};

const sectionHeader: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '7px',
  fontSize: '11px', fontWeight: 800, color: 'var(--color-text-secondary)',
  textTransform: 'uppercase', letterSpacing: '0.4px',
  marginBottom: '2px',
};

const baseInput: React.CSSProperties = {
  width: '100%', fontFamily: 'inherit', fontSize: '13px', color: 'var(--color-text-primary)',
  background: 'var(--color-bg-surface-alt)', border: '1px solid var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)', padding: '9px 12px', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
};

const fieldLabel: React.CSSProperties = {
  fontSize: '11px', fontWeight: 700, color: 'var(--color-text-secondary)',
  display: 'block', marginBottom: '5px',
};

/* Contenedor de chips: wrap flex con gap. */
const chipWrap: React.CSSProperties = {
  display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px',
};

/* Estilo base de un chip. */
const chipBase: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '5px',
  fontSize: '11px', fontWeight: 600, color: 'var(--color-text-secondary)',
  background: 'var(--surface-subtle)',
  /* Longhand y no `border`: el chip seleccionado y el hover cambian solo
     `borderColor`, y mezclar el atajo con una propiedad larga hace que React
     avise por rerender (y el orden de aplicación deje de ser predecible). */
  borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--color-border-subtle)',
  borderRadius: 'var(--radius-full)', padding: '5px 10px',
  cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1,
  transition: 'border-color 0.15s ease, background 0.15s ease, color 0.15s ease, transform 0.1s ease',
  userSelect: 'none',
};

/* Estilo de chip seleccionado (accent). */
const chipSelected: React.CSSProperties = {
  background: 'var(--color-accent-soft)',
  borderColor: 'var(--color-accent)',
  color: 'var(--color-accent)',
};

/* Tag removible (integrante ya añadido al campo autor). */
const removableTag: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  fontSize: '11px', fontWeight: 600, color: 'var(--color-text-primary)',
  background: 'var(--color-accent-soft)',
  border: '1px solid var(--color-accent)',
  borderRadius: 'var(--radius-full)', padding: '5px 4px 5px 10px',
  fontFamily: 'inherit', lineHeight: 1, maxWidth: '100%',
};

/* Botón X dentro de un tag removible. */
const removeBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: '16px', height: '16px', borderRadius: 'var(--radius-full)',
  border: 'none', background: 'var(--color-ink-a08)', cursor: 'pointer',
  color: 'var(--color-text-secondary)', padding: 0, flexShrink: 0,
};

/* Afirmación para un dato que el sistema NO conoce: en vez de dibujar un campo
   vacío con chips (lo que el usuario llamó "vomitar"), se ofrece agregarlo. */
const addFieldBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '6px', width: '100%',
  padding: '9px 12px', fontSize: '12px', fontWeight: 700,
  color: 'var(--color-accent)', background: 'var(--color-bg-surface-alt)',
  borderWidth: '1px', borderStyle: 'dashed', borderColor: 'var(--color-border-subtle)',
  borderRadius: 'var(--radius-md)', cursor: 'pointer', fontFamily: 'inherit',
  textAlign: 'left',
};

/* ── Sub-componente: Chip genérico ──────────────────────────────────────── */

interface ChipProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  title?: string;
  icon?: React.ReactNode;
}

const Chip: React.FC<ChipProps> = ({ label, selected, onClick, title, icon }) => (
  <button
    type="button"
    /* `aria-pressed` y no solo el color. Un chip que se enciende solo con el
       fondo no le dice nada a un lector de pantalla, y el estado de "elegido" es
       el dato, no la decoracion. */
    aria-pressed={selected}
    onClick={onClick}
    title={title || (selected ? 'Quitar' : 'Añadir')}
    style={{
      ...chipBase,
      ...(selected ? chipSelected : {}),
    }}
    onMouseEnter={(e) => {
      if (!selected) {
        e.currentTarget.style.borderColor = 'var(--color-accent)';
        e.currentTarget.style.color = 'var(--color-accent)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }
    }}
    onMouseLeave={(e) => {
      if (!selected) {
        e.currentTarget.style.borderColor = 'var(--color-border-subtle)';
        e.currentTarget.style.color = 'var(--color-text-secondary)';
        e.currentTarget.style.transform = 'translateY(0)';
      }
    }}
  >
    {selected && <Check size={11} strokeWidth="var(--icon-stroke)" />}
    {!selected && icon}
    <span>{label}</span>
  </button>
);

/* ── Sub-componente: sección plegable del formulario ─────────────────────────
 *  El editor tenía ocho campos sueltos en una sola columna, cada uno con su
 *  roster de chips debajo: un muro. Agrupados en tres secciones, la pantalla
 *  muestra lo que se está usando y el resto se abre cuando hace falta. El
 *  disparador es un `<button>` con `aria-expanded` y no un `<div>` con clic: así
 *  el teclado y el lector de pantalla saben que es un desplegable. */
interface SeccionProps {
  titulo: string;
  icono: React.ReactNode;
  abiertaPorDefecto?: boolean;
  children: React.ReactNode;
}

const Seccion: React.FC<SeccionProps> = ({ titulo, icono, abiertaPorDefecto = false, children }) => {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  const id = `seccion-portada-${titulo.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={id}
        onClick={() => setAbierta((v) => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
          width: '100%', padding: '8px 10px',
          background: 'var(--color-bg-surface-alt)',
          border: '1px solid var(--color-border-subtle)', borderRadius: 'var(--radius-md)',
          color: 'var(--color-text-primary)', fontFamily: 'inherit', cursor: 'pointer',
        }}
      >
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: '7px',
          fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px',
        }}>
          {icono}{titulo}
        </span>
        <ChevronDown
          size={14}
          strokeWidth="var(--icon-stroke)"
          aria-hidden
          style={{ transition: 'transform var(--transition-fast)', transform: abierta ? 'rotate(180deg)' : 'none' }}
        />
      </button>
      {abierta && (
        <div id={id} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {children}
        </div>
      )}
    </section>
  );
};

/* ── Componente principal ───────────────────────────────────────────────── */

export const CoverEditorPanel: React.FC = () => {
  const {
    portada, acta, setPortada, updateCoverField, updateActaField,
    updateCoverInstitucion, updateCoverCarrera, setCoverSetupDone,
  } = useDocStore();
  /* Los logos que se pidieron y no llegaron. Un asset faltante es un dato
     faltante, no un detalle de render: antes el `onError` hiding el `<img>` y
     la UI no decía nada. */
  const [logosQueNoCargan, setLogosQueNoCargan] = useState<Set<string>>(new Set());
  const { integrantes, profesores, grupos } = useRosterStore();
  const [busquedaRoster, setBusquedaRoster] = useState('');
  /* El editor no dibuja lo que no sabe. Institución y carrera arrancan plegadas
     detrás de una afirmación, y se abren cuando el usuario las pide o cuando el
     documento ya las trae. */
  const [mostrarInstitucion, setMostrarInstitucion] = useState(false);
  const [mostrarCarrera, setMostrarCarrera] = useState(false);

  const integrantesFiltrados = useMemo(() => {
    if (!busquedaRoster.trim()) return integrantes;
    const q = busquedaRoster.toLowerCase();
    return integrantes.filter(
      (i) => i.nombre.toLowerCase().includes(q) || (i.carnet && i.carnet.toLowerCase().includes(q))
    );
  }, [integrantes, busquedaRoster]);

  // Determinar modo actual
  const currentMode: 'original' | 'apa7' | 'uni' = useMemo(() => {
    if (portada.use_original_cover !== false) return 'original';
    if (portada.cover_mode === 'generate_uni_cover') return 'uni';
    return 'apa7';
  }, [portada.use_original_cover, portada.cover_mode]);

  const setCoverMode = (mode: 'original' | 'apa7' | 'uni') => {
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
    } else {
      setPortada({
        use_original_cover: false,
        force_skip_cover: false,
        cover_mode: '',
      });
    }
  };

  // Dispara el highlight azul sobre el campo en la hoja de portada
  const focusHighlight = (field: string) => () => requestCoverFieldHighlight(field);

  /* ── Integrantes / Autor ──────────────────────────────────────────────── */

  /* El autor es un dato del ACTA, no del diseno de la portada. Con la portada
     original conservada el bloque no se toca, asi que un autor guardado ahi
     nunca llegaba al `.docx`: eso es lo que reporto el usuario. El motivo
     entero esta en `python/models.py`. */
  const authorEntries = useMemo(() => parseAuthorEntries(acta.autor || ''), [acta.autor]);
  const currentAuthors = useMemo(() => authorEntries.map((a) => a.nombre), [authorEntries]);

  const handleUpdateAuthorEntry = (index: number, field: 'nombre' | 'carnet', value: string) => {
    const updated = [...authorEntries];
    updated[index] = { ...updated[index], [field]: value };
    const serialized = serializeAuthorEntries(updated);
    updateActaField('autor', serialized);
    requestCoverFieldHighlight('author');
  };

  const handleAddAuthorEntry = () => {
    const updated = [...authorEntries, { nombre: 'Br. Nuevo Estudiante', carnet: '' }];
    const serialized = serializeAuthorEntries(updated);
    updateActaField('autor', serialized);
    requestCoverFieldHighlight('author');
  };

  const handleRemoveAuthorEntry = (index: number) => {
    const updated = authorEntries.filter((_, i) => i !== index);
    const serialized = serializeAuthorEntries(updated);
    updateActaField('autor', serialized);
    requestCoverFieldHighlight('author');
  };

  const isAuthorSelected = (nombre: string): boolean =>
    currentAuthors.some((a) => a.toLowerCase() === nombre.toLowerCase());

  const toggleIntegrante = (nombre: string, carnet: string = '') => {
    const exists = currentAuthors.some((a) => a.toLowerCase() === nombre.toLowerCase());
    const next = exists
      ? authorEntries.filter((a) => a.nombre.toLowerCase() !== nombre.toLowerCase())
      : [...authorEntries, { nombre, carnet }];
    const serialized = serializeAuthorEntries(next);
    updateActaField('autor', serialized);
    requestCoverFieldHighlight('author');
  };

  /* ── Docente / Profesor ──────────────────────────────────────────────── */

  /* El profesor asesor es el PRIMERO de la lista del acta, y no un texto
     suelto: el comite de una defensa son varias personas, y `instructor` como
     string obligaba a pegarlas con comas. */
  const setInstructor = (nombre: string) => {
    const esElActual = acta.profesor_asesor[0] === nombre;
    updateActaField('profesor_asesor', esElActual ? [] : [nombre]);
    requestCoverFieldHighlight('instructor');
  };

  /* ── Grupo ───────────────────────────────────────────────────────────── */

  const setGrupo = (valor: string) => {
    const isCurrent = (acta.grupo || '') === valor;
    updateActaField('grupo', isCurrent ? '' : valor);
    requestCoverFieldHighlight('grupo');
  };

  /* ── Fecha ───────────────────────────────────────────────────────────── */

  const dateInputValue = useMemo(() => {
    const raw = portada.date || '';
    if (!raw) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
    /* "25 de junio de 2025" y también "25 de junio del año 2025": el backend
       escribe la fecha con "del año" en medio, y el regex viejo exigía "mes de
       año", así que el selector quedaba vacío con el dato presente. */
    const m = raw.match(/(\d{1,2})\s+de\s+(\w+)\s+(?:del?\s+)?(?:año\s+)?(\d{4})/i);
    if (m) {
      const day = m[1].padStart(2, '0');
      const monthIdx = MESES_ES.indexOf(m[2].toLowerCase());
      if (monthIdx >= 0) {
        const month = String(monthIdx + 1).padStart(2, '0');
        return `${m[3]}-${month}-${day}`;
      }
    }
    const d = new Date(raw);
    if (!isNaN(d.getTime())) {
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${d.getFullYear()}-${month}-${day}`;
    }
    return '';
  }, [portada.date]);

  const formattedDate = useMemo(() => formatFechaES(dateInputValue), [dateInputValue]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const iso = e.target.value;
    updateCoverField('date', iso ? formatFechaES(iso) : '');
    requestCoverFieldHighlight('date');
  };

  /* Un dato que existe se muestra; uno que no, se pide. */
  const tieneInstitucion = Boolean((portada.institution || '').trim() || portada.institucionSeleccionada);
  const tieneCarrera = Boolean((portada.departamento || '').trim() || portada.carreraSeleccionada);

  /* ── Render ──────────────────────────────────────────────────────────── */

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', height: '100%',
      overflow: 'hidden', backgroundColor: 'var(--color-bg-surface)',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
        padding: '12px 14px', borderBottom: '1px solid var(--color-border-subtle)',
      }}>
        <School size={15} color="var(--color-accent)" />
        <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-display)', fontWeight: 800, color: 'var(--color-text-primary)' }}>
          Editor de portada
        </span>
      </div>

      {/* Cuerpo scrollable */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '14px',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        {/* Formulario SIEMPRE activo y editable */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: '16px',
        }}>
          <Seccion titulo="Identificación" icono={<FileText size={12} color="var(--color-accent)" />}>

          {/* ── Título del trabajo ──────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={fieldLabel}>Título del trabajo</label>
              <span style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>Tab para ir a autores</span>
            </div>
            <textarea
              value={portada.title || ''}
              onChange={(e) => updateCoverField('title', e.target.value)}
              onFocus={focusHighlight('title')}
              placeholder="Escribe el título completo de tu trabajo..."
              rows={3}
              style={{ ...baseInput, resize: 'none', lineHeight: 1.45 }}
            />
            {/* Helper Badge (Contador de Caracteres y Palabras APA 7) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '3px 8px', borderRadius: 'var(--radius-full)',
                backgroundColor: 'var(--surface-subtle)',
                color: 'var(--color-text-secondary)',
                border: '1px solid var(--color-border-subtle)',
                fontSize: '11px', fontWeight: 600, fontFamily: 'inherit',
              }}>
                <span style={{
                  width: '6px', height: '6px', borderRadius: 'var(--radius-full)',
                  backgroundColor: ((portada.title || '').trim().split(/\s+/).filter(Boolean).length > 12) ? 'var(--color-text-tertiary)' : 'var(--color-accent)',
                }} />
                <span>
                  {(portada.title || '').length} caracteres · {(portada.title || '').trim().split(/\s+/).filter(Boolean).length} palabras (APA recomienda máx 12)
                </span>
              </div>
            </div>
          </div>
          </Seccion>

          {/* ── Integrantes / Autores: su propia sección plegable, cerrada ── */}
          <Seccion
            titulo={`Integrantes / Autores (${authorEntries.length})`}
            icono={<Users size={12} color="var(--color-accent)" />}
          >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={handleAddAuthorEntry}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: 'var(--color-accent)',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px 6px',
                }}
              >
                + Agregar Integrante
              </button>
            </div>

            {/* Lista de renglones estructurados */}
            {authorEntries.map((entry, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px',
                  backgroundColor: 'var(--surface-subtle)',
                  border: '1px solid var(--color-border-subtle)',
                  borderRadius: 'var(--radius-md)',
                }}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <input
                    type="text"
                    value={entry.nombre}
                    onChange={(e) => handleUpdateAuthorEntry(idx, 'nombre', e.target.value)}
                    onFocus={focusHighlight('author')}
                    placeholder="Br. Nombre del Estudiante"
                    style={{ ...baseInput, padding: '5px 8px', fontSize: '12px' }}
                  />
                  <input
                    type="text"
                    value={entry.carnet}
                    onChange={(e) => handleUpdateAuthorEntry(idx, 'carnet', e.target.value)}
                    onFocus={focusHighlight('author')}
                    placeholder="Carnet: 202X-XXXXU"
                    style={{ ...baseInput, padding: '5px 8px', fontSize: '11px', color: 'var(--color-text-secondary)' }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAuthorEntry(idx)}
                  title="Eliminar integrante"
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: 'var(--radius-full)',
                    border: 'none',
                    backgroundColor: 'var(--color-danger-a12)',
                    color: 'var(--color-danger)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <X size={12} strokeWidth="var(--icon-stroke)" />
                </button>
              </div>
            ))}

            {authorEntries.length === 0 && (
              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontStyle: 'italic', padding: '6px 0' }}>
                No hay integrantes agregados. Haz clic en "+ Agregar Integrante" o selecciona del roster.
              </div>
            )}

            {/* Roster de integrantes con buscador */}
            {integrantes.length > 0 && (
              <div style={{ marginTop: '6px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={sectionHeader}>
                    <Users size={12} color="var(--color-accent)" /> Integrantes del Roster ({integrantesFiltrados.length})
                  </div>
                </div>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={12} color="var(--color-text-tertiary)" style={{ position: 'absolute', left: '8px', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    value={busquedaRoster}
                    onChange={(e) => setBusquedaRoster(e.target.value)}
                    placeholder="Buscar estudiante o carnet..."
                    style={{
                      ...baseInput,
                      padding: '4px 8px 4px 26px',
                      fontSize: '11px',
                      height: '26px',
                    }}
                  />
                  {busquedaRoster && (
                    <button
                      type="button"
                      onClick={() => setBusquedaRoster('')}
                      style={{
                        position: 'absolute', right: '6px', background: 'none', border: 'none',
                        cursor: 'pointer', color: 'var(--color-text-tertiary)', display: 'flex', padding: 0,
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div style={{ ...chipWrap, maxHeight: '140px', overflowY: 'auto' }}>
                  {integrantesFiltrados.map((intg) => {
                    const selected = isAuthorSelected(intg.nombre);
                    return (
                      <Chip
                        key={intg.id}
                        icon={
                          <span style={{
                            width: '18px', height: '18px', borderRadius: 'var(--radius-full)',
                            backgroundColor: selected ? 'var(--color-text-on-accent)' : 'var(--color-accent)',
                            color: selected ? 'var(--color-accent)' : 'var(--color-text-on-accent)',
                            fontSize: '9px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            {getInitials(intg.nombre)}
                          </span>
                        }
                        label={getShortName(intg.nombre)}
                        selected={selected}
                        onClick={() => toggleIntegrante(intg.nombre, intg.carnet)}
                        title={intg.carnet ? `${intg.nombre} (${intg.carnet})` : intg.nombre}
                      />
                    );
                  })}
                  {integrantesFiltrados.length === 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', fontStyle: 'italic', padding: '4px 0' }}>
                      No se encontraron integrantes que coincidan con &quot;{busquedaRoster}&quot;
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
          </Seccion>

          <Seccion titulo="Institución y carrera" icono={<School size={12} color="var(--color-accent)" />}>
          {/* ── Institución / Universidad con Logos e Insignias Rápidas ─── */}
          {!tieneInstitucion && !mostrarInstitucion ? (
            <button type="button" style={addFieldBtn} onClick={() => setMostrarInstitucion(true)}>
              <Plus size={13} strokeWidth="var(--icon-stroke)" /> Agregar institución
            </button>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={fieldLabel}>Institución / Universidad</label>
              <div style={{ display: 'flex', gap: '5px' }}>
                {UNIVERSIDADES_PRESETS.map((u) => {
                  /* El estado es el CÓDIGO, y la comparación es por igualdad
                     exacta. Antes era `institution.toLowerCase().includes(codigo)`
                     sobre texto libre: con dos instituciones escritas en el campo
                     los dos chips quedaban encendidos, y el valor guardado no era
                     el de ninguna. Un control de un solo valor que parece de dos
                     no es un control de un solo valor. */
                  const isSelected = portada.institucionSeleccionada === u.codigo;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={u.nombre}
                      onClick={() => {
                        /* `null` cuando es la misma: hacer clic en la ya elegida
                           la deselecciona y devuelve el campo de texto libre. */
                        updateCoverInstitucion(isSelected ? null : u.codigo);
                        requestCoverFieldHighlight('institution');
                      }}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 'var(--radius-md)',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: isSelected ? 'var(--color-accent-soft)' : 'var(--color-bg-surface-alt)',
                        color: isSelected ? 'var(--color-accent)' : 'var(--color-text-primary)',
                        border: isSelected ? '1.5px solid var(--color-accent)' : '1px solid var(--color-border-subtle)',
                        boxShadow: isSelected ? '0 1px 4px var(--shadow-sm)' : 'none',
                        transition: 'all 0.15s ease',
                      }}
                      title={u.nombre}
                    >
                      {/* Logo nítido con fondo blanco contenido para máxima visibilidad */}
                      {u.logoUrl && !logosQueNoCargan.has(u.codigo) ? (
                        <div
                          style={{
                            width: '20px',
                            height: '20px',
                            borderRadius: 'var(--radius-xs)',
                            backgroundColor: 'var(--paper-white)',
                            padding: '2px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            boxShadow: '0 0 1px var(--color-ink-a20)',
                            flexShrink: 0,
                          }}
                        >
                          <img
                            src={resolveAssetUrl(u.logoUrl)}
                            alt={u.codigo}
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            onError={() => setLogosQueNoCargan((v) => new Set(v).add(u.codigo))}
                          />
                        </div>
                      ) : null}
                      {u.logoUrl && logosQueNoCargan.has(u.codigo) && (
                        <span
                          role="status"
                          style={{
                            fontSize: '9px', fontWeight: 700, color: 'var(--color-danger)',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {u.codigo}: el logo no se pudo cargar
                        </span>
                      )}
                      <span>{u.codigo}</span>
                      {isSelected && (
                        <Check size={12} strokeWidth="var(--icon-stroke)" style={{ color: 'var(--color-accent)' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            <input
              type="text"
              value={portada.institution || ''}
              onChange={(e) => updateCoverField('institution', e.target.value)}
              onFocus={focusHighlight('institution')}
              placeholder="Universidad o institución"
              style={baseInput}
            />
          </div>
          )}

          {/* ── Carrera / Facultad / Área con Avatares de Carrera ───────── */}
          {!tieneCarrera && !mostrarCarrera ? (
            <button type="button" style={addFieldBtn} onClick={() => setMostrarCarrera(true)}>
              <Plus size={13} strokeWidth="var(--icon-stroke)" /> Agregar carrera
            </button>
          ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={fieldLabel}>Carrera / Facultad / Área</label>
            <input
              type="text"
              value={portada.departamento || ''}
              onChange={(e) => updateCoverField('departamento', e.target.value)}
              onFocus={focusHighlight('departamento')}
              placeholder="Ej: Ingeniería Electrónica o Área de Conocimiento"
              style={baseInput}
            />
            {/* Presets de carreras con avatares / iconos vectoriales */}
            <div style={chipWrap}>
              {CARRERAS_PRESETS.map((carr) => {
                /* Mismo patron que la institucion, por el mismo motivo: el
                   estado es el ID y la comparacion es por igualdad exacta. Con
                   `includes` sobre `departamento`, escribir dos carreras a mano
                   encendia los dos chips. */
                const selected = portada.carreraSeleccionada === carr.id;
                return (
                  <Chip
                    key={carr.id}
                    icon={ICONO_DE_CARRERA[carr.id]}
                    label={carr.label}
                    selected={selected}
                    onClick={() => {
                      updateCoverCarrera(selected ? null : carr.id);
                      requestCoverFieldHighlight('departamento');
                    }}
                    title={carr.nombre}
                  />
                );
              })}
            </div>
          </div>
          )}

          </Seccion>

          <Seccion
            titulo="Docente y entrega"
            icono={<GraduationCap size={12} color="var(--color-accent)" />}
          >
          {/* ── Asignatura / Curso ──────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={fieldLabel}>Asignatura / Curso</label>
            <input
              type="text"
              value={portada.course || ''}
              onChange={(e) => updateCoverField('course', e.target.value)}
              onFocus={focusHighlight('course')}
              placeholder="Nombre de la asignatura"
              style={baseInput}
            />
          </div>

          {/* ── Grupo ───────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={fieldLabel}>Grupo</label>
            <input
              type="text"
              value={acta.grupo || ''}
              onChange={(e) => updateActaField('grupo', e.target.value)}
              onFocus={focusHighlight('grupo')}
              placeholder="Ej: 3T1 IND"
              style={baseInput}
            />
            {grupos.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ ...sectionHeader, fontSize: '9px' }}>
                  <Hash size={11} color="var(--color-accent)" /> Grupos guardados
                </div>
                <div style={chipWrap}>
                  {grupos.map((g) => {
                    const selected = (acta.grupo || '') === g;
                    return (
                      <Chip
                        key={g}
                        label={g}
                        selected={selected}
                        onClick={() => setGrupo(g)}
                        title={selected ? 'Quitar grupo' : 'Seleccionar grupo'}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Docente / Profesor ──────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={fieldLabel}>Docente / Profesor</label>
            <input
              type="text"
              value={acta.profesor_asesor[0] || ''}
              onChange={(e) => updateActaField('profesor_asesor', e.target.value ? [e.target.value] : [])}
              onFocus={focusHighlight('instructor')}
              placeholder="Nombre y título del docente"
              style={baseInput}
            />
            {/* Tag del docente seleccionado (removible) */}
            {acta.profesor_asesor.length > 0 && (
              <div style={{ display: 'flex', marginTop: '6px' }}>
                <span style={removableTag}>
                  <GraduationCap size={12} color="var(--color-accent)" />
                  <span style={{
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    maxWidth: '200px',
                  }}>
                    {acta.profesor_asesor.join(', ')}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateActaField('profesor_asesor', [])}
                    title="Quitar docente"
                    style={removeBtn}
                  >
                    <X size={10} strokeWidth="var(--icon-stroke)" />
                  </button>
                </span>
              </div>
            )}
            {/* Roster de profesores como chips */}
            {profesores.length > 0 && (
              <div style={{ marginTop: '4px' }}>
                <div style={{ ...sectionHeader, fontSize: '9px' }}>
                  <GraduationCap size={11} color="var(--color-accent)" /> Profesores guardados
                </div>
                <div style={chipWrap}>
                  {profesores.map((prof) => {
                    const selected = acta.profesor_asesor[0] === prof.nombre;
                    return (
                      <Chip
                        key={prof.id}
                        label={prof.nombre}
                        selected={selected}
                        onClick={() => setInstructor(prof.nombre)}
                        title={selected ? 'Quitar docente' : 'Asignar docente'}
                        icon={<GraduationCap size={11} />}
                      />
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* ── Fecha ───────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={fieldLabel}>Fecha</label>
            <div style={{ position: 'relative' }}>
              <Calendar
                size={14}
                color="var(--color-text-tertiary)"
                style={{
                  position: 'absolute', left: '12px', top: '50%',
                  transform: 'translateY(-50%)', pointerEvents: 'none',
                }}
              />
              <input
                type="date"
                value={dateInputValue}
                onChange={handleDateChange}
                onFocus={focusHighlight('date')}
                style={{
                  ...baseInput,
                  paddingLeft: '34px',
                  colorScheme: 'light',
                }}
              />
            </div>
            {/* Fecha formateada en español (preview) */}
            {formattedDate && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '5px',
                fontSize: '11px', color: 'var(--color-accent)', fontWeight: 600,
                marginTop: '2px',
              }}>
                <Calendar size={11} /> {formattedDate}
              </div>
            )}
          </div>
          </Seccion>
        </div>
      </div>

      {/* CTA fijo al pie */}
      <div style={{
        flexShrink: 0, padding: '12px 14px', borderTop: '1px solid var(--color-border-subtle)',
        backgroundColor: 'var(--color-bg-surface)',
      }}>
        <button
          type="button"
          onClick={() => {
            useDocStore.getState().showToast('Cambios de portada aplicados', 'success');
            setCoverSetupDone(true);
          }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '7px', padding: '11px 14px', fontSize: '13px', fontWeight: 700,
            background: 'var(--color-accent)', color: 'var(--color-text-on-accent)',
            border: 'none', borderRadius: 'var(--radius-lg)', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <Check size={15} strokeWidth="var(--icon-stroke)" /> Actualizar portada
        </button>
        <button
          type="button"
          onClick={() => {
            setCoverSetupDone(true);
            useDocStore.getState().setWizardStep(2);
          }}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: '7px', marginTop: '8px', padding: '10px 14px', fontSize: '12px', fontWeight: 700,
            background: 'transparent', color: 'var(--color-accent)',
            border: '1px solid var(--color-accent-a65)', borderRadius: 'var(--radius-lg)', cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Continuar a Estructura <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
};

export default CoverEditorPanel;
