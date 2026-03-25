/**
 * lac guardlock — manage per-feature field locks from the command line.
 *
 * Usage:
 *   lac guardlock status              — show lock state of the nearest feature
 *   lac guardlock lock <field...>     — lock one or more fields
 *   lac guardlock unlock <field...>   — remove locks on one or more fields
 *   lac guardlock freeze              — set featureLocked: true (lock everything)
 *   lac guardlock thaw                — remove featureLocked flag
 */

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { loadConfig } from '../lib/config.js'
import { findLacConfig, findNearestFeatureJson } from '../lib/walker.js'

function localDateIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function resolveFeatureDir(dir?: string): string {
  if (dir) return path.resolve(dir)
  const found = findNearestFeatureJson(process.cwd())
  if (!found) {
    process.stderr.write('No feature.json found from current directory.\n')
    process.exit(1)
  }
  return path.dirname(found)
}

function readFeature(featureDir: string): { raw: Record<string, unknown>; featurePath: string } {
  const featurePath = path.join(featureDir, 'feature.json')
  let rawStr: string
  try {
    rawStr = fs.readFileSync(featurePath, 'utf-8')
  } catch {
    process.stderr.write(`No feature.json found at "${featurePath}"\n`)
    process.exit(1)
  }
  return { raw: JSON.parse(rawStr) as Record<string, unknown>, featurePath }
}

function writeFeature(featurePath: string, raw: Record<string, unknown>): void {
  const result = validateFeature(raw)
  if (!result.success) {
    // Write anyway — lock fields are schema-valid, validation failure means something else is wrong
    process.stderr.write(`Warning: feature.json has validation issues: ${result.errors.join(', ')}\n`)
  }
  fs.writeFileSync(featurePath, JSON.stringify(raw, null, 2) + '\n', 'utf-8')
}

// ── status ────────────────────────────────────────────────────────────────────

export const guardlockCommand = new Command('guardlock')
  .description('Manage per-feature field locks — protect human decisions from AI drift')
  .argument('[dir]', 'Feature folder (default: nearest feature.json from cwd)')

guardlockCommand
  .command('status [dir]')
  .description('Show the current lock state of a feature')
  .action((dir?: string) => {
    const featureDir = resolveFeatureDir(dir)
    const { raw } = readFeature(featureDir)
    const config = loadConfig(featureDir)

    const featureLocked = raw.featureLocked === true
    const fieldLocks = (raw.fieldLocks as Array<{ field: string; lockedBy: string; lockedAt: string; reason?: string }> | undefined) ?? []
    const workspaceLocked = config.guardlock.restrictedFields ?? []

    process.stdout.write(`\n🔒 Guardlock status for ${String(raw.featureKey)} (${featureDir})\n\n`)

    if (featureLocked) {
      process.stdout.write(`  ⚡ Feature-locked: YES — all fields are AI-locked\n`)
      process.stdout.write(`     Use "lac guardlock thaw" to remove the full lock\n\n`)
    } else {
      process.stdout.write(`  Feature-locked: no\n\n`)
    }

    if (workspaceLocked.length > 0) {
      process.stdout.write(`  Workspace restricted fields (lac.config.json):\n`)
      for (const f of workspaceLocked) {
        process.stdout.write(`    🔒 ${f}\n`)
      }
      process.stdout.write('\n')
    }

    if (fieldLocks.length > 0) {
      process.stdout.write(`  Per-feature locked fields:\n`)
      for (const lock of fieldLocks) {
        const reason = lock.reason ? ` — ${lock.reason}` : ''
        process.stdout.write(`    🔒 ${lock.field.padEnd(24)} locked by ${lock.lockedBy} on ${lock.lockedAt}${reason}\n`)
      }
      process.stdout.write('\n')
    } else if (!featureLocked) {
      process.stdout.write(`  No per-feature locks set.\n`)
      process.stdout.write(`  To lock fields: lac guardlock lock <field...> [--reason "..."]\n`)
      process.stdout.write(`  To lock everything: lac guardlock freeze\n\n`)
    }

    if (config.guardlock.mode !== 'off') {
      const mode = config.guardlock.mode ?? 'warn'
      process.stdout.write(`  Enforcement mode: ${mode}${mode === 'block' ? ' (AI writes to locked fields are rejected)' : ' (warnings only, writes proceed)'}\n`)
    } else {
      process.stdout.write(`  Guardlock mode: off (set mode in lac.config.json to enable)\n`)
    }
    process.stdout.write('\n')
  })

// ── lock ──────────────────────────────────────────────────────────────────────

guardlockCommand
  .command('lock <fields...>')
  .description('Lock one or more fields — AI tools will skip or warn when writing them')
  .option('--reason <reason>', 'Why this field is locked (displayed in guardlock notices)')
  .option('--author <author>', 'Who is setting the lock (default: from lac.config.json defaultAuthor)')
  .option('--dir <dir>', 'Feature folder (default: nearest feature.json)')
  .action((fields: string[], options: { reason?: string; author?: string; dir?: string }) => {
    const featureDir = resolveFeatureDir(options.dir)
    const { raw, featurePath } = readFeature(featureDir)
    const config = loadConfig(featureDir)
    const author = options.author ?? config.defaultAuthor ?? 'unknown'
    const lockedAt = localDateIso()

    const existingLocks = (raw.fieldLocks as Array<{ field: string; lockedBy: string; lockedAt: string; reason?: string }> | undefined) ?? []
    const existingFieldSet = new Set(existingLocks.map((l) => l.field))

    const newLocks = fields.filter((f) => !existingFieldSet.has(f)).map((field) => ({
      field,
      lockedBy: author,
      lockedAt,
      ...(options.reason ? { reason: options.reason } : {}),
    }))

    const alreadyLocked = fields.filter((f) => existingFieldSet.has(f))

    if (alreadyLocked.length > 0) {
      process.stdout.write(`  Already locked: ${alreadyLocked.join(', ')}\n`)
    }

    if (newLocks.length === 0) {
      process.stdout.write('  Nothing to do — all specified fields are already locked.\n')
      return
    }

    raw.fieldLocks = [...existingLocks, ...newLocks]
    writeFeature(featurePath, raw)

    for (const lock of newLocks) {
      const reason = lock.reason ? ` (${lock.reason})` : ''
      process.stdout.write(`  🔒 Locked: ${lock.field}${reason}\n`)
    }
    process.stdout.write(`\n  ${newLocks.length} field(s) locked in ${featurePath}\n`)
    process.stdout.write(`  AI tools will now skip these fields (mode: ${config.guardlock.mode ?? 'warn'}).\n`)
    process.stdout.write(`  Use --force (lac fill) or override: true (MCP) to write them anyway.\n\n`)
  })

// ── unlock ────────────────────────────────────────────────────────────────────

guardlockCommand
  .command('unlock <fields...>')
  .description('Remove locks from one or more fields')
  .option('--dir <dir>', 'Feature folder (default: nearest feature.json)')
  .action((fields: string[], options: { dir?: string }) => {
    const featureDir = resolveFeatureDir(options.dir)
    const { raw, featurePath } = readFeature(featureDir)

    const existingLocks = (raw.fieldLocks as Array<{ field: string }> | undefined) ?? []
    const toRemove = new Set(fields)
    const after = existingLocks.filter((l) => !toRemove.has(l.field))
    const removed = existingLocks.filter((l) => toRemove.has(l.field)).map((l) => l.field)
    const notFound = fields.filter((f) => !existingLocks.some((l) => l.field === f))

    if (notFound.length > 0) {
      process.stdout.write(`  Not found in fieldLocks: ${notFound.join(', ')}\n`)
    }

    if (removed.length === 0) {
      process.stdout.write('  Nothing to unlock.\n')
      return
    }

    raw.fieldLocks = after.length > 0 ? after : undefined
    writeFeature(featurePath, raw)

    process.stdout.write(`  🔓 Unlocked: ${removed.join(', ')}\n`)
    process.stdout.write(`\n  ${removed.length} lock(s) removed from ${featurePath}\n\n`)
  })

// ── freeze (featureLocked: true) ──────────────────────────────────────────────

guardlockCommand
  .command('freeze [dir]')
  .description('Lock ALL fields in this feature — equivalent to listing every field in fieldLocks. Use when the feature is complete and human-reviewed.')
  .action((dir?: string) => {
    const featureDir = resolveFeatureDir(dir)
    const { raw, featurePath } = readFeature(featureDir)

    if (raw.featureLocked === true) {
      process.stdout.write(`  Already frozen — ${String(raw.featureKey)} is fully AI-locked.\n`)
      return
    }

    raw.featureLocked = true
    writeFeature(featurePath, raw)

    process.stdout.write(`  ⚡ ${String(raw.featureKey)} is now fully AI-locked (featureLocked: true)\n`)
    process.stdout.write(`  AI tools will refuse to generate any field without --force or override: true.\n`)
    process.stdout.write(`  Use "lac guardlock thaw" to remove the full lock.\n\n`)
  })

// ── base (workspace-level guardlock config) ──────────────────────────────────

const baseCommand = guardlockCommand
  .command('base [dir]')
  .description('Show and edit workspace-level guardlock settings in lac.config.json')

baseCommand
  .command('show [dir]')
  .description('Show the workspace guardlock config (default when no subcommand given)')
  .action((dir?: string) => showBase(dir))

// Default action for "lac guardlock base" with no subcommand
baseCommand.action((dir?: string) => showBase(dir))

baseCommand
  .command('mode <mode>')
  .description('Set enforcement mode: block | warn | off')
  .option('--dir <dir>', 'Workspace root (default: cwd)')
  .action((mode: string, options: { dir?: string }) => {
    if (!['block', 'warn', 'off'].includes(mode)) {
      process.stderr.write(`Invalid mode "${mode}". Choose: block, warn, off\n`)
      process.exit(1)
    }
    const { configPath, raw } = resolveConfig(options.dir)
    raw.guardlock = { ...((raw.guardlock as object) ?? {}), mode }
    writeConfig(configPath, raw)
    process.stdout.write(`  ✓ guardlock.mode = ${mode} in ${configPath}\n`)
    process.stdout.write(modeDescription(mode) + '\n\n')
  })

baseCommand
  .command('lock <fields...>')
  .description('Add fields to workspace restrictedFields — applies to all features')
  .option('--dir <dir>', 'Workspace root (default: cwd)')
  .action((fields: string[], options: { dir?: string }) => {
    const { configPath, raw } = resolveConfig(options.dir)
    const existing: string[] = (raw.guardlock as Record<string, unknown>)?.restrictedFields as string[] ?? []
    const toAdd = fields.filter((f) => !existing.includes(f))
    const alreadyThere = fields.filter((f) => existing.includes(f))
    if (alreadyThere.length) process.stdout.write(`  Already restricted: ${alreadyThere.join(', ')}\n`)
    if (toAdd.length === 0) { process.stdout.write('  Nothing to add.\n'); return }
    raw.guardlock = { ...((raw.guardlock as object) ?? {}), restrictedFields: [...existing, ...toAdd] }
    writeConfig(configPath, raw)
    process.stdout.write(`  🔒 Added to workspace restrictedFields: ${toAdd.join(', ')}\n`)
    process.stdout.write(`  AI tools will now skip these fields in all features (mode: ${(raw.guardlock as Record<string, unknown>).mode ?? 'warn'}).\n\n`)
  })

baseCommand
  .command('unlock <fields...>')
  .description('Remove fields from workspace restrictedFields')
  .option('--dir <dir>', 'Workspace root (default: cwd)')
  .action((fields: string[], options: { dir?: string }) => {
    const { configPath, raw } = resolveConfig(options.dir)
    const existing: string[] = (raw.guardlock as Record<string, unknown>)?.restrictedFields as string[] ?? []
    const after = existing.filter((f) => !fields.includes(f))
    const removed = fields.filter((f) => existing.includes(f))
    const notFound = fields.filter((f) => !existing.includes(f))
    if (notFound.length) process.stdout.write(`  Not in restrictedFields: ${notFound.join(', ')}\n`)
    if (removed.length === 0) { process.stdout.write('  Nothing to remove.\n'); return }
    raw.guardlock = { ...((raw.guardlock as object) ?? {}), restrictedFields: after }
    writeConfig(configPath, raw)
    process.stdout.write(`  🔓 Removed from workspace restrictedFields: ${removed.join(', ')}\n\n`)
  })

baseCommand
  .command('require-alternatives <on|off>')
  .description('Toggle requireAlternatives — when on, advance_feature(frozen) blocks if any decision lacks alternativesConsidered')
  .option('--dir <dir>', 'Workspace root (default: cwd)')
  .action((value: string, options: { dir?: string }) => {
    const enabled = value === 'on' || value === 'true'
    const { configPath, raw } = resolveConfig(options.dir)
    raw.guardlock = { ...((raw.guardlock as object) ?? {}), requireAlternatives: enabled }
    writeConfig(configPath, raw)
    process.stdout.write(`  ✓ guardlock.requireAlternatives = ${enabled}\n`)
    if (enabled) {
      process.stdout.write('  advance_feature(frozen) will now block if any decision lacks alternativesConsidered.\n')
      process.stdout.write('  This is the real guardlock — not just what was chosen, but what was rejected.\n\n')
    } else {
      process.stdout.write('  advance_feature(frozen) will no longer check for alternativesConsidered.\n\n')
    }
  })

baseCommand
  .command('require-revision <on|off>')
  .description('Toggle freezeRequiresHumanRevision — when on, advance_feature(frozen) requires at least one revision entry')
  .option('--dir <dir>', 'Workspace root (default: cwd)')
  .action((value: string, options: { dir?: string }) => {
    const enabled = value === 'on' || value === 'true'
    const { configPath, raw } = resolveConfig(options.dir)
    raw.guardlock = { ...((raw.guardlock as object) ?? {}), freezeRequiresHumanRevision: enabled }
    writeConfig(configPath, raw)
    process.stdout.write(`  ✓ guardlock.freezeRequiresHumanRevision = ${enabled}\n`)
    if (enabled) {
      process.stdout.write('  Freezing now requires a human revision entry on intent-critical fields.\n')
      process.stdout.write('  AI-only fills cannot be frozen — a human must sign off first.\n\n')
    } else {
      process.stdout.write('  Human revision no longer required before freeze.\n\n')
    }
  })

function showBase(dir?: string): void {
  const startDir = dir ? path.resolve(dir) : process.cwd()
  const configPath = findLacConfig(startDir)
  const config = loadConfig(startDir)
  const g = config.guardlock

  process.stdout.write('\n  Workspace guardlock config')
  process.stdout.write(configPath ? ` (${configPath})\n` : ' (no lac.config.json — showing defaults)\n')
  process.stdout.write('\n')
  process.stdout.write(`  mode                        ${g.mode ?? 'warn'}\n`)
  process.stdout.write(`  restrictedFields            ${(g.restrictedFields ?? []).length > 0 ? (g.restrictedFields ?? []).join(', ') : '(none)'}\n`)
  process.stdout.write(`  requireAlternatives         ${g.requireAlternatives ? 'true  ← freeze blocked without alternativesConsidered' : 'false'}\n`)
  process.stdout.write(`  freezeRequiresHumanRevision ${g.freezeRequiresHumanRevision ? 'true  ← freeze requires revision entry' : 'false'}\n`)
  process.stdout.write('\n')
  process.stdout.write('  Edit commands:\n')
  process.stdout.write('    lac guardlock base mode block\n')
  process.stdout.write('    lac guardlock base lock <fields...>\n')
  process.stdout.write('    lac guardlock base unlock <fields...>\n')
  process.stdout.write('    lac guardlock base require-alternatives on\n')
  process.stdout.write('    lac guardlock base require-revision on\n\n')
}

function resolveConfig(dir?: string): { configPath: string; raw: Record<string, unknown> } {
  const startDir = dir ? path.resolve(dir) : process.cwd()
  const existing = findLacConfig(startDir)
  const configPath = existing ?? path.join(startDir, 'lac.config.json')
  let raw: Record<string, unknown> = {}
  if (existing) {
    try { raw = JSON.parse(fs.readFileSync(existing, 'utf-8')) as Record<string, unknown> } catch { /* start fresh */ }
  }
  return { configPath, raw }
}

function writeConfig(configPath: string, raw: Record<string, unknown>): void {
  fs.writeFileSync(configPath, JSON.stringify(raw, null, 2) + '\n', 'utf-8')
}

function modeDescription(mode: string): string {
  if (mode === 'block') return '  AI writes to restricted fields will be rejected with an error.'
  if (mode === 'warn') return '  AI writes to restricted fields will proceed with a warning.'
  return '  Guardlock is disabled — all field writes are unrestricted.'
}

// ── thaw (remove featureLocked) ───────────────────────────────────────────────

guardlockCommand
  .command('thaw [dir]')
  .description('Remove the featureLocked flag — re-allows AI tools to fill missing fields')
  .action((dir?: string) => {
    const featureDir = resolveFeatureDir(dir)
    const { raw, featurePath } = readFeature(featureDir)

    if (!raw.featureLocked) {
      process.stdout.write(`  ${String(raw.featureKey)} is not fully locked — nothing to thaw.\n`)
      return
    }

    delete raw.featureLocked
    writeFeature(featurePath, raw)

    process.stdout.write(`  🔓 ${String(raw.featureKey)} is no longer fully AI-locked.\n`)
    process.stdout.write(`  Per-field locks (fieldLocks[]) are still active if any exist.\n\n`)
  })
