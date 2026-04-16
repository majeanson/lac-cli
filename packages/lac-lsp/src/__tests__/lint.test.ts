import { describe, expect, it } from 'vitest'

import type { IndexedFeature } from '../indexer/types.js'
import { lintFeatures } from '../lib/lint.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIndexed(overrides: Partial<Record<string, unknown>> = {}, completeness = 0): IndexedFeature {
  const feature = {
    featureKey: 'feat-2026-001',
    title: 'Test Feature',
    status: 'active',
    problem: 'A well-defined problem',
    ...overrides,
  }
  return {
    feature: feature as unknown as IndexedFeature['feature'],
    filePath: '/workspace/feat-2026-001/feature.json',
    dir: '/workspace/feat-2026-001',
    completeness,
  }
}

// ---------------------------------------------------------------------------
// lintFeatures — status filtering
// ---------------------------------------------------------------------------

describe('lintFeatures — status filtering', () => {
  it('checks active features by default', () => {
    const report = lintFeatures([makeIndexed({ status: 'active' })])
    expect(report.checkedCount).toBe(1)
    expect(report.skippedCount).toBe(0)
  })

  it('checks draft features by default', () => {
    const report = lintFeatures([makeIndexed({ status: 'draft' })])
    expect(report.checkedCount).toBe(1)
    expect(report.skippedCount).toBe(0)
  })

  it('skips frozen features by default', () => {
    const report = lintFeatures([makeIndexed({ status: 'frozen' })])
    expect(report.checkedCount).toBe(0)
    expect(report.skippedCount).toBe(1)
  })

  it('skips deprecated features by default', () => {
    const report = lintFeatures([makeIndexed({ status: 'deprecated' })])
    expect(report.checkedCount).toBe(0)
    expect(report.skippedCount).toBe(1)
  })

  it('respects custom lintStatuses option', () => {
    const features = [
      makeIndexed({ status: 'frozen', featureKey: 'feat-2026-001' }),
      makeIndexed({ status: 'active', featureKey: 'feat-2026-002' }),
    ]
    const report = lintFeatures(features, { lintStatuses: ['frozen'] })
    expect(report.checkedCount).toBe(1)
    expect(report.skippedCount).toBe(1)
  })

  it('counts both checked and skipped correctly with mixed statuses', () => {
    const features = [
      makeIndexed({ status: 'active', featureKey: 'feat-2026-001' }),
      makeIndexed({ status: 'draft', featureKey: 'feat-2026-002' }),
      makeIndexed({ status: 'frozen', featureKey: 'feat-2026-003' }),
      makeIndexed({ status: 'deprecated', featureKey: 'feat-2026-004' }),
    ]
    const report = lintFeatures(features)
    expect(report.checkedCount).toBe(2)
    expect(report.skippedCount).toBe(2)
  })
})

// ---------------------------------------------------------------------------
// lintFeatures — required field checking
// ---------------------------------------------------------------------------

describe('lintFeatures — required field checking', () => {
  it('passes when all required fields are present', () => {
    const report = lintFeatures([makeIndexed()], { requiredFields: ['problem'] })
    expect(report.passes).toBe(1)
    expect(report.failures).toBe(0)
    expect(report.results[0]?.pass).toBe(true)
    expect(report.results[0]?.missingRequired).toHaveLength(0)
  })

  it('fails when required string field is empty', () => {
    const report = lintFeatures([makeIndexed({ problem: '' })], { requiredFields: ['problem'] })
    expect(report.failures).toBe(1)
    expect(report.results[0]?.missingRequired).toContain('problem')
  })

  it('fails when required string field is whitespace-only', () => {
    const report = lintFeatures([makeIndexed({ problem: '   ' })], { requiredFields: ['problem'] })
    expect(report.failures).toBe(1)
    expect(report.results[0]?.missingRequired).toContain('problem')
  })

  it('fails when required array field is empty', () => {
    const report = lintFeatures([makeIndexed({ decisions: [] })], { requiredFields: ['decisions'] })
    expect(report.results[0]?.missingRequired).toContain('decisions')
  })

  it('passes when required array field is non-empty', () => {
    const report = lintFeatures(
      [makeIndexed({ decisions: [{ decision: 'Use X', rationale: 'Y' }] })],
      { requiredFields: ['decisions'] },
    )
    expect(report.results[0]?.missingRequired).not.toContain('decisions')
  })

  it('reports multiple missing required fields', () => {
    const report = lintFeatures(
      [makeIndexed({ problem: '', analysis: '' })],
      { requiredFields: ['problem', 'analysis'] },
    )
    expect(report.results[0]?.missingRequired).toContain('problem')
    expect(report.results[0]?.missingRequired).toContain('analysis')
    expect(report.results[0]?.missingRequired).toHaveLength(2)
  })

  it('uses default requiredFields ["problem"] when not specified', () => {
    const report = lintFeatures([makeIndexed({ problem: '' })])
    expect(report.results[0]?.missingRequired).toContain('problem')
  })
})

// ---------------------------------------------------------------------------
// lintFeatures — completeness threshold
// ---------------------------------------------------------------------------

describe('lintFeatures — completeness threshold', () => {
  it('passes when threshold is 0 (disabled)', () => {
    const report = lintFeatures([makeIndexed({}, 0)], { threshold: 0 })
    expect(report.results[0]?.belowThreshold).toBe(false)
    expect(report.results[0]?.pass).toBe(true)
  })

  it('fails when completeness is below threshold', () => {
    const report = lintFeatures([makeIndexed({}, 20)], { threshold: 50 })
    expect(report.results[0]?.belowThreshold).toBe(true)
    expect(report.results[0]?.pass).toBe(false)
  })

  it('passes when completeness equals threshold', () => {
    const report = lintFeatures([makeIndexed({}, 50)], { threshold: 50 })
    expect(report.results[0]?.belowThreshold).toBe(false)
    expect(report.results[0]?.pass).toBe(true)
  })

  it('passes when completeness exceeds threshold', () => {
    const report = lintFeatures([makeIndexed({}, 100)], { threshold: 80 })
    expect(report.results[0]?.belowThreshold).toBe(false)
    expect(report.results[0]?.pass).toBe(true)
  })

  it('can fail on both missing required AND below threshold', () => {
    const report = lintFeatures(
      [makeIndexed({ problem: '' }, 10)],
      { requiredFields: ['problem'], threshold: 50 },
    )
    expect(report.results[0]?.missingRequired).toContain('problem')
    expect(report.results[0]?.belowThreshold).toBe(true)
    expect(report.results[0]?.pass).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// lintFeatures — pass/fail aggregation
// ---------------------------------------------------------------------------

describe('lintFeatures — pass/fail aggregation', () => {
  it('returns empty results for empty input', () => {
    const report = lintFeatures([])
    expect(report.results).toHaveLength(0)
    expect(report.failures).toBe(0)
    expect(report.passes).toBe(0)
    expect(report.checkedCount).toBe(0)
    expect(report.skippedCount).toBe(0)
  })

  it('correctly counts passes and failures across multiple features', () => {
    const features = [
      makeIndexed({ problem: 'defined', featureKey: 'feat-2026-001' }),  // pass
      makeIndexed({ problem: '', featureKey: 'feat-2026-002' }),           // fail
      makeIndexed({ problem: 'defined', featureKey: 'feat-2026-003' }),  // pass
    ]
    const report = lintFeatures(features, { requiredFields: ['problem'] })
    expect(report.passes).toBe(2)
    expect(report.failures).toBe(1)
  })

  it('result includes featureKey, filePath, status, completeness', () => {
    const report = lintFeatures([makeIndexed()])
    const r = report.results[0]!
    expect(r.featureKey).toBe('feat-2026-001')
    expect(r.filePath).toBe('/workspace/feat-2026-001/feature.json')
    expect(r.status).toBe('active')
    expect(typeof r.completeness).toBe('number')
  })
})
