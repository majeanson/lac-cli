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
  type: 'component' | 'test' | 'migration' | 'docs' | 'types' | 'adr' | 'snippets' | 'mock'
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

  const feature = result.data as Record<string, unknown>

  // ── Deterministic generators (no AI) ────────────────────────────────────────
  if (type === 'types') {
    const generated = genTypes(feature)
    return writeOrPrint(generated, options.outFile ?? path.join(featureDir, `${feature['featureKey']}.types.ts`), dryRun, type)
  }
  if (type === 'adr') {
    const generated = genAdr(feature)
    return writeOrPrint(generated, options.outFile ?? path.join(featureDir, 'ARCHITECTURE-DECISIONS.md'), dryRun, type)
  }
  if (type === 'snippets') {
    const generated = genSnippets(feature)
    return writeOrPrint(generated, options.outFile ?? path.join(featureDir, `${feature['featureKey']}-snippets.md`), dryRun, type)
  }

  // ── AI generators ────────────────────────────────────────────────────────────
  const promptConfig = GEN_PROMPTS[type]
  if (!promptConfig) {
    throw new Error(
      `Unknown generation type: "${type}". Available: component, test, migration, docs, types, adr, snippets, mock`,
    )
  }

  const client = createClient()
  process.stdout.write(`\nGenerating ${type} for ${feature['featureKey']} (${feature['title']})...\n`)
  process.stdout.write(`Model: ${model}\n\n`)

  const ctx = buildContext(featureDir, result.data)
  const contextStr = contextToString(ctx)

  const generated = await generateText(
    client,
    promptConfig.system,
    `${contextStr}\n\n${promptConfig.userSuffix}`,
    model,
  )

  return writeOrPrint(generated, options.outFile ?? path.join(featureDir, `${feature['featureKey']}${typeToExt(type)}`), dryRun, type)
}

function writeOrPrint(content: string, outFile: string, dryRun: boolean, type: string): string {
  if (dryRun) {
    process.stdout.write(content)
    process.stdout.write(`\n\n  [dry-run] No file written.\n`)
    return content
  }
  fs.writeFileSync(outFile, content, 'utf-8')
  process.stdout.write(`  ✓ Generated ${type} → ${outFile}\n\n`)
  return content
}

// ── Deterministic generator implementations ──────────────────────────────────

function genTypes(feature: Record<string, unknown>): string {
  const iface = feature['publicInterface'] as Array<{ name: string; type: string; description?: string }> | undefined
  const featureKey = feature['featureKey'] as string
  const title = feature['title'] as string

  const lines: string[] = [
    `// Generated by lac gen --type types`,
    `// Feature: ${featureKey} — ${title}`,
    `// Do not edit manually — regenerate with: lac gen --type types`,
    ``,
  ]

  if (!iface || iface.length === 0) {
    lines.push(`// No publicInterface entries found in feature.json`)
    lines.push(`// Add publicInterface[] to the feature to generate type declarations`)
    return lines.join('\n')
  }

  for (const entry of iface) {
    if (entry.description) {
      lines.push(`/** ${entry.description} */`)
    }
    const lower = entry.type.toLowerCase()
    const name = entry.name

    if (lower.includes('react component') || (lower.includes('component') && !lower.includes('context'))) {
      lines.push(`export interface ${name}Props {`)
      lines.push(`  // TODO: define props`)
      lines.push(`}`)
      lines.push(`export declare function ${name}(props: ${name}Props): JSX.Element`)
    } else if (lower.includes('context') || lower.includes('provider')) {
      const valueName = `${name}Value`
      lines.push(`export interface ${valueName} {`)
      lines.push(`  // TODO: define context value shape`)
      lines.push(`}`)
      lines.push(`export declare const ${name}: React.Context<${valueName}>`)
    } else if (lower.includes('hook') || name.startsWith('use')) {
      lines.push(`export declare function ${name}(): unknown // TODO: define return type`)
    } else if (lower.includes('service') || lower.includes('manager') || lower.includes('class')) {
      lines.push(`export declare class ${name} {`)
      lines.push(`  // TODO: define service methods`)
      lines.push(`}`)
    } else if (lower.includes('function') || lower.includes('util') || lower.includes('helper')) {
      lines.push(`export declare function ${name}(...args: unknown[]): unknown // TODO: define signature`)
    } else {
      lines.push(`export interface ${name} {`)
      lines.push(`  // TODO: define interface shape`)
      lines.push(`}`)
    }
    lines.push(``)
  }

  return lines.join('\n')
}

function genAdr(feature: Record<string, unknown>): string {
  const decisions = feature['decisions'] as Array<{
    decision: string; rationale: string; alternativesConsidered?: string[]; date?: string
  }> | undefined
  const featureKey = feature['featureKey'] as string
  const title = feature['title'] as string
  const problem = feature['problem'] as string | undefined
  const analysis = feature['analysis'] as string | undefined

  const lines: string[] = [
    `# Architecture Decision Records — ${title}`,
    ``,
    `> Feature: \`${featureKey}\`  `,
    `> Generated by: \`lac gen --type adr\``,
    ``,
    `---`,
    ``,
  ]

  if (!decisions || decisions.length === 0) {
    lines.push(`*No decisions recorded in this feature.json.*`)
    lines.push(``)
    lines.push(`Add \`decisions[]\` to the feature to generate ADRs.`)
    return lines.join('\n')
  }

  decisions.forEach((d, i) => {
    const slug = d.decision.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)
    lines.push(`## ADR-${String(i + 1).padStart(3, '0')}: ${d.decision}`)
    lines.push(``)
    lines.push(`**Status:** Accepted  `)
    if (d.date) lines.push(`**Date:** ${d.date}  `)
    lines.push(`**Feature:** \`${featureKey}\``)
    lines.push(``)
    lines.push(`### Context`)
    lines.push(``)
    if (problem) {
      lines.push(problem)
      lines.push(``)
    }
    if (analysis) {
      lines.push(analysis)
      lines.push(``)
    }
    lines.push(`### Decision`)
    lines.push(``)
    lines.push(d.decision)
    lines.push(``)
    lines.push(`### Rationale`)
    lines.push(``)
    lines.push(d.rationale)
    lines.push(``)
    if (d.alternativesConsidered && d.alternativesConsidered.length > 0) {
      lines.push(`### Alternatives Considered`)
      lines.push(``)
      for (const alt of d.alternativesConsidered) {
        lines.push(`- ${alt}`)
      }
      lines.push(``)
    }
    lines.push(`---`)
    lines.push(``)
    void slug
  })

  return lines.join('\n')
}

function genSnippets(feature: Record<string, unknown>): string {
  const snippets = feature['codeSnippets'] as Array<{ label: string; snippet: string }> | undefined
  const featureKey = feature['featureKey'] as string
  const title = feature['title'] as string

  const lines: string[] = [
    `# Code Snippets — ${title}`,
    ``,
    `> Feature: \`${featureKey}\`  `,
    `> Generated by: \`lac gen --type snippets\``,
    ``,
    `---`,
    ``,
  ]

  if (!snippets || snippets.length === 0) {
    lines.push(`*No codeSnippets recorded in this feature.json.*`)
    lines.push(``)
    lines.push(`Add \`codeSnippets[]\` to the feature to generate a snippet reference.`)
    return lines.join('\n')
  }

  for (const s of snippets) {
    lines.push(`## ${s.label}`)
    lines.push(``)
    lines.push('```')
    lines.push(s.snippet)
    lines.push('```')
    lines.push(``)
  }

  return lines.join('\n')
}

export interface GenWithCustomPromptOptions {
  featureDir: string
  systemPrompt: string
  dryRun?: boolean
  outFile?: string
  model?: string
}

/**
 * Runs a custom AI generator against a single feature.json.
 * Used by the `lac gen --generator <name>` plugin system for type:"ai" generators.
 */
export async function genWithCustomPrompt(options: GenWithCustomPromptOptions): Promise<string> {
  const { featureDir, systemPrompt, dryRun = false, model = 'claude-sonnet-4-6' } = options

  const featurePath = path.join(featureDir, 'feature.json')

  let raw: string
  try {
    raw = fs.readFileSync(featurePath, 'utf-8')
  } catch {
    throw new Error(`No feature.json found at "${featurePath}"`)
  }

  const parsed = JSON.parse(raw) as unknown
  const result = validateFeature(parsed)
  if (!result.success) throw new Error(`Invalid feature.json: ${result.errors.join(', ')}`)

  const feature = result.data as Record<string, unknown>
  const client = createClient()

  process.stdout.write(`  Running AI generator for ${feature['featureKey']} (${feature['title']})...\n`)

  const ctx = buildContext(featureDir, result.data)
  const contextStr = contextToString(ctx)

  const generated = await generateText(
    client,
    systemPrompt,
    `${contextStr}\n\nGenerate the requested output for this feature.`,
    model,
  )

  const outFile = options.outFile ?? path.join(featureDir, `${feature['featureKey']}-generated.txt`)
  return writeOrPrint(generated, outFile, dryRun, 'custom')
}

function typeToExt(type: string): string {
  const map: Record<string, string> = {
    component: '.tsx',
    test: '.test.ts',
    migration: '.sql',
    docs: '.md',
    mock: '.mock.ts',
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
