import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { computeCompleteness, loadConfig } from '../lib/config.js'
import { findLacConfig } from '../lib/walker.js'

describe('computeCompleteness', () => {
  it('returns 0% when no optional fields are filled', () => {
    const feature: Record<string, unknown> = {
      featureKey: 'feat-2026-001',
      title: 'Test',
      status: 'active',
      problem: 'Some problem',
    }
    expect(computeCompleteness(feature)).toBe(0)
  })

  it('returns 100% when all optional fields are filled', () => {
    const feature: Record<string, unknown> = {
      featureKey: 'feat-2026-001',
      title: 'Test',
      status: 'active',
      problem: 'Some problem',
      analysis: 'Some analysis',
      decisions: [{ decision: 'Use X', rationale: 'Because Y' }],
      implementation: 'Implementation details',
      knownLimitations: ['Limitation 1'],
      tags: ['api'],
      annotations: [{ id: '1', author: 'test', date: '2026-01-01', type: 'decision', body: 'Note' }],
    }
    expect(computeCompleteness(feature)).toBe(100)
  })

  it('returns ~50% when half the optional fields are filled', () => {
    const feature: Record<string, unknown> = {
      featureKey: 'feat-2026-001',
      title: 'Test',
      status: 'active',
      problem: 'Some problem',
      analysis: 'Some analysis',
      decisions: [{ decision: 'Use X', rationale: 'Because Y' }],
      implementation: 'Implementation details',
    }
    // 3 out of 6 fields = 50%
    expect(computeCompleteness(feature)).toBe(50)
  })

  it('returns 0% for empty arrays', () => {
    const feature: Record<string, unknown> = {
      featureKey: 'feat-2026-001',
      title: 'Test',
      status: 'active',
      problem: 'Some problem',
      decisions: [],
      tags: [],
      annotations: [],
    }
    expect(computeCompleteness(feature)).toBe(0)
  })

  it('returns 0% for empty string fields', () => {
    const feature: Record<string, unknown> = {
      featureKey: 'feat-2026-001',
      title: 'Test',
      status: 'active',
      problem: 'Some problem',
      analysis: '',
      implementation: '   ',
    }
    expect(computeCompleteness(feature)).toBe(0)
  })

  it('counts non-empty arrays as filled', () => {
    const feature: Record<string, unknown> = {
      featureKey: 'feat-2026-001',
      title: 'Test',
      status: 'active',
      problem: 'Some problem',
      tags: ['api'],
    }
    // 1 out of 6 = ~17%
    const score = computeCompleteness(feature)
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(50)
  })
})

// ---------------------------------------------------------------------------
// findLacConfig
// ---------------------------------------------------------------------------

describe('findLacConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-config-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns null when no lac.config.json exists', () => {
    const result = findLacConfig(tmpDir)
    expect(result).toBeNull()
  })

  it('finds lac.config.json in the same directory', () => {
    const configPath = join(tmpDir, 'lac.config.json')
    writeFileSync(configPath, JSON.stringify({ version: 1 }), 'utf-8')
    const result = findLacConfig(tmpDir)
    expect(result).toBe(configPath)
  })

  it('finds lac.config.json in a parent directory', () => {
    const subDir = join(tmpDir, 'deep', 'path')
    mkdirSync(subDir, { recursive: true })
    const configPath = join(tmpDir, 'lac.config.json')
    writeFileSync(configPath, JSON.stringify({ version: 1 }), 'utf-8')
    const result = findLacConfig(subDir)
    expect(result).toBe(configPath)
  })
})

// ---------------------------------------------------------------------------
// loadConfig
// ---------------------------------------------------------------------------

describe('loadConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-loadconfig-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns defaults when no config file found', () => {
    const config = loadConfig(tmpDir)
    expect(config.version).toBe(1)
    expect(config.requiredFields).toEqual(['problem'])
    expect(config.ciThreshold).toBe(0)
    expect(config.domain).toBe('feat')
    expect(config.lintStatuses).toEqual(['active', 'draft'])
  })

  it('loads custom domain from config file', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ domain: 'proc' }),
      'utf-8',
    )
    const config = loadConfig(tmpDir)
    expect(config.domain).toBe('proc')
  })

  it('loads custom requiredFields from config file', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ requiredFields: ['problem', 'analysis'] }),
      'utf-8',
    )
    const config = loadConfig(tmpDir)
    expect(config.requiredFields).toEqual(['problem', 'analysis'])
  })

  it('uses defaults for fields not specified in config', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ domain: 'goal' }),
      'utf-8',
    )
    const config = loadConfig(tmpDir)
    expect(config.domain).toBe('goal')
    expect(config.requiredFields).toEqual(['problem'])
    expect(config.ciThreshold).toBe(0)
  })

  it('falls back to defaults on invalid JSON', () => {
    writeFileSync(join(tmpDir, 'lac.config.json'), 'not valid json!!!', 'utf-8')
    const config = loadConfig(tmpDir)
    expect(config.version).toBe(1)
    expect(config.domain).toBe('feat')
  })
})
