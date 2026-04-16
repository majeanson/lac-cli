import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scanFeatures } from '../scanner.js'

const VALID_FEATURE = {
  featureKey: 'feat-2026-001',
  title: 'Test Feature',
  status: 'active',
  problem: 'A test problem',
}

describe('scanFeatures', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-scanner-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns empty array for an empty directory', async () => {
    const results = await scanFeatures(tmpDir)
    expect(results).toEqual([])
  })

  it('finds a valid feature.json in the root dir', async () => {
    writeFileSync(join(tmpDir, 'feature.json'), JSON.stringify(VALID_FEATURE))
    const results = await scanFeatures(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0]?.feature.featureKey).toBe('feat-2026-001')
    expect(results[0]?.filePath).toBe(join(tmpDir, 'feature.json'))
  })

  it('finds feature.json files nested in subdirectories', async () => {
    const sub = join(tmpDir, 'feat-auth')
    mkdirSync(sub)
    writeFileSync(join(sub, 'feature.json'), JSON.stringify(VALID_FEATURE))
    const results = await scanFeatures(tmpDir)
    expect(results).toHaveLength(1)
    expect(results[0]?.filePath).toBe(join(sub, 'feature.json'))
  })

  it('finds multiple feature.json files across sibling directories', async () => {
    for (const [i, name] of ['feat-a', 'feat-b', 'feat-c'].entries()) {
      const sub = join(tmpDir, name)
      mkdirSync(sub)
      writeFileSync(
        join(sub, 'feature.json'),
        JSON.stringify({ ...VALID_FEATURE, featureKey: `feat-2026-00${i + 1}` }),
      )
    }
    const results = await scanFeatures(tmpDir)
    expect(results).toHaveLength(3)
  })

  it('skips files with invalid JSON', async () => {
    writeFileSync(join(tmpDir, 'feature.json'), 'not valid json !!!')
    const results = await scanFeatures(tmpDir)
    expect(results).toHaveLength(0)
  })

  it('skips feature.json that fails schema validation', async () => {
    writeFileSync(join(tmpDir, 'feature.json'), JSON.stringify({ title: 'Missing required fields' }))
    const results = await scanFeatures(tmpDir)
    expect(results).toHaveLength(0)
  })

  it('skips hidden directories', async () => {
    const hidden = join(tmpDir, '.git')
    mkdirSync(hidden)
    writeFileSync(join(hidden, 'feature.json'), JSON.stringify(VALID_FEATURE))
    const results = await scanFeatures(tmpDir)
    expect(results).toHaveLength(0)
  })

  it('skips node_modules directories', async () => {
    const nm = join(tmpDir, 'node_modules', 'some-pkg')
    mkdirSync(nm, { recursive: true })
    writeFileSync(join(nm, 'feature.json'), JSON.stringify(VALID_FEATURE))
    const results = await scanFeatures(tmpDir)
    expect(results).toHaveLength(0)
  })

  it('skips _archive directories by default', async () => {
    const archive = join(tmpDir, '_archive', 'old-feat')
    mkdirSync(archive, { recursive: true })
    writeFileSync(join(archive, 'feature.json'), JSON.stringify(VALID_FEATURE))
    const results = await scanFeatures(tmpDir)
    expect(results).toHaveLength(0)
  })

  it('includes _archive directories when includeArchived is true', async () => {
    const archive = join(tmpDir, '_archive', 'old-feat')
    mkdirSync(archive, { recursive: true })
    writeFileSync(join(archive, 'feature.json'), JSON.stringify(VALID_FEATURE))
    const results = await scanFeatures(tmpDir, { includeArchived: true })
    expect(results).toHaveLength(1)
  })

  it('finds archived and non-archived features together when opted in', async () => {
    writeFileSync(join(tmpDir, 'feature.json'), JSON.stringify(VALID_FEATURE))
    const archive = join(tmpDir, '_archive', 'old')
    mkdirSync(archive, { recursive: true })
    writeFileSync(
      join(archive, 'feature.json'),
      JSON.stringify({ ...VALID_FEATURE, featureKey: 'feat-2025-001' }),
    )
    const results = await scanFeatures(tmpDir, { includeArchived: true })
    expect(results).toHaveLength(2)
  })

  it('handles deeply nested feature.json', async () => {
    const deep = join(tmpDir, 'a', 'b', 'c', 'd')
    mkdirSync(deep, { recursive: true })
    writeFileSync(join(deep, 'feature.json'), JSON.stringify(VALID_FEATURE))
    const results = await scanFeatures(tmpDir)
    expect(results).toHaveLength(1)
  })

  it('returns valid Feature objects matching the schema', async () => {
    writeFileSync(join(tmpDir, 'feature.json'), JSON.stringify(VALID_FEATURE))
    const results = await scanFeatures(tmpDir)
    const feature = results[0]?.feature
    expect(feature?.featureKey).toBe('feat-2026-001')
    expect(feature?.title).toBe('Test Feature')
    expect(feature?.status).toBe('active')
    expect(feature?.problem).toBe('A test problem')
  })
})
