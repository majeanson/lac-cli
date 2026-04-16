import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  checkGuardlock,
  formatGuardlockMessage,
  loadGuardlockConfig,
  resolveLockedFields,
} from '../guardlock.js'
import type { FieldLock, GuardlockConfig } from '../guardlock.js'

const defaults: Required<GuardlockConfig> = {
  mode: 'warn',
  restrictedFields: [],
  requireAlternatives: false,
  freezeRequiresHumanRevision: false,
}

// ---------------------------------------------------------------------------
// resolveLockedFields
// ---------------------------------------------------------------------------

describe('resolveLockedFields', () => {
  it('returns empty sets when no restrictions', () => {
    const { lockedFields, lockReasons } = resolveLockedFields(defaults)
    expect(lockedFields.size).toBe(0)
    expect(lockReasons.size).toBe(0)
  })

  it('adds workspace-level restricted fields', () => {
    const config = { ...defaults, restrictedFields: ['problem', 'analysis'] }
    const { lockedFields, lockReasons } = resolveLockedFields(config)
    expect(lockedFields).toEqual(new Set(['problem', 'analysis']))
    expect(lockReasons.get('problem')).toMatch(/workspace config/)
    expect(lockReasons.get('analysis')).toMatch(/workspace config/)
  })

  it('adds per-feature field locks', () => {
    const locks: FieldLock[] = [
      { field: 'decisions', lockedAt: '2026-01-01', lockedBy: 'marc', reason: 'final' },
    ]
    const { lockedFields, lockReasons } = resolveLockedFields(defaults, locks)
    expect(lockedFields.has('decisions')).toBe(true)
    expect(lockReasons.get('decisions')).toMatch(/marc/)
    expect(lockReasons.get('decisions')).toMatch(/final/)
  })

  it('formats per-feature lock reason without reason field', () => {
    const locks: FieldLock[] = [
      { field: 'implementation', lockedAt: '2026-03-01', lockedBy: 'alice' },
    ]
    const { lockReasons } = resolveLockedFields(defaults, locks)
    expect(lockReasons.get('implementation')).toMatch(/alice/)
    expect(lockReasons.get('implementation')).toMatch(/2026-03-01/)
  })

  it('workspace restriction takes priority over per-feature lock reason', () => {
    const config = { ...defaults, restrictedFields: ['problem'] }
    const locks: FieldLock[] = [
      { field: 'problem', lockedAt: '2026-01-01', lockedBy: 'bob', reason: 'per-feature' },
    ]
    const { lockedFields, lockReasons } = resolveLockedFields(config, locks)
    // field still locked, workspace reason wins (set first)
    expect(lockedFields.has('problem')).toBe(true)
    expect(lockReasons.get('problem')).toMatch(/workspace config/)
  })

  it('merges workspace and per-feature locks without duplicates', () => {
    const config = { ...defaults, restrictedFields: ['problem'] }
    const locks: FieldLock[] = [
      { field: 'analysis', lockedAt: '2026-01-01', lockedBy: 'carol' },
    ]
    const { lockedFields } = resolveLockedFields(config, locks)
    expect(lockedFields).toEqual(new Set(['problem', 'analysis']))
  })
})

// ---------------------------------------------------------------------------
// checkGuardlock
// ---------------------------------------------------------------------------

describe('checkGuardlock', () => {
  it('returns no violations when mode is off', () => {
    const config = { ...defaults, mode: 'off' as const, restrictedFields: ['problem'] }
    const result = checkGuardlock(config, [], ['problem'])
    expect(result).toHaveLength(0)
  })

  it('returns no violations when no fields are locked', () => {
    const result = checkGuardlock(defaults, [], ['analysis', 'implementation'])
    expect(result).toHaveLength(0)
  })

  it('returns violation for a workspace-restricted field', () => {
    const config = { ...defaults, restrictedFields: ['problem'] }
    const result = checkGuardlock(config, [], ['problem', 'analysis'])
    expect(result).toHaveLength(1)
    expect(result[0]?.field).toBe('problem')
    expect(result[0]?.reason).toMatch(/workspace config/)
  })

  it('returns violation for a per-feature locked field', () => {
    const locks: FieldLock[] = [
      { field: 'decisions', lockedAt: '2026-01-01', lockedBy: 'marc', reason: 'agreed' },
    ]
    const result = checkGuardlock(defaults, locks, ['decisions'])
    expect(result).toHaveLength(1)
    expect(result[0]?.field).toBe('decisions')
  })

  it('returns multiple violations when multiple locked fields are written', () => {
    const config = { ...defaults, restrictedFields: ['problem', 'analysis'] }
    const result = checkGuardlock(config, [], ['problem', 'analysis', 'implementation'])
    expect(result).toHaveLength(2)
    expect(result.map((v) => v.field)).toEqual(expect.arrayContaining(['problem', 'analysis']))
  })

  it('locks all written fields when featureLocked is true', () => {
    const result = checkGuardlock(defaults, [], ['problem', 'analysis', 'decisions'], true)
    expect(result).toHaveLength(3)
    for (const v of result) {
      expect(v.reason).toMatch(/featureLocked/)
    }
  })

  it('featureLocked overrides mode off check... but mode off wins first', () => {
    const config = { ...defaults, mode: 'off' as const }
    const result = checkGuardlock(config, [], ['problem'], true)
    // mode: 'off' returns early before featureLocked check
    expect(result).toHaveLength(0)
  })

  it('returns no violations when written fields are not locked', () => {
    const config = { ...defaults, restrictedFields: ['problem'] }
    const result = checkGuardlock(config, [], ['analysis', 'tags'])
    expect(result).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// formatGuardlockMessage
// ---------------------------------------------------------------------------

describe('formatGuardlockMessage', () => {
  const violations = [
    { field: 'problem', reason: 'workspace config (guardlock.restrictedFields)' },
    { field: 'analysis', reason: 'per-feature lock by marc: final decision' },
  ]

  it('uses block prefix for block mode', () => {
    const msg = formatGuardlockMessage(violations, 'block', false)
    expect(msg).toMatch(/Guardlock blocked/)
    expect(msg).toMatch(/2 protected field/)
  })

  it('uses warn prefix for warn mode', () => {
    const msg = formatGuardlockMessage(violations, 'warn', false)
    expect(msg).toMatch(/Guardlock warning/)
  })

  it('lists each violation field and reason', () => {
    const msg = formatGuardlockMessage(violations, 'warn', false)
    expect(msg).toMatch(/problem/)
    expect(msg).toMatch(/analysis/)
    expect(msg).toMatch(/workspace config/)
    expect(msg).toMatch(/marc/)
  })

  it('adds override hint in block mode when canOverride is true', () => {
    const msg = formatGuardlockMessage(violations, 'block', true)
    expect(msg).toMatch(/override: true/)
  })

  it('does not add override hint in warn mode', () => {
    const msg = formatGuardlockMessage(violations, 'warn', true)
    expect(msg).not.toMatch(/override/)
  })

  it('handles single violation', () => {
    const msg = formatGuardlockMessage([violations[0]!], 'block', false)
    expect(msg).toMatch(/1 protected field/)
  })
})

// ---------------------------------------------------------------------------
// loadGuardlockConfig — filesystem loading
// ---------------------------------------------------------------------------

describe('loadGuardlockConfig', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-guardlock-cfg-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('returns defaults when no lac.config.json found', () => {
    const config = loadGuardlockConfig(tmpDir)
    expect(config.mode).toBe('warn')
    expect(config.restrictedFields).toEqual([])
    expect(config.requireAlternatives).toBe(false)
    expect(config.freezeRequiresHumanRevision).toBe(false)
  })

  it('loads mode from lac.config.json', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ guardlock: { mode: 'block' } }),
      'utf-8',
    )
    const config = loadGuardlockConfig(tmpDir)
    expect(config.mode).toBe('block')
  })

  it('loads restrictedFields from lac.config.json', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ guardlock: { restrictedFields: ['problem', 'decisions'] } }),
      'utf-8',
    )
    const config = loadGuardlockConfig(tmpDir)
    expect(config.restrictedFields).toEqual(['problem', 'decisions'])
  })

  it('loads requireAlternatives from lac.config.json', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ guardlock: { requireAlternatives: true } }),
      'utf-8',
    )
    const config = loadGuardlockConfig(tmpDir)
    expect(config.requireAlternatives).toBe(true)
  })

  it('loads freezeRequiresHumanRevision from lac.config.json', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ guardlock: { freezeRequiresHumanRevision: true } }),
      'utf-8',
    )
    const config = loadGuardlockConfig(tmpDir)
    expect(config.freezeRequiresHumanRevision).toBe(true)
  })

  it('uses defaults for fields not specified in guardlock section', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ guardlock: { mode: 'off' } }),
      'utf-8',
    )
    const config = loadGuardlockConfig(tmpDir)
    expect(config.mode).toBe('off')
    expect(config.restrictedFields).toEqual([]) // default
    expect(config.requireAlternatives).toBe(false) // default
  })

  it('returns defaults when guardlock section is absent', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ domain: 'feat' }),
      'utf-8',
    )
    const config = loadGuardlockConfig(tmpDir)
    expect(config.mode).toBe('warn')
    expect(config.restrictedFields).toEqual([])
  })

  it('returns defaults when lac.config.json has invalid JSON', () => {
    writeFileSync(join(tmpDir, 'lac.config.json'), 'not valid json!!!', 'utf-8')
    const config = loadGuardlockConfig(tmpDir)
    expect(config.mode).toBe('warn')
    expect(config.restrictedFields).toEqual([])
  })

  it('finds lac.config.json in a parent directory', () => {
    writeFileSync(
      join(tmpDir, 'lac.config.json'),
      JSON.stringify({ guardlock: { mode: 'block' } }),
      'utf-8',
    )
    const subDir = join(tmpDir, 'feat-auth')
    mkdirSync(subDir, { recursive: true })
    const config = loadGuardlockConfig(subDir)
    expect(config.mode).toBe('block')
  })
})
