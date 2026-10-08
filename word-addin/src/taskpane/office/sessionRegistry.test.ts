import { describe, it, expect, beforeEach } from 'vitest'
import {
  oncePerSession,
  wasApplied,
  resetSessionRegistry,
  registrySize,
} from './sessionRegistry'

describe('sessionRegistry — idempotencia por sesión (T3)', () => {
  beforeEach(() => resetSessionRegistry())

  it('primera vez true, segunda false (no duplicar escritura)', () => {
    const key = 'cap:figure:abc123'
    expect(oncePerSession(key)).toBe(true)
    expect(oncePerSession(key)).toBe(false)
    expect(wasApplied(key)).toBe(true)
  })

  it('claves distintas no se pisan', () => {
    expect(oncePerSession('fmt:p1')).toBe(true)
    expect(oncePerSession('fmt:p2')).toBe(true)
    expect(oncePerSession('fmt:p1')).toBe(false)
    expect(registrySize()).toBe(2)
  })

  it('reset limpia la sesión completa', () => {
    oncePerSession('a')
    resetSessionRegistry()
    expect(registrySize()).toBe(0)
    expect(oncePerSession('a')).toBe(true)
  })
})
