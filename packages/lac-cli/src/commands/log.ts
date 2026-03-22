import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

import { validateFeature } from '@life-as-code/feature-schema'

import { findNearestFeatureJson } from '../lib/walker.js'

interface TimelineEntry {
  date: string
  type: 'revision' | 'status' | 'annotation'
  label: string
  detail: string
  author?: string
}

export const logCommand = new Command('log')
  .description('Show the intent history of a feature: revisions, status transitions, and annotations')
  .argument('[dir]', 'Feature folder (default: nearest feature.json from cwd)')
  .option('--json', 'Output as JSON')
  .action(async (dir: string | undefined, options: { json?: boolean }) => {
    let featureDir: string
    if (dir) {
      featureDir = resolve(dir)
    } else {
      const found = findNearestFeatureJson(process.cwd())
      if (!found) {
        process.stderr.write('No feature.json found from current directory.\n')
        process.exit(1)
      }
      featureDir = dirname(found)
    }

    const featurePath = `${featureDir}/feature.json`
    let raw: string
    try {
      raw = await readFile(featurePath, 'utf-8')
    } catch {
      process.stderr.write(`No feature.json found at "${featurePath}"\n`)
      process.exit(1)
    }

    const parsed = JSON.parse(raw) as unknown
    const result = validateFeature(parsed)
    if (!result.success) {
      process.stderr.write(`Invalid feature.json: ${result.errors.join(', ')}\n`)
      process.exit(1)
    }

    const feature = result.data
    const raw2 = feature as unknown as Record<string, unknown>
    const timeline: TimelineEntry[] = []

    // Revisions
    for (const rev of (raw2.revisions as Array<{ date: string; author: string; fields_changed: string[]; reason: string }>) ?? []) {
      timeline.push({
        date: rev.date,
        type: 'revision',
        label: `revised by ${rev.author}`,
        detail: `${rev.reason}  [${rev.fields_changed.join(', ')}]`,
        author: rev.author,
      })
    }

    // Status history
    for (const st of (raw2.statusHistory as Array<{ from: string; to: string; date: string; reason?: string }>) ?? []) {
      timeline.push({
        date: st.date,
        type: 'status',
        label: `status: ${st.from} → ${st.to}`,
        detail: st.reason ?? '',
      })
    }

    // Annotations
    for (const ann of (feature.annotations ?? [])) {
      timeline.push({
        date: ann.date,
        type: 'annotation',
        label: `[${ann.type}] by ${ann.author}`,
        detail: ann.body,
        author: ann.author,
      })
    }

    // Sort chronologically (oldest first)
    timeline.sort((a, b) => a.date.localeCompare(b.date))

    if (options.json) {
      process.stdout.write(JSON.stringify({ featureKey: feature.featureKey, title: feature.title, timeline }, null, 2) + '\n')
      return
    }

    if (timeline.length === 0) {
      process.stdout.write(`${feature.featureKey}  ${feature.title}\n\nNo history recorded yet.\n`)
      return
    }

    process.stdout.write(`${feature.featureKey}  ${feature.title}  [${feature.status}]\n`)
    process.stdout.write('─'.repeat(60) + '\n\n')

    for (const entry of timeline) {
      const icon = entry.type === 'revision' ? '✎' : entry.type === 'status' ? '⟳' : '◆'
      process.stdout.write(`${icon}  ${entry.date}  ${entry.label}\n`)
      if (entry.detail) {
        process.stdout.write(`   ${entry.detail}\n`)
      }
      process.stdout.write('\n')
    }
  })
