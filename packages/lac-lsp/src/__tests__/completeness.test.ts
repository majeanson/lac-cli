import { describe, expect, it } from 'vitest'

import { computeCompleteness } from '../lib/completeness.js'

describe('computeCompleteness', () => {
  it('returns 0 when no optional fields are filled', () => {
    expect(computeCompleteness({ featureKey: 'feat-2026-001', title: 'T', status: 'active', problem: 'P' })).toBe(0)
  })

  it('returns 100 when all optional fields are filled', () => {
    const feature = {
      featureKey: 'feat-2026-001',
      title: 'T',
      status: 'active',
      problem: 'P',
      analysis: 'Some analysis',
      decisions: [{ decision: 'Use X', rationale: 'Y' }],
      implementation: 'Some impl',
      knownLimitations: ['Limitation 1'],
      tags: ['api'],
      annotations: [{ id: '1', author: 'a', date: '2026-01-01', type: 'decision', body: 'b' }],
    }
    expect(computeCompleteness(feature)).toBe(100)
  })

  it('returns 50 when 3 of 6 optional fields are filled', () => {
    const feature = {
      analysis: 'Some analysis',
      implementation: 'Some impl',
      tags: ['api'],
    }
    expect(computeCompleteness(feature)).toBe(50)
  })

  it('returns 0 for empty arrays', () => {
    const feature = {
      decisions: [],
      tags: [],
      annotations: [],
    }
    expect(computeCompleteness(feature)).toBe(0)
  })

  it('returns 0 for empty string fields', () => {
    const feature = {
      analysis: '',
      implementation: '   ',
    }
    expect(computeCompleteness(feature)).toBe(0)
  })

  it('counts a non-empty array as filled', () => {
    const score = computeCompleteness({ tags: ['api'] })
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThan(100)
  })

  it('returns ~17 for 1 out of 6 optional fields', () => {
    const score = computeCompleteness({ analysis: 'Something' })
    // 1/6 = 16.67 → rounds to 17
    expect(score).toBe(17)
  })

  it('ignores non-optional fields (featureKey, title, etc.) in scoring', () => {
    // Only optional fields matter — extra unknown fields have no effect
    const base = computeCompleteness({ featureKey: 'feat-2026-001', title: 'T' })
    const withExtra = computeCompleteness({ featureKey: 'feat-2026-001', title: 'T', customField: 'value' })
    expect(base).toBe(withExtra)
  })
})
