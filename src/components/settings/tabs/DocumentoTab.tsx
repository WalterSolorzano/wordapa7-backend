/* WordAPA7 — la pestaña Documento: el papel y el idioma, que son del archivo.
 *
 * Esta pestaña existe por una contradicción que llevaba meses viva y que nadie
 * había notado: `design-system.css` fijaba la hoja en `210mm` (A4) mientras el
 * lienzo paginaba con Carta y el `.docx` salía con el tamaño que tuviera el
 * original. Dos verdades sobre la misma hoja, ninguna mirando a la otra, y los
 * dos tamaños parecían razonables — por eso no se veía.
 *
 * LO QUE HAY ACÁ, y por qué cada cosa escribe donde escribe:
 *
 *  1. TAMAÑO DE HOJA, en `rules.page_size`. Es el mismo campo del que lee
 *     `pageGeometry.ts` (la paginación del lienzo) y del que lee
 *     `style_engine.py` (`section.page_width` del `.docx`). Un solo dato para
 *     las dos hojas. Antes no existía: cada lado tenía el suyo.
 *  2. IDIOMA DEL DOCUMENTO, en `portada.language`. Es lo que decide el `w:lang`
 *     del archivo, que es lo que hace que la revisión de ortografía no subraye
 *     un texto en español con el corrector en inglés. Antes no existía como
 *     dato: `portada.date` era texto libre y el idioma se lo adivinaba Word.
 *  3. PERFIL DE FORMATO, en `setActiveProfile`. Vive acá porque es la elección
 *     de qué norma se sigue, y porque desde Ajustes no se llamaba nunca: el
 *     `<select>` del paso 0 del wizard era la única forma de cambiarlo. Ese
 *     `<select>` SE QUEDA, como atajo, y su comentario de "única forma" ya no
 *     es cierto.
 *
 * Y dos perfiles, no un perfil institucional: `python/profiles.py` define
 * `apa7` y `scientific-journal`, y son dos configuraciones de formato. El texto
 * lo dice, porque "perfil" en otra app suele significar "la norma de tu
 * universidad" y prometer eso sería falso.
 *
 * NADA DE ESTO ES DE LA APP: todo baja y sube con el documento.
 */
import React, { useEffect } from 'react';
import { FileText, Globe, Layers, Square, AlertTriangle } from 'lucide-react';
import { useDocStore } from '../../../store/useDocStore';
import { EditorialMascot, type MascotExpression } from '../../layout/EditorialMascot';
import { kindDePestana, expresionDePestana, expresionDeDocumento } from '../mascotDePestana';
import { pestanaPorId } from '../tabs';
import { Seccion } from './word/Seccion';
import {
  TAMANOS_DE_PAPEL,
  normalizarPageSize,
} from '../../../lib/pageSizeEnHtml';
import { PORTADA_IDIOMAS, type PortadaLanguage } from '../../../types';

const PESTANA = pestanaPorId('documento');

const ESTILO_ETIQUETA: React.CSSProperties = {
  fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-text-primary)',
};
const ESTILO_AYUDA: React.CSSProperties = {
  fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)', lineHeight: 'var(--leading-normal)',
};
const ESTILO_CAMPO: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: 'var(--space-2) var(--space-3)',
  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-family)',
  background: 'var(--bg-base)', color: 'var(--color-text-primary)',
  border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
};

/* La cara sale del estado, no del decorado, y la regla vive en
 * `mascotDePestana.tsx` con las otras cuatro: preguntar por claves de proveedor
 * en una pestaña que no configura el motor pondría una cara preocupada permanente
 * donde no falta nada. La regla de esta pestaña es si el archivo va a decir lo
 * que dice la pantalla, y eso se responde con dos cosas: que haya un tamaño de
 * hoja elegido y que haya un idioma. Se reexporta acá porque es parte de la API
 * de la pestaña y hay quien la importa desde acá. */
export { expresionDeDocumento };

export const DocumentoTab: React.FC = () => {
  const doc = useDocStore((s) => s.doc);
  const rules = useDocStore((s) => s.rules);
  const setRules = useDocStore((s) => s.setRules);
  const portada = useDocStore((s) => s.portada);
  const setPortada = useDocStore((s) => s.setPortada);
  const profiles = useDocStore((s) => s.profiles);
  const activeProfileId = useDocStore((s) => s.activeProfileId);
  const fetchProfiles = useDocStore((s) => s.fetchProfiles);
  const setActiveProfile = useDocStore((s) => s.setActiveProfile);

  /* Los perfiles vienen de `/api/profiles`. Se piden al montar la pestaña y no
     en el arranque de la app: hasta hoy esta lista la llenaba el paso 0 del
     wizard, así que entrar a Ajustes con el documento ya abierto —que es el
     caso en que se lo necesita— no tenía ningún perfil que mostrar. */
  useEffect(() => {
    if (profiles.length === 0) { void fetchProfiles(); }
  }, [profiles.length, fetchProfiles]);

  const pageSize = normalizarPageSize(rules.page_size);
  const language = portada.language || 'es-ES';
  const expresion: MascotExpression = doc
    ? expresionDePestana(PESTANA, {
      documentoAbierto: true,
      pageSize: rules.page_size,
      idiomaPortada: portada.language,
    })
    : 'worried';

  /* Sin documento no hay papel que elegir: se lo dice, y no muestra los campos
     mudos. Es el Review Focus #4 de esta fase. */
  if (!doc) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <EditorialMascot kind={kindDePestana(PESTANA.mascotKind)} expression="worried" size={44} />
        <p
          data-testid="documento-estado"
          style={{
            margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-warning)',
            lineHeight: 'var(--leading-normal)',
          }}
        >
          Todavía no hay ningún documento abierto. El papel y el idioma son de
          cada documento, así que no hay nada que ajustar hasta que abras o subas
          uno.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      {/* La mascota con la cara del estado, y el estado en palabras al lado. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
        <EditorialMascot kind={kindDePestana(PESTANA.mascotKind)} expression={expresion} size={44} />
        <p
          data-testid="documento-estado"
          style={{
            margin: 0, fontSize: 'var(--text-sm)', lineHeight: 'var(--leading-normal)',
            color: 'var(--color-text-secondary)',
          }}
        >
          {expresion === 'happy'
            ? 'Hoja Carta e idioma declarados. El lienzo y el archivo van a decir lo mismo.'
            : 'Este documento se sale de la norma en el papel o en el idioma. Se puede: lo que no se puede es que el archivo no lo cumpla.'}
        </p>
      </div>

      {/* ── El tamaño de hoja ──────────────────────────────────────────── */}
      <Seccion
        titulo="Tamaño de hoja"
        descripcion="Eligelo acá y el lienzo pagina con esa hoja y el .docx sale con ese papel. Antes cada lado tenía el suyo: la hoja del CSS decía A4 y el archivo decía el tamaño del original."
      >
        <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
          {TAMANOS_DE_PAPEL.map((t) => {
            const activo = t.valor === pageSize;
            return (
              <button
                key={t.valor}
                type="button"
                data-campo="page_size"
                data-testid={`campo-page_size-${t.valor}`}
                aria-pressed={activo}
                onClick={() => setRules({ page_size: t.valor })}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                  padding: 'var(--space-3)', cursor: 'pointer', minWidth: '240px',
                  fontFamily: 'var(--font-family)', fontSize: 'var(--text-sm)',
                  fontWeight: activo ? 700 : 500, textAlign: 'left',
                  color: activo ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  background: activo ? 'var(--color-accent-soft)' : 'var(--bg-base)',
                  border: `1px solid ${activo ? 'var(--color-accent)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <Square size={14} strokeWidth="var(--icon-stroke)" />
                  {t.etiqueta}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                  {t.nota}
                </span>
              </button>
            );
          })}
        </div>
        <p data-testid="documento-hoja-efecto" style={{ margin: 0, ...ESTILO_AYUDA }}>
          {`El .docx va a medir ${TAMANOS_DE_PAPEL.find((t) => t.valor === pageSize)?.anchoMm} x ${TAMANOS_DE_PAPEL.find((t) => t.valor === pageSize)?.altoMm} mm, y el lienzo repagina con esa medida. Si el documento que subiste venía en otro papel, el archivo sale con el que elijas acá, no con el que traía.`}
        </p>
      </Seccion>

      {/* ── El idioma del documento ─────────────────────────────────────── */}
      <Seccion
        titulo="Idioma del documento"
        descripcion="No es el idioma de la interfaz: es el idioma en que está escrito el texto, y va dentro del archivo."
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)', maxWidth: '320px' }}>
          <label htmlFor="campo-language" style={ESTILO_ETIQUETA}>
            Idioma del texto
          </label>
          <select
            id="campo-language"
            data-campo="language"
            data-testid="campo-language"
            value={language}
            onChange={(e) => setPortada({ language: e.target.value as PortadaLanguage })}
            style={ESTILO_CAMPO}
          >
            {PORTADA_IDIOMAS.map((i) => (
              <option key={i.valor} value={i.valor}>{i.etiqueta}</option>
            ))}
          </select>
        </div>
        <p data-testid="documento-idioma-efecto" style={{ margin: 0, ...ESTILO_AYUDA }}>
          {`Se escribe como w:lang en el archivo. Es lo que Word usa para decidir qué corrector de ortografía aplicar: sin esto, o con el inglés que trae la plantilla, un texto en español sale con cada palabra subrayada y parece un documento mal escrito.`}
        </p>
      </Seccion>

      {/* ── El perfil de formato ────────────────────────────────────────── */}
      <Seccion
        titulo="Perfil de formato"
        descripcion="Qué norma se sigue. Hay dos, y son dos configuraciones de formato —no un perfil institucional—: el archivo del backend define exactamente estos dos y ninguno más."
      >
        {profiles.length === 0 ? (
          <p
            data-testid="documento-perfiles-vacios"
            style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--color-text-tertiary)' }}
          >
            No se pudieron leer los perfiles del servidor. El documento sigue con
            APA 7, que es el perfil por defecto. Abrí Ajustes otra vez para
            reintentarlo.
          </p>
        ) : (
          <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
            {profiles.map((p) => {
              const activo = p.profile_id === activeProfileId;
              return (
                <button
                  key={p.profile_id}
                  type="button"
                  data-campo="activeProfileId"
                  data-testid={`campo-perfil-${p.profile_id}`}
                  aria-pressed={activo}
                  onClick={() => { void setActiveProfile(p.profile_id); }}
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px',
                    padding: 'var(--space-3)', cursor: 'pointer', minWidth: '260px',
                    fontFamily: 'var(--font-family)', fontSize: 'var(--text-sm)',
                    fontWeight: activo ? 700 : 500, textAlign: 'left',
                    color: activo ? 'var(--color-accent)' : 'var(--color-text-primary)',
                    background: activo ? 'var(--color-accent-soft)' : 'var(--bg-base)',
                    border: `1px solid ${activo ? 'var(--color-accent)' : 'var(--border-subtle)'}`,
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <FileText size={14} strokeWidth="var(--icon-stroke)" />
                    {p.display_name}
                  </span>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-tertiary)' }}>
                    {p.description}
                  </span>
                </button>
              );
            })}
          </div>
        )}
        <p data-testid="documento-perfil-atajo" style={{ margin: 0, ...ESTILO_AYUDA }}>
          El selector del primer paso del asistente sigue funcionando: es el mismo
          control, no otro. Esta pestaña es el lugar donde se ve qué hace el
          perfil, no solo su nombre.
        </p>
      </Seccion>

      {/* ── EL LÍMITE, DICHO ─────────────────────────────────────────────
       * La pestaña pertenece a la pestaña Documento dice "se guardan con el
       * documento". Eso es cierto de la PERSISTENCIA —IndexedDB del cliente y
       * SQLite del servidor— y es falso del AISLAMIENTO: `rules` es UNO en el
       * store, no uno por documento, así que con dos documentos abiertos un
       * cambio de Formato o de Documento afecta a los dos.
       *
       * Se dice acá y no se maquilla. Un texto que promete aislamiento y no lo
       * tiene es peor que uno que dice la verdad, porque entrena a la gente a
       * confiar en algo que no funciona. */}
      <Seccion
        titulo="Qué pasa con dos documentos abiertos"
        descripcion="El límite real de esta pestaña, escrito."
      >
        <p
          data-testid="documento-limite-ambito"
          style={{
            margin: 0, display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)',
            fontSize: 'var(--text-xs)', color: 'var(--color-text-secondary)',
            lineHeight: 'var(--leading-normal)',
          }}
        >
          <AlertTriangle size={15} strokeWidth="var(--icon-stroke)" />
          <span>
            Lo que cambiás acá se guarda con el documento y sale con él al
            descargar. Lo que NO pasa todavía es que quede aislado del otro
            documento que tengas abierto: el formato y el papel viven en un solo
            lugar de la app, así que con dos documentos abiertos, cambiarlo acá
            cambia a los dos. Separarlos es un arreglo de fondo, no un texto, y
            por eso acá está escrito en vez de prometido.
          </span>
        </p>
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', ...ESTILO_AYUDA }}>
          <Layers size={14} strokeWidth="var(--icon-stroke)" />
          {`El perfil elegido sale de ${profiles.length} ${profiles.length === 1 ? 'perfil' : 'perfiles'} del servidor.`}
        </p>
      </Seccion>

      <p
        data-testid="documento-globo"
        style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 'var(--space-2)', ...ESTILO_AYUDA }}
      >
        <Globe size={14} strokeWidth="var(--icon-stroke)" />
        Ninguno de estos ajustes es de la app: no se guardan en localStorage y no
        cambian lo que ves en el resto de la aplicación.
      </p>
    </div>
  );
};

export default DocumentoTab;
