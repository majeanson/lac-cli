import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'

export const supersedeCommand = new Command('supersede')
  .description('Mark one feature as superseded by another, setting pointers on both sides')
  .argument('<old-key>', 'featureKey being superseded (will be deprecated)')
  .argument('<new-key>', 'featureKey that supersedes it')
  .option('-d, --dir <path>', 'Directory to scan (default: cwd)')
  .option('--dry-run', 'Preview changes without writing')
  .action(async (oldKey: string, newKey: string, options: { dir?: string; dryRun?: boolean }) => {
    const scanDir = resolve(options.dir ?? process.cwd())
    const features = await scanFeatures(scanDir)
    const byKey = new Map(features.map((f) => [f.feature.featureKey, f]))

    const oldEntry = byKey.get(oldKey)
    if (!oldEntry) {
      process.stderr.write(`Error: feature "${oldKey}" not found in "${scanDir}"\n`)
      process.exit(1)
    }
    const newEntry = byKey.get(newKey)
    if (!newEntry) {
      process.stderr.write(`Error: feature "${newKey}" not found in "${scanDir}"\n`)
      process.exit(1)
    }

    process.stdout.write(`Supersede: ${oldKey} → ${newKey}\n`)
    process.stdout.write(`  ${oldKey}: status → deprecated, superseded_by = ${newKey}\n`)
    process.stdout.write(`  ${newKey}: superseded_from += [${oldKey}]\n`)

    if (options.dryRun) {
      process.stdout.write('[dry-run] No changes written.\n')
      return
    }

    // Update old feature
    const oldRaw = JSON.parse(await readFile(oldEntry.filePath, 'utf-8')) as Record<string, unknown>
    oldRaw.status = 'deprecated'
    oldRaw.superseded_by = newKey
    const oldValidation = validateFeature(oldRaw)
    if (!oldValidation.success) {
      process.stderr.write(`Validation error on "${oldKey}": ${oldValidation.errors.join(', ')}\n`)
      process.exit(1)
    }
    await writeFile(oldEntry.filePath, JSON.stringify(oldValidation.data, null, 2) + '\n', 'utf-8')

    // Update new feature
    const newRaw = JSON.parse(await readFile(newEntry.filePath, 'utf-8')) as Record<string, unknown>
    const existingSupersededFrom = (newRaw.superseded_from as string[] | undefined) ?? []
    if (!existingSupersededFrom.includes(oldKey)) {
      newRaw.superseded_from = [...existingSupersededFrom, oldKey]
    }
    const newValidation = validateFeature(newRaw)
    if (!newValidation.success) {
      process.stderr.write(`Validation error on "${newKey}": ${newValidation.errors.join(', ')}\n`)
      process.exit(1)
    }
    await writeFile(newEntry.filePath, JSON.stringify(newValidation.data, null, 2) + '\n', 'utf-8')

    process.stdout.write(`✓ ${oldKey} superseded by ${newKey}\n`)
  })
