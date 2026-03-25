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
import { findNearestFeatureJson } from '../lib/walker.js'

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
