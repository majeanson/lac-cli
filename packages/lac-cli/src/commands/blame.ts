import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { computeCompleteness } from '../lib/config.js'
import { findNearestFeatureJson } from '../lib/walker.js'

export const blameCommand = new Command('blame')
  .description('Show which feature owns a file or path')
  .argument('<path>', 'File path to trace (supports path:line format, line is ignored)')
  .action((rawPath: string) => {
    // Strip line number if provided (e.g. src/auth/index.ts:42 → src/auth/index.ts)
    const filePath = rawPath.replace(/:\d+$/, '')
    const absPath = resolve(filePath)
    const startDir = dirname(absPath)

    const featureJsonPath = findNearestFeatureJson(startDir)

    if (!featureJsonPath) {
      process.stderr.write(
        `No feature.json found for "${filePath}".\nRun "lac init" in the feature folder to create one.\n`,
      )
      process.exit(1)
    }

    let raw: string
    try {
      raw = readFileSync(featureJsonPath, 'utf-8')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error reading "${featureJsonPath}": ${message}\n`)
      process.exit(1)
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      process.stderr.write(`Error: "${featureJsonPath}" contains invalid JSON.\n`)
      process.exit(1)
    }

    const result = validateFeature(parsed)
    if (!result.success) {
      process.stderr.write(`Error: "${featureJsonPath}" failed validation:\n  ${result.errors.join('\n  ')}\n`)
      process.exit(1)
    }

    const f = result.data

    const statusIcon: Record<string, string> = {
      active: '⊙',
      draft: '◌',
      frozen: '❄',
      deprecated: '⊘',
    }
    const icon = statusIcon[f.status] ?? '?'
    const completeness = computeCompleteness(f as unknown as Record<string, unknown>)
    const bar = '█'.repeat(Math.round(completeness / 10)) + '░'.repeat(10 - Math.round(completeness / 10))

    process.stdout.write('\n')
    process.stdout.write(`  Feature   : ${f.featureKey}\n`)
    process.stdout.write(`  Title     : ${f.title}\n`)
    process.stdout.write(`  Status    : ${icon}  ${f.status}\n`)
    process.stdout.write(`  Complete  : [${bar}] ${completeness}%\n`)
    process.stdout.write(`  Path      : ${featureJsonPath}\n`)
    process.stdout.write('\n')
    process.stdout.write(`  Problem:\n    ${f.problem}\n`)

    if (f.analysis) {
      const excerpt = f.analysis.length > 120 ? f.analysis.slice(0, 120) + '…' : f.analysis
      process.stdout.write(`\n  Analysis:\n    ${excerpt}\n`)
    }

    if (f.decisions && f.decisions.length > 0) {
      process.stdout.write(`\n  Decisions (${f.decisions.length}):\n`)
      for (const d of f.decisions) {
        process.stdout.write(`    • ${d.decision}\n      Rationale: ${d.rationale}\n`)
      }
    }

    if (f.knownLimitations && f.knownLimitations.length > 0) {
      process.stdout.write(`\n  Known Limitations:\n`)
      for (const lim of f.knownLimitations) {
        process.stdout.write(`    - ${lim}\n`)
      }
    }

    if (f.lineage?.parent) {
      process.stdout.write(`\n  Lineage   : parent → ${f.lineage.parent}\n`)
    }

    process.stdout.write('\n')
  })
