import { describe, expect, it } from 'vitest'

import { StatusTransitionSchema } from '../schema.js'
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

  it('accepts any non-empty annotation type (free-form — configured per workspace)', () => {
    // AnnotationSchema.type is z.string().min(1) — intentionally open, not an enum
    const result = validateFeature({
      ...VALID_FEATURE,
      annotations: [
        {
          id: 'ann-1',
          author: 'marc',
          date: '2026-01-01',
          type: 'custom-workspace-type',
          body: 'body',
        },
      ],
    })
    expect(result.success).toBe(true)
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

  it('accepts a valid feature with a statusHistory array', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      statusHistory: [
        {
          from: 'draft',
          to: 'active',
          date: '2026-01-10',
          reason: 'Feature was approved',
        },
        {
          from: 'active',
          to: 'frozen',
          date: '2026-03-01',
        },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.statusHistory).toHaveLength(2)
    }
  })

  it('rejects a StatusTransitionSchema entry with invalid status values', () => {
    const result = StatusTransitionSchema.safeParse({
      from: 'archived',   // not a valid FeatureStatus
      to: 'active',
      date: '2026-01-10',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a statusHistory entry with an invalid date format', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      statusHistory: [
        {
          from: 'draft',
          to: 'active',
          date: '10-01-2026', // wrong format — must be YYYY-MM-DD
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('StatusTransitionSchema is exported from index', async () => {
    const exports = await import('../index.js')
    expect(exports.StatusTransitionSchema).toBeDefined()
    expect(typeof exports.StatusTransitionSchema.parse).toBe('function')
  })

  it('accepts componentFile as a string', () => {
    const result = validateFeature({ ...VALID_FEATURE, componentFile: 'src/components/Foo.tsx' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.componentFile).toBe('src/components/Foo.tsx')
  })

  it('accepts npmPackages as a string array', () => {
    const result = validateFeature({ ...VALID_FEATURE, npmPackages: ['d3', 'react-query'] })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.npmPackages).toEqual(['d3', 'react-query'])
  })

  it('accepts publicInterface array', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      publicInterface: [
        { name: 'onSelect', type: '(id: string) => void', description: 'Called when a feature is selected' },
        { name: 'feature', type: 'Feature' },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.publicInterface).toHaveLength(2)
  })

  it('rejects publicInterface entry missing required name', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      publicInterface: [{ type: '() => void' }],
    })
    expect(result.success).toBe(false)
  })

  it('accepts externalDependencies as a string array', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      externalDependencies: ['feat-2026-003', 'src/utils/shared.ts'],
    })
    expect(result.success).toBe(true)
  })

  it('accepts a valid lastVerifiedDate', () => {
    const result = validateFeature({ ...VALID_FEATURE, lastVerifiedDate: '2026-03-22' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.lastVerifiedDate).toBe('2026-03-22')
  })

  it('rejects lastVerifiedDate with wrong format', () => {
    const result = validateFeature({ ...VALID_FEATURE, lastVerifiedDate: '22-03-2026' })
    expect(result.success).toBe(false)
  })

  it('accepts codeSnippets array', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      codeSnippets: [
        { label: 'glob pattern', snippet: "import.meta.glob('./.lac/**/feature.json')" },
        { label: 'key format', snippet: 'feat-YYYY-NNN' },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.codeSnippets).toHaveLength(2)
  })

  it('rejects codeSnippet entry missing required snippet', () => {
    const result = validateFeature({
      ...VALID_FEATURE,
      codeSnippets: [{ label: 'glob pattern' }],
    })
    expect(result.success).toBe(false)
  })

  it('PublicInterfaceEntrySchema and CodeSnippetSchema are exported from index', async () => {
    const exports = await import('../index.js')
    expect(exports.PublicInterfaceEntrySchema).toBeDefined()
    expect(exports.CodeSnippetSchema).toBeDefined()
  })
})
