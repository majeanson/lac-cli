export type ViewName = 'dev' | 'product' | 'user' | 'support' | 'tech'

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
      'successCriteria',
      'decisions',
      'knownLimitations',
      'tags',
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
      'userGuide',
      'successCriteria',
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
      'userGuide',
      'successCriteria',
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
