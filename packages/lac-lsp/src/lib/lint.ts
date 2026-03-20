import type { IndexedFeature } from '../indexer/types.js'

export interface LintResult {
  featureKey: string
  filePath: string
  status: string
  completeness: number
  missingRequired: string[]
  belowThreshold: boolean
  pass: boolean
}

export interface LintReport {
  results: LintResult[]
  failures: number
  passes: number
  checkedCount: number
  skippedCount: number
}

export interface LintOptions {
  requiredFields?: string[]
  threshold?: number
  lintStatuses?: string[]
}

const DEFAULTS: Required<LintOptions> = {
  requiredFields: ['problem'],
  threshold: 0,
  lintStatuses: ['active', 'draft'],
}

/**
 * Runs lint checks on a list of indexed features.
 * Returns a full report with per-feature results, pass/fail counts,
 * and how many features were skipped due to non-lintable statuses.
 */
export function lintFeatures(
  features: IndexedFeature[],
  options: LintOptions = {},
): LintReport {
  const requiredFields = options.requiredFields ?? DEFAULTS.requiredFields
  const threshold = options.threshold ?? DEFAULTS.threshold
  const lintStatuses = options.lintStatuses ?? DEFAULTS.lintStatuses

  const toCheck = features.filter((f) => lintStatuses.includes(f.feature.status))
  const skippedCount = features.length - toCheck.length

  const results: LintResult[] = toCheck.map(({ feature, filePath, completeness }) => {
    const raw = feature as unknown as Record<string, unknown>

    const missingRequired = requiredFields.filter((field) => {
      const val = raw[field]
      if (val === undefined || val === null || val === '') return true
      if (Array.isArray(val)) return val.length === 0
      return typeof val === 'string' && val.trim().length === 0
    })

    const belowThreshold = threshold > 0 && completeness < threshold

    return {
      featureKey: feature.featureKey,
      filePath,
      status: feature.status,
      completeness,
      missingRequired,
      belowThreshold,
      pass: missingRequired.length === 0 && !belowThreshold,
    }
  })

  const failures = results.filter((r) => !r.pass).length
  const passes = results.filter((r) => r.pass).length

  return { results, failures, passes, checkedCount: toCheck.length, skippedCount }
}
