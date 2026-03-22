import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'

export const mergeCommand = new Command('merge')
  .description('Merge two or more features into a target feature, setting pointers on all sides')
  .argument('<source-keys>', 'Comma-separated featureKeys to merge (will be deprecated)')
  .requiredOption('--into <target-key>', 'featureKey of the target feature to merge into')
  .option('-d, --dir <path>', 'Directory to scan (default: cwd)')
  .option('--dry-run', 'Preview changes without writing')
  .action(async (sourceKeysArg: string, options: { into: string; dir?: string; dryRun?: boolean }) => {
    const scanDir = resolve(options.dir ?? process.cwd())
    const sourceKeys = sourceKeysArg.split(',').map((k) => k.trim()).filter(Boolean)
    const targetKey = options.into

    if (sourceKeys.length === 0) {
      process.stderr.write('Error: at least one source key is required.\n')
      process.exit(1)
    }

    const features = await scanFeatures(scanDir)
    const byKey = new Map(features.map((f) => [f.feature.featureKey, f]))

    for (const key of sourceKeys) {
      if (!byKey.has(key)) {
        process.stderr.write(`Error: feature "${key}" not found in "${scanDir}"\n`)
        process.exit(1)
      }
    }
    const targetEntry = byKey.get(targetKey)
    if (!targetEntry) {
      process.stderr.write(`Error: target feature "${targetKey}" not found in "${scanDir}"\n`)
      process.exit(1)
    }

    process.stdout.write(`Merge: [${sourceKeys.join(', ')}] → ${targetKey}\n`)
    for (const key of sourceKeys) {
      process.stdout.write(`  ${key}: status → deprecated, merged_into = ${targetKey}\n`)
    }
    process.stdout.write(`  ${targetKey}: merged_from += [${sourceKeys.join(', ')}]\n`)

    if (options.dryRun) {
      process.stdout.write('[dry-run] No changes written.\n')
      return
    }

    // Update each source
    for (const key of sourceKeys) {
      const entry = byKey.get(key)!
      const raw = JSON.parse(await readFile(entry.filePath, 'utf-8')) as Record<string, unknown>
      raw.status = 'deprecated'
      raw.merged_into = targetKey
      const validation = validateFeature(raw)
      if (!validation.success) {
        process.stderr.write(`Validation error on "${key}": ${validation.errors.join(', ')}\n`)
        process.exit(1)
      }
      await writeFile(entry.filePath, JSON.stringify(validation.data, null, 2) + '\n', 'utf-8')
    }

    // Update target
    const targetRaw = JSON.parse(await readFile(targetEntry.filePath, 'utf-8')) as Record<string, unknown>
    const existingMergedFrom = (targetRaw.merged_from as string[] | undefined) ?? []
    const toAdd = sourceKeys.filter((k) => !existingMergedFrom.includes(k))
    targetRaw.merged_from = [...existingMergedFrom, ...toAdd]
    const targetValidation = validateFeature(targetRaw)
    if (!targetValidation.success) {
      process.stderr.write(`Validation error on "${targetKey}": ${targetValidation.errors.join(', ')}\n`)
      process.exit(1)
    }
    await writeFile(targetEntry.filePath, JSON.stringify(targetValidation.data, null, 2) + '\n', 'utf-8')

    process.stdout.write(`✓ ${sourceKeys.join(', ')} merged into ${targetKey}\n`)
  })
