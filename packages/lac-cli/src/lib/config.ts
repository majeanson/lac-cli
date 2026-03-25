import { readFileSync } from 'node:fs'
import process from 'node:process'

import { findLacConfig } from './walker.js'

/**
 * Guardlock configuration — controls how AI tools (lac fill, write_feature_fields)
 * interact with fields that a human has already decided and locked down.
 */
export interface GuardlockConfig {
  /**
   * Enforcement mode for restricted fields.
   * - 'block' — AI writes to restricted fields are rejected with an error (safe default for frozen features)
   * - 'warn'  — AI writes proceed but emit a warning (good for active development)
   * - 'off'   — guardlock is disabled entirely
   * Default: 'warn'
   */
  mode?: 'block' | 'warn' | 'off'
  /**
   * Field names that AI tools cannot overwrite without --force (CLI) or override: true (MCP).
   * Applies to lac fill and write_feature_fields.
   * Any valid feature.json field name is accepted.
   * Example: ["problem", "decisions", "analysis"]
   * Default: [] (no workspace-level restrictions)
   */
  restrictedFields?: string[]
  /**
   * When true, advance_feature(frozen) blocks if any decision is missing alternativesConsidered.
   * This enforces that every decision documents the roads not taken — the real guardlock.
   * Default: false
   */
  requireAlternatives?: boolean
  /**
   * When true, advance_feature(frozen) requires at least one revision entry on intent-critical fields
   * (problem, analysis, implementation, decisions, successCriteria).
   * Ensures a human has explicitly reviewed and signed off before the feature is frozen.
   * Default: false
   */
  freezeRequiresHumanRevision?: boolean
}

export type RequirableField =
  | 'problem'
  | 'analysis'
  | 'decisions'
  | 'implementation'
  | 'knownLimitations'
  | 'tags'
  | 'userGuide'

export interface LacConfig {
  version?: number
  /** Fields that must be non-empty for lint to pass. Default: ['problem'] */
  requiredFields?: RequirableField[]
  /** Completeness % (0-100) a feature must meet. Default: 0 (disabled) */
  ciThreshold?: number
  /** Only lint features with these statuses. Default: ['active', 'draft'] */
  lintStatuses?: Array<'draft' | 'active' | 'frozen' | 'deprecated'>
  /**
   * Domain prefix for generated featureKeys. Default: "feat".
   * Use any lowercase alphanumeric string, e.g. "proc", "goal", "adr", "law".
   * Example: `"domain": "proc"` → keys like `proc-2026-001`.
   */
  domain?: string
  /**
   * Default author name pre-filled in revision prompts (lac fill, lac revisions baseline).
   * Each team member sets this in their local lac.config.json.
   */
  defaultAuthor?: string
  /** Guardlock settings — restrict AI writes on specific fields. */
  guardlock?: GuardlockConfig
}

const DEFAULTS: Required<LacConfig> = {
  version: 1,
  requiredFields: ['problem'],
  ciThreshold: 0,
  lintStatuses: ['active', 'draft'],
  domain: 'feat',
  defaultAuthor: '',
  guardlock: {
    mode: 'warn',
    restrictedFields: [],
    requireAlternatives: false,
    freezeRequiresHumanRevision: false,
  },
}

export function loadConfig(fromDir?: string): Required<LacConfig> {
  const startDir = fromDir ?? process.cwd()
  const configPath = findLacConfig(startDir)
  if (!configPath) return { ...DEFAULTS }

  try {
    const raw = readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as LacConfig
    return {
      version: parsed.version ?? DEFAULTS.version,
      requiredFields: parsed.requiredFields ?? DEFAULTS.requiredFields,
      ciThreshold: parsed.ciThreshold ?? DEFAULTS.ciThreshold,
      lintStatuses: parsed.lintStatuses ?? DEFAULTS.lintStatuses,
      domain: parsed.domain ?? DEFAULTS.domain,
      defaultAuthor: parsed.defaultAuthor ?? DEFAULTS.defaultAuthor,
      guardlock: {
        mode: parsed.guardlock?.mode ?? DEFAULTS.guardlock.mode,
        restrictedFields: parsed.guardlock?.restrictedFields ?? DEFAULTS.guardlock.restrictedFields,
        requireAlternatives: parsed.guardlock?.requireAlternatives ?? DEFAULTS.guardlock.requireAlternatives,
        freezeRequiresHumanRevision: parsed.guardlock?.freezeRequiresHumanRevision ?? DEFAULTS.guardlock.freezeRequiresHumanRevision,
      },
    }
  } catch {
    process.stderr.write(`Warning: could not parse lac.config.json at "${configPath}" — using defaults\n`)
    return { ...DEFAULTS }
  }
}

/** The 6 optional fields used to compute completeness score (0–100) */
export const OPTIONAL_FIELDS: (RequirableField | 'annotations')[] = [
  'analysis',
  'decisions',
  'implementation',
  'knownLimitations',
  'tags',
  'annotations',
]

/**
 * Returns today's date in YYYY-MM-DD format.
 * Use this as the default `date` for new annotations when no date is provided.
 */
export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function computeCompleteness(feature: Record<string, unknown>): number {
  const filled = OPTIONAL_FIELDS.filter((field) => {
    const val = feature[field]
    if (val === undefined || val === null || val === '') return false
    if (Array.isArray(val)) return val.length > 0
    return typeof val === 'string' && val.trim().length > 0
  }).length
  return Math.round((filled / OPTIONAL_FIELDS.length) * 100)
}
