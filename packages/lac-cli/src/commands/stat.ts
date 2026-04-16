import process from 'node:process'

import type { Feature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { computeCompleteness } from '../lib/config.js'
import { scanFeatures } from '../lib/scanner.js'

export interface StatResult {
  total: number
  statusBreakdown: Record<string, number>
  avgCompleteness: number
  zeroDecisions: number
  zeroTags: number
  topTags: Array<[string, number]>
}

export function computeStats(features: Array<{ feature: Feature }>): StatResult {
  const total = features.length

  const statusBreakdown: Record<string, number> = { active: 0, draft: 0, frozen: 0, deprecated: 0 }
  for (const { feature } of features) {
    const s = feature.status
    statusBreakdown[s] = (statusBreakdown[s] ?? 0) + 1
  }

  const completenessValues = features.map(({ feature }) =>
    computeCompleteness(feature as unknown as Record<string, unknown>),
  )
  const avgCompleteness =
    completenessValues.length > 0
      ? Math.round(completenessValues.reduce((a, b) => a + b, 0) / completenessValues.length)
      : 0

  const zeroDecisions = features.filter(
    ({ feature }) => !feature.decisions || feature.decisions.length === 0,
  ).length

  const zeroTags = features.filter(
    ({ feature }) => !feature.tags || feature.tags.length === 0,
  ).length

  const tagCounts = new Map<string, number>()
  for (const { feature } of features) {
    for (const tag of feature.tags ?? []) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
    }
  }
  const topTags = Array.from(tagCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)

  return { total, statusBreakdown, avgCompleteness, zeroDecisions, zeroTags, topTags }
}

export const statCommand = new Command('stat')
  .description('Show workspace statistics: feature counts, status breakdown, completeness, top tags')
  .option('-d, --dir <path>', 'Directory to scan (default: cwd)')
  .option('--tags <tags>', 'Comma-separated tags to filter by — scope stats to features with at least one matching tag (OR logic)')
  .option('--by-tag', 'Group output by tag — show per-tag feature counts and status breakdown')
  .action(async (options: { dir?: string; tags?: string; byTag?: boolean }) => {
    const scanDir = options.dir ?? process.cwd()

    let features: Awaited<ReturnType<typeof scanFeatures>>
    try {
      features = await scanFeatures(scanDir)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Error scanning "${scanDir}": ${message}\n`)
      process.exit(1)
    }

    if (options.tags) {
      const tagsToMatch = options.tags.split(',').map((t) => t.trim()).filter(Boolean)
      features = features.filter(({ feature }) =>
        tagsToMatch.some((tag) => feature.tags?.includes(tag)),
      )
    }

    const { total, statusBreakdown, avgCompleteness, zeroDecisions, zeroTags, topTags } = computeStats(features)

    if (total === 0) {
      process.stdout.write(`No features found in "${scanDir}".\n`)
      process.stdout.write(`Run "lac init" in a subdirectory to create your first feature.\n`)
      return
    }

    // Re-compute tagCounts for --by-tag (not part of computeStats return but needed below)
    const tagCounts = new Map<string, number>()
    for (const { feature } of features) {
      for (const tag of feature.tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }

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

    if (options.byTag) {
      lines.push('')
      lines.push('By tag:')
      const allTags = Array.from(tagCounts.keys()).sort()
      for (const tag of allTags) {
        const tagged = features.filter(({ feature }) => feature.tags?.includes(tag))
        const byStatus: Record<string, number> = {}
        for (const { feature } of tagged) {
          byStatus[feature.status] = (byStatus[feature.status] ?? 0) + 1
        }
        const statusSummary = Object.entries(byStatus)
          .map(([s, n]) => `${s}:${n}`)
          .join('  ')
        lines.push(`  ${tag.padEnd(22)} ${tagged.length.toString().padStart(3)} features  (${statusSummary})`)
      }
      const untagged = features.filter(({ feature }) => !feature.tags || feature.tags.length === 0)
      if (untagged.length > 0) {
        lines.push(`  ${'(untagged)'.padEnd(22)} ${untagged.length.toString().padStart(3)} features`)
      }
    }

    process.stdout.write(lines.join('\n') + '\n')
  })
