import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('taskpane.css tipografías — legibilidad mínima', () => {
  const css = fs.readFileSync(
    path.resolve(__dirname, 'taskpane.css'),
    'utf8',
  )

  it('.tab usa al menos 14px', () => {
    const m = css.match(/\.tab\s*\{[^}]*font-size:\s*([^;]+);/)
    expect(parseFloat(m?.[1] || '0')).toBeGreaterThanOrEqual(14)
  })

  it('.mascot-bubble__text usa al menos 12px', () => {
    const m = css.match(/\.mascot-bubble__text\s*\{[^}]*font-size:\s*([^;]+);/)
    expect(parseFloat(m?.[1] || '0')).toBeGreaterThanOrEqual(12)
  })

  it('.app-header__status usa al menos 13px', () => {
    const m = css.match(/\.app-header__status\s*\{[^}]*font-size:\s*([^;]+);/)
    expect(parseFloat(m?.[1] || '0')).toBeGreaterThanOrEqual(13)
  })

  it('.card__subtitle usa al menos 12px', () => {
    const m = css.match(/\.card__subtitle\s*\{[^}]*font-size:\s*([^;]+);/)
    expect(parseFloat(m?.[1] || '0')).toBeGreaterThanOrEqual(12)
  })

  it('.btn-sm usa al menos 12px', () => {
    const m = css.match(/\.btn-sm\s*\{[^}]*font-size:\s*([^;]+);/)
    expect(parseFloat(m?.[1] || '0')).toBeGreaterThanOrEqual(12)
  })

  it('.stat-chip__label usa al menos 10.5px', () => {
    const m = css.match(/\.stat-chip__label\s*\{[^}]*font-size:\s*([^;]+);/)
    expect(parseFloat(m?.[1] || '0')).toBeGreaterThanOrEqual(10.5)
  })

  it('.finding-item__badge usa al menos 10.5px', () => {
    const m = css.match(/\.finding-item__badge\s*\{[^}]*font-size:\s*([^;]+);/)
    expect(parseFloat(m?.[1] || '0')).toBeGreaterThanOrEqual(10.5)
  })
})
