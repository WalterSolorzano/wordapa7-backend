/**
 * WordAPA7 Add-in — Figura X con confirmación
 * ============================================
 *
 * Escanea el OOXML del cuerpo (body.getOoxml) buscando párrafos con
 * <w:drawing> cuyo párrafo siguiente NO empieza con "Figura N" y propone
 * leyendas "Figura 1..N" en orden. Al aceptar, inserta el caption centrado
 * justo después del párrafo de la imagen. Las omitidas se recuerdan en
 * localStorage (no se vuelven a proponer).
 */

const OMIT_KEY = 'wordapa7_fig_omits'

export interface FigureProposal {
  /** Id estable del hallazgo (hash de contexto) para memoria de omitidos. */
  id: string
  /** Número propuesto (1..N en orden de aparición). */
  number: number
  /** Texto cercano para mostrar al usuario. */
  excerpt: string
  /**
   * Texto ancla: párrafo SIGUIENTE a la imagen (o previo como fallback).
   * Se usa body.search() para ubicar la imagen en el documento vivo.
   */
  anchorText?: string
}

// ── Memoria de omitidos ──────────────────────────────────────────────────────

function loadOmits(): string[] {
  try {
    const raw = localStorage.getItem(OMIT_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveOmits(ids: string[]): void {
  try {
    localStorage.setItem(OMIT_KEY, JSON.stringify(ids))
  } catch {
    /* ignore */
  }
}

export function rememberOmittedFigure(id: string): void {
  const omits = loadOmits()
  if (!omits.includes(id)) omits.push(id)
  saveOmits(omits)
}

/** Hash estable corto (djb2) sobre el contexto de la imagen. */
function hashId(input: string): string {
  let h = 5381
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h + input.charCodeAt(i)) | 0
  }
  return 'fig' + Math.abs(h).toString(36)
}

// ── Escaneo OOXML ────────────────────────────────────────────────────────────

function xmlBlockToText(block: string): string {
  const matches = block.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) || []
  return matches
    .map((m) => m.replace(/<[^>]+>/g, ''))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Escanea el documento y devuelve las propuestas de caption pendientes.
 * Las imágenes ya captionadas y las previamente omitidas no se proponen.
 */
export async function scanFigureProposals(): Promise<FigureProposal[]> {
  const ooxml = await Word.run(async (context) => {
    const body = context.document.body
    const result = body.getOoxml()
    await context.sync()
    return result.value
  })

  // Cortar por apertura de párrafo; cada bloque llega hasta su cierre.
  const blocks = ooxml
    .split(/<w:p\b[^>]*>/)
    .slice(1)
    .map((b) => b.split('</w:p>')[0] || '')

  const texts = blocks.map(xmlBlockToText)
  const RE_CAPTION = /^Figura\s+\d+/
  const omits = new Set(loadOmits())
  const proposals: FigureProposal[] = []

  for (let i = 0; i < blocks.length; i++) {
    if (!blocks[i].includes('<w:drawing')) continue

    const nextText = i + 1 < texts.length ? texts[i + 1] : ''
    if (RE_CAPTION.test(nextText)) continue // ya tiene caption

    const prevText = i > 0 ? texts[i - 1] : ''
    const contextRaw = `${prevText}|${nextText}`
    const id = hashId(contextRaw)
    if (omits.has(id)) continue

    // Ancla preferente: texto del párrafo siguiente (suficientemente único);
    // fallback: texto del párrafo anterior.
    let anchorText: string | undefined
    if (nextText.length >= 12) anchorText = nextText.slice(0, 80)
    else if (prevText.length >= 12) anchorText = prevText.slice(0, 80)

    proposals.push({
      id,
      number: proposals.length + 1,
      excerpt: nextText || prevText || '(imagen sin texto cercano)',
      anchorText,
    })
  }

  return proposals
}

/**
 * Inserta "Figura N. <título>" centrado justo después del párrafo de la
 * imagen. Localiza la imagen vía body.search sobre el texto ancla (el
 * párrafo siguiente a la imagen); si el ancla es el párrafo previo, inserta
 * antes de él.
 *
 * @returns el label insertado.
 */
export async function acceptFigureCaption(
  proposal: FigureProposal,
  titulo: string,
): Promise<string> {
  if (!proposal.anchorText) {
    throw new Error('No se pudo ubicar la figura (sin texto ancla).')
  }

  const cleanTitle = titulo.trim()
  const label = cleanTitle
    ? `Figura ${proposal.number}. ${cleanTitle}`
    : `Figura ${proposal.number}.`
  const anchor = proposal.anchorText

  await Word.run(async (context) => {
    const found = context.document.body.search(anchor, {
      matchCase: false,
    })
    context.load(found, 'items')
    await context.sync()

    if (!found.items || found.items.length === 0) {
      throw new Error('No se encontró el texto ancla de la figura.')
    }

    // El ancla puede ser el párrafo siguiente o el previo según el escaneo.
    const range = found.items[0]
    context.load(range, 'text')
    await context.sync()

    const rangeText = (range.text || '').replace(/\s+/g, ' ').trim().slice(0, 80)
    const isNextAnchor = rangeText === anchor.replace(/\s+/g, ' ').trim()

    let imageParagraph: Word.Paragraph | null = null
    const firstPara = range.paragraphs.getFirstOrNullObject()
    if (isNextAnchor) {
      // ancla = párrafo siguiente → imagen es el anterior
      const prev = firstPara.getPreviousOrNullObject()
      await context.sync()
      if (!prev.isNullObject) imageParagraph = prev
    }
    if (!imageParagraph) {
      // fallback: insertar relativo al propio ancla
      imageParagraph = firstPara
    }

    const p = imageParagraph.insertParagraph(
      label,
      isNextAnchor ? Word.InsertLocation.after : Word.InsertLocation.before,
    )
    p.alignment = Word.Alignment.centered
    p.font.name = 'Times New Roman'
    p.font.size = 12
    p.lineSpacing = 24
    await context.sync()
  })

  rememberOmittedFigure(proposal.id) // ya resuelta: no reproponer
  return label
}
