import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { FeatureIndex } from '../indexer/FeatureIndex.js'
import type { IndexedFeature } from '../indexer/types.js'
import { blame } from '../lib/blame.js'

// ---------------------------------------------------------------------------
// Minimal FeatureIndex stub — only getByDir is needed by blame()
// ---------------------------------------------------------------------------

function makeIndex(entries: Map<string, IndexedFeature>): FeatureIndex {
  return {
    getByDir(dir: string): IndexedFeature | undefined {
      return entries.get(dir)
    },
  } as unknown as FeatureIndex
}

function makeIndexed(dir: string, key = 'feat-2026-001'): IndexedFeature {
  return {
    feature: {
      featureKey: key,
      title: 'T',
      status: 'active',
      problem: 'P',
    } as unknown as IndexedFeature['feature'],
    filePath: join(dir, 'feature.json'),
    dir,
    completeness: 0,
  }
}

// ---------------------------------------------------------------------------
// blame() — path resolution
// ---------------------------------------------------------------------------

describe('blame()', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-blame-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('finds feature when given a file path directly in the feature directory', () => {
    const featDir = join(tmpDir, 'feat-auth')
    mkdirSync(featDir, { recursive: true })
    // Create the file so statSync works
    writeFileSync(join(featDir, 'some-file.ts'), '', 'utf-8')

    const indexed = makeIndexed(featDir)
    const index = makeIndex(new Map([[featDir, indexed]]))

    const result = blame(join(featDir, 'some-file.ts'), index)
    expect(result).toBeDefined()
    expect(result?.feature.featureKey).toBe('feat-2026-001')
  })

  it('finds feature when given the feature directory itself', () => {
    const featDir = join(tmpDir, 'feat-auth')
    mkdirSync(featDir, { recursive: true })

    const indexed = makeIndexed(featDir)
    const index = makeIndex(new Map([[featDir, indexed]]))

    const result = blame(featDir, index)
    expect(result).toBeDefined()
    expect(result?.feature.featureKey).toBe('feat-2026-001')
  })

  it('walks up the directory tree to find a parent-level feature', () => {
    const featDir = join(tmpDir, 'feat-auth')
    const nestedDir = join(featDir, 'src', 'components')
    mkdirSync(nestedDir, { recursive: true })

    const indexed = makeIndexed(featDir)
    // Only featDir is indexed — nested path must walk up to find it
    const index = makeIndex(new Map([[featDir, indexed]]))

    // Give blame a deep nested file
    const result = blame(join(nestedDir, 'Button.tsx'), index)
    expect(result).toBeDefined()
    expect(result?.feature.featureKey).toBe('feat-2026-001')
  })

  it('returns undefined when no feature found in any ancestor', () => {
    // Empty index — no features registered
    const index = makeIndex(new Map())
    const result = blame(join(tmpDir, 'some', 'path', 'file.ts'), index)
    expect(result).toBeUndefined()
  })

  it('returns nearest (most specific) feature when multiple levels are indexed', () => {
    const rootFeatDir = tmpDir
    const childFeatDir = join(tmpDir, 'child-feat')
    mkdirSync(childFeatDir, { recursive: true })

    const rootIndexed = makeIndexed(rootFeatDir, 'feat-2026-root')
    const childIndexed = makeIndexed(childFeatDir, 'feat-2026-child')

    const index = makeIndex(new Map([
      [rootFeatDir, rootIndexed],
      [childFeatDir, childIndexed],
    ]))

    // File inside childFeatDir — should find child, not root
    const result = blame(join(childFeatDir, 'file.ts'), index)
    expect(result?.feature.featureKey).toBe('feat-2026-child')
  })

  it('handles non-existent path by treating it as a file (uses dirname)', () => {
    const featDir = join(tmpDir, 'feat-ghost')
    mkdirSync(featDir, { recursive: true })

    const indexed = makeIndexed(featDir)
    const index = makeIndex(new Map([[featDir, indexed]]))

    // Non-existent file inside featDir — statSync will throw, blame uses dirname
    const result = blame(join(featDir, 'does-not-exist.ts'), index)
    expect(result).toBeDefined()
    expect(result?.feature.featureKey).toBe('feat-2026-001')
  })
})
