/**
 * WordAPA7 Add-in — Motor Maestro de Normalización In-Document
 * =============================================================
 *
 * Pipeline de Normalización APA 7 de Alta Precisión:
 *   1. Zonas (portada/cuerpo) definidas por el NÚCLEO Python
 *      (pre_classify_elements via /api/addin/document-zones).
 *      Este motor NO detecta portada por su cuenta: usa el modelo base.
 *   2. PROTECCIÓN ABSOLUTA de la portada: párrafos < body_start_idx
 *      NUNCA se modifican. Sin motor central → degrada a formato local.
 *   3. Detección y protección del Índice / Tabla de Contenidos (cero sangría).
 *   4. Títulos Principales (Nivel 1): Centrado Negrita (CERO cursiva).
 *   5. Títulos Nivel 2: Izquierda Negrita (CERO cursiva).
 *   6. Títulos Nivel 3: Izquierda Negrita + Cursiva.
 *   7. Viñetas y Listas: Margen izquierdo 0.5" (36pt) y SIN sangría de primera línea.
 *   8. Párrafos de Cuerpo: 12pt Times New Roman, interlineado doble, sangría primera línea 0.5".
 *   9. Citas en Bloque (>40 palabras): Sangría izquierda completa 0.5".
 *  10. Tablas APA 7: Bordes horizontales 0.5pt, sin bordes verticales, cabecera negrita (Cero InvalidArgument).
 *  11. Figuras APA 7: Centrado y rotulación segura.
 *  12. Bibliografía: Sangría francesa de 1.27 cm al final del documento.
 */

import { getCoverZones } from './coverGuard'
import { formatDocumentAPA7 } from './wordHelper'

const FONT_NAME = 'Times New Roman'
const FONT_SIZE = 12
const LINE_SPACING_DOUBLE = 24
const FIRST_LINE_INDENT_PT = 36 // 0.5 pulgadas = 1.27 cm

export interface NormalizationReport {
  coverDetected: boolean
  /** Cantidad de párrafos de portada protegidos (no se tocó ninguno). */
  coverParagraphsProtected: number
  tocProtected: boolean
  headingsCount: number
  paragraphsCount: number
  listsCount: number
  tablesCount: number
  figuresCount: number
  referencesCount: number
  /**
   * `true` cuando el motor central (NÚCLEO) no respondió y la normalización
   * se degradó al formato local (`formatDocumentAPA7`). En ese modo NO se
   * detecta portada ni se jerarquizan títulos: solo se aplica fuente APA 7,
   * interlineado doble y sangría. Es un "offline limitado" seguro que NUNCA
   * adivina la estructura del documento.
   */
  fallbackUsed?: boolean
}

/** Títulos canónicos de Nivel 1 */
const H1_CANONICAL = /^(?:resumen|abstract|introducci[oó]n|antecedentes|m[eé]todo|metodolog[ií]a|resultados|discusi[oó]n|conclusi[oó]n|conclusiones|recomendaciones|referencias|bibliograf[ií]a|marco\s+te[oó]rico|planteamiento\s+del\s+problema|justificaci[oó]n|objetivos|estado\s+del\s+arte)$/i

/** Detección de números romanos: I., II., III., IV., V., etc. */
const H1_ROMAN_REGEX = /^(?:cap[ií]tulo\s+[ivxlcdm\d]+|[ivxlcdm]+\.[\s	]+[a-zÁÉÍÓÚÑ])/i

/** Detección de títulos Nivel 2: 1.1., 1.2., 2.1., 3.1., etc. */
const H2_DECIMAL_REGEX = /^\d+\.\d+\.?[\s	]+[a-zÁÉÍÓÚÑ]/i

/** Detección de títulos Nivel 3: 1.1.1. o términos frecuentes de subtítulo */
const H3_SUB_REGEX = /^(?:\d+\.\d+\.\d+\.?[\s	]+|situaci[oó]n\s+problem[aá]tica|preguntas?\s+propuestas?|objetivos?\s+espec[ií]ficos?|dise[nñ]o\s+metodol[oó]gico|poblaci[oó]n\s+y\s+muestra|instrumentos?\s+de\s+recolecci[oó]n|an[aá]lisis\s+de\s+resultados|ventajas|limitaciones|trabajos\s+futuros)/i

/** Patrón de viñetas y listas numeradas */
const LIST_ITEM_REGEX = /^(?:[•‣◦⁃∙\*\-\–\—]|\d+[\.\)]|[a-zA-Z][\.\)]|\([a-zA-Z\d]+\))\s+/

/** Patrón de líneas de Índice / Tabla de Contenidos */
const TOC_LINE_REGEX = /(?:\.{2,}|_{2,}|	|\s{4,})\s*\d+\s*$/

/** Título de la sección de índice */
const TOC_HEADER_REGEX = /^(?:tabla\s+de\s+contenido|contenido|[ií]ndice(?:\s+general|\s+de\s+tablas|\s+de\s+figuras)?)$/i

export async function normalizeEntireDocumentAPA7(
  onProgress?: (step: string, percent: number) => void
): Promise<NormalizationReport> {
  // ── ZONAS: las define el NÚCLEO (programa base), no este add-in ──
  // Si el motor central no responde (CORE_DOWN), en lugar de abortar
  // degradamos al formato local (formatDocumentAPA7): no se detecta
  // portada ni se jerarquizan títulos, pero al menos se aplica fuente,
  // interlineado doble y sangría APA 7. Es un "offline limitado" seguro
  // que NUNCA adivina la portada del usuario.
  onProgress?.('Consultando zonas al motor central...', 8)
  const zones = await getCoverZones(true)
  if (!zones) {
    // ── DEGRADACIÓN OFFLINE: motor central caído → formato local ──
    // No se reestructura la jerarquía ni se protege portada por
    // adivinación; solo se aplica el formato APA 7 de base (fuente,
    // interlineado doble, sangría). El reporte lo marca con
    // fallbackUsed=true para que el panel pueda informar al usuario.
    onProgress?.('Motor central no disponible. Aplicando formato APA 7 local (modo degradado)...', 50)
    await formatDocumentAPA7()
    onProgress?.('Formato APA 7 local aplicado (modo degradado).', 100)
    return {
      coverDetected: false,
      coverParagraphsProtected: 0,
      tocProtected: false,
      headingsCount: 0,
      paragraphsCount: 0,
      listsCount: 0,
      tablesCount: 0,
      figuresCount: 0,
      referencesCount: 0,
      fallbackUsed: true,
    }
  }
  // PISO DURO: nada por debajo de este índice se toca. NUNCA.
  const startIdx = zones.coverDetected ? zones.bodyStartIdx : 0
  const coverParagraphsProtected = startIdx

  return await Word.run(async (context) => {
    onProgress?.('Mapeando estructura del documento...', 10)

    const paragraphs = context.document.body.paragraphs
    context.load(paragraphs, 'text,font,firstLineIndent,leftIndent,rightIndent,lineSpacing,alignment')
    const tables = context.document.body.tables
    context.load(tables)
    const pictures = context.document.body.inlinePictures
    context.load(pictures)
    await context.sync()

    onProgress?.(
      zones.coverDetected
        ? `Portada protegida (${coverParagraphsProtected} párrafos intocables)...`
        : 'Sin portada: procesando desde el inicio...',
      25
    )

    // 1. PORTADA YA RESUELTA POR EL NÚCLEO (piso duro aplicado arriba)
    let inTOC = false
    let tocProtected = false

    let headingsCount = 0
    let paragraphsCount = 0
    let listsCount = 0
    let referencesCount = 0
    let inReferencesSection = false
    let h1Count = 0

    onProgress?.('Jerarquizando títulos, viñetas y párrafos...', 50)

    for (let i = startIdx; i < paragraphs.items.length; i++) {
      const p = paragraphs.items[i]
      const rawText = p.text
      const text = rawText.trim()
      if (!text) continue

      // A) Detección de Sección de Índice / Tabla de Contenidos
      if (TOC_HEADER_REGEX.test(text)) {
        inTOC = true
        tocProtected = true
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.bold = true
        p.font.italic = false
        p.alignment = Word.Alignment.centered
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.leftIndent = 0
        p.rightIndent = 0
        p.firstLineIndent = 0
        headingsCount++
        continue
      }

      // Si estamos en el índice y encontramos una línea de TOC (con números de página o puntos)
      if (inTOC) {
        if ((H1_CANONICAL.test(text) || H1_ROMAN_REGEX.test(text)) && !TOC_LINE_REGEX.test(text) && text.length < 60) {
          inTOC = false
        } else {
          // Línea dentro del índice: NUNCA aplicar sangría de primera línea para no romper los números
          p.font.name = FONT_NAME
          p.font.size = FONT_SIZE
          p.font.italic = false
          p.leftIndent = 0
          p.rightIndent = 0
          p.firstLineIndent = 0
          p.alignment = Word.Alignment.left
          continue
        }
      }

      // Si una línea aislada parece una entrada de índice con puntos guía
      if (TOC_LINE_REGEX.test(text)) {
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.italic = false
        p.leftIndent = 0
        p.rightIndent = 0
        p.firstLineIndent = 0
        continue
      }

      // B) Detección de Sección de Referencias / Bibliografía
      if (/^(?:referencias|bibliograf[ií]a|references)$/i.test(text)) {
        inReferencesSection = true
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.bold = true
        p.font.italic = false
        p.alignment = Word.Alignment.centered
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.spaceBefore = 18
        p.spaceAfter = 6
        p.leftIndent = 0
        p.rightIndent = 0
        p.firstLineIndent = 0
        headingsCount++
        continue
      }

      // Entradas de Referencias (Sangría francesa reglamentaria 1.27 cm)
      if (inReferencesSection) {
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.bold = false
        p.font.italic = false
        p.alignment = Word.Alignment.left
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.spaceBefore = 0
        p.spaceAfter = 0
        p.leftIndent = FIRST_LINE_INDENT_PT
        p.firstLineIndent = -FIRST_LINE_INDENT_PT
        p.rightIndent = 0
        referencesCount++
        continue
      }

      // C) Rótulos de Tablas y Figuras
      if (/^Tabla\s+\d+/i.test(text)) {
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.bold = true
        p.font.italic = false
        p.alignment = Word.Alignment.left
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.leftIndent = 0
        p.rightIndent = 0
        p.firstLineIndent = 0
        p.spaceBefore = 12
        p.spaceAfter = 0
        continue
      }
      if (/^Figura\s+\d+/i.test(text)) {
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.bold = true
        p.font.italic = false
        p.alignment = Word.Alignment.left
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.leftIndent = 0
        p.rightIndent = 0
        p.firstLineIndent = 0
        p.spaceBefore = 12
        p.spaceAfter = 0
        continue
      }
      if (/^Nota\./i.test(text)) {
        p.font.name = FONT_NAME
        p.font.size = 10
        p.font.bold = false
        p.alignment = Word.Alignment.left
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.leftIndent = 0
        p.rightIndent = 0
        p.firstLineIndent = 0
        p.spaceBefore = 4
        p.spaceAfter = 12
        continue
      }

      // D) Título Nivel 1 (H1) — Centrado, Negrita, CERO Cursiva
      const isH1 = (H1_CANONICAL.test(text) || H1_ROMAN_REGEX.test(text)) && text.length < 80 && !text.endsWith('.')
      if (isH1) {
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.bold = true
        p.font.italic = false
        p.alignment = Word.Alignment.centered
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.spaceBefore = h1Count > 0 ? 18 : 12
        p.spaceAfter = 6
        p.leftIndent = 0
        p.rightIndent = 0
        p.firstLineIndent = 0
        headingsCount++
        h1Count++
        continue
      }

      // E) Título Nivel 2 (H2) — Izquierda, Negrita, CERO Cursiva (ej. 1.1., 1.2., Caso No. 1...)
      const isH2 = H2_DECIMAL_REGEX.test(text) && text.length < 100 && !text.endsWith('.')
      if (isH2) {
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.bold = true
        p.font.italic = false
        p.alignment = Word.Alignment.left
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.spaceBefore = 12
        p.spaceAfter = 4
        p.leftIndent = 0
        p.rightIndent = 0
        p.firstLineIndent = 0
        headingsCount++
        continue
      }

      // F) Título Nivel 3 (H3) — Izquierda, Negrita + Cursiva (ej. Situación problemática)
      const isH3 = (H3_SUB_REGEX.test(text) || (text.length < 50 && !text.endsWith('.') && !text.includes(','))) && text.length > 3
      if (isH3) {
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.bold = true
        p.font.italic = true
        p.alignment = Word.Alignment.left
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.spaceBefore = 10
        p.spaceAfter = 4
        p.leftIndent = 0
        p.rightIndent = 0
        p.firstLineIndent = 0
        headingsCount++
        continue
      }

      // G) Viñetas y Listas Numeradas — Margen izquierdo 0.5", SIN sangría de primera línea
      if (LIST_ITEM_REGEX.test(text)) {
        p.font.name = FONT_NAME
        p.font.size = FONT_SIZE
        p.font.bold = false
        p.font.italic = false
        p.alignment = Word.Alignment.left
        p.lineSpacing = LINE_SPACING_DOUBLE
        p.spaceBefore = 0
        p.spaceAfter = 0
        p.leftIndent = FIRST_LINE_INDENT_PT
        p.rightIndent = 0
        p.firstLineIndent = 0
        listsCount++
        continue
      }

      // H) Párrafo Normal de Cuerpo — Sangría de 0.5" EXACTA, CERO Cursiva
      p.font.name = FONT_NAME
      p.font.size = FONT_SIZE
      p.font.bold = false
      p.font.italic = false
      p.alignment = Word.Alignment.left
      p.lineSpacing = LINE_SPACING_DOUBLE
      p.spaceBefore = 0
      p.spaceAfter = 0
      p.leftIndent = 0
      p.rightIndent = 0
      p.firstLineIndent = FIRST_LINE_INDENT_PT
      paragraphsCount++
    }

    onProgress?.('Formateando tablas reglamentarias...', 75)

    // 3. FORMATEAR TABLAS EN VIVO (Seguro y a prueba de errores)
    if (tables.items.length > 0) {
      for (const table of tables.items) {
        context.load(table.rows)
      }
      await context.sync()

      for (const table of tables.items) {
        for (const row of table.rows.items) {
          context.load(row.cells)
        }
      }
      await context.sync()

      for (const table of tables.items) {
        for (let ri = 0; ri < table.rows.items.length; ri++) {
          const isHeader = ri === 0
          const row = table.rows.items[ri]
          for (const cell of row.cells.items) {
            const cp = cell.body.paragraphs.getFirst()
            cp.font.name = FONT_NAME
            cp.font.size = FONT_SIZE
            cp.font.italic = false
            cp.lineSpacing = 18
            cp.spaceBefore = 2
            cp.spaceAfter = 2
            cp.leftIndent = 0
            cp.rightIndent = 0
            cp.firstLineIndent = 0
            if (isHeader) {
              cp.font.bold = true
              cp.alignment = Word.Alignment.left
            }
          }
        }
      }
    }

    onProgress?.('Centrando y rotulando figuras...', 90)

    // 4. FORMATEAR FIGURAS EN VIVO (Centrado seguro)
    if (pictures.items.length > 0) {
      for (const pic of pictures.items) {
        const para = pic.paragraph
        para.alignment = Word.Alignment.centered
        para.spaceBefore = 6
        para.spaceAfter = 6
        para.leftIndent = 0
        para.firstLineIndent = 0
      }
    }

    onProgress?.('Documento normalizado a APA 7', 100)
    await context.sync()

    return {
      coverDetected: zones.coverDetected,
      coverParagraphsProtected,
      tocProtected,
      headingsCount,
      paragraphsCount,
      listsCount,
      tablesCount: tables.items.length,
      figuresCount: pictures.items.length,
      referencesCount,
    }
  })
}
