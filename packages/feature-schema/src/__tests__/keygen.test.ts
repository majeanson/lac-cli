import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { generateFeatureKey, getCurrentYear, padCounter } from '../keygen.js'

describe('keygen', () => {
  let tmpDir: string
  let lacDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-keygen-test-${Date.now()}`)
    lacDir = join(tmpDir, '.lac')
    mkdirSync(lacDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('getCurrentYear returns the current year', () => {
    const year = getCurrentYear()
    expect(year).toBe(new Date().getFullYear())
  })

  it('padCounter pads numbers to 3 digits', () => {
    expect(padCounter(1)).toBe('001')
    expect(padCounter(10)).toBe('010')
    expect(padCounter(100)).toBe('100')
    expect(padCounter(999)).toBe('999')
  })

  it('generates first key as feat-YYYY-001', () => {
    const year = getCurrentYear()
    const key = generateFeatureKey(tmpDir)
    expect(key).toBe(`feat-${year}-001`)
  })

  it('increments counter on second call', () => {
    const year = getCurrentYear()
    const key1 = generateFeatureKey(tmpDir)
    const key2 = generateFeatureKey(tmpDir)

    expect(key1).toBe(`feat-${year}-001`)
    expect(key2).toBe(`feat-${year}-002`)
  })

  it('uses custom prefix', () => {
    const year = getCurrentYear()
    const key = generateFeatureKey(tmpDir, 'proc')
    expect(key).toBe(`proc-${year}-001`)
  })

  it('resets counter when year changes', () => {
    const thisYear = getCurrentYear()
    // Manually write a counter for a previous year
    writeFileSync(join(lacDir, 'counter'), `${thisYear - 1}\n99\n`, 'utf-8')

    const key = generateFeatureKey(tmpDir)
    expect(key).toBe(`feat-${thisYear}-001`)
  })

  it('detects duplicates via .lac/keys and increments', () => {
    const year = getCurrentYear()
    // Pre-populate the keys file with feat-YYYY-001 and feat-YYYY-002
    // counter file says last used = 1, so next attempt = 2; feat-YYYY-002 is taken, so skip to 003
    writeFileSync(join(lacDir, 'keys'), `feat-${year}-001\nfeat-${year}-002\n`, 'utf-8')
    writeFileSync(join(lacDir, 'counter'), `${year}\n1\n`, 'utf-8')

    const key = generateFeatureKey(tmpDir)
    expect(key).toBe(`feat-${year}-003`)
  })

  it('handles corrupt counter by resetting to 1', () => {
    const year = getCurrentYear()
    // Write corrupt counter
    writeFileSync(join(lacDir, 'counter'), 'not-a-number\ncorrupt\n', 'utf-8')

    const key = generateFeatureKey(tmpDir)
    expect(key).toBe(`feat-${year}-001`)
  })
})
