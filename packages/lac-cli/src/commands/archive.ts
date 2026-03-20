import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'

export const archiveCommand = new Command('archive')
  .description('Mark a feature as deprecated (archived)')
  .argument('<key>', 'featureKey to archive (e.g. feat-2026-001)')
  .option('-d, --dir <path>', 'Directory to scan (default: cwd)')
  .action(async (key: string, options: { dir?: string }) => {
    const scanDir = options.dir ?? process.cwd()
    const features = await scanFeatures(scanDir)
    const found = features.find(f => f.feature.featureKey === key)

    if (!found) {
      process.stderr.write(`Error: feature "${key}" not found in "${scanDir}"\n`)
      process.exit(1)
    }

    if (found.feature.status === 'deprecated') {
      process.stdout.write(`Already deprecated: ${key}\n`)
      process.exit(0)
    }

    const raw = await readFile(found.filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    parsed['status'] = 'deprecated'

    const validation = validateFeature(parsed)
    if (!validation.success) {
      process.stderr.write(`Validation error: ${validation.errors.join(', ')}\n`)
      process.exit(1)
    }

    await writeFile(found.filePath, JSON.stringify(validation.data, null, 2) + '\n', 'utf-8')
    process.stdout.write(`✓ ${key} archived (status → deprecated)\n`)
  })
