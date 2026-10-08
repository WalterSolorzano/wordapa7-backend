import { describe, it, expect, beforeEach } from 'vitest'
import {
  inferContext,
  contextFromScan,
} from './contextAnalyzer'

describe('contextAnalyzer — inferencia pura sin roundtrips', () => {
  it('portada protegida gana sobre todo', () => {
    expect(inferContext({ text: 'UNIVERSIDAD', isCover: true }).kind).toBe('protected-cover')
    expect(inferContext({ text: 'UNIVERSIDAD', isCover: true, inTable: true }).kind).toBe('protected-cover')
  })

  it('tabla', () => {
    expect(inferContext({ text: 'Actividad', inTable: true }).kind).toBe('table')
  })

  it('imagen por drawing del parrafo', () => {
    expect(inferContext({ hasDrawing: true, text: '' }).kind).toBe('image')
  })

  it('heading por estilo Word', () => {
    expect(inferContext({ text: 'Introduccion', style: 'Heading 1' }).kind).toBe('heading')
    expect(inferContext({ text: 'Método', style: 'Título 2' }).kind).toBe('heading')
  })

  it('zona de referencias por encabezado', () => {
    expect(inferContext({ text: 'Referencias' }).kind).toBe('references')
    expect(inferContext({ text: 'Bibliografía' }).kind).toBe('references')
  })

  it('parrafo corriente', () => {
    const long = 'El presente trabajo analiza la productividad mediante estudio de metodos y tiempos en el proceso.'
    expect(inferContext({ text: long }).kind).toBe('paragraph')
  })

  it('unknown honesto cuando no hay datos', () => {
    expect(inferContext({}).kind).toBe('unknown')
    expect(inferContext({ text: '' }).kind).toBe('unknown')
  })

  it('contextFromScan adapter mapea snapshot', () => {
    expect(contextFromScan({ currentParagraphText: 'Tabla 2', inTable: true }).kind).toBe('table')
  })
})
