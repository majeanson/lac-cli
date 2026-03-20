import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'

export const tagCommand = new Command('tag')
  .description('Add or remove tags on a feature')
  .argument('<key>', 'featureKey to tag (e.g. feat-2026-001)')
  .argument('<tags>', 'Comma-separated tags to add (prefix with - to remove, e.g. "auth,-legacy,api")')
  .option('-d, --dir <path>', 'Directory to scan for features (default: cwd)')
  .action(async (key: string, tags: string, options: { dir?: string }) => {
    const scanDir = options.dir ?? process.cwd()
    const features = await scanFeatures(scanDir)
    const found = features.find(f => f.feature.featureKey === key)

    if (!found) {
      process.stderr.write(`Error: feature "${key}" not found in "${scanDir}"\n`)
      process.exit(1)
    }

    const tagList = tags.split(',').map(t => t.trim()).filter(Boolean)
    const toAdd = tagList.filter(t => !t.startsWith('-'))
    const toRemove = tagList.filter(t => t.startsWith('-')).map(t => t.slice(1))

    const current = found.feature.tags ?? []

    // Warn about tags that already exist (when adding) or don't exist (when removing)
    for (const tag of toAdd) {
      if (current.includes(tag)) {
        process.stdout.write(`Note: tag "${tag}" already present\n`)
      }
    }
    for (const tag of toRemove) {
      if (!current.includes(tag)) {
        process.stdout.write(`Note: tag "${tag}" was not present\n`)
      }
    }

    const updated = [...new Set([...current.filter(t => !toRemove.includes(t)), ...toAdd])]

    const raw = await readFile(found.filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    parsed['tags'] = updated

    const validation = validateFeature(parsed)
    if (!validation.success) {
      process.stderr.write(`Validation error: ${validation.errors.join(', ')}\n`)
      process.exit(1)
    }

    await writeFile(found.filePath, JSON.stringify(validation.data, null, 2) + '\n', 'utf-8')
    process.stdout.write(`✓ ${key} tags: [${updated.join(', ')}]\n`)
  })
