import { describe, expect, it } from 'vitest'

import type { Feature } from '@life-as-code/feature-schema'
import { computeStats } from '../stat.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides: Partial<Record<string, unknown>> = {}): { feature: Feature } {
  return {
    feature: {
      featureKey: 'feat-2026-001',
      title: 'Test Feature',
      status: 'active',
      problem: 'A test problem',
      ...overrides,
    } as unknown as Feature,
  }
}

// ---------------------------------------------------------------------------
// computeStats — totals
// ---------------------------------------------------------------------------

describe('computeStats — totals', () => {
  it('returns 0 total for empty features array', () => {
    const result = computeStats([])
    expect(result.total).toBe(0)
    expect(result.avgCompleteness).toBe(0)
  })

  it('counts total correctly', () => {
    const features = [
      makeFeature({ featureKey: 'feat-2026-001' }),
      makeFeature({ featureKey: 'feat-2026-002' }),
      makeFeature({ featureKey: 'feat-2026-003' }),
    ]
    const result = computeStats(features)
    expect(result.total).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// computeStats — status breakdown
// ---------------------------------------------------------------------------

describe('computeStats — status breakdown', () => {
  it('counts each status correctly', () => {
    const features = [
      makeFeature({ featureKey: 'feat-2026-001', status: 'active' }),
      makeFeature({ featureKey: 'feat-2026-002', status: 'active' }),
      makeFeature({ featureKey: 'feat-2026-003', status: 'draft' }),
      makeFeature({ featureKey: 'feat-2026-004', status: 'frozen' }),
      makeFeature({ featureKey: 'feat-2026-005', status: 'deprecated' }),
    ]
    const result = computeStats(features)
    expect(result.statusBreakdown['active']).toBe(2)
    expect(result.statusBreakdown['draft']).toBe(1)
    expect(result.statusBreakdown['frozen']).toBe(1)
    expect(result.statusBreakdown['deprecated']).toBe(1)
  })

  it('shows 0 for statuses with no features', () => {
    const result = computeStats([makeFeature({ status: 'active' })])
    expect(result.statusBreakdown['draft']).toBe(0)
    expect(result.statusBreakdown['frozen']).toBe(0)
    expect(result.statusBreakdown['deprecated']).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeStats — avgCompleteness
// ---------------------------------------------------------------------------

describe('computeStats — avgCompleteness', () => {
  it('computes average completeness across features', () => {
    // 1 feature with 100% completeness (all 6 optional fields), 1 with 0%
    const features = [
      makeFeature({
        featureKey: 'feat-2026-001',
        analysis: 'a',
        decisions: [{ decision: 'x', rationale: 'y' }],
        implementation: 'i',
        knownLimitations: ['l'],
        tags: ['t'],
        annotations: [{ id: '1', author: 'a', date: '2026-01-01', type: 'note', body: 'b' }],
      }),
      makeFeature({ featureKey: 'feat-2026-002' }), // 0%
    ]
    const result = computeStats(features)
    // (100 + 0) / 2 = 50
    expect(result.avgCompleteness).toBe(50)
  })

  it('returns 0 when no features have any optional fields', () => {
    const result = computeStats([
      makeFeature({ featureKey: 'feat-2026-001' }),
      makeFeature({ featureKey: 'feat-2026-002' }),
    ])
    expect(result.avgCompleteness).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// computeStats — zeroDecisions / zeroTags
// ---------------------------------------------------------------------------

describe('computeStats — zeroDecisions and zeroTags', () => {
  it('counts features with no decisions', () => {
    const features = [
      makeFeature({ featureKey: 'feat-2026-001', decisions: [] }),
      makeFeature({ featureKey: 'feat-2026-002', decisions: [{ decision: 'Use X', rationale: 'Y' }] }),
    ]
    const result = computeStats(features)
    expect(result.zeroDecisions).toBe(1)
  })

  it('counts features with no tags', () => {
    const features = [
      makeFeature({ featureKey: 'feat-2026-001', tags: [] }),
      makeFeature({ featureKey: 'feat-2026-002', tags: ['api'] }),
      makeFeature({ featureKey: 'feat-2026-003' }), // no tags field
    ]
    const result = computeStats(features)
    expect(result.zeroTags).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// computeStats — topTags ordering
// ---------------------------------------------------------------------------

describe('computeStats — topTags ordering', () => {
  it('returns top 5 tags ordered by count descending', () => {
    const features = [
      makeFeature({ featureKey: 'feat-2026-001', tags: ['api', 'auth', 'security'] }),
      makeFeature({ featureKey: 'feat-2026-002', tags: ['api', 'auth'] }),
      makeFeature({ featureKey: 'feat-2026-003', tags: ['api', 'billing'] }),
      makeFeature({ featureKey: 'feat-2026-004', tags: ['security'] }),
    ]
    const result = computeStats(features)
    // api: 3, auth: 2, security: 2, billing: 1
    expect(result.topTags[0]![0]).toBe('api')
    expect(result.topTags[0]![1]).toBe(3)
    // auth and security both have 2 — order between them is stable but either is valid
    const secondAndThird = [result.topTags[1]![0], result.topTags[2]![0]]
    expect(secondAndThird).toContain('auth')
    expect(secondAndThird).toContain('security')
  })

  it('returns at most 5 tags', () => {
    const features = Array.from({ length: 7 }, (_, i) =>
      makeFeature({ featureKey: `feat-2026-00${i + 1}`, tags: [`tag${i}`] }),
    )
    const result = computeStats(features)
    expect(result.topTags.length).toBeLessThanOrEqual(5)
  })

  it('returns empty topTags when no features have tags', () => {
    const result = computeStats([makeFeature()])
    expect(result.topTags).toHaveLength(0)
  })

  it('counts tags across multiple features correctly', () => {
    const features = [
      makeFeature({ featureKey: 'feat-2026-001', tags: ['api'] }),
      makeFeature({ featureKey: 'feat-2026-002', tags: ['api'] }),
      makeFeature({ featureKey: 'feat-2026-003', tags: ['api'] }),
    ]
    const result = computeStats(features)
    expect(result.topTags[0]).toEqual(['api', 3])
  })
})
