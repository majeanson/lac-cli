import { readFileSync } from 'node:fs'
import process from 'node:process'

import { findLacConfig } from './walker.js'

export type RequirableField =
  | 'problem'
  | 'analysis'
  | 'decisions'
  | 'implementation'
  | 'knownLimitations'
  | 'tags'

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
}

const DEFAULTS: Required<LacConfig> = {
  version: 1,
  requiredFields: ['problem'],
  ciThreshold: 0,
  lintStatuses: ['active', 'draft'],
  domain: 'feat',
  defaultAuthor: '',
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
    }
  } catch {
    process.stderr.write(`Warning: could not parse lac.config.json at "${configPath}" — using defaults\n`)
    return { ...DEFAULTS }
  }
}

/** The 6 optional fields used to compute completeness score (0–100) */
export const OPTIONAL_FIELDS: RequirableField[] = [
  'analysis',
  'decisions',
  'implementation',
  'knownLimitations',
  'tags',
  'annotations' as RequirableField,
]

/**
 * Returns today's date in YYYY-MM-DD format.
 * Use this as the default `date` for new annotations when no date is provided.
 */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
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
