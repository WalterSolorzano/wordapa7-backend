import React from 'react';
import { Document, Page, Text, View, StyleSheet, PDFViewer } from '@react-pdf/renderer';
import { useDocStore } from '../../store/useDocStore';
import { useDebounce } from 'use-debounce';
import { ActaDocumento, DocumentModel, PortadaData } from '../../types';

/**
 * La tinta del PDF, leída de la hoja en vez de escrita a mano.
 *
 * `@react-pdf/renderer` NO resuelve `var()`: su `StyleSheet` se serializa a un
 * PDF y un token CSS no viaja en ese formato. Y no es que no haga falta: la
 * hoja declara `--paper-ink` como `#111827` en LOS DOS temas a propósito (R7,
 * el papel no se oscurece), así que leerlo da el mismo valor en claro y en
 * oscuro y el PDF sale igual en los dos.
 *
 * El respaldo es un literal a propósito, y es el mismo valor: si la hoja no
 * estuviera cargada —una prueba, un import temprano— el PDF tiene que
 * imprimirse igual de negro. Por eso este es el ÚNICO literal de color que
 * queda en el archivo, y está en la misma línea que la explicación de por qué
 * no puede ser otra cosa.
 */
const TINTA_PAPEL =
  (typeof document !== 'undefined' && getComputedStyle(document.documentElement).getPropertyValue('--paper-ink').trim()) || '#111827';

// Estilos base de APA 7
const styles = StyleSheet.create({
  page: {
    paddingTop: 46,
    paddingBottom: 60,
    paddingHorizontal: 54,
    fontSize: 12,
    lineHeight: 2.0, // Doble espacio (APA)
    color: TINTA_PAPEL,
  },
  title: {
    fontSize: 12,
    textAlign: 'center',
    fontWeight: 'bold',
    marginBottom: 10,
  },
  paragraph: {
    marginBottom: 10,
    textIndent: 36, // Sangría de 0.5 pulgadas
    textAlign: 'left',
  },
  heading1: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  heading2: {
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'left',
    marginTop: 10,
    marginBottom: 10,
  },
  bullet: {
    marginBottom: 8,
    paddingLeft: 24,
    textAlign: 'left',
  },
  referenceItem: {
    marginLeft: 36, // Sangría francesa
    textIndent: -36,
    marginBottom: 10,
  },
  coverPage: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 150,
  },
  coverLine: {
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 15,
    lineHeight: 1.6,
  },
  coverTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 1.6,
  },
  footer: {
    position: 'absolute',
    top: 46,
    right: 54,
    fontSize: 12,
    color: TINTA_PAPEL,
  },
});

// Pie de página: número de hoja empezando en 1 DESPUÉS de la portada.
const PageNumber: React.FC<{ startAt?: number }> = ({ startAt = 1 }) => (
  <View
    fixed
    render={({ pageNumber }) => (
      <Text style={styles.footer}>{Math.max(startAt, pageNumber)}</Text>
    )}
  />
);

/** Líneas de texto reales de la portada (del documento, no placeholders). */
function getCoverLines(doc: DocumentModel, portada: PortadaData, acta: ActaDocumento): string[] {
  const lines: string[] = [];

  // 1) Contenido REAL de la portada detectada (párrafos / bloques de portada)
  const coverElems = doc.elements.filter(
    (e) => e.type === 'portada_block' || (e as any).is_cover_section,
  );
  for (const e of coverElems) {
    if (e.text && e.text.trim()) {
      lines.push(...e.text.split('\n'));
    }
  }

  // 2) Fallback: campos de portada editados por el usuario
  if (lines.length === 0) {
    const fields: [string, string | undefined][] = [
      /* El autor y el profesor son del acta, no de la portada. Ver el motivo
         en `python/models.py`: con la portada original conservada, un dato
         guardado dentro de ella no sale. */
      ['title', portada.title],
      ['author', acta.autor],
      ['institution', portada.institution],
      ['course', portada.course],
      ['instructor', acta.profesor_asesor[0]],
      ['date', portada.date],
    ];
    for (const [, v] of fields) {
      if (v && v.trim()) {
        lines.push(...v.split('\n'));
      }
    }
  }

  // 3) Último recurso: campos parseados de la portada original
  if (lines.length === 0 && doc.portada?.fields) {
    const order = ['title', 'author', 'institution', 'course', 'instructor', 'date'];
    for (const key of order) {
      const v = doc.portada.fields[key];
      if (v && v.trim()) lines.push(...v.split('\n'));
    }
  }

  return lines.filter((l) => l.trim()).slice(0, 40);
}

export const ReactPDFPreview: React.FC = () => {
  const { doc, portada, acta } = useDocStore();
  const [debouncedDoc] = useDebounce(doc, 500);
  const [debouncedPortada] = useDebounce(portada, 500);
  const [debouncedActa] = useDebounce(acta, 500);

  if (!debouncedDoc) {
    return <div className="text-center p-8" style={{ color: 'var(--color-text-tertiary)' }}>No hay documento para previsualizar.</div>;
  }

  const isLandscape = debouncedDoc.has_landscape_sections === true;
  const coverOrientation =
    debouncedDoc.meta?.sections?.[0]?.orientation === 'landscape' ? 'landscape' : 'portrait';
  const bodyOrientation = isLandscape ? 'landscape' : 'portrait';
  const coverLines = getCoverLines(debouncedDoc, debouncedPortada, debouncedActa);

  // Generamos el documento dinámico
  const PDFDoc = () => (
    <Document>
      {/* Portada real del documento — sin número de página */}
      <Page size="LETTER" orientation={coverOrientation} style={[styles.page, styles.coverPage]} wrap={false}>
        {coverLines.length === 0 && (
          <Text style={styles.coverTitle}>{debouncedPortada.title || 'Portada'}</Text>
        )}
        {coverLines.map((line, i) => (
          <Text key={i} style={i === 0 && coverLines.length > 1 ? styles.coverTitle : styles.coverLine}>
            {line}
          </Text>
        ))}
      </Page>

      {/* Cuerpo del Documento — número de hoja desde 1 (sin contar portada) */}
      <Page size="LETTER" orientation={bodyOrientation} style={styles.page} wrap={true}>
        <PageNumber startAt={1} />
        {debouncedDoc.elements.map((elem) => {
          if (elem.type === 'heading') {
            if (elem.heading_level === 1) {
              return <Text key={elem.id} style={styles.heading1}>{elem.text}</Text>;
            }
            return <Text key={elem.id} style={styles.heading2}>{elem.text}</Text>;
          }

          if (elem.type === 'paragraph') {
            return <Text key={elem.id} style={styles.paragraph}>{elem.text}</Text>;
          }

          if (elem.type === 'bullet' || elem.type === 'numbered_list') {
            return <Text key={elem.id} style={styles.bullet}>{elem.text}</Text>;
          }

          if (elem.type === 'table') {
            const tInfo: any = elem.table_info;
            const tNum = tInfo?.table_number || '1';
            const tCap = tInfo?.caption || tInfo?.title || 'Tabla formal';
            const tNote = tInfo?.note;
            const rows = tInfo?.rows || (elem as any).rows || [];
            return (
              <View key={elem.id} style={{ marginVertical: 12 }} wrap={false}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 2 }}>
                  Tabla {tNum}
                </Text>
                <Text style={{ fontSize: 11, fontStyle: 'italic', marginBottom: 6 }}>
                  {tCap}
                </Text>
                <View style={{ borderTopWidth: 1.5, borderTopColor: TINTA_PAPEL, borderBottomWidth: 1.5, borderBottomColor: TINTA_PAPEL, width: '100%' }}>
                  {rows.slice(0, 10).map((r: any, rIdx: number) => {
                    const cells = r.cells || r || [];
                    const isHeader = rIdx === 0;
                    return (
                      <View key={rIdx} style={{ flexDirection: 'row', borderBottomWidth: isHeader ? 1 : 0, borderBottomColor: TINTA_PAPEL, paddingVertical: 4 }}>
                        {cells.map((c: any, cIdx: number) => (
                          <Text key={cIdx} style={{ flex: 1, fontSize: 10, fontWeight: isHeader ? 'bold' : 'normal', paddingHorizontal: 4 }}>
                            {typeof c === 'string' ? c : c.text || ''}
                          </Text>
                        ))}
                      </View>
                    );
                  })}
                </View>
                <Text style={{ fontSize: 9, fontStyle: 'italic', marginTop: 4 }}>
                  Nota. {tNote || 'Adaptado conforme a los estándares de formato y presentación APA 7.ª edición.'}
                </Text>
              </View>
            );
          }

          if (elem.type === 'image') {
            const fInfo = elem.image_info;
            const fNum = fInfo?.figure_number || 1;
            const fCap = fInfo?.caption || 'Ilustración del proceso';
            const fNote = fInfo?.note;
            return (
              <View key={elem.id} style={{ marginVertical: 12 }} wrap={false}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', marginBottom: 2 }}>
                  Figura {fNum}
                </Text>
                <Text style={{ fontSize: 11, fontStyle: 'italic', marginBottom: 6 }}>
                  {fCap}
                </Text>
                {elem.text ? <Text style={styles.paragraph}>{elem.text}</Text> : null}
                <Text style={{ fontSize: 9, fontStyle: 'italic', marginTop: 4 }}>
                  Nota. {fNote || 'Presentación gráfica formal APA 7 con alineación y resolución óptima.'}
                </Text>
              </View>
            );
          }

          if (elem.type === 'page_break') {
            return null;
          }

          return null;
        })}
      </Page>

      {/* Referencias — nueva hoja, sin número repetido de portada */}
      {debouncedDoc.referencias && debouncedDoc.referencias.length > 0 && (
        <Page size="LETTER" orientation={bodyOrientation} style={styles.page} wrap={true}>
          <PageNumber startAt={1} />
          <Text style={styles.heading1}>Referencias</Text>
          {debouncedDoc.referencias.map((ref: any) => (
            <Text key={ref.id} style={styles.referenceItem}>
              {(ref.apa_segments && ref.apa_segments.length ? ref.apa_segments : null)
                ? ref.apa_segments.map((s: any, i: number) => (
                    <Text key={i} style={s.italic ? { fontStyle: 'italic' } : undefined}>{s.text}</Text>
                  ))
                : (ref.formatted_apa || ref.raw_text || '')}
            </Text>
          ))}
        </Page>
      )}
    </Document>
  );

  return (
    <div className="w-full h-full">
      <PDFViewer style={{ width: '100%', height: '100%' }}>
        <PDFDoc />
      </PDFViewer>
    </div>
  );
};
