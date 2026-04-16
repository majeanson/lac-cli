import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { scanFeatures, type ScannedFeature } from '../lib/scanner.js'
import { generateHtmlWiki } from '../lib/htmlGenerator.js'
import { generateRawHtml } from '../lib/rawHtmlGenerator.js'
import { generateSite } from '../lib/siteGenerator.js'
import { generatePostcard } from '../lib/postcardGenerator.js'
import { generatePrint } from '../lib/printGenerator.js'
import { generateResume } from '../lib/resumeGenerator.js'
import { generateSlides } from '../lib/slideGenerator.js'
import { generateQuiz } from '../lib/quizGenerator.js'
import { generateStory } from '../lib/storyGenerator.js'
import { generateGraph } from '../lib/graphGenerator.js'
import { generateHeatmap } from '../lib/heatmapGenerator.js'
import { generateDiff } from '../lib/diffGenerator.js'
import { generateTreemap } from '../lib/treemapGenerator.js'
import { generateKanban } from '../lib/kanbanGenerator.js'
import { generateHealth } from '../lib/healthGenerator.js'
import { generateEmbed } from '../lib/embedGenerator.js'
import { generateDecisionLog } from '../lib/decisionLogGenerator.js'
import { generateUserGuide } from '../lib/userGuideGenerator.js'
import { generateChangelog } from '../lib/changelogGenerator.js'
import { generateReleaseNotes } from '../lib/releaseNotesGenerator.js'
import { generateSprint } from '../lib/sprintGenerator.js'
import { generateApiSurface } from '../lib/apiSurfaceGenerator.js'
import { generateDependencyMap } from '../lib/dependencyMapGenerator.js'
import { generateHub, ALL_HUB_ENTRIES, type HubStats } from '../lib/hubGenerator.js'
import { VIEW_NAMES, applyView, applyViewForHtml, applyDensity, applyViewTransforms, resolveView, type ViewName, type DensityLevel } from '../lib/views.js'
import { loadConfig } from '../lib/config.js'

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
  if (f['featureKey']) lines.push(`**Key:** \`${f['featureKey'] as string}\`  `)
  if (f['status']) lines.push(`**Status:** ${f['status'] as string}`)
  if (f['featureKey'] || f['status']) lines.push('')

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

  if (f['userGuide']) {
    lines.push('## User Guide')
    lines.push('')
    lines.push(f['userGuide'] as string)
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
  .description('Export feature.json as JSON, Markdown, or generate a static HTML view')
  .option('--out <path>', 'Output file or directory path')
  .option('--html [dir]',     'Scan <dir> (default: cwd) and emit a single self-contained HTML wiki')
  .option('--raw [dir]',      'Raw field-by-field HTML dump with sidebar navigation')
  .option('--print [dir]',    'Print-ready HTML document (A4, all features, @media print CSS)')
  .option('--postcard',       'Beautiful single-feature shareable card (nearest feature.json)')
  .option('--resume [dir]',   'Portfolio page from all frozen features')
  .option('--slide [dir]',    'Full-screen HTML slideshow, one slide per feature')
  .option('--graph [dir]',    'Interactive force-directed feature lineage graph')
  .option('--heatmap [dir]',  'Completeness heatmap — fields × features grid')
  .option('--quiz [dir]',     'Flashcard-style quiz to test knowledge of your feature set')
  .option('--story [dir]',    'Long-form narrative document — product case study from feature data')
  .option('--treemap [dir]',  'Rectangular treemap — features sized by decisions × completeness, grouped by domain')
  .option('--kanban [dir]',   'Kanban board — Active / Frozen / Draft columns with sortable, filterable cards')
  .option('--health [dir]',   'Project health scorecard — completeness, coverage, tech debt, and health score')
  .option('--embed [dir]',    'Compact embeddable stats widget (iframe-ready)')
  .option('--decisions [dir]','Consolidated ADR — all decisions from all features, searchable by domain')
  .option('--guide [dir]',    'User guide — one page per feature that has a non-empty userGuide field')
  .option('--hub [dir]',     'Hub landing page linking to all generated views → lac-hub.html')
  .option('--all [dir]',     'Generate all HTML views + hub index.html → --out dir (default: ./lac-output)')
  .option('--prefix <prefix>', 'URL prefix for hub links (no leading slash), e.g. lac → hrefs become /lac/lac-guide.html')
  .option('--diff <dir-b>',   'Compare cwd workspace against <dir-b> and show added/removed/changed')
  .option('--site <dir>',     'Generate a multi-page static site → --out dir (default: ./lac-site)')
  .option('--prompt [dir]',   'AI reconstruction prompt for all features (stdout or --out file)')
  .option('--markdown',       'Single feature as Markdown (nearest feature.json)')
  .option('--changelog [dir]',      'Structured changelog grouped by month — from revisions[] across all features')
  .option('--since <date>',         'Filter --changelog and --release-notes to entries after this date (YYYY-MM-DD)')
  .option('--release-notes [dir]',  'User-facing release notes — features that went frozen since --since date or --release version')
  .option('--release <version>',    'Filter --release-notes to features matching this releaseVersion (e.g. 3.5.0)')
  .option('--sprint [dir]',         'Sprint planning view — draft+active features sorted by priority, summary density')
  .option('--api-surface [dir]',    'Aggregated publicInterface[] reference across all features → lac-api-surface.html')
  .option('--dependency-map [dir]', 'Runtime dependency graph from externalDependencies[] → lac-depmap.html')
  .option('--tags <tags>',    'Comma-separated tags to filter by (OR logic) — applies to all multi-feature modes')
  .option('--sort <mode>',    'Sort order for multi-feature modes: key (default) | build-order (parents before children)')
  .option('--view <name>',    `Audience view — built-in (${VIEW_NAMES.join(', ')}) or custom name from lac.config.json views`)
  .option('--density <level>','Content density: summary | standard | verbose (default: standard)')
  .addHelpText('after', `
Examples:
  lac export --html                          HTML wiki (cwd) → lac-wiki.html
  lac export --raw                           Raw field dump  → lac-raw.html
  lac export --print                         Print-ready doc → lac-print.html
  lac export --postcard                      Single-feature card → lac-postcard.html
  lac export --resume                        Frozen-features portfolio → lac-resume.html
  lac export --slide                         Slideshow → lac-slides.html
  lac export --quiz                          Flashcard quiz → lac-quiz.html
  lac export --story                         Narrative story → lac-story.html
  lac export --treemap                       Domain treemap → lac-treemap.html
  lac export --kanban                        Kanban board → lac-kanban.html
  lac export --health                        Health scorecard → lac-health.html
  lac export --embed                         Stats widget → lac-embed.html
  lac export --decisions                     Decision log (ADR) → lac-decisions.html
  lac export --guide                         User guide → lac-guide.html
  lac export --hub                           Hub index page → lac-hub.html
  lac export --all --out ./public/lac        All views + hub → ./public/lac/
  lac export --graph                         Lineage graph → lac-graph.html
  lac export --heatmap                       Completeness heatmap → lac-heatmap.html
  lac export --diff ./other-workspace        Diff vs another directory → lac-diff.html

  lac export --site ./src --out ./public     Multi-page static site
  lac export --prompt --out REBUILD.md       AI reconstruction spec
  lac export --markdown                      Single feature as Markdown
  lac export                                 Single feature as JSON

  # All multi-feature modes support --tags and --view:
  lac export --slide --tags "auth,feed" --view product

Views (--view):
  user     Plain-language guide for end users
  support  Known limitations and annotations for support teams
  product  Business problem, success criteria, and strategic decisions (no code)
  dev      Full implementation context — code, decisions, snippets, and lineage
  tech     Complete technical record — all fields including history and revisions`)
  .action(async (options: {
    out?: string
    html?: string | boolean
    raw?: string | boolean
    print?: string | boolean
    postcard?: boolean
    resume?: string | boolean
    slide?: string | boolean
    quiz?: string | boolean
    story?: string | boolean
    treemap?: string | boolean
    kanban?: string | boolean
    health?: string | boolean
    embed?: string | boolean
    decisions?: string | boolean
    guide?: string | boolean
    hub?: string | boolean
    all?: string | boolean
    graph?: string | boolean
    heatmap?: string | boolean
    diff?: string
    site?: string
    prompt?: string | boolean
    markdown?: boolean
    changelog?: string | boolean
    since?: string
    releaseNotes?: string | boolean
    release?: string
    sprint?: string | boolean
    apiSurface?: string | boolean
    dependencyMap?: string | boolean
    tags?: string
    sort?: string
    view?: string
    density?: string
    prefix?: string
  }) => {
    // ── Config + view resolution ─────────────────────────────────────────────
    const config = loadConfig(process.cwd())
    let activeView = options.view
      ? resolveView(options.view, config.views)
      : undefined
    // For custom views, use the extends base as render mode so 'user'-extending views get clean UI
    const activeViewRenderMode = options.view && config.views[options.view]
      ? config.views[options.view].extends
      : undefined

    if (options.view && !activeView) {
      const customNames = Object.keys(config.views)
      const allNames = [...VIEW_NAMES, ...customNames]
      process.stderr.write(
        `Error: unknown view "${options.view}". Available: ${allNames.join(', ')}\n`,
      )
      process.exit(1)
    }

    // Density — explicit flag overrides view profile density
    const activeDensity: DensityLevel = (
      options.density === 'summary' || options.density === 'verbose'
        ? options.density
        : (activeView && 'density' in activeView && activeView.density)
          ? activeView.density as DensityLevel
          : 'standard'
    )

    if (options.sort && options.sort !== 'key' && options.sort !== 'build-order') {
      process.stderr.write(
        `Error: unknown sort mode "${options.sort}". Valid modes: key, build-order\n`,
      )
      process.exit(1)
    }

    const applySort = <T extends Awaited<ReturnType<typeof scanFeatures>>>(feats: T): T =>
      options.sort === 'build-order' ? topoSort(feats) as T : feats

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
      const promptFeatures = activeView
        ? features.map(f => ({ ...f, feature: applyView(f.feature as Record<string, unknown>, activeView) as typeof f.feature }))
        : features
      const prompt = buildReconstructionPrompt(promptFeatures, projectName, promptDir)

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

      features = applySort(features)

      if (features.length === 0) {
        process.stdout.write(`No valid feature.json files found in "${htmlDir}".\n`)
        process.exit(0)
      }

      const projectName = basename(htmlDir)
      const densityFeatures = withDensity(features)
      const htmlFeatures = activeView
        ? densityFeatures.map(f => applyViewForHtml(f.feature as Record<string, unknown>, activeView) as typeof f.feature)
        : densityFeatures.map(f => f.feature)
      const html = generateHtmlWiki(htmlFeatures, projectName, activeView?.label, activeView?.name, activeViewRenderMode)

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

    // ── Raw HTML mode ────────────────────────────────────────────────────────
    if (options.raw !== undefined) {
      const rawDir = typeof options.raw === 'string'
        ? resolve(options.raw)
        : resolve(process.cwd())

      let features: Awaited<ReturnType<typeof scanFeatures>>
      try {
        features = await scanFeatures(rawDir)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error scanning "${rawDir}": ${message}\n`)
        process.exit(1)
      }

      if (options.tags) {
        const tagsToMatch = options.tags.split(',').map((t) => t.trim()).filter(Boolean)
        features = features.filter(({ feature }) =>
          tagsToMatch.some((tag) => feature.tags?.includes(tag)),
        )
      }

      features = applySort(features)

      if (features.length === 0) {
        process.stdout.write(`No valid feature.json files found in "${rawDir}".\n`)
        process.exit(0)
      }

      const projectName = basename(rawDir)
      const densityRaw = withDensity(features)
      const rawFeatures = activeView
        ? densityRaw.map(f => applyViewForHtml(f.feature as Record<string, unknown>, activeView) as typeof f.feature)
        : densityRaw.map(f => f.feature)
      const html = generateRawHtml(rawFeatures, projectName, activeView?.label, activeView?.name)

      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-raw.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Raw HTML (${features.length} features) → ${options.out ?? 'lac-raw.html'}\n`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error writing "${outFile}": ${message}\n`)
        process.exit(1)
      }
      return
    }

    // ── Postcard mode (single feature) ──────────────────────────────────────
    if (options.postcard) {
      const featureJsonPath = findNearestFeatureJson(process.cwd())
      if (!featureJsonPath) {
        process.stderr.write('Error: no feature.json found in the current directory or any of its parents.\n')
        process.exit(1)
      }
      let raw: string
      try { raw = await readFile(featureJsonPath, 'utf-8') }
      catch (err) { process.stderr.write(`Error reading "${featureJsonPath}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      let parsed: unknown
      try { parsed = JSON.parse(raw) }
      catch { process.stderr.write(`Error: "${featureJsonPath}" contains invalid JSON.\n`); process.exit(1) }
      const result = validateFeature(parsed)
      if (!result.success) { process.stderr.write(`Error: "${featureJsonPath}" failed validation:\n  ${result.errors.join('\n  ')}\n`); process.exit(1) }
      const projectName = basename(dirname(featureJsonPath))
      const html = generatePostcard(result.data, projectName)
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-postcard.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Postcard → ${options.out ?? 'lac-postcard.html'}\n`)
      } catch (err) {
        process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1)
      }
      return
    }

    // ── Helper: scan + filter + sort features for multi-feature modes ────────
    async function scanAndFilter(dir: string): Promise<Awaited<ReturnType<typeof scanFeatures>>> {
      let features: Awaited<ReturnType<typeof scanFeatures>>
      try { features = await scanFeatures(dir) }
      catch (err) { process.stderr.write(`Error scanning "${dir}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      if (options.tags) {
        const tagsToMatch = options.tags!.split(',').map(t => t.trim()).filter(Boolean)
        features = features.filter(({ feature }) => tagsToMatch.some(tag => feature.tags?.includes(tag)))
      }
      // Apply view-level transforms (filterStatus, sortBy) if active view has them
      if (activeView && ('filterStatus' in activeView || 'sortBy' in activeView)) {
        const rawFeatures = features.map(f => f.feature as Record<string, unknown>)
        const transformed = applyViewTransforms(rawFeatures, {
          filterStatus: (activeView as { filterStatus?: string[] }).filterStatus,
          sortBy: (activeView as { sortBy?: string }).sortBy,
        })
        const transformedKeys = new Set(transformed.map(f => f['featureKey'] as string))
        features = features.filter(f => transformedKeys.has(f.feature.featureKey))
      }
      features = applySort(features)
      return features
    }

    // ── Helper: apply density to a scanned feature list ──────────────────────
    function withDensity<T extends { feature: Record<string, unknown> }>(featureList: T[]): T[] {
      if (activeDensity === 'standard') return featureList
      return featureList.map(f => ({
        ...f,
        feature: applyDensity(f.feature, activeDensity) as T['feature'],
      }))
    }

    // ── Print mode ───────────────────────────────────────────────────────────
    if (options.print !== undefined) {
      const dir = typeof options.print === 'string' ? resolve(options.print) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const dPrint = withDensity(features)
      const fs = activeView ? dPrint.map(f => applyViewForHtml(f.feature as Record<string, unknown>, activeView) as typeof f.feature) : dPrint.map(f => f.feature)
      const html = generatePrint(fs, basename(dir), activeView?.label)
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-print.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Print HTML (${features.length} features) → ${options.out ?? 'lac-print.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Resume mode ──────────────────────────────────────────────────────────
    if (options.resume !== undefined) {
      const dir = typeof options.resume === 'string' ? resolve(options.resume) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = withDensity(features).map(f => f.feature)
      const html = generateResume(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-resume.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Resume (${features.filter(f => f.feature.status === 'frozen').length} frozen features) → ${options.out ?? 'lac-resume.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Slide mode ───────────────────────────────────────────────────────────
    if (options.slide !== undefined) {
      const dir = typeof options.slide === 'string' ? resolve(options.slide) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const dSlide = withDensity(features)
      const fs = activeView ? dSlide.map(f => applyViewForHtml(f.feature as Record<string, unknown>, activeView) as typeof f.feature) : dSlide.map(f => f.feature)
      const html = generateSlides(fs, basename(dir), activeView?.label)
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-slides.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Slides (${features.length} features) → ${options.out ?? 'lac-slides.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Quiz mode ────────────────────────────────────────────────────────────
    if (options.quiz !== undefined) {
      const dir = typeof options.quiz === 'string' ? resolve(options.quiz) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateQuiz(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-quiz.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Quiz (${features.length} features) → ${options.out ?? 'lac-quiz.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Story mode ───────────────────────────────────────────────────────────
    if (options.story !== undefined) {
      const dir = typeof options.story === 'string' ? resolve(options.story) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = withDensity(features).map(f => f.feature)
      const html = generateStory(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-story.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Story (${features.length} features) → ${options.out ?? 'lac-story.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Treemap mode ─────────────────────────────────────────────────────────
    if (options.treemap !== undefined) {
      const dir = typeof options.treemap === 'string' ? resolve(options.treemap) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateTreemap(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-treemap.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Treemap (${features.length} features) → ${options.out ?? 'lac-treemap.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Kanban mode ──────────────────────────────────────────────────────────
    if (options.kanban !== undefined) {
      const dir = typeof options.kanban === 'string' ? resolve(options.kanban) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = withDensity(features).map(f => f.feature)
      const html = generateKanban(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-kanban.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Kanban (${features.length} features) → ${options.out ?? 'lac-kanban.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Health mode ──────────────────────────────────────────────────────────
    if (options.health !== undefined) {
      const dir = typeof options.health === 'string' ? resolve(options.health) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateHealth(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-health.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Health scorecard (${features.length} features) → ${options.out ?? 'lac-health.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Embed mode ───────────────────────────────────────────────────────────
    if (options.embed !== undefined) {
      const dir = typeof options.embed === 'string' ? resolve(options.embed) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateEmbed(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-embed.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Embed widget (${features.length} features) → ${options.out ?? 'lac-embed.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Decision log mode ────────────────────────────────────────────────────
    if (options.decisions !== undefined) {
      const dir = typeof options.decisions === 'string' ? resolve(options.decisions) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = withDensity(features).map(f => f.feature)
      const totalDecisions = fs.reduce((n, f) => n + (f.decisions?.length ?? 0), 0)
      const html = generateDecisionLog(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-decisions.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Decision log (${totalDecisions} decisions across ${features.length} features) → ${options.out ?? 'lac-decisions.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── User guide mode ──────────────────────────────────────────────────────
    if (options.guide !== undefined) {
      const dir = typeof options.guide === 'string' ? resolve(options.guide) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateUserGuide(fs, basename(dir))
      const guideFeatureCount = fs.filter(f => typeof f.userGuide === 'string' && f.userGuide.trim().length > 0).length
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-guide.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ User guide (${guideFeatureCount} of ${features.length} features have userGuide) → ${options.out ?? 'lac-guide.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Hub mode ─────────────────────────────────────────────────────────────
    if (options.hub !== undefined) {
      const dir = typeof options.hub === 'string' ? resolve(options.hub) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const stats: HubStats = {
        total: fs.length,
        frozen: fs.filter(f => f.status === 'frozen').length,
        active: fs.filter(f => f.status === 'active').length,
        draft: fs.filter(f => f.status === 'draft').length,
        deprecated: fs.filter(f => f.status === 'deprecated').length,
        domains: [...new Set(fs.map(f => f.domain).filter((d): d is string => Boolean(d)))],
      }
      const html = generateHub(basename(dir), stats, ALL_HUB_ENTRIES, new Date().toISOString(), options.prefix)
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-hub.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Hub (${fs.length} features) → ${options.out ?? 'lac-hub.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Changelog mode ────────────────────────────────────────────────────────
    if (options.changelog !== undefined) {
      const dir = typeof options.changelog === 'string' ? resolve(options.changelog) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateChangelog(fs, basename(dir), options.since)
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-changelog.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        const totalRevisions = fs.reduce((n, f) => n + ((f as Record<string, unknown[]>)['revisions']?.length ?? 0), 0)
        process.stdout.write(`✓ Changelog (${totalRevisions} revisions across ${features.length} features) → ${options.out ?? 'lac-changelog.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Release notes mode ────────────────────────────────────────────────────
    if (options.releaseNotes !== undefined) {
      const dir = typeof options.releaseNotes === 'string' ? resolve(options.releaseNotes) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateReleaseNotes(fs, basename(dir), { since: options.since, release: options.release })
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-release-notes.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Release notes → ${options.out ?? 'lac-release-notes.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Sprint mode ───────────────────────────────────────────────────────────
    if (options.sprint !== undefined) {
      const dir = typeof options.sprint === 'string' ? resolve(options.sprint) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      // Sprint is always summary density, always draft+active only
      const sprintFeatures = features.filter(f => f.feature.status === 'draft' || f.feature.status === 'active')
      const fs = sprintFeatures.map(f => f.feature)
      const html = generateSprint(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-sprint.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Sprint (${sprintFeatures.length} active+draft features) → ${options.out ?? 'lac-sprint.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── API surface mode ──────────────────────────────────────────────────────
    if (options.apiSurface !== undefined) {
      const dir = typeof options.apiSurface === 'string' ? resolve(options.apiSurface) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const totalEntries = fs.reduce((n, f) => n + ((f as Record<string, unknown[]>)['publicInterface']?.length ?? 0), 0)
      const html = generateApiSurface(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-api-surface.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ API surface (${totalEntries} entries across ${features.length} features) → ${options.out ?? 'lac-api-surface.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Dependency map mode ───────────────────────────────────────────────────
    if (options.dependencyMap !== undefined) {
      const dir = typeof options.dependencyMap === 'string' ? resolve(options.dependencyMap) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateDependencyMap(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-depmap.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Dependency map (${features.length} features) → ${options.out ?? 'lac-depmap.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── All mode ──────────────────────────────────────────────────────────────
    if (options.all !== undefined) {
      const dir = typeof options.all === 'string' ? resolve(options.all) : resolve(process.cwd())
      const outDir = resolve(options.out ?? './lac-output')

      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)

      try { await mkdir(outDir, { recursive: true }) }
      catch (err) { process.stderr.write(`Error creating output dir "${outDir}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }

      const write = async (filename: string, html: string): Promise<void> => {
        const outFile = join(outDir, filename)
        try {
          await writeFile(outFile, html, 'utf-8')
          process.stdout.write(`  ✓ ${filename}\n`)
        } catch (err) {
          process.stderr.write(`  ✗ ${filename}: ${err instanceof Error ? err.message : String(err)}\n`)
        }
      }

      const projectName = basename(dir)
      process.stdout.write(`Generating all LAC views for "${projectName}" → ${outDir}\n`)

      await write('lac-guide.html',          generateUserGuide(fs, projectName))
      await write('lac-story.html',          generateStory(fs, projectName))
      await write('lac-wiki.html',           generateHtmlWiki(fs, projectName))
      await write('lac-kanban.html',         generateKanban(fs, projectName))
      await write('lac-health.html',         generateHealth(fs, projectName))
      await write('lac-decisions.html',      generateDecisionLog(fs, projectName))
      await write('lac-heatmap.html',        generateHeatmap(fs, projectName))
      await write('lac-graph.html',          generateGraph(fs, projectName))
      await write('lac-print.html',          generatePrint(fs, projectName))
      await write('lac-raw.html',            generateRawHtml(fs, projectName))
      await write('lac-changelog.html',      generateChangelog(fs, projectName))
      await write('lac-release-notes.html',  generateReleaseNotes(fs, projectName, {}))
      await write('lac-sprint.html',         generateSprint(fs.filter(f => f.status === 'draft' || f.status === 'active'), projectName))
      await write('lac-api-surface.html',    generateApiSurface(fs, projectName))
      await write('lac-depmap.html',         generateDependencyMap(fs, projectName))

      const stats: HubStats = {
        total: fs.length,
        frozen: fs.filter(f => f.status === 'frozen').length,
        active: fs.filter(f => f.status === 'active').length,
        draft: fs.filter(f => f.status === 'draft').length,
        deprecated: fs.filter(f => f.status === 'deprecated').length,
        domains: [...new Set(fs.map(f => f.domain).filter((d): d is string => Boolean(d)))],
      }

      // ── Custom views from lac.config.json ─────────────────────────────────
      const customEntries: HubEntry[] = []
      const VIEW_ICON_MAP: Record<string, string> = {
        musician: '🎵', sprint: '⚡', 'dev-deep': '🔬', 'code-focus': '📦',
        shipped: '🚀', onboarding: '🎓', architect: '🏛️', support: '🛟',
        user: '👤', dev: '💻', product: '📊', tech: '🔧',
      }
      function pickViewIcon(name: string, label: string): string {
        if (VIEW_ICON_MAP[name]) return VIEW_ICON_MAP[name]
        const lc = label.toLowerCase()
        if (lc.includes('music')) return '🎵'
        if (lc.includes('sprint') || lc.includes('active')) return '⚡'
        if (lc.includes('dev') || lc.includes('engineer')) return '🔬'
        if (lc.includes('code') || lc.includes('snippet')) return '📦'
        if (lc.includes('ship') || lc.includes('release') || lc.includes('frozen')) return '🚀'
        if (lc.includes('onboard') || lc.includes('guide') || lc.includes('new')) return '🎓'
        if (lc.includes('architect') || lc.includes('decision')) return '🏛️'
        if (lc.includes('support') || lc.includes('qa')) return '🛟'
        return '📄'
      }

      for (const [viewName, viewDef] of Object.entries(config.views)) {
        const resolved = resolveView(viewName, config.views)
        if (!resolved) continue

        const label = viewDef.label ?? viewName
        const description = viewDef.description ?? `Custom view: ${viewName}`
        const icon = pickViewIcon(viewName, label)
        const filename = `view-${viewName}.html`

        let viewFeatures = features.map(f => f.feature as Record<string, unknown>)
        viewFeatures = applyViewTransforms(viewFeatures, {
          filterStatus: (resolved as { filterStatus?: string[] }).filterStatus,
          sortBy: (resolved as { sortBy?: string }).sortBy,
        })
        const viewHtmlFeatures = viewFeatures.map(f => applyViewForHtml(f, resolved) as typeof f)
        // Pass the extends base as renderMode so views like musician inherit user-friendly UI
        const renderMode = viewDef.extends
        await write(filename, generateHtmlWiki(viewHtmlFeatures, projectName, label, viewName, renderMode))

        customEntries.push({ file: filename, label, description, icon, primary: false })
      }

      const allEntries = [...ALL_HUB_ENTRIES, ...customEntries]
      await write('index.html', generateHub(projectName, stats, allEntries, new Date().toISOString(), options.prefix))

      const totalFiles = 15 + customEntries.length + 1
      process.stdout.write(`Done — ${features.length} features, ${totalFiles} files written to ${outDir}\n`)
      return
    }

    // ── Graph mode ───────────────────────────────────────────────────────────
    if (options.graph !== undefined) {
      const dir = typeof options.graph === 'string' ? resolve(options.graph) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateGraph(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-graph.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Graph (${features.length} nodes) → ${options.out ?? 'lac-graph.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Heatmap mode ─────────────────────────────────────────────────────────
    if (options.heatmap !== undefined) {
      const dir = typeof options.heatmap === 'string' ? resolve(options.heatmap) : resolve(process.cwd())
      const features = await scanAndFilter(dir)
      if (features.length === 0) { process.stdout.write(`No valid feature.json files found in "${dir}".\n`); process.exit(0) }
      const fs = features.map(f => f.feature)
      const html = generateHeatmap(fs, basename(dir))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-heatmap.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Heatmap (${features.length} features) → ${options.out ?? 'lac-heatmap.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
      return
    }

    // ── Diff mode ─────────────────────────────────────────────────────────────
    if (options.diff !== undefined) {
      const dirA = resolve(process.cwd())
      const dirB = resolve(options.diff)
      const [featuresA, featuresB] = await Promise.all([scanAndFilter(dirA), scanAndFilter(dirB)])
      const fsA = featuresA.map(f => f.feature)
      const fsB = featuresB.map(f => f.feature)
      const html = generateDiff(fsA, fsB, basename(dirA), basename(dirB))
      const outFile = options.out ? resolve(options.out) : resolve(process.cwd(), 'lac-diff.html')
      try {
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`✓ Diff (${fsA.length} → ${fsB.length} features) → ${options.out ?? 'lac-diff.html'}\n`)
      } catch (err) { process.stderr.write(`Error writing "${outFile}": ${err instanceof Error ? err.message : String(err)}\n`); process.exit(1) }
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

      features = applySort(features)

      if (features.length === 0) {
        process.stdout.write(`No valid feature.json files found in "${scanDir}".\n`)
        process.exit(0)
      }

      const siteFeatures = activeView
        ? features.map(f => ({ ...f, feature: applyViewForHtml(f.feature as Record<string, unknown>, activeView) as typeof f.feature }))
        : features

      try {
        await generateSite(siteFeatures, outDir, activeView?.label, activeView?.name)
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

    const exportData = activeView
      ? applyView(result.data as Record<string, unknown>, activeView) as typeof result.data
      : result.data

    // Markdown mode
    if (options.markdown) {
      const mdOutput = featureToMarkdown(exportData)
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

    const output = JSON.stringify(exportData, null, 2) + '\n'

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
