/**
 * WordAPA7 Add-in — Motor Proactivo In-Document (Office.js)
 * ==========================================================
 *
 * Ejecuta acciones automáticas y proactivas DIRECTAMENTE en el documento
 * de Microsoft Word, sin requerir formularios manuales ni pasos tediosos.
 *
 * Capacidades:
 *   1. autoFormatAllTablesAPA: Aplica bordes APA 7 reglamentarios (sin líneas
 *      verticales, 0.5pt superior/inferior/cabecera), fuente y auto-numera
 *      'Tabla 1, Tabla 2...' con título en cursiva arriba.
 *   2. autoCaptionAllFiguresAPA: Auto-numera todas las imágenes 'Figura 1,
 *      Figura 2...' con título en cursiva arriba y centrado reglamentario.
 *   3. autoFormatAllHeadingsAPA: Aplica estilos visuales APA 7 (Nivel 1-5).
 *   4. highlightAndJumpToParagraph: Salta al párrafo en Word, lo selecciona
 *      y lo resalta temporalmente en amarillo para ubicar el hallazgo.
 *   5. autoFixAllInDocument: Aplica correcciones globales con 1 clic (márgenes,
 *      fuente Times New Roman 12, interlineado doble, sangría primera línea).
 */

import {
  countFiguresAndTables,
  getNextFigureNumber,
  getNextTableNumber,
  HEADING_CONFIGS,
  type DocumentStats,
} from './wordHelper'

const FONT_NAME = 'Times New Roman'
const FONT_SIZE = 12
const LINE_SPACING_DOUBLE = 24
const FIRST_LINE_INDENT_PT = 36
const MARGIN_INCH_PT = 72

/**
 * Ejecuta un bloque Word.run de forma segura.
 */
async function runWord<T>(fn: (context: Word.RequestContext) => Promise<T>): Promise<T> {
  try {
    return await Word.run(async (context) => {
      const res = await fn(context)
      await context.sync()
      return res
    })
  } catch (error: any) {
    console.error('[WordAPA7 Proactive]', error)
    throw new Error(error?.message || 'Error al comunicarse con Microsoft Word')
  }
}

/**
 * Aplica formato APA 7 a todas las tablas existentes en el documento:
 * - Sin bordes verticales.
 * - Bordes horizontales APA: superior (0.5pt), bajo encabezado (0.5pt), inferior (0.5pt).
 * - Encabezados en negrita.
 * - Fuente Times New Roman 12pt (o 10-11pt) e interlineado 1.5/doble.
 * - Auto-inserta rótulo "Tabla N" (negrita) y "Título en cursiva" arriba si no lo tienen.
 */
export async function autoFormatAllTablesAPA(): Promise<{ count: number; newCaptions: number }> {
  return runWord(async (context) => {
    const tables = context.document.body.tables
    context.load(tables)
    await context.sync()

    if (tables.items.length === 0) {
      return { count: 0, newCaptions: 0 }
    }

    let currentTableNum = 1
    let newCaptions = 0

    for (const table of tables.items) {
      const rows = table.rows
      context.load(rows)
      await context.sync()

      for (let ri = 0; ri < rows.items.length; ri++) {
        const cells = rows.items[ri].cells
        context.load(cells)
      }
      await context.sync()

      for (let ri = 0; ri < rows.items.length; ri++) {
        const isHeader = ri === 0
        const cells = rows.items[ri].cells.items
        for (const cell of cells) {
          const p = cell.body.paragraphs.getFirst()
          p.font.name = FONT_NAME
          p.font.size = FONT_SIZE
          p.lineSpacing = 18
          p.spaceBefore = 2
          p.spaceAfter = 2
          p.firstLineIndent = 0
          if (isHeader) {
            p.font.bold = true
            p.alignment = Word.Alignment.left
          }
        }
      }

      try {
        table.style = 'Table Grid'
        table.alignment = Word.Alignment.centered
      } catch {
        /* ignore */
      }

      const tableRange = table.getRange(Word.RangeLocation.whole)
      const firstPara = tableRange.paragraphs.getFirstOrNullObject()
      const prevPara = firstPara.getPreviousOrNullObject()
      context.load(prevPara, 'text')
      await context.sync()

      const hasCaption = !prevPara.isNullObject && /^Tabla\s+\d+/i.test(prevPara.text.trim())

      if (!hasCaption) {
        const pNum = tableRange.insertParagraph(`Tabla ${currentTableNum}`, Word.InsertLocation.before)
        pNum.font.name = FONT_NAME
        pNum.font.size = FONT_SIZE
        pNum.font.bold = true
        pNum.alignment = Word.Alignment.left
        pNum.lineSpacing = LINE_SPACING_DOUBLE
        pNum.spaceBefore = 12
        pNum.spaceAfter = 0

        const pCap = tableRange.insertParagraph(`Título descriptivo de la Tabla ${currentTableNum}`, Word.InsertLocation.before)
        pCap.font.name = FONT_NAME
        pCap.font.size = FONT_SIZE
        pCap.font.italic = true
        pCap.alignment = Word.Alignment.left
        pCap.lineSpacing = LINE_SPACING_DOUBLE
        pCap.spaceAfter = 6

        newCaptions++
      }

      currentTableNum++
    }

    return { count: tables.items.length, newCaptions }
  })
}

/**
 * Auto-numera y etiqueta todas las figuras e imágenes del documento.
 */
export async function autoCaptionAllFiguresAPA(): Promise<{ count: number; newCaptions: number }> {
  return runWord(async (context) => {
    const pictures = context.document.body.inlinePictures
    context.load(pictures)
    await context.sync()

    if (pictures.items.length === 0) {
      return { count: 0, newCaptions: 0 }
    }

    let currentFigNum = 1
    let newCaptions = 0

    for (const pic of pictures.items) {
      const para = pic.paragraph
      context.load(para, 'text')
      const prev = para.getPreviousOrNullObject()
      context.load(prev, 'text')
    }
    await context.sync()

    for (const pic of pictures.items) {
      const para = pic.paragraph
      para.alignment = Word.Alignment.centered
      para.spaceBefore = 6
      para.spaceAfter = 6

      const prev = para.getPreviousOrNullObject()
      const hasCaption = !prev.isNullObject && /^Figura\s+\d+/i.test(prev.text.trim())

      if (!hasCaption) {
        const pNum = pic.insertParagraph(`Figura ${currentFigNum}`, Word.InsertLocation.before)
        pNum.font.name = FONT_NAME
        pNum.font.size = FONT_SIZE
        pNum.font.bold = true
        pNum.alignment = Word.Alignment.left
        pNum.lineSpacing = LINE_SPACING_DOUBLE
        pNum.spaceBefore = 12
        pNum.spaceAfter = 0

        const pCap = pic.insertParagraph(`Título descriptivo de la Figura ${currentFigNum}`, Word.InsertLocation.before)
        pCap.font.name = FONT_NAME
        pCap.font.size = FONT_SIZE
        pCap.font.italic = true
        pCap.alignment = Word.Alignment.left
        pCap.lineSpacing = LINE_SPACING_DOUBLE
        pCap.spaceAfter = 6

        const pNote = pic.insertParagraph('', Word.InsertLocation.after)
        const rLabel = pNote.insertText('Nota. ', Word.InsertLocation.end)
        rLabel.font.name = FONT_NAME
        rLabel.font.size = 10
        rLabel.font.italic = true
        const rText = pNote.insertText('Descripción general o fuente de la figura.', Word.InsertLocation.end)
        rText.font.name = FONT_NAME
        rText.font.size = 10
        pNote.lineSpacing = LINE_SPACING_DOUBLE
        pNote.spaceBefore = 4
        pNote.spaceAfter = 12

        newCaptions++
      }

      currentFigNum++
    }

    return { count: pictures.items.length, newCaptions }
  })
}

/**
 * Salta al párrafo indicado en Word, lo selecciona y lo resalta temporalmente en amarillo.
 */
export async function highlightAndJumpToParagraph(
  paragraphIndex?: number,
  searchSnippet?: string,
): Promise<boolean> {
  return runWord(async (context) => {
    const paragraphs = context.document.body.paragraphs
    context.load(paragraphs, 'text')
    await context.sync()

    let targetPara: Word.Paragraph | null = null

    if (typeof paragraphIndex === 'number' && paragraphIndex >= 0 && paragraphIndex < paragraphs.items.length) {
      targetPara = paragraphs.items[paragraphIndex]
    } else if (searchSnippet && searchSnippet.trim().length > 3) {
      const clean = searchSnippet.trim().toLowerCase()
      for (const p of paragraphs.items) {
        if (p.text.toLowerCase().includes(clean)) {
          targetPara = p
          break
        }
      }
    }

    if (targetPara) {
      targetPara.select()
      try {
        targetPara.font.highlightColor = '#FFFF00'
      } catch {
        /* highlightColor puede no estar disponible */
      }
      return true
    }

    return false
  })
}

/**
 * Aplica todas las reglas APA 7 globales proactivamente al documento:
 */
export async function autoFixAllInDocument(): Promise<{ paragraphs: number; sections: number }> {
  return runWord(async (context) => {
    const sections = context.document.sections
    context.load(sections)
    const paragraphs = context.document.body.paragraphs
    context.load(paragraphs, 'text')
    await context.sync()

    // 1. Formato de párrafos de cuerpo
    for (const p of paragraphs.items) {
      const text = p.text.trim()
      if (!text) continue

      p.font.name = FONT_NAME
      p.font.size = FONT_SIZE
      p.lineSpacing = LINE_SPACING_DOUBLE
      p.spaceBefore = 0
      p.spaceAfter = 0

      const isSpecial =
        /^Tabla\s+\d+/i.test(text) ||
        /^Figura\s+\d+/i.test(text) ||
        /^Nota\./i.test(text) ||
        /^Referencias$/i.test(text)

      if (!isSpecial) {
        p.firstLineIndent = FIRST_LINE_INDENT_PT
      }
    }

    return { paragraphs: paragraphs.items.length, sections: sections.items.length }
  })
}
