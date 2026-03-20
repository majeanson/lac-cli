import { describe, expect, it } from 'vitest'

import { validateFeature } from '../validate.js'

const VALID_FEATURE = {
  featureKey: 'feat-2026-001',
  title: 'My Feature',
  status: 'draft',
  problem: 'This is the problem statement.',
}

describe('validateFeature', () => {
  it('accepts a valid minimal feature', () => {
    const result = validateFeature(VALID_FEATURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.featureKey).toBe('feat-2026-001')
      expect(result.data.title).toBe('My Feature')
      expect(result.data.status).toBe('draft')
    }
  })

  it('accepts all valid statuses', () => {
    for (const status of ['draft', 'active', 'frozen', 'deprecated'] as const) {
      const result = validateFeature({ ...VALID_FEATURE, status })
      expect(result.success, `status ${status} should be valid`).toBe(true)
    }
  })

  it('rejects missing featureKey', () => {
    const { featureKey: _omitted, ...rest } = VALID_FEATURE
    const result = validateFeature(rest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('featureKey') || e.includes('Required'))).toBe(true)
    }
  })

  it('rejects missing title', () => {
    const { title: _omitted, ...rest } = VALID_FEATURE
    const result = validateFeature(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing status', () => {
    const { status: _omitted, ...rest } = VALID_FEATURE
    const result = validateFeature(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing problem', () => {
    const { problem: _omitted, ...rest } = VALID_FEATURE
    const result = validateFeature(rest)
    expect(result.success).toBe(false)
  })

  it('rejects bad featureKey pattern — no year', () => {
    const result = validateFeature({ ...VALID_FEATURE, featureKey: 'feat-001' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.toLowerCase().includes('featurekey') || e.includes('featureKey'))).toBe(true)
    }
  })

  it('rejects bad featureKey pattern — uppercase domain', () => {
    const result = validateFeature({ ...VALID_FEATURE, featureKey: 'Feat-2026-001' })
    expect(result.success).toBe(false)
  })

  it('rejects bad featureKey pattern — missing NNN part', () => {
    const result = validateFeature({ ...VALID_FEATURE, featureKey: 'feat-2026' })
    expect(result.success).toBe(false)
  })

  it('rejects bad featureKey pattern — 2-digit NNN', () => {
    const result = validateFeature({ ...VALID_FEATURE, featureKey: 'feat-2026-01' })
    expect(result.success).toBe(false)
  })

  it('accepts featureKey with alternate domain prefix', () => {
    const result = validateFeature({ ...VALID_FEATURE, featureKey: 'proc-2026-001' })
    expect(result.success).toBe(true)
  })

  it('accepts optional owner field', () => {
    const result = validateFeature({ ...VALID_FEATURE, owner: 'marc' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.owner).toBe('marc')
    }
  })

  it('accepts optional analysis field', () => {
    const result = validateFeature({ ...VALID_FEATURE, analysis: 'Deep analysis here.' })
    expect(result.success).toBe(true)
  })

  it('accepts optional implementation field', () => {
    const result = validateFeature({ ...VALID_FEATURE, implementation: 'Use X pattern.' })
    expect(result.success).toBe(true)
  })

  it('accepts optional knownLimitations array', () => {
    const result = validateFeature({ ...VALID_FEATURE, knownLimitations: ['limit A', 'limit B'] })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.knownLimitations).toEqual(['limit A', 'limit B'])
    }
  })

  it('accepts optional tags array', () => {
    const result = validateFeature({ ...VALID_FEATURE, tags: ['auth', 'security'] })
    expect(result.success).toBe(true)
  })

  it('accepts optional annotations array', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      annotations: [
        {
          id: 'ann-1',
          author: 'marc',
          date: '2026-01-01',
          type: 'decision',
          body: 'We decided to use X.',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid annotation type', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      annotations: [
        {
          id: 'ann-1',
          author: 'marc',
          date: '2026-01-01',
          type: 'invalid-type',
          body: 'body',
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional lineage with parent and children', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      lineage: {
        parent: 'feat-2025-001',
        children: ['feat-2026-002'],
        spawnReason: 'needed specialisation',
      },
    })
    expect(result.success).toBe(true)
  })

  it('accepts optional decisions array', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      decisions: [
        {
          decision: 'Use event sourcing',
          rationale: 'Better auditability',
          date: '2026-01-15',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('returns structured errors array on failure', () => {
    const result = validateFeature({ featureKey: 'bad', title: '', status: 'unknown', problem: 'ok' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(Array.isArray(result.errors)).toBe(true)
      expect(result.errors.length).toBeGreaterThan(0)
    }
  })
})
