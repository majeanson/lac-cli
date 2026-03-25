import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'

import { validateFeature } from '@life-as-code/feature-schema'

import { createClient, generateText } from './client.js'
import { buildContext, contextToString } from './context-builder.js'
import { printDiff, type FieldDiff } from './diff.js'
import { checkGuardlock, loadGuardlockConfig, type FieldLock } from './guardlock.js'
import {
  FILL_PROMPTS,
  GEN_PROMPTS,
  JSON_FIELDS,
  getMissingFields,
  type FillableField,
} from './prompts.js'
import { appendPromptLog, hashPrompt, type PromptLogEntry } from './prompt-log.js'

export type { FillableField }
export { buildContext, contextToString } from './context-builder.js'
export { getMissingFields, ALL_FILLABLE_FIELDS, FILL_PROMPTS, JSON_FIELDS } from './prompts.js'
export { extractFeature } from './extract.js'
export type { ExtractedFeatureFields } from './extract.js'
export { appendPromptLog, hashPrompt, PROMPT_LOG_FILENAME } from './prompt-log.js'
export type { PromptLogEntry } from './prompt-log.js'
export {
  loadGuardlockConfig,
  resolveLockedFields,
  checkGuardlock,
  formatGuardlockMessage,
} from './guardlock.js'
export type { GuardlockConfig, FieldLock } from './guardlock.js'

export interface FillOptions {
  /** Absolute path to the feature folder (contains feature.json) */
  featureDir: string
  /** Specific fields to fill. Undefined = all missing fields. */
  fields?: string[]
  /** Print proposed changes without writing or prompting */
  dryRun?: boolean
  /** Skip the interactive confirm prompt and apply immediately */
  skipConfirm?: boolean
  /** Model override */
  model?: string
  /** Pre-fill the revision author prompt (from lac.config.json defaultAuthor) */
  defaultAuthor?: string
  /**
   * Fields to skip even if missing — combines workspace guardlock.restrictedFields
   * and per-feature fieldLocks. Passed by fill.ts after loading config.
   * When set, lac fill will skip these fields and emit a notice.
   */
  guardlockRestrictedFields?: string[]
  /** When true, skip guardlock checks and fill all requested fields anyway. */
  force?: boolean
}

export interface FillResult {
  applied: boolean
  fields: string[]
  patch: Record<string, unknown>
}

export interface GenOptions {
  featureDir: string
  type: 'component' | 'test' | 'migration' | 'docs'
  dryRun?: boolean
  /** If set, write to this path instead of auto-naming */
  outFile?: string
  model?: string
}

export async function fillFeature(options: FillOptions): Promise<FillResult> {
  const {
    featureDir,
    dryRun = false,
    skipConfirm = false,
    model = 'claude-sonnet-4-6',
    defaultAuthor = '',
    force = false,
  } = options

  const featurePath = path.join(featureDir, 'feature.json')

  let raw: string
  try {
    raw = fs.readFileSync(featurePath, 'utf-8')
  } catch {
    throw new Error(`No feature.json found at "${featurePath}"`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Invalid JSON in "${featurePath}"`)
  }

  const result = validateFeature(parsed)
  if (!result.success) {
    throw new Error(`Invalid feature.json: ${result.errors.join(', ')}`)
  }

  const feature = result.data
  const client = createClient()

  // Determine which fields to fill
  let fieldsToFill: FillableField[] = options.fields
    ? (options.fields as FillableField[])
    : getMissingFields(feature)

  // Guardlock: skip restricted fields unless --force
  if (!force) {
    // Load workspace config + merge per-feature fieldLocks
    const guardConfig = loadGuardlockConfig(featureDir)
    const perFeatureLocks: FieldLock[] = (feature as Record<string, unknown>).fieldLocks as FieldLock[] ?? []
    const featureLocked = !!(feature as Record<string, unknown>).featureLocked
    const violations = checkGuardlock(
      { ...guardConfig, restrictedFields: [...(options.guardlockRestrictedFields ?? guardConfig.restrictedFields)] },
      perFeatureLocks,
      fieldsToFill,
      featureLocked,
    )
    if (violations.length > 0) {
      const lockedFieldNames = new Set(violations.map((v) => v.field))
      const skipped = fieldsToFill.filter((f) => lockedFieldNames.has(f))
      fieldsToFill = fieldsToFill.filter((f) => !lockedFieldNames.has(f))
      process.stdout.write(`  🔒 Skipping ${skipped.length} locked field(s) — use --force to override: ${skipped.join(', ')}\n`)
      if (violations.some((v) => v.reason)) {
        for (const v of violations) {
          process.stdout.write(`     ${v.field}: ${v.reason}\n`)
        }
      }
    }
  }

  if (fieldsToFill.length === 0) {
    process.stdout.write(`  All fields already filled for ${feature.featureKey}.\n`)
    return { applied: false, fields: [], patch: {} }
  }

  process.stdout.write(`\nAnalyzing ${feature.featureKey} (${feature.title})...\n`)

  const ctx = buildContext(featureDir, feature)
  const contextStr = contextToString(ctx)

  process.stdout.write(`Reading ${ctx.sourceFiles.length} source file(s)...\n`)
  process.stdout.write(`Generating with ${model}...\n`)

  // Fill each field
  const patch: Record<string, unknown> = {}
  const diffs: FieldDiff[] = []
  // Track raw responses for prompt log (keyed by field)
  const rawResponses = new Map<string, { raw: string; systemPrompt: string }>()

  for (const field of fieldsToFill) {
    const prompt = FILL_PROMPTS[field]
    if (!prompt) continue

    process.stdout.write(`  → ${field}...`)

    try {
      const rawValue = await generateText(
        client,
        prompt.system,
        `${contextStr}\n\n${prompt.userSuffix}`,
        model,
      )

      rawResponses.set(field, { raw: rawValue, systemPrompt: prompt.system })

      let value: unknown = rawValue.trim()

      if (JSON_FIELDS.has(field)) {
        try {
          // Strip markdown code fences if present
          const fenceMatch = rawValue.match(/```(?:json)?\s*([\s\S]*?)```/)
          const jsonStr = fenceMatch?.[1] ?? rawValue
          value = JSON.parse(jsonStr.trim())
        } catch {
          process.stderr.write(
            `\n  Warning: could not parse JSON for "${field}", storing as string\n`,
          )
        }
      }

      patch[field] = value

      const existing = (feature as Record<string, unknown>)[field]
      const wasEmpty =
        existing === undefined ||
        existing === null ||
        (typeof existing === 'string' && existing.trim().length === 0) ||
        (Array.isArray(existing) && existing.length === 0)

      diffs.push({ field, wasEmpty, proposed: value })
      process.stdout.write(' done\n')
    } catch (err) {
      process.stdout.write(' failed\n')
      process.stderr.write(
        `  Error generating "${field}": ${err instanceof Error ? err.message : String(err)}\n`,
      )
    }
  }

  if (diffs.length === 0) {
    return { applied: false, fields: [], patch: {} }
  }

  printDiff(diffs)

  if (dryRun) {
    process.stdout.write('  [dry-run] No changes written.\n\n')
    return { applied: false, fields: Object.keys(patch), patch }
  }

  // Interactive confirm (unless skipped for MCP/programmatic use)
  if (!skipConfirm) {
    const answer = await askUser('Apply? [Y]es / [n]o / [f]ield-by-field: ')

    if (answer.toLowerCase() === 'n') {
      process.stdout.write('  Cancelled.\n')
      return { applied: false, fields: Object.keys(patch), patch }
    }

    if (answer.toLowerCase() === 'f') {
      const approved: Record<string, unknown> = {}
      for (const [field, value] of Object.entries(patch)) {
        const a = await askUser(`  Apply "${field}"? [Y/n]: `)
        if (a.toLowerCase() !== 'n') approved[field] = value
      }
      // Replace patch with only approved fields
      for (const key of Object.keys(patch)) {
        if (!(key in approved)) delete patch[key]
      }
      Object.assign(patch, approved)
    }
  }

  // Collect revision note only for intent-critical fields that were previously non-empty (true changes, not first fills)
  const INTENT_CRITICAL = new Set(['problem', 'analysis', 'implementation', 'decisions', 'successCriteria'])
  const changedCritical = Object.keys(patch).filter((k) => {
    if (!INTENT_CRITICAL.has(k)) return false
    const existing = (feature as Record<string, unknown>)[k]
    if (existing === undefined || existing === null) return false
    if (typeof existing === 'string') return existing.trim().length > 0
    if (Array.isArray(existing)) return existing.length > 0
    return false
  })

  const base = parsed as Record<string, unknown>
  let updatedRevisions = (base.revisions as unknown[]) ?? []

  if (!skipConfirm && changedCritical.length > 0) {
    process.stdout.write(`\n  Intent-critical fields changed: ${changedCritical.join(', ')}\n`)
    const authorPrompt = defaultAuthor ? `  Revision author [${defaultAuthor}]: ` : '  Revision author: '
    const authorInput = await askUser(authorPrompt)
    const author = authorInput || defaultAuthor
    const reason = await askUser('  Reason for change: ')
    if (author && reason) {
      const d = new Date()
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      updatedRevisions = [
        ...updatedRevisions,
        { date: today, author, fields_changed: changedCritical, reason },
      ]
    }
  }

  // Write to disk
  const updated = { ...base, ...patch, ...(updatedRevisions.length > 0 ? { revisions: updatedRevisions } : {}) }
  fs.writeFileSync(featurePath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')

  // Append prompt log entries for every field actually written
  const now = new Date().toISOString()
  const logEntries: PromptLogEntry[] = Object.keys(patch).map((field) => {
    const captured = rawResponses.get(field)
    return {
      date: now,
      field,
      source: 'lac fill',
      model,
      prompt_hash: captured ? hashPrompt(captured.systemPrompt) : undefined,
      response_preview: captured ? captured.raw.slice(0, 120) : undefined,
    }
  })
  appendPromptLog(featureDir, logEntries)

  const count = Object.keys(patch).length
  process.stdout.write(
    `\n  ✓ Updated ${feature.featureKey} — ${count} field${count === 1 ? '' : 's'} written.\n\n`,
  )

  return { applied: true, fields: Object.keys(patch), patch }
}

export async function genFromFeature(options: GenOptions): Promise<string> {
  const { featureDir, type, dryRun = false, model = 'claude-sonnet-4-6' } = options

  const featurePath = path.join(featureDir, 'feature.json')

  let raw: string
  try {
    raw = fs.readFileSync(featurePath, 'utf-8')
  } catch {
    throw new Error(`No feature.json found at "${featurePath}"`)
  }

  const parsed = JSON.parse(raw) as unknown
  const result = validateFeature(parsed)
  if (!result.success) {
    throw new Error(`Invalid feature.json: ${result.errors.join(', ')}`)
  }

  const feature = result.data
  const promptConfig = GEN_PROMPTS[type]
  if (!promptConfig) {
    throw new Error(
      `Unknown generation type: "${type}". Available: component, test, migration, docs`,
    )
  }

  const client = createClient()

  process.stdout.write(`\nGenerating ${type} for ${feature.featureKey} (${feature.title})...\n`)
  process.stdout.write(`Model: ${model}\n\n`)

  const ctx = buildContext(featureDir, feature)
  const contextStr = contextToString(ctx)

  const generated = await generateText(
    client,
    promptConfig.system,
    `${contextStr}\n\n${promptConfig.userSuffix}`,
    model,
  )

  if (dryRun) {
    process.stdout.write(generated)
    process.stdout.write('\n\n  [dry-run] No file written.\n')
    return generated
  }

  const outFile =
    options.outFile ??
    path.join(
      featureDir,
      `${feature.featureKey}${typeToExt(type)}`,
    )

  fs.writeFileSync(outFile, generated, 'utf-8')
  process.stdout.write(`  ✓ Written to ${outFile}\n\n`)

  return generated
}

function typeToExt(type: string): string {
  const map: Record<string, string> = {
    component: '.tsx',
    test: '.test.ts',
    migration: '.sql',
    docs: '.md',
  }
  return map[type] ?? '.txt'
}

function askUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim() || 'y')
    })
  })
}
