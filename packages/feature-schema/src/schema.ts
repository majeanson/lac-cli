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
  type: z.string().min(1),  // configurable per workspace (e.g. 'tech-debt', 'warning', 'lesson', 'breaking-change', etc.)
  body: z.string().min(1),
})

export const LineageSchema = z.object({
  parent: z.string().nullable().optional(),
  children: z.array(z.string()).optional(),
  spawnReason: z.string().nullable().optional(),
})

export const StatusTransitionSchema = z.object({
  from: FeatureStatusSchema,
  to: FeatureStatusSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  reason: z.string().optional(),
})

export const RevisionSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  author: z.string().min(1),
  fields_changed: z.array(z.string()).min(1),
  reason: z.string().min(1),
})

export const PublicInterfaceEntrySchema = z.object({
  name: z.string().min(1),           // prop, function, or export name
  type: z.string().min(1),           // TypeScript type signature
  description: z.string().optional(), // what it does / when to use it
})

export const CodeSnippetSchema = z.object({
  label: z.string().min(1),   // short human label, e.g. "glob pattern", "API call"
  snippet: z.string().min(1), // the actual one-liner or short block
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
  successCriteria: z.string().optional(),  // plain-language definition of done
  domain: z.string().optional(),           // free-form domain tag, e.g. "auth", "payments"
  priority: z.number().int().min(1).max(5).optional(), // 1 = highest, 5 = lowest; controls sibling ordering
  statusHistory: z.array(StatusTransitionSchema).optional(),
  revisions: z.array(RevisionSchema).optional(),
  superseded_by: z.string().regex(FEATURE_KEY_PATTERN, 'superseded_by must be a valid featureKey').optional(),
  superseded_from: z.array(z.string().regex(FEATURE_KEY_PATTERN, 'each superseded_from entry must be a valid featureKey')).optional(),
  merged_into: z.string().regex(FEATURE_KEY_PATTERN, 'merged_into must be a valid featureKey').optional(),
  merged_from: z.array(z.string().regex(FEATURE_KEY_PATTERN, 'each merged_from entry must be a valid featureKey')).optional(),

  // User-facing documentation
  userGuide: z.string().optional(),   // plain-language guide for end users: what the feature does and how to use it (not acceptance criteria)

  // Reconstruction-critical fields (derived from experiment: features are not reconstructable without these)
  componentFile: z.string().optional(),                              // relative path to the primary source file, e.g. "src/components/FeatureCard.tsx"
  npmPackages: z.array(z.string()).optional(),                       // npm packages this feature directly depends on, e.g. ["d3", "react-query"]
  publicInterface: z.array(PublicInterfaceEntrySchema).optional(),   // exported props / function signatures
  externalDependencies: z.array(z.string()).optional(),              // featureKeys or file paths this feature depends on at runtime (beyond lineage)
  lastVerifiedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'lastVerifiedDate must be YYYY-MM-DD').optional(), // date the feature.json was last confirmed accurate
  codeSnippets: z.array(CodeSnippetSchema).optional(),               // critical one-liners worth preserving verbatim (glob paths, API calls, etc.)
})
