import { readFileSync } from 'node:fs'
import process from 'node:process'

import { findLacConfig } from './walker.js'

// ── View profile config ───────────────────────────────────────────────────────

/**
 * A named view profile defined in lac.config.json.
 * Extends one of the 5 built-in views (dev/product/user/support/tech) and
 * overrides specific attributes. Used via `lac export --view <name>`.
 *
 * Community tip: publish your view profiles as JSON snippets in a README
 * so anyone can drop them into their lac.config.json. No package install needed.
 */
export interface ViewProfileConfig {
  /** Built-in view to extend. Inherited fields are overridden by any explicit keys below. */
  extends?: 'dev' | 'product' | 'user' | 'support' | 'tech'
  /** Explicit field list — overrides the extended view's field set if provided. */
  fields?: string[]
  /**
   * Content density:
   * - 'summary'  — title + problem (first sentence) + status badge + priority + tags only
   * - 'standard' — all included fields rendered normally (default)
   * - 'verbose'  — standard + adds annotations, statusHistory, revisions, toolingAnnotations
   */
  density?: 'summary' | 'standard' | 'verbose'
  /** Group features by this attribute before rendering. */
  groupBy?: 'domain' | 'status' | 'priority'
  /** Sort features by this attribute (within group if groupBy is set). */
  sortBy?: 'priority' | 'title' | 'status' | 'lastVerifiedDate'
  /** Only include features with these statuses. Defaults to all statuses. */
  filterStatus?: Array<'draft' | 'active' | 'frozen' | 'deprecated'>
  /** Ordered array of field names controlling section rendering order in HTML exports. */
  sections?: string[]
  /** Human label shown in HTML topbars for this view. Defaults to the view name. */
  label?: string
  /** Short description shown in lac config output. */
  description?: string
}

// ── Generator plugin config ───────────────────────────────────────────────────

/**
 * A named generator defined in lac.config.json.
 * Run with `lac gen --generator <name> [dir]`.
 *
 * Three types:
 *  - 'template' — Handlebars (.hbs) template file; receives features as template context
 *  - 'script'   — JS/TS script; receives features JSON on stdin, writes output to stdout
 *  - 'ai'       — custom Claude prompt (inline string or path to .md file)
 *
 * Community tip: publish your generators as npm packages.
 * Users install and reference them:
 *   "script": "./node_modules/@lac-gen/openapi/index.js"
 */
export interface GeneratorConfig {
  /** Generator type. */
  type: 'template' | 'script' | 'ai'
  /** (template) Path to a Handlebars .hbs file. Relative to the lac.config.json location. */
  template?: string
  /** (script) Path to a JS/TS script. Relative to the lac.config.json location. */
  script?: string
  /**
   * (ai) System prompt — inline string or path to a .md/.txt file.
   * The feature JSON is appended as user content. Claude model is used.
   */
  systemPrompt?: string
  /**
   * Output file path pattern. Supports substitutions:
   *   {featureKey}  — e.g. feat-2026-001
   *   {domain}      — e.g. auth
   *   {status}      — e.g. frozen
   *   {title}       — slugified title
   * If omitted, output goes to stdout.
   */
  outputFile?: string
  /** Only run this generator on features with these statuses. */
  filterStatus?: Array<'draft' | 'active' | 'frozen' | 'deprecated'>
  /** Only run on features matching these tags (OR logic). */
  filterTags?: string[]
  /**
   * Whether to run per-feature (default) or once for the whole workspace.
   * 'workspace' mode receives all matching features as an array.
   */
  scope?: 'feature' | 'workspace'
  /** Short description shown in `lac gen --list`. */
  description?: string
}

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
  | 'successCriteria'
  | 'acceptanceCriteria'
  | 'testStrategy'
  | 'pmSummary'
  | 'componentFile'
  | 'testCases'
  | 'edgeCases'
  | 'riskLevel'
  | 'rollbackPlan'
  | 'supportNotes'
  | 'knownWorkarounds'

/**
 * Per-role override for `lac export --roles` (lac-roles.html).
 * Each key is a role id: 'user' | 'product' | 'dev' | 'qa' | 'support' | 'architect'
 *
 * Example — make testCases required for QA, add rollbackPlan to architect:
 * ```json
 * "roles": {
 *   "qa":       { "required": ["testStrategy", "acceptanceCriteria", "testCases"] },
 *   "architect": { "fields": ["decisions", "analysis", "implementationNotes", "externalDependencies", "publicInterface", "riskLevel", "rollbackPlan", "componentFile"] }
 * }
 * ```
 */
export interface RoleOverrideConfig {
  /**
   * Fields to show in this role's cards.
   * Replaces the built-in field list entirely — so include everything you want.
   * If omitted, the built-in field list for this role is used.
   */
  fields?: string[]
  /**
   * Fields that trigger a gap warning when missing.
   * Replaces the built-in required list for this role.
   * If omitted, the built-in required list is used.
   */
  required?: string[]
  /** Override the role label shown in the sidebar and topbar. */
  label?: string
  /** Override the role description shown under the label. */
  desc?: string
}

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
  /**
   * Named view profiles used with `lac export --view <name>`.
   * Each profile extends a built-in view and overrides specific attributes.
   *
   * Example:
   * ```json
   * "views": {
   *   "sprint": { "extends": "product", "density": "summary", "filterStatus": ["draft", "active"], "sortBy": "priority" },
   *   "onboarding": { "extends": "dev", "density": "verbose", "filterStatus": ["frozen"], "groupBy": "domain" }
   * }
   * ```
   *
   * Community: share your views as JSON snippets — others drop them in their lac.config.json.
   */
  views?: Record<string, ViewProfileConfig>
  /**
   * Per-role overrides for `lac export --roles` (lac-roles.html).
   * Keys must be built-in role ids: 'user' | 'product' | 'dev' | 'qa' | 'support' | 'architect'.
   * Override fields[], required[], label, or desc for any role.
   * Unspecified roles use their built-in defaults.
   */
  roles?: Record<string, RoleOverrideConfig>
  /**
   * Named generator plugins used with `lac gen --generator <name>`.
   * Supports template (Handlebars), script (stdin/stdout), and ai (custom Claude prompt) types.
   *
   * Example:
   * ```json
   * "generators": {
   *   "my-docs": { "type": "template", "template": "./templates/feature-doc.hbs", "outputFile": "./docs/{featureKey}.md" },
   *   "openapi":  { "type": "script",   "script": "./node_modules/@lac-gen/openapi/index.js", "scope": "workspace" }
   * }
   * ```
   *
   * Community: publish generators as npm packages (e.g. @lac-gen/openapi, @lac-gen/storybook).
   */
  generators?: Record<string, GeneratorConfig>
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
  views: {},
  roles: {},
  generators: {},
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
      views: parsed.views ?? DEFAULTS.views,
      roles: parsed.roles ?? DEFAULTS.roles,
      generators: parsed.generators ?? DEFAULTS.generators,
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
