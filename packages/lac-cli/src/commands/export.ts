import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { scanFeatures, type ScannedFeature } from '../lib/scanner.js'
import { generateHtmlWiki } from '../lib/htmlGenerator.js'
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

/**
 * Topological sort: parents before children. Features with no lineage come first.
 * Cycles are broken by key order (shouldn't happen in a valid workspace).
 */
function topoSort(features: Awaited<ReturnType<typeof scanFeatures>>): typeof features {
  const keyToFeature = new Map(features.map(f => [f.feature.featureKey, f]))
  const visited = new Set<string>()
  const result: typeof features = []

  function visit(key: string): void {
    if (visited.has(key)) return
    visited.add(key)
    const f = keyToFeature.get(key)
    if (!f) return
    const parent = f.feature.lineage?.parent
    if (parent && keyToFeature.has(parent)) visit(parent)
    result.push(f)
  }

  for (const f of features) visit(f.feature.featureKey)
  return result
}

/**
 * Render a compact ASCII tree of the parent→child hierarchy.
 */
function renderLineageTree(features: Awaited<ReturnType<typeof scanFeatures>>): string {
  const childrenOf = new Map<string, string[]>()
  const roots: string[] = []

  for (const f of features) {
    const parent = f.feature.lineage?.parent
    if (parent) {
      const list = childrenOf.get(parent) ?? []
      list.push(f.feature.featureKey)
      childrenOf.set(parent, list)
    } else {
      roots.push(f.feature.featureKey)
    }
  }

  const keyToTitle = new Map(features.map(f => [f.feature.featureKey, f.feature.title]))
  const treeLines: string[] = []

  function renderNode(key: string, prefix: string, isLast: boolean): void {
    const connector = isLast ? '└── ' : '├── '
    treeLines.push(`${prefix}${connector}${key} — ${keyToTitle.get(key) ?? ''}`)
    const children = childrenOf.get(key) ?? []
    const childPrefix = prefix + (isLast ? '    ' : '│   ')
    children.forEach((child, i) => renderNode(child, childPrefix, i === children.length - 1))
  }

  roots.forEach((root, i) => renderNode(root, '', i === roots.length - 1))
  return treeLines.join('\n')
}

/**
 * Build a reconstruction prompt from all feature.jsons under a directory.
 * The output is a single Markdown document a fresh AI can consume to
 * re-implement the system from its documented intent alone.
 */
export function buildReconstructionPrompt(
  features: Awaited<ReturnType<typeof scanFeatures>>,
  projectName: string,
  promptDir: string,
): string {
  const lines: string[] = []

  lines.push(`# Reconstruction Spec — ${projectName}`)
  lines.push('')
  lines.push(
    '> This document fully describes a software system through its feature documentation.',
    '> Your task is to implement this system from scratch.',
    '> Do not reproduce the original source — implement cleanly to satisfy each feature\'s',
    '> problem statement, decisions, and success criteria.',
    '> Features are listed in dependency order (parents before children).',
  )
  lines.push('')

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total = features.length
  const frozen = features.filter(f => f.feature.status === 'frozen').length
  const domains = [...new Set(features.map(f => f.feature.domain).filter(Boolean))]
  lines.push(`**${total} features** · ${frozen} frozen · ${domains.length} domains: ${domains.join(', ')}`)
  lines.push('')

  // ── Lineage tree ────────────────────────────────────────────────────────────
  const tree = renderLineageTree(features)
  if (tree) {
    lines.push('## Feature Tree')
    lines.push('')
    lines.push('```')
    lines.push(tree)
    lines.push('```')
    lines.push('')
  }

  // ── Features in dependency order ────────────────────────────────────────────
  const sorted = topoSort(features)

  const renderFeature = (f: ScannedFeature): string => {
    const feat = f.feature
    const parts: string[] = []
    const featureDir = dirname(f.filePath)
    const relDir = featureDir === promptDir
      ? '.'
      : featureDir.slice(promptDir.length).replace(/^[\\/]/, '').replace(/\\/g, '/')

    parts.push(`### ${feat.featureKey} — ${feat.title}`)
    parts.push('')
    parts.push(`**Status:** ${feat.status}`)
    parts.push(`**Path:** \`${relDir}/\``)
    if (feat.lineage?.parent) parts.push(`**Parent:** ${feat.lineage.parent}`)
    if (feat.lineage?.children?.length) parts.push(`**Children:** ${feat.lineage.children.join(', ')}`)
    parts.push('')

    parts.push(`**Problem:** ${feat.problem}`)
    parts.push('')

    if (feat.analysis) {
      parts.push('**Analysis:**')
      parts.push(feat.analysis)
      parts.push('')
    }

    if (feat.implementation) {
      parts.push('**Implementation:**')
      parts.push(feat.implementation)
      parts.push('')
    }

    if (feat.decisions?.length) {
      parts.push('**Decisions:**')
      for (const d of feat.decisions) {
        parts.push(`- **${d.decision}** — ${d.rationale}`)
        if (d.alternativesConsidered?.length) {
          parts.push(`  Alternatives considered: ${d.alternativesConsidered.join(', ')}`)
        }
      }
      parts.push('')
    }

    if (feat.knownLimitations?.length) {
      parts.push('**Known Limitations:**')
      for (const lim of feat.knownLimitations) parts.push(`- ${lim}`)
      parts.push('')
    }

    if (feat.successCriteria) {
      parts.push(`**Success Criteria:** ${feat.successCriteria}`)
      parts.push('')
    }

    if (feat.tags?.length) {
      parts.push(`**Tags:** ${feat.tags.join(', ')}`)
      parts.push('')
    }

    return parts.join('\n')
  }

  lines.push('## Features')
  lines.push('')
  for (const f of sorted) {
    lines.push(renderFeature(f))
    lines.push('---')
    lines.push('')
  }

  lines.push('## Reconstruction Instructions')
  lines.push('')
  lines.push(
    'Using only the feature specs above (no original source code):',
    '',
    '1. Identify the tech stack implied by the decisions and tags',
    '2. Implement each feature in the order listed above (parents are always listed before children)',
    '3. Place each feature\'s code in the directory indicated by its **Path** field',
    '4. For each feature, satisfy its Problem, Success Criteria, and honour its Decisions',
    '5. Respect Known Limitations — do not over-engineer around them unless specified',
    '6. The result should pass all Success Criteria when run',
  )
  lines.push('')

  return lines.join('\n')
}

export const exportCommand = new Command('export')
  .description('Export feature.json as JSON, Markdown, or generate a static HTML wiki')
  .option('--out <path>', 'Output file or directory path')
  .option('--html [dir]', 'Scan <dir> (default: cwd) and emit a single self-contained HTML wiki file')
  .option('--site <dir>', 'Scan <dir> for feature.json files and generate a static HTML site (outputs index.html in --out dir)')
  .option('--prompt [dir]', 'Scan <dir> for all feature.json files and emit a single reconstruction prompt (default: cwd)')
  .option('--markdown', 'Output feature as a Markdown document instead of JSON')
  .option('--tags <tags>', 'Comma-separated tags to filter by in --site/--html mode — only features with at least one matching tag are exported (OR logic)')
  .action(async (options: { out?: string; html?: string | boolean; site?: string; prompt?: string | boolean; markdown?: boolean; tags?: string }) => {
    // ── Reconstruction prompt mode ──────────────────────────────────────────
    if (options.prompt !== undefined) {
      const promptDir = typeof options.prompt === 'string'
        ? resolve(options.prompt)
        : resolve(process.cwd())

      let features: Awaited<ReturnType<typeof scanFeatures>>
      try {
        features = await scanFeatures(promptDir)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error scanning "${promptDir}": ${message}\n`)
        process.exit(1)
      }

      if (features.length === 0) {
        process.stdout.write(`No valid feature.json files found in "${promptDir}".\n`)
        process.exit(0)
      }

      const projectName = basename(promptDir)
      const prompt = buildReconstructionPrompt(features, projectName, promptDir)

      if (options.out) {
        const outPath = resolve(options.out)
        try {
          await writeFile(outPath, prompt, 'utf-8')
          process.stdout.write(`✓ Reconstruction prompt (${features.length} features) → ${options.out}\n`)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          process.stderr.write(`Error writing to "${options.out}": ${message}\n`)
          process.exit(1)
        }
      } else {
        process.stdout.write(prompt)
      }
      return
    }

    // ── HTML wiki mode ──────────────────────────────────────────────────────
    if (options.html !== undefined) {
      const htmlDir = typeof options.html === 'string'
        ? resolve(options.html)
        : resolve(process.cwd())

      let features: Awaited<ReturnType<typeof scanFeatures>>
      try {
        features = await scanFeatures(htmlDir)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error scanning "${htmlDir}": ${message}\n`)
        process.exit(1)
      }

      if (options.tags) {
        const tagsToMatch = options.tags.split(',').map((t) => t.trim()).filter(Boolean)
        features = features.filter(({ feature }) =>
          tagsToMatch.some((tag) => feature.tags?.includes(tag)),
        )
      }

      if (features.length === 0) {
        process.stdout.write(`No valid feature.json files found in "${htmlDir}".\n`)
        process.exit(0)
      }

      const projectName = basename(htmlDir)
      const html = generateHtmlWiki(features.map(f => f.feature), projectName)

      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-wiki.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ HTML wiki (${features.length} features) → ${options.out ?? 'lac-wiki.html'}\n`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error writing "${outFile}": ${message}\n`)
        process.exit(1)
      }
      return
    }

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

      if (options.tags) {
        const tagsToMatch = options.tags.split(',').map((t) => t.trim()).filter(Boolean)
        features = features.filter(({ feature }) =>
          tagsToMatch.some((tag) => feature.tags?.includes(tag)),
        )
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
