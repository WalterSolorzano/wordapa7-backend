/**
 * WordAPA7 Add-in — Tests del detector local de citas APA 7 (TypeScript)
 * ====================================================================
 *
 * Verifica el motor de detección de citas de ``citationDetector.ts`` (la
 * versión canónica en ``lib/``) que corre en el navegador del Add-in de
 * Word, sin depender del backend.
 *
 * Cobertura:
 *  - Citas parentéticas: (García, 2023), (OIT, 2007), (Smith & Jones, 2020, p. 45)
 *  - Citas narrativas: García (2023), López et al. (2019)
 *  - Citas múltiples: (García, 2023; López, 2021; Martínez, 2019)
 *  - Citas secundarias: (García, 2020, como se citó en Pérez, 2023)
 *  - Falsos positivos: (véase Figura 1), (100 kg), (p < .05)
 *  - Deduplicación con citationKey / normalizeSurnameKey
 *  - findNewCitations: solo citas nuevas
 *  - Casos límite: texto vacío, sin citas, año sin autor
 */

import { describe, it, expect } from 'vitest'

import {
  extractCitations,
  findNewCitations,
  citationKey,
  normalizeSurnameKey,
} from './citationDetector'

// Helper: busca la primera cita cuyo rawText contiene un substring.
function findCitationByRaw(citations: ReturnType<typeof extractCitations>, sub: string) {
  return citations.find((c) => c.rawText.includes(sub))
}

// ── CITAS PARENTÉTICAS ───────────────────────────────────────────────────────

describe('Citas parentéticas', () => {
  it('detecta (García, 2023) como parentetica con autor y año', () => {
    const text = 'La inteligencia artificial avanza rápido (García, 2023).'
    const cits = extractCitations(text)

    expect(cits.length).toBeGreaterThanOrEqual(1)
    const garcia = findCitationByRaw(cits, 'García')!
    expect(garcia).toBeDefined()
    expect(garcia.type).toBe('parentetica')
    expect(garcia.authors).toContain('García')
    expect(garcia.year).toBe('2023')
    expect(garcia.page).toBeNull()
  })

  it('detecta acrónimo organizacional (OIT, 2007)', () => {
    const text = 'El informe (OIT, 2007) define los estándares laborales.'
    const cits = extractCitations(text)

    expect(cits.length).toBeGreaterThanOrEqual(1)
    const oit = findCitationByRaw(cits, 'OIT')!
    expect(oit).toBeDefined()
    expect(oit.type).toBe('parentetica')
    expect(oit.authors).toContain('OIT')
    expect(oit.year).toBe('2007')
  })

  it('detecta dos autores con & y página (Smith & Jones, 2020, p. 45)', () => {
    const text = 'The analysis (Smith & Jones, 2020, p. 45) shows the data.'
    const cits = extractCitations(text)

    expect(cits.length).toBeGreaterThanOrEqual(1)
    const sj = findCitationByRaw(cits, 'Smith & Jones')!
    expect(sj).toBeDefined()
    expect(sj.type).toBe('parentetica')
    expect(sj.authors).toEqual(expect.arrayContaining(['Smith', 'Jones']))
    expect(sj.year).toBe('2020')
    expect(sj.page).toBe('45')
  })

  it('detecta et al. parentética (García et al., 2023) como et_al', () => {
    const text = 'Estudios recientes (García et al., 2023) confirman la hipótesis.'
    const cits = extractCitations(text)

    const etAl = cits.find((c) => c.type === 'et_al')
    expect(etAl).toBeDefined()
    expect(etAl!.authors).toContain('García')
    expect(etAl!.year).toBe('2023')
  })
})

// ── CITAS NARRATIVAS ─────────────────────────────────────────────────────────

describe('Citas narrativas', () => {
  it('detecta García (2023) como narrativa', () => {
    const text = 'García (2023) afirma que la educación ha cambiado.'
    const cits = extractCitations(text)

    expect(cits.length).toBeGreaterThanOrEqual(1)
    const garcia = findCitationByRaw(cits, 'García (2023)')!
    expect(garcia).toBeDefined()
    expect(garcia.type).toBe('narrativa')
    expect(garcia.authors).toContain('García')
    expect(garcia.year).toBe('2023')
  })

  it('detecta López et al. (2019) como et_al narrativa', () => {
    const text = 'López et al. (2019) demostraron la eficacia del método.'
    const cits = extractCitations(text)

    expect(cits.length).toBeGreaterThanOrEqual(1)
    const lopez = findCitationByRaw(cits, 'López')!
    expect(lopez).toBeDefined()
    // BUG conocido: la detección narrativa prueba m[1] (solo el autor) en vez
    // de m[0] (match completo) para decidir si es et_al. Tras el fix, debe
    // clasificarse como 'et_al'.
    expect(lopez.type).toBe('et_al')
    expect(lopez.authors).toContain('López')
    expect(lopez.year).toBe('2019')
  })

  it('detecta narrativa con página: García (2023, p. 12)', () => {
    const text = 'García (2023, p. 12) señala el diseño experimental.'
    const cits = extractCitations(text)

    const garcia = findCitationByRaw(cits, 'García')!
    expect(garcia).toBeDefined()
    expect(garcia.type).toBe('narrativa')
    expect(garcia.year).toBe('2023')
    expect(garcia.page).toBe('12')
  })
})

// ── CITAS MÚLTIPLES ──────────────────────────────────────────────────────────

describe('Citas múltiples (separadas por ;)', () => {
  it('detecta las 3 sub-citas de (García, 2023; López, 2021; Martínez, 2019)', () => {
    const text = 'La evidencia es mixta (García, 2023; López, 2021; Martínez, 2019).'
    const cits = extractCitations(text)

    // Deben aparecer las 3 referencias de autores
    const authors = cits.map((c) => c.authors[0])
    expect(authors).toEqual(expect.arrayContaining(['García', 'López', 'Martínez']))
    expect(cits.length).toBeGreaterThanOrEqual(3)

    // Cada sub-cita debe tener su año correcto
    const byAuthor = new Map(cits.map((c) => [c.authors[0], c.year]))
    expect(byAuthor.get('García')).toBe('2023')
    expect(byAuthor.get('López')).toBe('2021')
    expect(byAuthor.get('Martínez')).toBe('2019')
  })
})

// ── CITAS SECUNDARIAS ────────────────────────────────────────────────────────

describe('Citas secundarias (como se citó en)', () => {
  it('detecta (García, 2020, como se citó en Pérez, 2023) y toma la fuente secundaria', () => {
    const text = 'El concepto (García, 2020, como se citó en Pérez, 2023) es clave.'
    const cits = extractCitations(text)

    const sec = cits.find((c) => c.type === 'secundaria')
    expect(sec).toBeDefined()
    // La fuente que va a la bibliografía es la secundaria (Pérez, 2023)
    expect(sec!.authors).toContain('Pérez')
    expect(sec!.year).toBe('2023')
  })

  it('detecta secundaria en inglés (Freud, 1920, as cited in Smith, 2020)', () => {
    const text = 'The theory (Freud, 1920, as cited in Smith, 2020) remains.'
    const cits = extractCitations(text)

    const sec = cits.find((c) => c.type === 'secundaria')
    expect(sec).toBeDefined()
    expect(sec!.authors).toContain('Smith')
    expect(sec!.year).toBe('2020')
  })
})

// ── FALSOS POSITIVOS ─────────────────────────────────────────────────────────

describe('Falsos positivos (no deben detectarse como citas)', () => {
  it('no detecta (véase Figura 1)', () => {
    const cits = extractCitations('Los datos se muestran (véase Figura 1) abajo.')
    expect(cits).toHaveLength(0)
  })

  it('no detecta (100 kg) como cita', () => {
    const cits = extractCitations('El peso promedio fue de (100 kg) en la muestra.')
    expect(cits).toHaveLength(0)
  })

  it('no detecta (p < .05) como cita', () => {
    const cits = extractCitations('El resultado fue significativo (p < .05).')
    expect(cits).toHaveLength(0)
  })

  it('no detecta (ver Tabla 2) como cita', () => {
    const cits = extractCitations('Los datos completos (ver Tabla 2) se adjuntan.')
    expect(cits).toHaveLength(0)
  })
})

// ── DEDUPLICACIÓN: citationKey y normalizeSurnameKey ──────────────────────────

describe('Deduplicación con citationKey / normalizeSurnameKey', () => {
  it('normaliza apellidos: quita tildes y pasa a minúsculas', () => {
    expect(normalizeSurnameKey('García')).toBe('garcia')
    expect(normalizeSurnameKey('Núñez')).toBe('nunez')
    expect(normalizeSurnameKey('González')).toBe('gonzalez')
  })

  it('toma solo el apellido (antes de la coma) para claves compuestas', () => {
    expect(normalizeSurnameKey('García López, M.')).toBe('garcia lopez')
  })

  it('devuelve string vacío para autor vacío', () => {
    expect(normalizeSurnameKey('')).toBe('')
  })

  it('citationKey combina apellido normalizado + año', () => {
    expect(citationKey(['García'], '2023')).toBe('garcia|2023')
    expect(citationKey(['García'], null)).toBe('garcia|s.f.')
    expect(citationKey([], '2023')).toBe('|2023')
  })

  it('citationKey es insensible a mayúsculas y tildes (deduplica)', () => {
    // "García", "GARCIA" y "García" deben producir la misma clave
    expect(citationKey(['García'], '2023')).toBe(citationKey(['Garcia'], '2023'))
  })
})

// ── findNewCitations ─────────────────────────────────────────────────────────

describe('findNewCitations: solo citas nuevas', () => {
  it('retorna solo las citas cuya clave no está en knownKeys', () => {
    const text = 'El estudio (García, 2023) y (López, 2021) lo confirman.'
    // García ya conocida → solo López debería ser "nueva"
    const known = new Set<string>(['garcia|2023'])

    const fresh = findNewCitations(text, known)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].authors).toContain('López')
    expect(fresh[0].year).toBe('2021')
  })

  it('con knownKeys vacío, retorna todas las citas', () => {
    const text = 'El estudio (García, 2023) y (López, 2021) lo confirman.'
    const fresh = findNewCitations(text, new Set<string>())
    expect(fresh.length).toBeGreaterThanOrEqual(2)
  })

  it('cuando todo ya está conocido, retorna array vacío', () => {
    const text = 'El estudio (García, 2023) lo confirma.'
    const known = new Set<string>(['garcia|2023'])
    const fresh = findNewCitations(text, known)
    expect(fresh).toHaveLength(0)
  })
})

// ── CASOS LÍMITE ─────────────────────────────────────────────────────────────

describe('Casos límite', () => {
  it('texto vacío → sin citas', () => {
    expect(extractCitations('')).toEqual([])
  })

  it('texto solo con espacios → sin citas', () => {
    expect(extractCitations('     ')).toEqual([])
  })

  it('texto sin citas → sin citas', () => {
    expect(extractCitations('No hay ninguna cita en este párrafo.')).toEqual([])
  })

  it('año sin autor ni paréntesis → sin citas', () => {
    // "2023" suelto no es una cita (falta autor y paréntesis)
    const cits = extractCitations('En el año 2023 hubo muchos cambios sociales.')
    expect(cits).toEqual([])
  })

  it('los offsets start/end corresponden al rawText en el texto', () => {
    const text = 'Prefacio (García, 2023) conclusión.'
    const cits = extractCitations(text)
    const cit = findCitationByRaw(cits, 'García')!
    expect(cit).toBeDefined()
    expect(text.substring(cit.start, cit.end)).toBe(cit.rawText)
  })

  it('detecta varias citas en un párrafo y las ordena por posición', () => {
    const text = 'Primero (García, 2023). Luego López (2021) y al final (Pérez, 2020).'
    const cits = extractCitations(text)
    expect(cits.length).toBeGreaterThanOrEqual(3)
    // Deben estar ordenadas por start ascendente
    for (let i = 1; i < cits.length; i++) {
      expect(cits[i].start).toBeGreaterThanOrEqual(cits[i - 1].start)
    }
  })
})
