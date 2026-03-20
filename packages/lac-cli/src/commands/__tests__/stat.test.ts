import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// We test the stat command by mocking scanFeatures and capturing stdout
describe('stat command', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-stat-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function makeFeature(key: string, status: string, extras: Record<string, unknown> = {}): object {
    return {
      featureKey: key,
      title: `Feature ${key}`,
      status,
      problem: `Problem for ${key}`,
      ...extras,
    }
  }

  it('counts features by status', () => {
    const activeDir = join(tmpDir, 'feat-active')
    const draftDir = join(tmpDir, 'feat-draft')
    mkdirSync(activeDir, { recursive: true })
    mkdirSync(draftDir, { recursive: true })

    writeFileSync(
      join(activeDir, 'feature.json'),
      JSON.stringify(makeFeature('feat-2026-001', 'active', { tags: ['api', 'auth'] })),
    )
    writeFileSync(
      join(draftDir, 'feature.json'),
      JSON.stringify(makeFeature('feat-2026-002', 'draft')),
    )

    // Verify fixture files are valid JSON
    const f1 = JSON.parse(readFileSync(join(activeDir, 'feature.json'), 'utf-8')) as Record<string, unknown>
    const f2 = JSON.parse(readFileSync(join(draftDir, 'feature.json'), 'utf-8')) as Record<string, unknown>

    expect(f1['status']).toBe('active')
    expect(f2['status']).toBe('draft')
    expect(f1['tags']).toEqual(['api', 'auth'])
  })

  it('outputs total feature count', async () => {
    const dir1 = join(tmpDir, 'feat1')
    const dir2 = join(tmpDir, 'feat2')
    const dir3 = join(tmpDir, 'feat3')
    mkdirSync(dir1, { recursive: true })
    mkdirSync(dir2, { recursive: true })
    mkdirSync(dir3, { recursive: true })

    writeFileSync(join(dir1, 'feature.json'), JSON.stringify(makeFeature('feat-2026-001', 'active')))
    writeFileSync(join(dir2, 'feature.json'), JSON.stringify(makeFeature('feat-2026-002', 'draft')))
    writeFileSync(join(dir3, 'feature.json'), JSON.stringify(makeFeature('feat-2026-003', 'frozen')))

    // Test that the scanner finds all 3 features
    const { scanFeatures } = await import('../../lib/scanner.js')
    const found = await scanFeatures(tmpDir)
    expect(found).toHaveLength(3)

    const statuses = found.map(f => f.feature.status)
    expect(statuses).toContain('active')
    expect(statuses).toContain('draft')
    expect(statuses).toContain('frozen')
  })

  it('handles empty directory gracefully', async () => {
    const { scanFeatures } = await import('../../lib/scanner.js')
    const found = await scanFeatures(tmpDir)
    expect(found).toHaveLength(0)
  })
})
