import { describe, expect, it } from 'vitest'

import { VIEWS, applyView, applyViewForHtml } from '../views.js'

const feature: Record<string, unknown> = {
  featureKey: 'feat-2026-001',
  title: 'Auth System',
  status: 'active',
  domain: 'feat',
  schemaVersion: 2,
  owner: 'marc',
  priority: 'high',
  problem: 'Users cannot log in.',
  analysis: 'Need OAuth2.',
  implementation: 'Use Passport.js.',
  userGuide: 'Click login.',
  successCriteria: 'Users can log in.',
  decisions: [{ decision: 'OAuth2', rationale: 'Standard' }],
  knownLimitations: ['No SSO yet'],
  tags: ['auth', 'api'],
  annotations: [],
  lineage: { parent: null, children: [] },
  statusHistory: [],
  revisions: [],
  componentFile: 'src/auth.ts',
  npmPackages: ['passport'],
  publicInterface: 'login()',
  externalDependencies: ['Google OAuth'],
  codeSnippets: [{ label: 'login', code: '...' }],
  lastVerifiedDate: '2026-01-01',
  superseded_by: null,
  superseded_from: null,
  merged_into: null,
  merged_from: null,
}

// ---------------------------------------------------------------------------
// applyView
// ---------------------------------------------------------------------------

describe('applyView', () => {
  it('user view: only includes user-facing fields', () => {
    const result = applyView(feature, VIEWS.user)
    expect(result).toHaveProperty('title')
    expect(result).toHaveProperty('problem')
    expect(result).toHaveProperty('userGuide')
    expect(result).toHaveProperty('successCriteria')
    expect(result).toHaveProperty('tags')
    // identity & internal fields excluded
    expect(result).not.toHaveProperty('featureKey')
    expect(result).not.toHaveProperty('implementation')
    expect(result).not.toHaveProperty('analysis')
    expect(result).not.toHaveProperty('decisions')
  })

  it('support view: includes identity + knownLimitations + annotations', () => {
    const result = applyView(feature, VIEWS.support)
    expect(result).toHaveProperty('featureKey')
    expect(result).toHaveProperty('knownLimitations')
    expect(result).toHaveProperty('annotations')
    expect(result).not.toHaveProperty('implementation')
    expect(result).not.toHaveProperty('codeSnippets')
  })

  it('product view: includes decisions but not implementation details', () => {
    const result = applyView(feature, VIEWS.product)
    expect(result).toHaveProperty('decisions')
    expect(result).toHaveProperty('analysis')
    expect(result).not.toHaveProperty('implementation')
    expect(result).not.toHaveProperty('codeSnippets')
    expect(result).not.toHaveProperty('componentFile')
  })

  it('dev view: includes code-level fields', () => {
    const result = applyView(feature, VIEWS.dev)
    expect(result).toHaveProperty('implementation')
    expect(result).toHaveProperty('codeSnippets')
    expect(result).toHaveProperty('componentFile')
    expect(result).toHaveProperty('npmPackages')
    // history fields excluded in dev view
    expect(result).not.toHaveProperty('statusHistory')
    expect(result).not.toHaveProperty('revisions')
  })

  it('tech view: includes all fields', () => {
    const result = applyView(feature, VIEWS.tech)
    expect(result).toHaveProperty('statusHistory')
    expect(result).toHaveProperty('revisions')
    expect(result).toHaveProperty('superseded_by')
    expect(result).toHaveProperty('merged_into')
    expect(result).toHaveProperty('schemaVersion')
  })

  it('strips fields not in the view set', () => {
    const extended = { ...feature, internalDebugFlag: true }
    const result = applyView(extended, VIEWS.user)
    expect(result).not.toHaveProperty('internalDebugFlag')
  })

  it('returns empty object for feature with no matching fields', () => {
    const minimal = { internalDebugFlag: true }
    const result = applyView(minimal, VIEWS.user)
    expect(Object.keys(result)).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// applyViewForHtml
// ---------------------------------------------------------------------------

describe('applyViewForHtml', () => {
  it('always includes nav fields even when not in view', () => {
    // user view excludes featureKey, status, domain normally
    const result = applyViewForHtml(feature, VIEWS.user)
    expect(result).toHaveProperty('featureKey')
    expect(result).toHaveProperty('status')
    expect(result).toHaveProperty('domain')
  })

  it('preserves lineage for nav even in restricted views', () => {
    const result = applyViewForHtml(feature, VIEWS.support)
    expect(result).toHaveProperty('lineage')
  })

  it('still excludes non-view, non-nav fields', () => {
    const result = applyViewForHtml(feature, VIEWS.user)
    expect(result).not.toHaveProperty('implementation')
    expect(result).not.toHaveProperty('codeSnippets')
  })

  it('produces a superset of applyView', () => {
    const viewResult = applyView(feature, VIEWS.user)
    const htmlResult = applyViewForHtml(feature, VIEWS.user)
    for (const key of Object.keys(viewResult)) {
      expect(htmlResult).toHaveProperty(key)
    }
    // html result has at least as many keys
    expect(Object.keys(htmlResult).length).toBeGreaterThanOrEqual(Object.keys(viewResult).length)
  })
})
