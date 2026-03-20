import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'
import { generateSite } from '../lib/siteGenerator.js'

/**
 * Walks up the directory tree from `startDir` to find the nearest feature.json.
 * Returns the absolute path or null if not found.
 */
function findNearestFeatureJson(startDir: string): string | null {
  let current = resolve(startDir)

  while (true) {
    const candidate = join(current, 'feature.json')
    if (existsSync(candidate)) {
      return candidate
    }
    const parent = dirname(current)
    if (parent === current) {
      return null
    }
    current = parent
  }
}

/** Render a feature as a Markdown document */
function featureToMarkdown(feature: ReturnType<typeof JSON.parse>): string {
  const f = feature as Record<string, unknown>
  const lines: string[] = []

  lines.push(`# ${f['title'] as string}`)
  lines.push('')
  lines.push(`**Key:** \`${f['featureKey'] as string}\`  `)
  lines.push(`**Status:** ${f['status'] as string}`)
  lines.push('')

  if (f['problem']) {
    lines.push('## Problem')
    lines.push('')
    lines.push(f['problem'] as string)
    lines.push('')
  }

  if (f['analysis']) {
    lines.push('## Analysis')
    lines.push('')
    lines.push(f['analysis'] as string)
    lines.push('')
  }

  if (f['implementation']) {
    lines.push('## Implementation')
    lines.push('')
    lines.push(f['implementation'] as string)
    lines.push('')
  }

  const limitations = f['knownLimitations'] as string[] | undefined
  if (limitations && limitations.length > 0) {
    lines.push('## Known Limitations')
    lines.push('')
    for (const lim of limitations) {
      lines.push(`- ${lim}`)
    }
    lines.push('')
  }

  const decisions = f['decisions'] as Array<Record<string, unknown>> | undefined
  if (decisions && decisions.length > 0) {
    lines.push('## Decisions')
    lines.push('')
    for (const d of decisions) {
      lines.push(`### ${d['decision'] as string}`)
      lines.push('')
      lines.push(`**Rationale:** ${d['rationale'] as string}`)
      if (d['date']) lines.push(`**Date:** ${d['date'] as string}`)
      lines.push('')
    }
  }

  const annotations = f['annotations'] as Array<Record<string, unknown>> | undefined
  if (annotations && annotations.length > 0) {
    lines.push('## Annotations')
    lines.push('')
    for (const a of annotations) {
      lines.push(`- **[${a['type'] as string}]** ${a['body'] as string} _(${a['author'] as string}, ${a['date'] as string})_`)
    }
    lines.push('')
  }

  const tags = f['tags'] as string[] | undefined
  if (tags && tags.length > 0) {
    lines.push(`**Tags:** ${tags.join(', ')}`)
    lines.push('')
  }

  return lines.join('\n')
}

export const exportCommand = new Command('export')
  .description('Export feature.json as JSON, Markdown, or generate a static HTML site')
  .option('--out <path>', 'Output file or directory path')
  .option('--site <dir>', 'Scan <dir> for feature.json files and generate a static HTML site')
  .option('--markdown', 'Output feature as a Markdown document instead of JSON')
  .action(async (options: { out?: string; site?: string; markdown?: boolean }) => {
    // ── Site generation mode ────────────────────────────────────────────────
    if (options.site !== undefined) {
      const scanDir = resolve(options.site)
      const outDir = resolve(options.out ?? './lac-site')

      let features: Awaited<ReturnType<typeof scanFeatures>>
      try {
        features = await scanFeatures(scanDir)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error scanning "${scanDir}": ${message}\n`)
        process.exit(1)
      }

      if (features.length === 0) {
        process.stdout.write(`No valid feature.json files found in "${scanDir}".\n`)
        process.exit(0)
      }

      try {
        await generateSite(features, outDir)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error generating site: ${message}\n`)
        process.exit(1)
      }

      // Compute a display-friendly relative path when possible
      const displayOut = options.out ?? './lac-site'
      process.stdout.write(`✓ Generated ${features.length} page${features.length === 1 ? '' : 's'} → ${displayOut}\n`)
      return
    }

    // ── Plain export mode ───────────────────────────────────────────────────
    const featureJsonPath = findNearestFeatureJson(process.cwd())

    if (!featureJsonPath) {
      process.stderr.write(
        `Error: no feature.json found in the current directory or any of its parents.\n`,
      )
      process.exit(1)
    }

    let raw: string
    try {
      raw = await readFile(featureJsonPath, 'utf-8')
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
      process.stderr.write(
        `Error: "${featureJsonPath}" failed validation:\n  ${result.errors.join('\n  ')}\n`,
      )
      process.exit(1)
    }

    // Markdown mode
    if (options.markdown) {
      const mdOutput = featureToMarkdown(result.data)
      if (options.out) {
        const outPath = resolve(options.out)
        try {
          await writeFile(outPath, mdOutput, 'utf-8')
          process.stdout.write(`Exported to ${outPath}\n`)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          process.stderr.write(`Error writing to "${outPath}": ${message}\n`)
          process.exit(1)
        }
      } else {
        process.stdout.write(mdOutput)
      }
      return
    }

    const output = JSON.stringify(result.data, null, 2) + '\n'

    if (options.out) {
      const outPath = resolve(options.out)
      try {
        await writeFile(outPath, output, 'utf-8')
        process.stdout.write(`Exported to ${outPath}\n`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error writing to "${outPath}": ${message}\n`)
        process.exit(1)
      }
    } else {
      process.stdout.write(output)
    }
  })
