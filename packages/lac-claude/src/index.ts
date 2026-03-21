import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import readline from 'node:readline'

import { validateFeature } from '@life-as-code/feature-schema'

import { createClient, generateText } from './client.js'
import { buildContext, contextToString } from './context-builder.js'
import { printDiff, type FieldDiff } from './diff.js'
import {
  FILL_PROMPTS,
  GEN_PROMPTS,
  JSON_FIELDS,
  getMissingFields,
  type FillableField,
} from './prompts.js'

export type { FillableField }
export { buildContext, contextToString } from './context-builder.js'
export { getMissingFields, ALL_FILLABLE_FIELDS, FILL_PROMPTS, JSON_FIELDS } from './prompts.js'

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
  const { featureDir, dryRun = false, skipConfirm = false, model = 'claude-sonnet-4-6' } = options

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
  const fieldsToFill: FillableField[] = options.fields
    ? (options.fields as FillableField[])
    : getMissingFields(feature)

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

  // Write to disk
  const updated = { ...(parsed as Record<string, unknown>), ...patch }
  fs.writeFileSync(featurePath, JSON.stringify(updated, null, 2) + '\n', 'utf-8')

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
