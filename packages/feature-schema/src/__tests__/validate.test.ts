import { describe, expect, it } from 'vitest'

import { validateFeature } from '../validate.js'

const VALID_FEATURE = {
  featureKey: 'feat-2026-001',
  title: 'Test Feature',
  status: 'active',
  problem: 'A test problem statement',
}

describe('validateFeature', () => {
  it('accepts a valid minimal feature', () => {
    const result = validateFeature(VALID_FEATURE)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.featureKey).toBe('feat-2026-001')
      expect(result.data.status).toBe('active')
    }
  })

  it('accepts all valid statuses', () => {
    for (const status of ['draft', 'active', 'frozen', 'deprecated']) {
      const result = validateFeature({ ...VALID_FEATURE, status })
      expect(result.success).toBe(true)
    }
  })

  it('rejects missing featureKey', () => {
    const { featureKey: _k, ...rest } = VALID_FEATURE
    const result = validateFeature(rest)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.includes('featureKey'))).toBe(true)
    }
  })

  it('rejects invalid featureKey pattern', () => {
    const result = validateFeature({ ...VALID_FEATURE, featureKey: 'invalid-key' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some((e) => e.toLowerCase().includes('featurekey') || e.includes('pattern') || e.includes('match'))).toBe(true)
    }
  })

  it('rejects invalid status', () => {
    const result = validateFeature({ ...VALID_FEATURE, status: 'archived' })
    expect(result.success).toBe(false)
  })

  it('rejects missing title', () => {
    const { title: _t, ...rest } = VALID_FEATURE
    const result = validateFeature(rest)
    expect(result.success).toBe(false)
  })

  it('rejects missing problem', () => {
    const { problem: _p, ...rest } = VALID_FEATURE
    const result = validateFeature(rest)
    expect(result.success).toBe(false)
  })

  it('accepts optional fields', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      analysis: 'Some analysis',
      implementation: 'How it works',
      tags: ['api', 'auth'],
      decisions: [
        {
          decision: 'Use JWT tokens',
          rationale: 'Stateless and widely supported',
          date: '2026-01-15',
        },
      ],
      knownLimitations: ['Limited to 10 requests per second'],
      annotations: [
        {
          id: 'ann-001',
          author: 'marc',
          date: '2026-01-15',
          type: 'decision',
          body: 'Decided to use JWT',
        },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects non-object input', () => {
    expect(validateFeature(null).success).toBe(false)
    expect(validateFeature('string').success).toBe(false)
    expect(validateFeature(42).success).toBe(false)
    expect(validateFeature([]).success).toBe(false)
  })

  it('accepts all annotation types', () => {
    const types = ['decision', 'warning', 'assumption', 'lesson', 'breaking-change', 'question', 'tech-debt']
    for (const type of types) {
      const result = validateFeature({
        ...VALID_FEATURE,
        annotations: [{ id: 'ann-1', author: 'test', date: '2026-01-01', type, body: 'Test' }],
      })
      expect(result.success).toBe(true)
    }
  })

  it('accepts valid featureKey patterns', () => {
    const validKeys = ['feat-2026-001', 'proc-2024-999', 'goal-2025-100', 'adr-2026-001']
    for (const key of validKeys) {
      const result = validateFeature({ ...VALID_FEATURE, featureKey: key })
      expect(result.success).toBe(true)
    }
  })
})
