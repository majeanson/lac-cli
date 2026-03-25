import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import readline from 'node:readline'
import { resolve } from 'node:path'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { loadConfig } from '../lib/config.js'
import { scanFeatures } from '../lib/scanner.js'

const INTENT_CRITICAL = ['problem', 'analysis', 'implementation', 'decisions', 'successCriteria'] as const

function askUser(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

const baselineCommand = new Command('baseline')
  .description('Add a first revision entry to all features that have intent-critical fields but no revisions')
  .argument('[dir]', 'Directory to scan (default: cwd)')
  .option('--author <author>', 'Author name for the baseline revision')
  .option('--reason <reason>', 'Reason text for the baseline revision (default: "initial baseline")')
  .option('--dry-run', 'Preview which features would be updated without writing')
  .action(async (dir: string | undefined, options: {
    author?: string
    reason?: string
    dryRun?: boolean
  }) => {
    const scanDir = resolve(dir ?? process.cwd())
    const config = loadConfig(scanDir)

    const features = await scanFeatures(scanDir)

    // Find features that have intent-critical fields but no revisions
    const needsBaseline = features.filter(({ feature }) => {
      const raw = feature as unknown as Record<string, unknown>
      const hasRevisions = Array.isArray(raw.revisions) && (raw.revisions as unknown[]).length > 0
      if (hasRevisions) return false
      return INTENT_CRITICAL.some((field) => {
        const val = raw[field]
        if (val === undefined || val === null) return false
        if (typeof val === 'string') return val.trim().length > 0
        if (Array.isArray(val)) return (val as unknown[]).length > 0
        return false
      })
    })

    if (needsBaseline.length === 0) {
      process.stdout.write('All features already have revision entries. Nothing to baseline.\n')
      return
    }

    process.stdout.write(`Found ${needsBaseline.length} feature(s) without revisions:\n`)
    for (const { feature } of needsBaseline) {
      process.stdout.write(`  ${feature.featureKey}  ${feature.title}\n`)
    }
    process.stdout.write('\n')

    if (options.dryRun) {
      process.stdout.write('[dry-run] No changes written.\n')
      return
    }

    // Resolve author
    const defaultAuthor = (config as unknown as Record<string, unknown>).defaultAuthor as string | undefined
    let author = options.author ?? defaultAuthor ?? ''
    if (!author) {
      author = await askUser('Revision author (for all features): ')
    }
    if (!author) {
      process.stderr.write('Error: author is required.\n')
      process.exit(1)
    }

    const reason = options.reason ?? 'initial baseline — revisions tracking added retroactively'
    const _dtr = new Date()
    const today = `${_dtr.getFullYear()}-${String(_dtr.getMonth() + 1).padStart(2, '0')}-${String(_dtr.getDate()).padStart(2, '0')}`

    let updated = 0
    for (const { feature, filePath } of needsBaseline) {
      const raw = feature as unknown as Record<string, unknown>

      const filledCritical = INTENT_CRITICAL.filter((field) => {
        const val = raw[field]
        if (val === undefined || val === null) return false
        if (typeof val === 'string') return val.trim().length > 0
        if (Array.isArray(val)) return (val as unknown[]).length > 0
        return false
      })

      const revision = { date: today, author, fields_changed: filledCritical, reason }
      const content = JSON.parse(await readFile(filePath, 'utf-8')) as Record<string, unknown>
      content.revisions = [revision]

      const validation = validateFeature(content)
      if (!validation.success) {
        process.stderr.write(`  ✗  ${feature.featureKey}  validation failed — skipping\n`)
        continue
      }

      await writeFile(filePath, JSON.stringify(validation.data, null, 2) + '\n', 'utf-8')
      process.stdout.write(`  ✓  ${feature.featureKey}  baselined (${filledCritical.join(', ')})\n`)
      updated++
    }

    process.stdout.write(`\n${updated} feature(s) baselined.\n`)
  })

export const revisionsCommand = new Command('revisions')
  .description('Manage feature revision history')
  .addCommand(baselineCommand)
