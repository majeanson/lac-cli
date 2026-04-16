import type { ViewProfileConfig } from './config.js'

export type ViewName = 'dev' | 'product' | 'user' | 'support' | 'tech'
export type DensityLevel = 'summary' | 'standard' | 'verbose'

/** Fields always shown at summary density regardless of view */
const SUMMARY_FIELDS = new Set(['featureKey', 'title', 'status', 'domain', 'priority', 'tags', 'problem'])

/** Fields added at verbose density (on top of standard) */
const VERBOSE_EXTRA_FIELDS = new Set(['annotations', 'statusHistory', 'revisions', 'toolingAnnotations', 'fieldLocks'])

export const VIEW_NAMES: readonly ViewName[] = ['dev', 'product', 'user', 'support', 'tech']

export interface ViewConfig {
  name: ViewName
  label: string
  description: string
  /** Which feature.json top-level keys to include. All others are stripped. */
  fields: ReadonlySet<string>
}

/** Always-present identity fields included in every view */
const IDENTITY = ['featureKey', 'title', 'status', 'domain'] as const

export const VIEWS: Record<ViewName, ViewConfig> = {
  /**
   * End-user guide: plain-language description of what the feature does.
   * No implementation details, no internal keys.
   */
  user: {
    name: 'user',
    label: 'User',
    description: 'Plain-language guide — what the feature does and why it exists',
    fields: new Set([
      'title',
      'problem',
      'userGuide',
      'successCriteria',
      'tags',
    ]),
  },

  /**
   * Support / customer-success view: known issues and escalation context.
   */
  support: {
    name: 'support',
    label: 'Support',
    description: 'Known limitations, annotations, and escalation context for support teams',
    fields: new Set([
      ...IDENTITY,
      'owner',
      'problem',
      'knownLimitations',
      'annotations',
      'tags',
    ]),
  },

  /**
   * Product-owner view: business problem, outcomes, and strategic decisions.
   * No code details.
   */
  product: {
    name: 'product',
    label: 'Product',
    description: 'Business problem, success criteria, and strategic decisions — no implementation details',
    fields: new Set([
      ...IDENTITY,
      'owner',
      'priority',
      'problem',
      'analysis',
      'userGuide',
      'pmSummary',
      'successCriteria',
      'acceptanceCriteria',
      'decisions',
      'knownLimitations',
      'tags',
      'releaseVersion',
    ]),
  },

  /**
   * Developer view: everything needed to implement, extend, or debug a feature.
   */
  dev: {
    name: 'dev',
    label: 'Developer',
    description: 'Full implementation context — code, decisions, snippets, and lineage',
    fields: new Set([
      ...IDENTITY,
      'owner',
      'priority',
      'problem',
      'analysis',
      'implementation',
      'implementationNotes',
      'userGuide',
      'successCriteria',
      'acceptanceCriteria',
      'testStrategy',
      'decisions',
      'knownLimitations',
      'tags',
      'annotations',
      'lineage',
      'componentFile',
      'npmPackages',
      'publicInterface',
      'externalDependencies',
      'codeSnippets',
    ]),
  },

  /**
   * Technical / architect view: all fields, including full history and supersession chains.
   */
  tech: {
    name: 'tech',
    label: 'Technical',
    description: 'Complete technical record — all fields including history, revisions, and lineage',
    fields: new Set([
      ...IDENTITY,
      'schemaVersion',
      'owner',
      'priority',
      'problem',
      'analysis',
      'implementation',
      'implementationNotes',
      'userGuide',
      'pmSummary',
      'successCriteria',
      'acceptanceCriteria',
      'testStrategy',
      'decisions',
      'knownLimitations',
      'tags',
      'annotations',
      'lineage',
      'statusHistory',
      'revisions',
      'componentFile',
      'npmPackages',
      'publicInterface',
      'externalDependencies',
      'codeSnippets',
      'lastVerifiedDate',
      'releaseVersion',
      'superseded_by',
      'superseded_from',
      'merged_into',
      'merged_from',
    ]),
  },
}

/**
 * Return a copy of `feature` with only the keys allowed by `view`.
 * Fields not in the view's set are omitted entirely.
 */
export function applyView(
  feature: Record<string, unknown>,
  view: ViewConfig,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(feature)) {
    if (view.fields.has(key)) {
      result[key] = feature[key]
    }
  }
  return result
}

/**
 * Fields the HTML wiki renderer requires for sidebar navigation and routing.
 * These are always preserved regardless of view, so the wiki remains navigable.
 */
const HTML_NAV_FIELDS = new Set(['featureKey', 'title', 'status', 'domain', 'lineage', 'priority'])

/**
 * Like `applyView`, but always preserves HTML navigation fields so the wiki
 * sidebar and routing continue to work correctly.
 */
export function applyViewForHtml(
  feature: Record<string, unknown>,
  view: ViewConfig,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(feature)) {
    if (view.fields.has(key) || HTML_NAV_FIELDS.has(key)) {
      result[key] = feature[key]
    }
  }
  return result
}

/**
 * Apply density filtering to a feature.
 * - summary:  only SUMMARY_FIELDS (title, status, domain, priority, tags, problem snippet)
 * - standard: pass through unchanged (generators decide what to show)
 * - verbose:  pass through unchanged but callers should render VERBOSE_EXTRA_FIELDS too
 *
 * Returns the filtered feature and the resolved density level.
 */
export function applyDensity(
  feature: Record<string, unknown>,
  density: DensityLevel,
): Record<string, unknown> {
  if (density === 'standard' || density === 'verbose') return feature
  // summary: keep only SUMMARY_FIELDS, truncate problem to first sentence
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(feature)) {
    if (SUMMARY_FIELDS.has(key)) {
      if (key === 'problem' && typeof feature[key] === 'string') {
        const prob = feature[key] as string
        const firstSentence = prob.split(/[.!?]\s/)[0] ?? prob
        result[key] = firstSentence.length < prob.length ? firstSentence + '.' : prob
      } else {
        result[key] = feature[key]
      }
    }
  }
  return result
}

/**
 * Resolve a view name against both built-in views and custom views from lac.config.json.
 *
 * Resolution order:
 *  1. If `name` matches a key in `customViews` (from lac.config.json), build a ViewConfig from it.
 *     If it has `extends`, merge on top of the built-in base.
 *  2. Otherwise fall back to VIEWS[name].
 *  3. If neither matches, return undefined.
 */
export function resolveView(
  name: string,
  customViews: Record<string, ViewProfileConfig> = {},
): (ViewConfig & { density?: DensityLevel; groupBy?: string; sortBy?: string; filterStatus?: string[]; sections?: string[] }) | undefined {
  // Try custom view first
  const custom = customViews[name]
  if (custom) {
    // Start from built-in base if extends is specified
    const base = custom.extends ? VIEWS[custom.extends] : undefined
    const baseFields = base ? new Set(base.fields) : new Set<string>()

    // Custom fields override base; if no custom fields, inherit base
    const fields = custom.fields
      ? new Set(custom.fields)
      : baseFields

    // Always include identity fields
    for (const f of IDENTITY) fields.add(f)

    return {
      name: name as ViewName,
      label: custom.label ?? (base?.label ?? name),
      description: custom.description ?? (base?.description ?? `Custom view: ${name}`),
      fields,
      density: custom.density,
      groupBy: custom.groupBy,
      sortBy: custom.sortBy,
      filterStatus: custom.filterStatus,
      sections: custom.sections,
    }
  }

  // Fall back to built-in view
  const builtin = VIEW_NAMES.includes(name as ViewName) ? VIEWS[name as ViewName] : undefined
  return builtin
}

/**
 * Sort and filter a feature list according to a resolved view profile.
 * This is called before passing features to any generator.
 */
export function applyViewTransforms<T extends Record<string, unknown>>(
  features: T[],
  profile: { filterStatus?: string[]; sortBy?: string; groupBy?: string },
): T[] {
  let result = [...features]

  // Filter by status
  if (profile.filterStatus && profile.filterStatus.length > 0) {
    result = result.filter(f => profile.filterStatus!.includes(f['status'] as string))
  }

  // Sort
  if (profile.sortBy === 'priority') {
    result.sort((a, b) => ((a['priority'] as number) ?? 99) - ((b['priority'] as number) ?? 99))
  } else if (profile.sortBy === 'title') {
    result.sort((a, b) => String(a['title'] ?? '').localeCompare(String(b['title'] ?? '')))
  } else if (profile.sortBy === 'status') {
    const order: Record<string, number> = { active: 0, draft: 1, frozen: 2, deprecated: 3 }
    result.sort((a, b) => (order[a['status'] as string] ?? 9) - (order[b['status'] as string] ?? 9))
  } else if (profile.sortBy === 'lastVerifiedDate') {
    result.sort((a, b) => String(b['lastVerifiedDate'] ?? '').localeCompare(String(a['lastVerifiedDate'] ?? '')))
  }

  return result
}
