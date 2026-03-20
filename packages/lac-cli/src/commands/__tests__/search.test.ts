import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('search — scanFeatures filtering', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-search-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function makeFeature(key: string, overrides: Record<string, unknown> = {}): object {
    return {
      featureKey: key,
      title: 'Default title',
      status: 'active',
      problem: 'Default problem statement',
      ...overrides,
    }
  }

  it('finds features by title keyword', async () => {
    const dir1 = join(tmpDir, 'auth')
    const dir2 = join(tmpDir, 'billing')
    mkdirSync(dir1, { recursive: true })
    mkdirSync(dir2, { recursive: true })

    writeFileSync(
      join(dir1, 'feature.json'),
      JSON.stringify(makeFeature('feat-2026-001', { title: 'Authentication flow', problem: 'Users need to log in' })),
    )
    writeFileSync(
      join(dir2, 'feature.json'),
      JSON.stringify(makeFeature('feat-2026-002', { title: 'Billing portal', problem: 'Users need to pay' })),
    )

    const { scanFeatures } = await import('../../lib/scanner.js')
    const features = await scanFeatures(tmpDir)

    const q = 'authentication'
    const matches = features.filter(({ feature }) =>
      feature.title.toLowerCase().includes(q),
    )

    expect(matches).toHaveLength(1)
    expect(matches[0]?.feature.featureKey).toBe('feat-2026-001')
  })

  it('finds features by problem keyword (case-insensitive)', async () => {
    const dir1 = join(tmpDir, 'feat1')
    mkdirSync(dir1, { recursive: true })
    writeFileSync(
      join(dir1, 'feature.json'),
      JSON.stringify(makeFeature('feat-2026-001', { problem: 'Users cannot RESET their password' })),
    )

    const { scanFeatures } = await import('../../lib/scanner.js')
    const features = await scanFeatures(tmpDir)

    const q = 'reset'
    const matches = features.filter(({ feature }) =>
      feature.problem.toLowerCase().includes(q.toLowerCase()),
    )

    expect(matches).toHaveLength(1)
  })

  it('returns empty when no features match', async () => {
    const dir1 = join(tmpDir, 'feat1')
    mkdirSync(dir1, { recursive: true })
    writeFileSync(
      join(dir1, 'feature.json'),
      JSON.stringify(makeFeature('feat-2026-001', { title: 'Auth system' })),
    )

    const { scanFeatures } = await import('../../lib/scanner.js')
    const features = await scanFeatures(tmpDir)

    const q = 'xyznotfound'
    const matches = features.filter(({ feature }) =>
      feature.title.toLowerCase().includes(q) || feature.problem.toLowerCase().includes(q),
    )

    expect(matches).toHaveLength(0)
  })
})
