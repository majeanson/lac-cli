import type { Feature } from '@life-as-code/feature-schema'
import { VIEWS, applyView } from './views.js'
import type { ViewProfileConfig } from './config.js'

/**
 * generateDataExport — produces `lac-data.json`, the universal bridge between
 * feature.jsons and any app/framework.
 *
 * Structure:
 *   meta    — project stats, generation timestamp, lac version
 *   features — one entry per feature with all identity fields + a `views` object
 *              containing pre-projected slices for each audience (user, dev, product, support)
 *
 * Apps consume this file to surface contextual help, documentation, and tutorials
 * without knowing about the LAC CLI or the feature.json file format.
 *
 * Output: lac-data.json
 */
export function generateDataExport(
  features: Feature[],
  projectName: string,
  options: {
    lacVersion?: string
    customViews?: Record<string, ViewProfileConfig>
  } = {},
): string {
  const { lacVersion = '3.5.0', customViews = {} } = options

  // ── Build custom view resolvers ────────────────────────────────────────────
  // For each custom view, resolve its field set (extends + overrides)
  const customViewConfigs: Record<string, { fields: Set<string> }> = {}
  for (const [name, cfg] of Object.entries(customViews)) {
    const baseFields = cfg.extends ? new Set(VIEWS[cfg.extends as keyof typeof VIEWS]?.fields ?? []) : new Set<string>()
    const fieldSet = cfg.fields ? new Set(cfg.fields) : baseFields
    // Always include identity
    for (const f of ['featureKey', 'title', 'status', 'domain']) fieldSet.add(f)
    customViewConfigs[name] = { fields: fieldSet }
  }

  const domains = [...new Set(features.map(f => f.domain).filter((d): d is string => Boolean(d)))].sort()
  const definedViews = ['user', 'dev', 'product', 'support', ...Object.keys(customViews)]

  const entries = features.map(f => {
    const raw = f as Record<string, unknown>

    // ── Fixed identity + cross-cutting fields ─────────────────────────────
    const entry: Record<string, unknown> = {
      featureKey:           f.featureKey,
      title:                f.title,
      status:               f.status,
      domain:               f.domain,
      tags:                 f.tags                 ?? [],
      priority:             f.priority,
      externalDependencies: f.externalDependencies ?? [],
    }

    // ── View projections ──────────────────────────────────────────────────
    const views: Record<string, Record<string, unknown>> = {}

    // Built-in views: user, dev, product, support
    for (const viewName of ['user', 'dev', 'product', 'support'] as const) {
      const viewDef = VIEWS[viewName]
      const projected = applyView(raw, viewDef)
      // Remove identity fields from view slices (already at top level)
      for (const id of ['featureKey', 'title', 'status', 'domain']) delete projected[id]
      // Only include the view if it has at least one non-empty value
      const hasContent = Object.values(projected).some(v =>
        v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0),
      )
      if (hasContent) views[viewName] = projected
    }

    // Custom views from lac.config.json
    for (const [viewName, cfg] of Object.entries(customViewConfigs)) {
      const projected: Record<string, unknown> = {}
      for (const key of Object.keys(raw)) {
        if (cfg.fields.has(key)) projected[key] = raw[key]
      }
      for (const id of ['featureKey', 'title', 'status', 'domain']) delete projected[id]
      const hasContent = Object.values(projected).some(v =>
        v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && v.length === 0),
      )
      if (hasContent) views[viewName] = projected
    }

    entry['views'] = views
    return entry
  })

  const output = {
    meta: {
      projectName,
      generatedAt: new Date().toISOString(),
      lacVersion,
      featureCount: features.length,
      domains,
      definedViews,
    },
    features: entries,
  }

  return JSON.stringify(output, null, 2)
}
