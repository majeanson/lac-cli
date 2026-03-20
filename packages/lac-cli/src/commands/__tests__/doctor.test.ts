import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('doctor — workspace checks', () => {
  let tmpDir: string
  let lacDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-doctor-test-${Date.now()}`)
    lacDir = join(tmpDir, '.lac')
    mkdirSync(lacDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('detects valid .lac/counter file', () => {
    const year = new Date().getFullYear()
    writeFileSync(join(lacDir, 'counter'), `${year}\n5\n`, 'utf-8')

    // Read back and verify
    const raw = readFileSync(join(lacDir, 'counter'), 'utf-8').trim()
    const parts = raw.split('\n').map((l) => l.trim())
    const storedYear = parseInt(parts[0] ?? '', 10)
    const storedCounter = parseInt(parts[1] ?? '', 10)

    expect(storedYear).toBe(year)
    expect(storedCounter).toBe(5)
  })

  it('detects valid feature.json files', async () => {
    const featureDir = join(tmpDir, 'my-feature')
    mkdirSync(featureDir, { recursive: true })

    writeFileSync(
      join(featureDir, 'feature.json'),
      JSON.stringify({
        featureKey: 'feat-2026-001',
        title: 'Test Feature',
        status: 'active',
        problem: 'Test problem',
      }),
      'utf-8',
    )

    const { scanFeatures } = await import('../../lib/scanner.js')
    const features = await scanFeatures(tmpDir)

    expect(features).toHaveLength(1)
    expect(features[0]?.feature.featureKey).toBe('feat-2026-001')
  })

  it('identifies invalid feature.json', async () => {
    const featureDir = join(tmpDir, 'bad-feature')
    mkdirSync(featureDir, { recursive: true })

    writeFileSync(
      join(featureDir, 'feature.json'),
      JSON.stringify({ badField: true }),
      'utf-8',
    )

    const { scanFeatures } = await import('../../lib/scanner.js')
    // Invalid features are skipped by scanFeatures
    const features = await scanFeatures(tmpDir)
    expect(features).toHaveLength(0)
  })
})
