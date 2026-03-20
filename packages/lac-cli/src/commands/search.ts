import process from 'node:process'

import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'

export const searchCommand = new Command('search')
  .description('Search features by keyword across key, title, problem, tags, and analysis')
  .argument('<query>', 'Search query (case-insensitive)')
  .option('-d, --dir <path>', 'Directory to scan (default: cwd)')
  .option('--json', 'Output results as JSON')
  .option('--field <fields>', 'Comma-separated fields to search (default: all)')
  .action(async (query: string, options: { dir?: string; json?: boolean; field?: string }) => {
    const scanDir = options.dir ?? process.cwd()
    const features = await scanFeatures(scanDir)

    const searchFields = options.field
      ? options.field.split(',').map((f) => f.trim())
      : ['featureKey', 'title', 'problem', 'tags', 'analysis', 'implementation']

    const q = query.toLowerCase()

    const matches = features.filter(({ feature }) => {
      for (const field of searchFields) {
        const val = (feature as Record<string, unknown>)[field]
        if (val === undefined || val === null) continue
        if (typeof val === 'string' && val.toLowerCase().includes(q)) return true
        if (Array.isArray(val) && val.some((v) => typeof v === 'string' && v.toLowerCase().includes(q)))
          return true
      }
      return false
    })

    if (options.json) {
      process.stdout.write(JSON.stringify(matches.map((m) => m.feature), null, 2) + '\n')
      return
    }

    if (matches.length === 0) {
      process.stdout.write(`No features found matching "${query}"\n`)
      return
    }

    process.stdout.write(`Found ${matches.length} feature(s) matching "${query}":\n\n`)

    for (const { feature, filePath } of matches) {
      const statusIcon =
        ({ active: '⊙', draft: '◌', frozen: '❄', deprecated: '⊘' } as Record<string, string>)[
          feature.status
        ] ?? '?'
      process.stdout.write(`  ${statusIcon}  ${feature.featureKey.padEnd(18)} ${feature.title}\n`)
      process.stdout.write(
        `     ${feature.problem.slice(0, 80)}${feature.problem.length > 80 ? '...' : ''}\n`,
      )
      process.stdout.write(`     ${filePath}\n\n`)
    }
  })
