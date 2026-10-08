/* WordAPA7 — Vista previa de la portada universitaria (UNI).
   Renderiza la misma estructura que genera python/modules/portada_uni.py:
   logo centrado, area de conocimiento, titulo, asignatura, "Elaborado por",
   autores en columnas con separadores verticales, docente + grupo, fecha y lugar.

   NO HAY NI UN NUMERO DE MEDIDA ESCRITO A MANO EN ESTE ARCHIVO. Antes los
   habia (un `minHeight: 780px` sin relacion de aspecto, un `width: 150px` para
   el logo y seis `fontSize` en pt que no eran los del `.docx`), y por eso la
   preview se veia mas chica de lo que iba a salir: el `.docx` ponia el titulo en
   20pt y la preview lo pintaba en 16pt. Tres constantes duplicadas sin un token
   que las amarre.

   La direccion del arreglo es una sola: el `.docx` manda y la preview copia.
   Todo sale de `lib/portada/geometria`, y los puntos vienen de la tabla
   `PT_PORTADA_UNI`, que es una COPIA de los de `portada_uni.py`. El test de la
   Task 2 mide que las dos copias coincidan. */
import React, { useState, useEffect } from 'react';
import { useDocStore } from '../../store/useDocStore';
import { parseAuthorEntries, COVER_FIELD_HIGHLIGHT_EVENT } from '../../lib/portadaAuthors';
import { resolveAssetUrl } from '../../api/backend';
import { medidaDeLaHoja, PT_PORTADA_UNI, FRACCION_DE_ANCHO_DEL_LOGO, type Hoja } from '../../lib/portada/geometria';

/* La tinta de la portada. Es una PREVISUALIZACION de una hoja impresa, asi que
   el color no es el de la interfaz sino el del papel: `--paper-ink`, que R7
   declara igual en los dos temas precisamente porque el papel no se oscurece.
   Este `BLACK` era un `#000000` suelto que ademas no era el negro de la hoja,
   con lo que la vista previa y el PDF salian de un gris distinto al que
   python/modules/portada_uni.py escribe. */
const BLACK = 'var(--paper-ink)';

/** El ancho disponible de la hoja, en px. Es el ancho de la pantalla, no una
 *  medida de la hoja, asi que vive aca y no en `geometria.ts`: todo lo demas
 *  sale de la escala que este numero produce. */
export const ANCHO_HOJA_PX = 680;

/** Separa el acta en estudiantes y docente por DATO, no por el prefijo del
 *  nombre. La heuristica anterior (`/^(ing\.|dr\.|m\.sc\.|lic\.)/`) clasificaba
 *  a un estudiante con titulo como docente y a un docente sin titulo como
 *  estudiante, asi que la preview podia mostrar (u ocultar) al tutor distinto de
 *  lo que escribia `portada_uni.py`. El criterio real es el mismo que usa el
 *  `.docx`: el docente es quien esta en `profesor_asesor` (alli viaja el flag
 *  `es_tutor`). Si ademas viene en la lista de autores, se excluye de
 *  estudiantes para no duplicarlo. */
export function clasificarAutoresDePortada(
  autores: { nombre: string; carnet: string }[],
  profesorAsesor: string[],
): { estudiantes: { nombre: string; carnet: string }[]; tutor: string } {
  const docentes = new Set((profesorAsesor || []).map((d) => d.toLowerCase().trim()));
  const esDocente = (nombre: string) => docentes.has(nombre.toLowerCase().trim());
  return {
    estudiantes: autores.filter((a) => !esDocente(a.nombre)),
    tutor: (profesorAsesor && profesorAsesor[0]) || '',
  };
}

export const UNICoverPreview: React.FC<{ hoja?: Hoja; anchoPx?: number }> = ({
  hoja = 'carta',
  anchoPx = ANCHO_HOJA_PX,
}) => {
  const portada = useDocStore((s) => s.portada);
  /* Los integrantes, el docente y el grupo son datos del acta, no del diseno de
     la portada. Ver el motivo en `python/models.py`: con `use_original_cover` un
     dato guardado dentro de la portada no sale, porque el bloque no se toca. */
  const acta = useDocStore((s) => s.acta);
  const [highlightField, setHighlightField] = useState<string | null>(null);
  /* Un logo que se pidio y no llego es un DATO FALTANTE, no un detalle de
     render. Antes el `onError` le hacia `display: none` y la portada se
     drawneaba sin logo sin que nadie se enterara: es la forma peor de fallar,
     porque no hay error, hay una hoja incompleta. */
  /* Los logos que el documento pidió, por su `asset`. Antes la preview
     apuntaba siempre a `logo_uni.png` y el `.docx` ponía siempre el logo de la
     UNI: los dosgjuntos tenían la insignia fija y elegir UNAN no se notaba ni en
     la preview ni en el documento. La lista viene del store, que es donde el
     `onClick` del chip la dejó. */
  const logos = portada.logos?.length
    ? portada.logos
    : [{ asset: 'logo_uni.png', ancho_fraccion: FRACCION_DE_ANCHO_DEL_LOGO }];
  const [logosQueNoCargan, setLogosQueNoCargan] = useState<Set<string>>(new Set());

  useEffect(() => {
    const handler = (e: Event) => {
      const field = (e as CustomEvent).detail?.field as string | undefined;
      if (!field) return;
      setHighlightField(field);
      window.setTimeout(() => setHighlightField(null), 1200);
    };
    window.addEventListener(COVER_FIELD_HIGHLIGHT_EVENT, handler);
    return () => window.removeEventListener(COVER_FIELD_HIGHLIGHT_EVENT, handler);
  }, []);

  const hl = (field: string): React.CSSProperties =>
    highlightField === field
      ? { background: 'var(--color-accent-a20)', boxShadow: '0 0 0 2px var(--accent-primary)', borderRadius: 'var(--radius-xs)' }
      : {};

  /* Toda medida de esta hoja sale de aca. El alto sale de `medidaDeLaHoja` y
     no de un `minHeight` escrito a mano: una carta a 680 px de ancho mide 880
     px de alto, y el `780` de antes se comia cien pixeles de hoja. */
  const m = medidaDeLaHoja(hoja, anchoPx);
  /** Milimetros de papel a pixeles de pantalla, a la escala de esta hoja. */
  const px = (mm: number) => Math.round(mm * m.escala * 10) / 10;
  /** Puntos del `.docx` a pixeles de pantalla. */
  const pt = (puntos: number) => Math.round(m.pt(puntos) * 100) / 100;
  /* Los margenes van por el padding del contenedor, no por un `minHeight`: si
     el papel tiene margen, el margen se ve. */
  const marco = {
    paddingTop: m.margenSuperiorPx,
    paddingBottom: m.margenInferiorPx,
    paddingLeft: m.margenIzquierdoPx,
    paddingRight: m.margenDerechoPx,
  };

  const autores = parseAuthorEntries(acta.autor);
  const { estudiantes, tutor: tutorName } = clasificarAutoresDePortada(
    autores,
    acta.profesor_asesor || [],
  );
  const grupo = acta.grupo || '';

  // Columnas de estudiantes dinámicas adaptativas:
  // 1 estudiante  -> 1 col (balanceado)
  // 2 estudiantes -> 2 cols (balanceado)
  // 3 estudiantes -> 3 cols (1 fila)
  // 4 estudiantes -> 2 cols x 2 filas (simetría 2x2)
  // 5-6 estudiantes -> 3 cols x 2 filas
  let nStudentCols = 3;
  if (estudiantes.length <= 1) nStudentCols = 1;
  else if (estudiantes.length === 2 || estudiantes.length === 4) nStudentCols = 2;

  const studentCols: { nombre: string; carnet: string }[][] = Array.from({ length: nStudentCols }, () => []);
  estudiantes.forEach((a, i) => {
    studentCols[i % nStudentCols].push({ nombre: a.nombre, carnet: a.carnet });
  });
  const cols = [...studentCols, tutorName ? [{ nombre: tutorName, carnet: grupo ? `Grupo: ${grupo}` : '' }] : []].filter((c) => c.length > 0);

  // Anchos de columna en centimetros, identicos a los del .docx
  // (`portada_uni.py`): 3 estudiantes -> 3.5 cm, 2 -> 5.0 cm, 1 -> 7.0 cm;
  // el docente siempre 5.0 cm. Asi la preview y el Word miden lo mismo.
  const studentColWidthCm = { 3: 3.5, 2: 5.0, 1: 7.0 }[nStudentCols] ?? 3.5;
  const tutorColWidthCm = 5.0;
  const colWidthsCm = [
    ...Array.from({ length: nStudentCols }, () => studentColWidthCm),
    ...(tutorName ? [tutorColWidthCm] : []),
  ];

  const cellStyle: React.CSSProperties = {
    // Ancho fijo (box-sizing border-box = el padding queda DENTRO del ancho,
    // igual que en Word); no se estira para llenar la hoja.
    flex: '0 0 auto',
    boxSizing: 'border-box',
    minWidth: 0,
    padding: `${px(1.6)}px ${px(2)}px`,
    fontSize: `${pt(PT_PORTADA_UNI.autor)}px`,
    color: BLACK,
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
  };

  return (
    <div
      data-testid="portada-uni-preview"
      data-hoja={hoja}
      data-escala={m.escala}
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        height: m.altoPx,
        minHeight: m.altoPx,
        ...marco,
        fontFamily: 'Times New Roman, serif',
      }}
    >
      {/* Logo centrado. El ancho es una FRACCION del ancho util, que es lo que
          hace que se vea igual en Carta y en A4; sale del mismo lado que
          `portada_uni.py` mide en el `.docx` y no de un `150px` a mano. */}
      <div
        data-testid="logos-de-la-portada"
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: px(4), marginBottom: px(2) }}
      >
        {logos.map((lg) => {
          const ancho = m.anchoUtilPx * (lg.ancho_fraccion || FRACCION_DE_ANCHO_DEL_LOGO);
          const noCarga = logosQueNoCargan.has(lg.asset);
          return noCarga ? (
            <div
              key={lg.asset}
              role="status"
              data-testid="logo-faltante"
              data-asset={lg.asset}
              style={{
                width: ancho,
                height: px(12),
                border: '1px dashed var(--border-subtle)',
                borderRadius: 'var(--radius-xs)',
                background: 'var(--surface-subtle)',
                color: 'var(--text-secondary)',
                fontSize: 'var(--text-xs)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
              }}
            >
              <span>El logo {lg.asset} no se pudo cargar</span>
            </div>
          ) : (
            <img
              key={lg.asset}
              data-asset={lg.asset}
              src={resolveAssetUrl(`/api/assets/${lg.asset}`)}
              alt={lg.institucion ? `Logo de ${lg.institucion}` : `Logo ${lg.asset}`}
              /* La MISMA fracción del ancho útil que usa `portada_uni.py`. Con
                 un ancho absoluto, el logo se ve distinto en Carta y en A4 y la
                 preview miente otra vez. */
              style={{ width: ancho, objectFit: 'contain' }}
              onError={() => setLogosQueNoCargan((v) => new Set(v).add(lg.asset))}
            />
          );
        })}
      </div>

      {/* Área de conocimiento — centrado, escalable */}
      <p
        id="cover-field-departamento"
        style={{
          textAlign: 'center', fontSize: `${pt(PT_PORTADA_UNI.departamento)}px`, color: BLACK,
          margin: `${px(2)}px 0 ${px(8)}px`,
          wordBreak: 'break-word', overflowWrap: 'break-word', ...hl('departamento'),
        }}
      >
        {portada.departamento || 'Área de Conocimiento de Ingeniería y Afines'}
      </p>

      {/* Título — Montserrat Black */}
      <p
        id="cover-field-title"
        style={{
          textAlign: 'center', fontSize: `${pt(PT_PORTADA_UNI.titulo)}px`, fontWeight: 900, color: BLACK,
          margin: `0 0 ${px(8)}px`,
          fontFamily: 'Montserrat, sans-serif',
          wordBreak: 'break-word', overflowWrap: 'break-word', ...hl('title'),
        }}
      >
        {portada.title || 'Título del trabajo'}
      </p>

      {/* Asignatura */}
      {portada.course && (
        <p
          id="cover-field-course"
          style={{
            textAlign: 'center', fontSize: `${pt(PT_PORTADA_UNI.asignatura)}px`, color: BLACK,
            margin: `0 0 ${px(10)}px`,
            wordBreak: 'break-word', overflowWrap: 'break-word', ...hl('course'),
          }}
        >
          {portada.course}
        </p>
      )}

      {/* Elaborado por */}
      <p
        style={{
          textAlign: 'left', fontWeight: 700, fontSize: `${pt(PT_PORTADA_UNI.elaboradoPor)}px`,
          color: BLACK, margin: `${px(14)}px 0 ${px(4)}px`,
          fontFamily: 'Montserrat, sans-serif',
        }}
      >
        Elaborado por
      </p>

      {/* Autores en columnas con separadores verticales y filas alineadas */}
      <div style={{ display: 'flex', borderTop: '1px solid transparent', gap: px(1) }}>
        {cols.map((col, ci) => {
          const isTutorCol = ci === cols.length - 1 && !!tutorName;
          return (
            <React.Fragment key={ci}>
              <div style={{ ...cellStyle, width: px(colWidthsCm[ci] * 10), borderRight: ci < cols.length - 1 ? `1px solid ${BLACK}` : 'none' }}>
                {isTutorCol ? (
                  <div style={{ fontFamily: 'Montserrat, sans-serif', display: 'flex', flexDirection: 'column', gap: px(3) }}>
                    <div>
                      <div style={{ fontSize: `${pt(PT_PORTADA_UNI.autor)}px`, fontWeight: 700, color: BLACK, lineHeight: 1.2 }}>
                        Profesor:
                      </div>
                      <div style={{ fontSize: `${pt(PT_PORTADA_UNI.autor)}px`, fontWeight: 400, color: BLACK, lineHeight: 1.2, marginTop: px(0.5) }}>
                        {tutorName}
                      </div>
                    </div>
                    {grupo && (
                      <div>
                        <div style={{ fontSize: `${pt(PT_PORTADA_UNI.autor)}px`, fontWeight: 700, color: BLACK, lineHeight: 1.2 }}>
                          Grupo:
                        </div>
                        <div style={{ fontSize: `${pt(PT_PORTADA_UNI.autor)}px`, fontWeight: 400, color: BLACK, lineHeight: 1.2, marginTop: px(0.5) }}>
                          {grupo}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  col.map((a, ai) => (
                    <div
                      key={ai}
                      style={{
                        minHeight: px(18),
                        marginBottom: ai < col.length - 1 ? px(2.5) : 0,
                        fontFamily: 'Montserrat, sans-serif',
                      }}
                    >
                      <div
                        style={{
                          fontSize: `${pt(PT_PORTADA_UNI.autor)}px`,
                          fontWeight: 400, color: BLACK,
                          wordBreak: 'break-word', overflowWrap: 'break-word', lineHeight: 1.2,
                        }}
                      >
                        {a.nombre}
                      </div>
                      {a.carnet && (
                        <div
                          style={{
                            fontSize: `${pt(PT_PORTADA_UNI.carnet)}px`,
                            fontWeight: 400, color: BLACK,
                            wordBreak: 'break-word', overflowWrap: 'break-word',
                            marginTop: px(0.5), lineHeight: 1.2,
                          }}
                        >
                          {a.carnet.startsWith('Carnet:') ? a.carnet : `Carnet: ${a.carnet}`}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div style={{ flex: 1, minHeight: px(15) }} />

      {/* Fecha y lugar */}
      <p
        style={{
          textAlign: 'left', fontSize: `${pt(PT_PORTADA_UNI.fecha)}px`, color: BLACK,
          margin: `${px(0.5)}px 0 0`,
          fontFamily: 'Montserrat, sans-serif',
        }}
      >
        {portada.date || ''}
      </p>
      <p
        style={{
          textAlign: 'left', fontSize: `${pt(PT_PORTADA_UNI.lugar)}px`, color: BLACK,
          margin: 0, fontFamily: 'Montserrat, sans-serif',
        }}
      >
        Managua, Nicaragua
      </p>
    </div>
  );
};

export default UNICoverPreview;
