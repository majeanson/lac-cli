import { z } from 'zod'

/** Matches any domain prefix: feat-2026-001, proc-2026-001, goal-2026-001, etc. */
export const FEATURE_KEY_PATTERN = /^[a-z][a-z0-9]*-\d{4}-\d{3}$/

export const FeatureStatusSchema = z.enum(['draft', 'active', 'frozen', 'deprecated'])

export const DecisionSchema = z.object({
  decision: z.string().min(1),
  rationale: z.string().min(1),
  alternativesConsidered: z.array(z.string()).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD').optional(),
})

export const AnnotationSchema = z.object({
  id: z.string().min(1),
  author: z.string().min(1),
  date: z.string().min(1),
  type: z.enum(['decision', 'warning', 'assumption', 'lesson', 'breaking-change', 'question', 'tech-debt']),
  body: z.string().min(1),
})

export const LineageSchema = z.object({
  parent: z.string().nullable().optional(),
  children: z.array(z.string()).optional(),
  spawnReason: z.string().nullable().optional(),
})

export const FeatureSchema = z.object({
  // Required fields
  featureKey: z
    .string()
    .regex(FEATURE_KEY_PATTERN, 'featureKey must match pattern <domain>-YYYY-NNN (e.g. feat-2026-001, proc-2026-001)'),
  title: z.string().min(1),
  status: FeatureStatusSchema,
  problem: z.string().min(1),

  // Optional fields
  schemaVersion: z.number().int().positive().optional(),  // e.g. 1; when absent, assume version 1
  owner: z.string().optional(),  // e.g. "marc", "team-auth", "alice@example.com"
  analysis: z.string().optional(),
  decisions: z.array(DecisionSchema).optional(),
  implementation: z.string().optional(),
  knownLimitations: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  annotations: z.array(AnnotationSchema).optional(),
  lineage: LineageSchema.optional(),
})
