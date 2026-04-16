import { mkdir, writeFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'
import { generateHtmlWiki } from '../lib/htmlGenerator.js'
import { generateRawHtml } from '../lib/rawHtmlGenerator.js'
import { generatePrint } from '../lib/printGenerator.js'
import { generateResume } from '../lib/resumeGenerator.js'
import { generateSlides } from '../lib/slideGenerator.js'
import { generateGraph } from '../lib/graphGenerator.js'
import { generateHeatmap } from '../lib/heatmapGenerator.js'
import { generateQuiz } from '../lib/quizGenerator.js'
import { generateStory } from '../lib/storyGenerator.js'
import { generateTreemap } from '../lib/treemapGenerator.js'
import { generateKanban } from '../lib/kanbanGenerator.js'
import { generateHealth } from '../lib/healthGenerator.js'
import { generateEmbed } from '../lib/embedGenerator.js'
import { generateDecisionLog } from '../lib/decisionLogGenerator.js'
import { generateSite } from '../lib/siteGenerator.js'
import { buildReconstructionPrompt } from './export.js'
import type { Feature } from '@life-as-code/feature-schema'

// ─── Format registry ──────────────────────────────────────────────────────────

// All generators in the library take Feature[] (unwrapped from ScannedFeature)
type HtmlGenerator = (features: Feature[], projectName: string) => string

interface HtmlFormat {
  name: string
  file: string
  generate: HtmlGenerator
}

const HTML_FORMATS: HtmlFormat[] = [
  { name: 'html',      file: 'lac-wiki.html',      generate: (f, p) => generateHtmlWiki(f, p) },
  { name: 'raw',       file: 'lac-raw.html',        generate: (f, p) => generateRawHtml(f, p) },
  { name: 'print',     file: 'lac-print.html',      generate: (f, p) => generatePrint(f, p) },
  { name: 'resume',    file: 'lac-resume.html',     generate: (f, p) => generateResume(f, p) },
  { name: 'slide',     file: 'lac-slides.html',     generate: (f, p) => generateSlides(f, p) },
  { name: 'graph',     file: 'lac-graph.html',      generate: (f, p) => generateGraph(f, p) },
  { name: 'heatmap',   file: 'lac-heatmap.html',    generate: (f, p) => generateHeatmap(f, p) },
  { name: 'quiz',      file: 'lac-quiz.html',       generate: (f, p) => generateQuiz(f, p) },
  { name: 'story',     file: 'lac-story.html',      generate: (f, p) => generateStory(f, p) },
  { name: 'treemap',   file: 'lac-treemap.html',    generate: (f, p) => generateTreemap(f, p) },
  { name: 'kanban',    file: 'lac-kanban.html',     generate: (f, p) => generateKanban(f, p) },
  { name: 'health',    file: 'lac-health.html',     generate: (f, p) => generateHealth(f, p) },
  { name: 'embed',     file: 'lac-embed.html',      generate: (f, p) => generateEmbed(f, p) },
  { name: 'decisions', file: 'lac-decisions.html',  generate: (f, p) => generateDecisionLog(f, p) },
]

const ALL_FORMAT_NAMES = [...HTML_FORMATS.map(f => f.name), 'prompt', 'site']

// ─── Command ──────────────────────────────────────────────────────────────────

interface ExportAllOptions {
  out: string
  skip: string
}

export const exportAllCommand = new Command('export-all')
  .description('Run all export formats and write each to an output folder')
  .argument('[path]', 'Directory to scan for features (default: current directory)')
  .option('--out <dir>', 'Output directory (default: ./lac-exports)', './lac-exports')
  .option(
    '--skip <formats>',
    `Comma-separated formats to skip. Available: ${ALL_FORMAT_NAMES.join(', ')}`,
    '',
  )
  .addHelpText('after', `
Examples:
  lac export-all                           Export all formats from cwd → ./lac-exports/
  lac export-all ./src --out ./reports     Scan ./src, write to ./reports/
  lac export-all --skip site,quiz          Skip the static site and quiz outputs

Output files:
  lac-wiki.html      HTML wiki          lac-raw.html       Raw field dump
  lac-print.html     Print-ready doc    lac-resume.html    Portfolio
  lac-slides.html    Slideshow          lac-graph.html     Lineage graph
  lac-heatmap.html   Heatmap            lac-quiz.html      Flashcard quiz
  lac-story.html     Narrative story    lac-treemap.html   Treemap
  lac-kanban.html    Kanban board       lac-health.html    Health scorecard
  lac-embed.html     Stats widget       lac-decisions.html Decision log (ADR)
  lac-prompt.md      AI rebuild prompt  site/              Multi-page static site`)
  .action(async (pathArg: string | undefined, opts: Partial<ExportAllOptions>) => {
    const scanDir = resolve(pathArg ?? process.cwd())
    const outDir = resolve(opts.out ?? './lac-exports')
    const skipSet = new Set(
      (opts.skip ?? '').split(',').map(s => s.trim()).filter(Boolean),
    )

    // ── Validate skip names ──────────────────────────────────────────────────
    for (const name of skipSet) {
      if (!ALL_FORMAT_NAMES.includes(name)) {
        process.stderr.write(
          `Error: unknown format "${name}". Valid formats: ${ALL_FORMAT_NAMES.join(', ')}\n`,
        )
        process.exit(1)
      }
    }

    // ── Scan features ────────────────────────────────────────────────────────
    process.stdout.write(`\nScanning "${scanDir}"...\n`)
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

    process.stdout.write(`Found ${features.length} feature${features.length === 1 ? '' : 's'}.\n`)

    // ── Ensure output directory ───────────────────────────────────────────────
    await mkdir(outDir, { recursive: true })
    process.stdout.write(`Output → ${outDir}\n\n`)

    const projectName = basename(scanDir)
    // All generators take Feature[] — unwrap ScannedFeature once here
    const featureList: Feature[] = features.map(f => f.feature)
    const results: { name: string; file: string; ok: boolean; error?: string }[] = []

    // ── HTML formats ─────────────────────────────────────────────────────────
    for (const fmt of HTML_FORMATS) {
      if (skipSet.has(fmt.name)) {
        process.stdout.write(`  skip  ${fmt.file}\n`)
        continue
      }
      const outFile = join(outDir, fmt.file)
      try {
        const html = fmt.generate(featureList, projectName)
        await writeFile(outFile, html, 'utf-8')
        process.stdout.write(`  ✓     ${fmt.file}\n`)
        results.push({ name: fmt.name, file: fmt.file, ok: true })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        process.stdout.write(`  ✗     ${fmt.file}  (${error.slice(0, 60)})\n`)
        results.push({ name: fmt.name, file: fmt.file, ok: false, error })
      }
    }

    // ── Reconstruction prompt ────────────────────────────────────────────────
    if (!skipSet.has('prompt')) {
      const outFile = join(outDir, 'lac-prompt.md')
      try {
        const prompt = buildReconstructionPrompt(features, projectName, scanDir)
        await writeFile(outFile, prompt, 'utf-8')
        process.stdout.write(`  ✓     lac-prompt.md\n`)
        results.push({ name: 'prompt', file: 'lac-prompt.md', ok: true })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        process.stdout.write(`  ✗     lac-prompt.md  (${error.slice(0, 60)})\n`)
        results.push({ name: 'prompt', file: 'lac-prompt.md', ok: false, error })
      }
    } else {
      process.stdout.write(`  skip  lac-prompt.md\n`)
    }

    // ── Static site ───────────────────────────────────────────────────────────
    if (!skipSet.has('site')) {
      const siteOutDir = join(outDir, 'site')
      try {
        await mkdir(siteOutDir, { recursive: true })
        await generateSite(features, siteOutDir)
        process.stdout.write(`  ✓     site/\n`)
        results.push({ name: 'site', file: 'site/', ok: true })
      } catch (err) {
        const error = err instanceof Error ? err.message : String(err)
        process.stdout.write(`  ✗     site/  (${error.slice(0, 60)})\n`)
        results.push({ name: 'site', file: 'site/', ok: false, error })
      }
    } else {
      process.stdout.write(`  skip  site/\n`)
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const passed = results.filter(r => r.ok).length
    const failed = results.filter(r => !r.ok).length
    const skipped = skipSet.size

    process.stdout.write('\n')
    process.stdout.write(
      `✓ ${passed} exported` +
      (failed > 0 ? `, ${failed} failed` : '') +
      (skipped > 0 ? `, ${skipped} skipped` : '') +
      `  →  ${outDir}\n\n`,
    )
  })
