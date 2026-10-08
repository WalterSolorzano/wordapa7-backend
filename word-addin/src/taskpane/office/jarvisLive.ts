/**
 * WordAPA7 — Jarvis en vivo (Fase 3)
 * Modo pasivo: polling 12s -> normaliza SOLO el delta nuevo.
 * Captions: Tabla N / Figura N (serie continua del motor central).
 * Citas vivas: (Autor, YYYY) -> Crossref -> inserta en Referencias.
 * Filosofia: el central decide; este archivo solo ejecuta. Sin emojis.
 */
import { normalizeEntireDocumentAPA7 } from './masterNormalizer'

const BASE = 'http://127.0.0.1:8742'
const POLL_MS = 12000

let jarvisOn = localStorage.getItem('wordapa7_jarvis') !== '0'
let busy = false
let lastHash = ''
let lastTexts: string[] = []
const appliedCaps = new Set<string>()

export function isJarvisOn(): boolean {
  return jarvisOn
}

export function setJarvis(on: boolean): void {
  jarvisOn = on
  localStorage.setItem('wordapa7_jarvis', on ? '1' : '0')
}

function hashOf(texts: string[]): string {
  return `${texts.length}|${(texts[texts.length - 1] || '').slice(0, 80)}`
}

async function getTexts(): Promise<string[]> {
  return await Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs
    ps.load('items')
    ctx.load(ps, 'text')
    await ctx.sync()
    if ((ps as any).isNullObject) return []
    return ps.items.map((p) => p.text)
  })
}

/** Normaliza solo indices nuevos/modificados usando roles del central. */
async function normalizeDelta(prev: string[], curr: string[]): Promise<void> {
  const changed: number[] = []
  for (let i = 0; i < curr.length; i++) {
    if ((prev[i] ?? null) !== curr[i]) changed.push(i)
  }
  if (changed.length === 0) return
  // El plan central se calcula sobre el documento completo para respetar floor;
  // la ejecucion silenciosa reusa el normalizador oficial (idempotente).
  await normalizeEntireDocumentAPA7()
}

async function tick(): Promise<void> {
  if (!jarvisOn || busy) return
  busy = true
  try {
    const texts = await getTexts()
    const h = hashOf(texts)
    if (lastHash && h !== lastHash) {
      await normalizeDelta(lastTexts, texts)
      await applyCaptions()
      await liveCitations(texts)
    }
    lastTexts = texts
    lastHash = h
  } catch {
    /* sin doc o backend: silencio */
  } finally {
    busy = false
  }
}

export function startJarvis(): void {
  setInterval(() => void tick(), POLL_MS)
}

// ── Captions ────────────────────────────────────────────────────────────────
export async function applyCaptions(): Promise<void> {
  await Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs
    const tbls = ctx.document.body.tables
    const pics = ctx.document.body.inlinePictures
    ctx.load(ps, 'text')
    ctx.load(tbls)
    ctx.load(pics, 'altTextTitle')
    await ctx.sync()

    const texts = ps.items.map((p) => p.text)
    const tablesIdx = tbls.items.map(() => 0) // marcador de presencia
    const figuresIdx = pics.items.map(() => 0)

    const res = await fetch(`${BASE}/api/addin/captions-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts, tables: tablesIdx, figures: figuresIdx }),
    })
    if (!res.ok) return
        const plan = await res.json()

    type CapOp = { i: number; kind: string; number: number }
    for (const op of (plan.ops || []) as CapOp[]) {
      const dedupeKey = `${op.kind}${op.number}`
      if ((appliedCaps as Set<string>).has(dedupeKey)) continue
      appliedCaps.add(dedupeKey)
      const label = op.kind === 'table' ? `Tabla ${op.number}` : `Figura ${op.number}`
      try {
        if (op.kind === 'table' && tbls.items[op.i]) {
          const rngB = tbls.items[op.i].getRange('Start')
          const capP = rngB.insertParagraph(label, 'Before')
          capP.font.bold = true
        } else if (op.kind === 'figure' && pics.items[op.i]) {
          const rng = pics.items[op.i].getRange('End')
          const after = rng.insertParagraph(label, 'After')
          after.font.bold = true
        }
      } catch {
        /* tabla anidada u objeto transitorio: skip */
      }
    }
    await ctx.sync()
  })
}

// ── Citas vivas ─────────────────────────────────────────────────────────────
const CITE = /\(([A-ZÁÉÍÓÚÑ][A-Za-zÁÉÍÓÚÑáéíóúñ.& ]{2,40}),\s*(19|20)\d{2}[a-z]?\)/g
const added = new Set<string>()

async function liveCitations(texts: string[]): Promise<void> {
  const refsStart = texts.findIndex((t) => t.trim().toLowerCase().replace(/:+$/, '') === 'referencias')
  const zone = refsStart >= 0 ? texts.slice(refsStart + 1).join('\n') : ''
  const found: { author: string; year: string }[] = []
  for (const t of texts) {
    let m: RegExpExecArray | null
    CITE.lastIndex = 0
    while ((m = CITE.exec(t))) {
      const key = `${m[1]}|${m[0].match(/\b(19|20)\d{2}\b/)?.[0]}`
      if (added.has(key)) continue
      if (zone.includes(m[1])) continue
      found.push({ author: m[1].trim(), year: m[0].match(/\b(19|20)\d{2}\b/)?.[0] || '' })
    }
  }
  for (const c of found.slice(0, 3)) {
    try {
      const r = await fetch(`${BASE}/api/resolve-ghost-citation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ authors: [c.author], year: c.year }),
      })
      if (!r.ok) continue
      const data = await r.json()
      const apa =
        data?.candidates?.[0]?.formatted_apa ||
        data?.reference?.formatted_apa ||
        `${c.author} (${c.year}).`
      await insertReference(apa)
      added.add(`${c.author}|${c.year}`)
    } catch {
      /* offline */
    }
  }
}

async function insertReference(apa: string): Promise<void> {
  await Word.run(async (ctx) => {
    const ps = ctx.document.body.paragraphs
    ctx.load(ps, 'text')
    await ctx.sync()
    let target: Word.Paragraph | null = null
    let inRefs = false
    for (const p of ps.items) {
      if (/^(?:referencias|bibliograf[i?]a|bibliography)$/i.test(p.text.trim())) {
        inRefs = true
        target = p
        continue
      }
      if (inRefs && p.text.trim()) target = p
    }
    const newP = target
      ? target.insertParagraph(apa, 'After')
      : ctx.document.body.insertParagraph(apa, 'End')
    newP.leftIndent = 36
    newP.firstLineIndent = -36
    newP.lineSpacing = 24
    await ctx.sync()
  })
}
