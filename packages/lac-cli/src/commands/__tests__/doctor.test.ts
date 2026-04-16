import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { findLacDir, walkFeatureFiles } from '../doctor.js'

const VALID_FEATURE = {
  featureKey: 'feat-2026-001',
  title: 'Test Feature',
  status: 'active',
  problem: 'A test problem',
}

// ---------------------------------------------------------------------------
// findLacDir
// ---------------------------------------------------------------------------

describe('findLacDir', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-doctor-dir-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('finds .lac/ in the same directory', () => {
    const lacDir = join(tmpDir, '.lac')
    mkdirSync(lacDir)
    const result = findLacDir(tmpDir)
    expect(result).toBe(lacDir)
  })

  it('finds .lac/ in a parent directory', () => {
    const lacDir = join(tmpDir, '.lac')
    mkdirSync(lacDir)
    const subDir = join(tmpDir, 'packages', 'my-pkg')
    mkdirSync(subDir, { recursive: true })
    const result = findLacDir(subDir)
    expect(result).toBe(lacDir)
  })

  it('ignores .lac when it is a file, not a directory', () => {
    // Write .lac as a FILE — findLacDir only matches directories
    writeFileSync(join(tmpDir, '.lac'), 'not a dir', 'utf-8')
    const result = findLacDir(tmpDir)
    // Must not return the file path as a valid lac dir
    if (result !== null) {
      expect(result).not.toBe(join(tmpDir, '.lac'))
    }
  })
})

// ---------------------------------------------------------------------------
// walkFeatureFiles
// ---------------------------------------------------------------------------

describe('walkFeatureFiles', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-doctor-walk-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns zero valid and no invalid for empty directory', async () => {
    const result = await walkFeatureFiles(tmpDir)
    expect(result.valid).toBe(0)
    expect(result.invalid).toHaveLength(0)
  })

  it('counts a valid feature.json as valid', async () => {
    writeFileSync(join(tmpDir, 'feature.json'), JSON.stringify(VALID_FEATURE), 'utf-8')
    const result = await walkFeatureFiles(tmpDir)
    expect(result.valid).toBe(1)
    expect(result.invalid).toHaveLength(0)
  })

  it('reports invalid JSON as an error', async () => {
    writeFileSync(join(tmpDir, 'feature.json'), 'not valid json!!!', 'utf-8')
    const result = await walkFeatureFiles(tmpDir)
    expect(result.valid).toBe(0)
    expect(result.invalid).toHaveLength(1)
    expect(result.invalid[0]?.errors[0]).toMatch(/invalid JSON/i)
  })

  it('reports schema validation failure with errors', async () => {
    writeFileSync(
      join(tmpDir, 'feature.json'),
      JSON.stringify({ title: 'Missing required fields' }),
      'utf-8',
    )
    const result = await walkFeatureFiles(tmpDir)
    expect(result.valid).toBe(0)
    expect(result.invalid).toHaveLength(1)
    expect(result.invalid[0]?.filePath).toBe(join(tmpDir, 'feature.json'))
    expect(result.invalid[0]?.errors.length).toBeGreaterThan(0)
  })

  it('finds feature.json in nested subdirectories', async () => {
    const featDir = join(tmpDir, 'feat-auth')
    mkdirSync(featDir)
    writeFileSync(join(featDir, 'feature.json'), JSON.stringify(VALID_FEATURE), 'utf-8')
    const result = await walkFeatureFiles(tmpDir)
    expect(result.valid).toBe(1)
  })

  it('skips hidden directories', async () => {
    const hidden = join(tmpDir, '.git')
    mkdirSync(hidden)
    writeFileSync(join(hidden, 'feature.json'), JSON.stringify(VALID_FEATURE), 'utf-8')
    const result = await walkFeatureFiles(tmpDir)
    expect(result.valid).toBe(0)
  })

  it('skips node_modules directories', async () => {
    const nm = join(tmpDir, 'node_modules', 'some-pkg')
    mkdirSync(nm, { recursive: true })
    writeFileSync(join(nm, 'feature.json'), JSON.stringify(VALID_FEATURE), 'utf-8')
    const result = await walkFeatureFiles(tmpDir)
    expect(result.valid).toBe(0)
  })

  it('counts both valid and invalid separately', async () => {
    for (let i = 1; i <= 2; i++) {
      const d = join(tmpDir, `feat-${i}`)
      mkdirSync(d)
      writeFileSync(join(d, 'feature.json'), JSON.stringify({ ...VALID_FEATURE, featureKey: `feat-2026-00${i}` }), 'utf-8')
    }
    const badDir = join(tmpDir, 'feat-bad')
    mkdirSync(badDir)
    writeFileSync(join(badDir, 'feature.json'), 'bad json', 'utf-8')

    const result = await walkFeatureFiles(tmpDir)
    expect(result.valid).toBe(2)
    expect(result.invalid).toHaveLength(1)
  })

  it('includes filePath in the invalid entry', async () => {
    const featPath = join(tmpDir, 'feature.json')
    writeFileSync(featPath, 'bad json!', 'utf-8')
    const result = await walkFeatureFiles(tmpDir)
    expect(result.invalid[0]?.filePath).toBe(featPath)
  })
})
