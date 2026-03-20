const OPTIONAL_FIELDS = [
  'analysis',
  'decisions',
  'implementation',
  'knownLimitations',
  'tags',
  'annotations',
] as const

/**
 * Computes a completeness score (0–100) for a feature based on how many
 * of the 6 optional enrichment fields are non-empty.
 */
export function computeCompleteness(feature: Record<string, unknown>): number {
  const filled = OPTIONAL_FIELDS.filter((field) => {
    const val = feature[field]
    if (val === undefined || val === null || val === '') return false
    if (Array.isArray(val)) return val.length > 0
    return typeof val === 'string' && val.trim().length > 0
  }).length
  return Math.round((filled / OPTIONAL_FIELDS.length) * 100)
}
