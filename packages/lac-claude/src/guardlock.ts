/**
 * Guardlock — configurable field protection for lac workspaces.
 *
 * Two layers of protection:
 * 1. Workspace-level: `lac.config.json` → `guardlock.restrictedFields` — applies to all features
 * 2. Per-feature: `feature.json` → `fieldLocks[]` — locks specific fields in a single feature,
 *    useful when a field was hard-won and should never be touched without human review.
 *
 * "While working on this feature, lock these fields too" → add entries to fieldLocks.
 */

import fs from 'node:fs'
import path from 'node:path'

export interface GuardlockConfig {
  /**
   * Enforcement mode for restricted fields.
   * - 'block' — AI writes to restricted fields are rejected (hard error)
   * - 'warn'  — writes proceed but a warning is returned
   * - 'off'   — guardlock disabled entirely
   * Default: 'warn'
   */
  mode?: 'block' | 'warn' | 'off'
  /**
   * Field names that AI tools (lac fill, write_feature_fields) cannot overwrite
   * without --force (CLI) or override: true (MCP).
   * Example: ["problem", "decisions", "analysis"]
   * Default: []
   */
  restrictedFields?: string[]
  /**
   * When true, advance_feature(frozen) blocks if any decision is missing alternativesConsidered.
   * Default: false
   */
  requireAlternatives?: boolean
  /**
   * When true, advance_feature(frozen) requires at least one revision entry
   * on intent-critical fields (problem, analysis, implementation, decisions, successCriteria).
   * Default: false
   */
  freezeRequiresHumanRevision?: boolean
}

export interface FieldLock {
  field: string
  lockedAt: string
  lockedBy: string
  reason?: string
}

const GUARDLOCK_DEFAULTS: Required<GuardlockConfig> = {
  mode: 'warn',
  restrictedFields: [],
  requireAlternatives: false,
  freezeRequiresHumanRevision: false,
}

/** Walk up from startDir to find the nearest lac.config.json */
function findLacConfig(startDir: string): string | null {
  let dir = startDir
  const root = path.parse(dir).root
  while (dir !== root) {
    const candidate = path.join(dir, 'lac.config.json')
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

/** Load guardlock config from the nearest lac.config.json, walking up from fromDir. */
export function loadGuardlockConfig(fromDir: string): Required<GuardlockConfig> {
  const configPath = findLacConfig(fromDir)
  if (!configPath) return { ...GUARDLOCK_DEFAULTS }

  try {
    const raw = fs.readFileSync(configPath, 'utf-8')
    const parsed = JSON.parse(raw) as { guardlock?: GuardlockConfig }
    const g = parsed.guardlock ?? {}
    return {
      mode: g.mode ?? GUARDLOCK_DEFAULTS.mode,
      restrictedFields: g.restrictedFields ?? GUARDLOCK_DEFAULTS.restrictedFields,
      requireAlternatives: g.requireAlternatives ?? GUARDLOCK_DEFAULTS.requireAlternatives,
      freezeRequiresHumanRevision: g.freezeRequiresHumanRevision ?? GUARDLOCK_DEFAULTS.freezeRequiresHumanRevision,
    }
  } catch {
    return { ...GUARDLOCK_DEFAULTS }
  }
}

/**
 * Resolve which fields are locked for a given feature.
 *
 * Combines two sources:
 * - workspace config: `guardlock.restrictedFields`
 * - per-feature: `feature.fieldLocks[]` — "lock these fields while working on this feature"
 *
 * Returns a Set of locked field names and a map of field → reason (for error messages).
 */
export function resolveLockedFields(
  config: Required<GuardlockConfig>,
  featureFieldLocks: FieldLock[] = [],
): { lockedFields: Set<string>; lockReasons: Map<string, string> } {
  const lockedFields = new Set<string>()
  const lockReasons = new Map<string, string>()

  for (const field of config.restrictedFields) {
    lockedFields.add(field)
    lockReasons.set(field, 'workspace config (guardlock.restrictedFields)')
  }

  for (const lock of featureFieldLocks) {
    lockedFields.add(lock.field)
    const existing = lockReasons.get(lock.field)
    if (!existing) {
      const reason = lock.reason
        ? `per-feature lock by ${lock.lockedBy}: ${lock.reason}`
        : `per-feature lock by ${lock.lockedBy} (${lock.lockedAt})`
      lockReasons.set(lock.field, reason)
    }
  }

  return { lockedFields, lockReasons }
}

/**
 * Check if writing `fieldsToWrite` would violate any locks.
 *
 * @param featureLocked - when true, ALL fields in this feature are locked (equivalent to
 *   listing every attempted field in fieldLocks). Use `feature.featureLocked` to pass this.
 *
 * Returns a list of violations (field + reason) or empty if clean.
 */
export function checkGuardlock(
  config: Required<GuardlockConfig>,
  featureFieldLocks: FieldLock[],
  fieldsToWrite: string[],
  featureLocked = false,
): Array<{ field: string; reason: string }> {
  if (config.mode === 'off') return []

  // featureLocked = "AI lock all fields in this feature"
  if (featureLocked) {
    return fieldsToWrite.map((field) => ({ field, reason: 'feature is AI-locked (featureLocked: true)' }))
  }

  const { lockedFields, lockReasons } = resolveLockedFields(config, featureFieldLocks)
  const violations: Array<{ field: string; reason: string }> = []

  for (const field of fieldsToWrite) {
    if (lockedFields.has(field)) {
      violations.push({ field, reason: lockReasons.get(field) ?? 'locked' })
    }
  }

  return violations
}

/** Format guardlock violations into a human-readable message. */
export function formatGuardlockMessage(
  violations: Array<{ field: string; reason: string }>,
  mode: 'block' | 'warn',
  canOverride: boolean,
): string {
  const prefix = mode === 'block' ? '🔒 Guardlock blocked' : '⚠ Guardlock warning'
  const lines = violations.map((v) => `  - ${v.field}: ${v.reason}`)
  const overrideHint = canOverride
    ? mode === 'block'
      ? '\nPass override: true to force-write these fields.'
      : ''
    : ''
  return `${prefix} — ${violations.length} protected field(s) would be overwritten:\n${lines.join('\n')}${overrideHint}`
}
