import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { Feature } from '@life-as-code/feature-schema'
import { FIELD_DEFAULTS, checkFeature, fixFeature } from '../lint.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFeature(overrides: Partial<Record<string, unknown>> = {}): Feature {
  return {
    featureKey: 'feat-2026-001',
    title: 'Test feature',
    status: 'active',
    problem: 'A well-defined problem',
    ...overrides,
  } as unknown as Feature
}

// ---------------------------------------------------------------------------
// checkFeature — required fields
// ---------------------------------------------------------------------------

describe('checkFeature — required fields', () => {
  it('passes when all required fields are present', () => {
    const result = checkFeature(makeFeature(), 'path', ['problem'], 0, false)
    expect(result.pass).toBe(true)
    expect(result.missingRequired).toHaveLength(0)
  })

  it('fails when a required string field is empty', () => {
    const result = checkFeature(makeFeature({ problem: '' }), 'path', ['problem'], 0, false)
    expect(result.pass).toBe(false)
    expect(result.missingRequired).toContain('problem')
  })

  it('fails when a required string field is whitespace-only', () => {
    const result = checkFeature(makeFeature({ problem: '   ' }), 'path', ['problem'], 0, false)
    expect(result.pass).toBe(false)
    expect(result.missingRequired).toContain('problem')
  })

  it('fails when a required array field is empty', () => {
    const result = checkFeature(makeFeature({ decisions: [] }), 'path', ['decisions'], 0, false)
    expect(result.pass).toBe(false)
    expect(result.missingRequired).toContain('decisions')
  })

  it('fails when a required field is missing (undefined)', () => {
    const f = makeFeature()
    const raw = f as unknown as Record<string, unknown>
    delete raw['problem']
    const result = checkFeature(f, 'path', ['problem'], 0, false)
    expect(result.missingRequired).toContain('problem')
  })

  it('reports multiple missing required fields', () => {
    const result = checkFeature(
      makeFeature({ problem: '', analysis: '' }),
      'path',
      ['problem', 'analysis'],
      0,
      false,
    )
    expect(result.missingRequired).toContain('problem')
    expect(result.missingRequired).toContain('analysis')
    expect(result.missingRequired).toHaveLength(2)
  })

  it('passes when required array field is non-empty', () => {
    const result = checkFeature(
      makeFeature({ decisions: [{ decision: 'Use X', rationale: 'Good' }] }),
      'path',
      ['decisions'],
      0,
      false,
    )
    expect(result.missingRequired).not.toContain('decisions')
  })

  it('ignores fields not in requiredFields list', () => {
    const result = checkFeature(makeFeature({ analysis: '' }), 'path', ['problem'], 0, false)
    expect(result.pass).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// checkFeature — completeness threshold
// ---------------------------------------------------------------------------

describe('checkFeature — completeness threshold', () => {
  it('passes when threshold is 0 (disabled)', () => {
    const result = checkFeature(makeFeature(), 'path', [], 0, false)
    expect(result.belowThreshold).toBe(false)
  })

  it('fails when completeness is below threshold', () => {
    // No optional fields filled → 0% completeness
    const result = checkFeature(makeFeature(), 'path', [], 50, false)
    expect(result.belowThreshold).toBe(true)
    expect(result.pass).toBe(false)
  })

  it('passes when completeness equals threshold', () => {
    // Fill 3 of 6 optional fields (50%)
    const result = checkFeature(
      makeFeature({ analysis: 'Some analysis', implementation: 'Some impl', tags: ['api'] }),
      'path',
      [],
      50,
      false,
    )
    expect(result.belowThreshold).toBe(false)
    expect(result.pass).toBe(true)
  })

  it('passes when completeness exceeds threshold', () => {
    // Fill all 6 optional fields (100%)
    const result = checkFeature(
      makeFeature({
        analysis: 'a',
        decisions: [{ decision: 'x', rationale: 'y' }],
        implementation: 'i',
        knownLimitations: ['l'],
        tags: ['t'],
        annotations: [{ id: '1', author: 'a', date: '2026-01-01', type: 'note', body: 'b' }],
      }),
      'path',
      [],
      80,
      false,
    )
    expect(result.belowThreshold).toBe(false)
    expect(result.completeness).toBe(100)
  })

  it('can fail on both missing required AND below threshold', () => {
    const result = checkFeature(makeFeature({ problem: '' }), 'path', ['problem'], 50, false)
    expect(result.missingRequired).toContain('problem')
    expect(result.belowThreshold).toBe(true)
    expect(result.pass).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// checkFeature — revision warnings
// ---------------------------------------------------------------------------

describe('checkFeature — revision warnings', () => {
  it('emits no warning when revisionWarnings is false', () => {
    const result = checkFeature(
      makeFeature({ analysis: 'Some analysis', revisions: [] }),
      'path',
      [],
      0,
      false, // revisionWarnings off
    )
    expect(result.warnings).toHaveLength(0)
  })

  it('emits warning when intent-critical fields filled but no revisions', () => {
    const result = checkFeature(
      makeFeature({ analysis: 'Some analysis', revisions: [] }),
      'path',
      [],
      0,
      true, // revisionWarnings on
    )
    expect(result.warnings.some((w) => w.includes('no revisions recorded'))).toBe(true)
    expect(result.warnings.some((w) => w.includes('analysis'))).toBe(true)
  })

  it('lists all filled critical fields in warning', () => {
    const result = checkFeature(
      makeFeature({
        problem: 'test',
        analysis: 'Some analysis',
        implementation: 'Some impl',
        revisions: [],
      }),
      'path',
      [],
      0,
      true,
    )
    const warning = result.warnings.find((w) => w.includes('no revisions recorded')) ?? ''
    expect(warning).toMatch(/analysis/)
    expect(warning).toMatch(/implementation/)
  })

  it('emits no revision warning when revisions array is non-empty', () => {
    const result = checkFeature(
      makeFeature({
        analysis: 'Some analysis',
        revisions: [{ date: '2026-01-01', author: 'marc', fields: ['analysis'], summary: 'done' }],
      }),
      'path',
      [],
      0,
      true,
    )
    expect(result.warnings.some((w) => w.includes('no revisions recorded'))).toBe(false)
  })

  it('emits no revision warning when no critical fields are filled', () => {
    // All INTENT_CRITICAL_FIELDS (including problem) are empty/unset
    const result = checkFeature(makeFeature({ problem: '' }), 'path', [], 0, true)
    expect(result.warnings.some((w) => w.includes('no revisions recorded'))).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// checkFeature — alternativesConsidered
// ---------------------------------------------------------------------------

describe('checkFeature — requireAlternatives', () => {
  it('emits warning for decisions missing alternativesConsidered when enabled', () => {
    const result = checkFeature(
      makeFeature({ decisions: [{ decision: 'Use OAuth', rationale: 'Standard' }] }),
      'path',
      [],
      0,
      false,
      true, // requireAlternatives
    )
    expect(result.warnings.some((w) => w.includes('alternativesConsidered'))).toBe(true)
  })

  it('emits no warning when all decisions have alternativesConsidered', () => {
    const result = checkFeature(
      makeFeature({
        decisions: [{ decision: 'Use OAuth', rationale: 'Standard', alternativesConsidered: ['Basic auth'] }],
      }),
      'path',
      [],
      0,
      false,
      true,
    )
    expect(result.warnings.some((w) => w.includes('alternativesConsidered'))).toBe(false)
  })

  it('emits no warning when requireAlternatives is false', () => {
    const result = checkFeature(
      makeFeature({ decisions: [{ decision: 'Use OAuth', rationale: 'Standard' }] }),
      'path',
      [],
      0,
      false,
      false,
    )
    expect(result.warnings.some((w) => w.includes('alternativesConsidered'))).toBe(false)
  })

  it('counts how many decisions are missing in warning message', () => {
    const result = checkFeature(
      makeFeature({
        decisions: [
          { decision: 'Use OAuth', rationale: 'Standard' },
          { decision: 'Use Postgres', rationale: 'Reliable' },
        ],
      }),
      'path',
      [],
      0,
      false,
      true,
    )
    const warning = result.warnings.find((w) => w.includes('alternativesConsidered')) ?? ''
    expect(warning).toMatch(/2 decision/)
  })
})

// ---------------------------------------------------------------------------
// checkFeature — featureLocked + supersession warnings
// ---------------------------------------------------------------------------

describe('checkFeature — featureLocked and supersession warnings', () => {
  it('warns when featureLocked but no decisions', () => {
    const result = checkFeature(
      makeFeature({ featureLocked: true }),
      'path',
      [],
      0,
      false,
    )
    expect(result.warnings.some((w) => w.includes('featureLocked'))).toBe(true)
  })

  it('does not warn featureLocked when decisions exist', () => {
    const result = checkFeature(
      makeFeature({ featureLocked: true, decisions: [{ decision: 'Use X', rationale: 'y' }] }),
      'path',
      [],
      0,
      false,
    )
    expect(result.warnings.some((w) => w.includes('featureLocked') && w.includes('no decisions'))).toBe(false)
  })

  it('warns when superseded_by is set but status is not deprecated', () => {
    const result = checkFeature(
      makeFeature({ superseded_by: 'feat-2026-002', status: 'active' }),
      'path',
      [],
      0,
      false,
    )
    expect(result.warnings.some((w) => w.includes('superseded_by'))).toBe(true)
  })

  it('does not warn superseded_by when status is deprecated', () => {
    const result = checkFeature(
      makeFeature({ superseded_by: 'feat-2026-002', status: 'deprecated' }),
      'path',
      [],
      0,
      false,
    )
    expect(result.warnings.some((w) => w.includes('superseded_by'))).toBe(false)
  })

  it('warns when merged_into is set but status is not deprecated', () => {
    const result = checkFeature(
      makeFeature({ merged_into: 'feat-2026-003', status: 'draft' }),
      'path',
      [],
      0,
      false,
    )
    expect(result.warnings.some((w) => w.includes('merged_into'))).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// checkFeature — return shape
// ---------------------------------------------------------------------------

describe('checkFeature — return shape', () => {
  it('returns featureKey, filePath, status, completeness', () => {
    const result = checkFeature(makeFeature(), '/some/path/feature.json', [], 0, false)
    expect(result.featureKey).toBe('feat-2026-001')
    expect(result.filePath).toBe('/some/path/feature.json')
    expect(result.status).toBe('active')
    expect(typeof result.completeness).toBe('number')
  })
})

// ---------------------------------------------------------------------------
// fixFeature
// ---------------------------------------------------------------------------

describe('fixFeature', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = join(tmpdir(), `lac-lint-fix-test-${Date.now()}`)
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeFeat(obj: Record<string, unknown>): string {
    const p = join(tmpDir, 'feature.json')
    writeFileSync(p, JSON.stringify(obj), 'utf-8')
    return p
  }

  it('returns 0 when missingFields is empty', async () => {
    const p = writeFeat({ featureKey: 'feat-2026-001', title: 'T', status: 'active', problem: 'P' })
    const count = await fixFeature(p, [])
    expect(count).toBe(0)
  })

  it('inserts default value for missing problem field', async () => {
    const p = writeFeat({ featureKey: 'feat-2026-001', title: 'T', status: 'active', problem: 'P' })
    const count = await fixFeature(p, ['problem'])
    // problem already exists — but fixFeature still sets it; returns 1 because field is in FIELD_DEFAULTS
    expect(count).toBe(1)
    const written = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
    expect(written.problem).toBe(FIELD_DEFAULTS['problem'])
  })

  it('inserts default for tags (array field)', async () => {
    const p = writeFeat({ featureKey: 'feat-2026-001', title: 'T', status: 'active', problem: 'P' })
    const count = await fixFeature(p, ['tags'])
    expect(count).toBe(1)
    const written = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
    expect(written.tags).toEqual([])
  })

  it('returns 0 for fields not in FIELD_DEFAULTS', async () => {
    const p = writeFeat({ featureKey: 'feat-2026-001', title: 'T', status: 'active', problem: 'P' })
    const count = await fixFeature(p, ['unknownField'])
    expect(count).toBe(0)
  })

  it('returns 0 when file does not exist', async () => {
    const count = await fixFeature(join(tmpDir, 'nonexistent.json'), ['problem'])
    expect(count).toBe(0)
  })

  it('returns 0 when file contains invalid JSON', async () => {
    const p = join(tmpDir, 'feature.json')
    writeFileSync(p, 'not json!', 'utf-8')
    const count = await fixFeature(p, ['problem'])
    expect(count).toBe(0)
  })

  it('fixes multiple fields in one call', async () => {
    const p = writeFeat({ featureKey: 'feat-2026-001', title: 'T', status: 'active', problem: 'P' })
    const count = await fixFeature(p, ['problem', 'tags', 'decisions'])
    expect(count).toBe(3)
    const written = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>
    expect(written.tags).toEqual([])
    expect(written.decisions).toEqual([])
  })

  it('writes valid JSON after fix', async () => {
    const p = writeFeat({ featureKey: 'feat-2026-001', title: 'T', status: 'active', problem: 'P' })
    await fixFeature(p, ['problem'])
    const raw = readFileSync(p, 'utf-8')
    expect(() => JSON.parse(raw)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// FIELD_DEFAULTS
// ---------------------------------------------------------------------------

describe('FIELD_DEFAULTS', () => {
  it('has a non-empty default for problem', () => {
    expect(typeof FIELD_DEFAULTS['problem']).toBe('string')
    expect((FIELD_DEFAULTS['problem'] as string).length).toBeGreaterThan(0)
  })

  it('has empty array defaults for array fields', () => {
    expect(FIELD_DEFAULTS['decisions']).toEqual([])
    expect(FIELD_DEFAULTS['tags']).toEqual([])
    expect(FIELD_DEFAULTS['knownLimitations']).toEqual([])
  })
})
