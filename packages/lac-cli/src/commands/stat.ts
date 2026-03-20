import process from 'node:process'

import { Command } from 'commander'

import { computeCompleteness } from '../lib/config.js'
import { scanFeatures } from '../lib/scanner.js'

export const statCommand = new Command('stat')
  .description('Show workspace statistics: feature counts, status breakdown, completeness, top tags')
  .option('-d, --dir <path>', 'Directory to scan (default: cwd)')
  .action(async (options: { dir?: string }) => {
    const scanDir = options.dir ?? process.cwd()

    let features: Awaited<ReturnType<typeof scanFeatures>>
    try {
      features = await scanFeatures(scanDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error scanning "${scanDir}": ${message}\n`)
      process.exit(1)
    }

    const total = features.length

    if (total === 0) {
      process.stdout.write(`No features found in "${scanDir}".\n`)
      process.stdout.write(`Run "lac init" in a subdirectory to create your first feature.\n`)
      return
    }

    // Status breakdown
    const statusBreakdown: Record<string, number> = {
      active: 0,
      draft: 0,
      frozen: 0,
      deprecated: 0,
    }
    for (const { feature } of features) {
      const s = feature.status
      statusBreakdown[s] = (statusBreakdown[s] ?? 0) + 1
    }

    // Completeness
    const completenessValues = features.map(({ feature }) =>
      computeCompleteness(feature as unknown as Record<string, unknown>),
    )
    const avgCompleteness =
      completenessValues.length > 0
        ? Math.round(completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length)
        : 0

    // Features with 0 decisions
    const zeroDecisions = features.filter(
      ({ feature }) => !feature.decisions || feature.decisions.length === 0,
    ).length

    // Features with 0 tags
    const zeroTags = features.filter(
      ({ feature }) => !feature.tags || feature.tags.length === 0,
    ).length

    // Top 5 tags
    const tagCounts = new Map<string, number>()
    for (const { feature } of features) {
      for (const tag of feature.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }
    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)

    const lines: string[] = []
    lines.push('lac stat — workspace statistics')
    lines.push('================================')
    lines.push('')
    lines.push(`Total features : ${total}`)
    lines.push('')
    lines.push('By status:')
    for (const [status, count] of Object.entries(statusBreakdown)) {
      if (count > 0) {
        lines.push(`  ${status.padEnd(12)}: ${count}`)
      }
    }
    lines.push('')
    lines.push(`Avg completeness  : ${avgCompleteness}%`)
    lines.push(`No decisions      : ${zeroDecisions}`)
    lines.push(`No tags           : ${zeroTags}`)

    if (topTags.length > 0) {
      lines.push('')
      lines.push('Top 5 tags:')
      for (const [tag, count] of topTags) {
        lines.push(`  ${tag.padEnd(20)}: ${count}`)
      }
    }

    process.stdout.write(lines.join('\n') + '\n')
  })
