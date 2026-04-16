import { describe, expect, it } from 'vitest'

import type { Feature } from '@life-as-code/feature-schema'
import { DEFAULT_SEARCH_FIELDS, matchFeature } from '../search.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides: Partial<Record<string, unknown>> = {}): Feature {
  return {
    featureKey: 'feat-2026-001',
    title: 'Authentication flow',
    status: 'active',
    problem: 'Users need to log in securely',
    ...overrides,
  } as unknown as Feature
}

// ---------------------------------------------------------------------------
// matchFeature — basic field matching
// ---------------------------------------------------------------------------

describe('matchFeature — basic field matching', () => {
  it('matches by title (case-insensitive)', () => {
    const f = makeFeature({ title: 'Authentication Flow' })
    expect(matchFeature(f, 'authentication', DEFAULT_SEARCH_FIELDS)).toBe(true)
    expect(matchFeature(f, 'AUTHENTICATION', DEFAULT_SEARCH_FIELDS)).toBe(true)
  })

  it('matches by problem field', () => {
    const f = makeFeature({ problem: 'Users cannot RESET their password' })
    expect(matchFeature(f, 'reset', DEFAULT_SEARCH_FIELDS)).toBe(true)
  })

  it('matches by featureKey', () => {
    const f = makeFeature({ featureKey: 'feat-2026-001' })
    expect(matchFeature(f, 'feat-2026-001', DEFAULT_SEARCH_FIELDS)).toBe(true)
  })

  it('matches in analysis field', () => {
    const f = makeFeature({ analysis: 'OAuth2 is the standard protocol' })
    expect(matchFeature(f, 'oauth2', DEFAULT_SEARCH_FIELDS)).toBe(true)
  })

  it('matches within a tags array', () => {
    const f = makeFeature({ tags: ['authentication', 'security'] })
    expect(matchFeature(f, 'security', DEFAULT_SEARCH_FIELDS)).toBe(true)
  })

  it('returns false when query not found in any field', () => {
    const f = makeFeature()
    expect(matchFeature(f, 'xyznotfound', DEFAULT_SEARCH_FIELDS)).toBe(false)
  })

  it('returns false for empty feature with no matching content', () => {
    const f = makeFeature({ title: 'A', problem: 'B' })
    expect(matchFeature(f, 'quantum', DEFAULT_SEARCH_FIELDS)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchFeature — custom searchFields (--field option)
// ---------------------------------------------------------------------------

describe('matchFeature — custom searchFields', () => {
  it('only searches the specified field', () => {
    const f = makeFeature({ title: 'OAuth Login', problem: 'Users cannot log in' })
    // Searching only "problem" — "oauth" in title should NOT match
    expect(matchFeature(f, 'oauth', ['problem'])).toBe(false)
    // But "log in" in problem SHOULD match
    expect(matchFeature(f, 'log in', ['problem'])).toBe(true)
  })

  it('matches when the specified field contains the query', () => {
    const f = makeFeature({ analysis: 'We chose JWT for stateless auth' })
    expect(matchFeature(f, 'jwt', ['analysis'])).toBe(true)
  })

  it('returns false when the specified field is absent', () => {
    const f = makeFeature() // no analysis field
    expect(matchFeature(f, 'anything', ['analysis'])).toBe(false)
  })

  it('searches multiple custom fields', () => {
    const f = makeFeature({ title: 'Dashboard', problem: 'Metrics are unavailable' })
    expect(matchFeature(f, 'metrics', ['title', 'problem'])).toBe(true)
    expect(matchFeature(f, 'dashboard', ['title', 'problem'])).toBe(true)
    expect(matchFeature(f, 'oauth', ['title', 'problem'])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// matchFeature — special characters in query
// ---------------------------------------------------------------------------

describe('matchFeature — special characters', () => {
  it('handles dots in query without regex issues', () => {
    const f = makeFeature({ title: 'v2.0 API' })
    expect(matchFeature(f, 'v2.0', DEFAULT_SEARCH_FIELDS)).toBe(true)
  })

  it('handles parentheses in query', () => {
    const f = makeFeature({ problem: 'Edge case (rare) in auth flow' })
    expect(matchFeature(f, '(rare)', DEFAULT_SEARCH_FIELDS)).toBe(true)
  })

  it('handles slashes in query', () => {
    const f = makeFeature({ tags: ['api/v2'] })
    expect(matchFeature(f, 'api/v2', DEFAULT_SEARCH_FIELDS)).toBe(true)
  })

  it('handles empty query — matches every feature', () => {
    const f = makeFeature()
    // Empty string is a substring of every non-null string
    expect(matchFeature(f, '', DEFAULT_SEARCH_FIELDS)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// matchFeature — tag OR filtering (tags array)
// ---------------------------------------------------------------------------

describe('matchFeature — tags array search', () => {
  it('matches when any tag contains the query', () => {
    const f = makeFeature({ tags: ['api', 'security', 'oauth'] })
    expect(matchFeature(f, 'oauth', ['tags'])).toBe(true)
  })

  it('does not match when no tag contains the query', () => {
    const f = makeFeature({ tags: ['api', 'billing'] })
    expect(matchFeature(f, 'auth', ['tags'])).toBe(false)
  })

  it('handles empty tags array gracefully', () => {
    const f = makeFeature({ tags: [] })
    expect(matchFeature(f, 'anything', ['tags'])).toBe(false)
  })
})
