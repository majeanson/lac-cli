import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

import { generateComparisonReport, type DepthResult } from '../lib/comparisonGenerator.js'

// ── report subcommand ────────────────────────────────────────────────────────

const reportCommand = new Command('report')
  .description('Generate an HTML comparison report from depth experiment result files')
  .argument('<dir>', 'Directory containing results/ with d1.json, d2.json, d3.json (and optionally original.ts)')
  .action(async (dir: string) => {
    const resultsDir = path.resolve(dir, 'results')

    // ── Read depth result files ────────────────────────────────────────────

    const results: DepthResult[] = []

    for (const depth of [1, 2, 3] as const) {
      const filePath = path.join(resultsDir, `d${depth}.json`)

      if (!fs.existsSync(filePath)) {
        process.stderr.write(`Error: missing result file: ${filePath}\n`)
        process.exit(1)
      }

      let raw: unknown
      try {
        raw = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error reading ${filePath}: ${message}\n`)
        process.exit(1)
      }

      // Basic shape validation
      const r = raw as Record<string, unknown>
      if (typeof r !== 'object' || r === null) {
        process.stderr.write(`Error: ${filePath} must be a JSON object\n`)
        process.exit(1)
      }

      results.push({
        depth,
        label:           typeof r['label']         === 'string'  ? r['label']                                : depth === 1 ? 'Why' : depth === 2 ? 'What' : 'How',
        fieldsIncluded:  Array.isArray(r['fieldsIncluded'])       ? (r['fieldsIncluded'] as string[])         : [],
        reconstruction:  typeof r['reconstruction'] === 'string'  ? r['reconstruction']                       : '',
        testsPassed:     typeof r['testsPassed']    === 'number'  ? r['testsPassed']                          : 0,
        testsFailed:     typeof r['testsFailed']    === 'number'  ? r['testsFailed']                          : 0,
        coveragePct:     typeof r['coveragePct']    === 'number'  ? r['coveragePct']                          : 0,
        linesWritten:    typeof r['linesWritten']   === 'number'  ? r['linesWritten']                         : 0,
        notes:           typeof r['notes']          === 'string'  ? r['notes']                                : '',
      })
    }

    // ── Read optional original source ──────────────────────────────────────

    const originalPath = path.join(resultsDir, 'original.ts')
    const originalSource = fs.existsSync(originalPath)
      ? fs.readFileSync(originalPath, 'utf8').replace(/\r\n/g, '\n')
      : ''

    // ── Derive project name from directory ─────────────────────────────────

    const projectName = path.basename(path.resolve(dir))

    // ── Generate report ────────────────────────────────────────────────────

    const html = generateComparisonReport(results, projectName, originalSource)

    // ── Write output ───────────────────────────────────────────────────────

    const outPath = path.join(resultsDir, 'lac-comparison.html')
    fs.writeFileSync(outPath, html, 'utf8')

    process.stdout.write(`\u2713 lac-comparison.html \u2192 ${outPath}\n`)
  })

// ── experiment top-level command ─────────────────────────────────────────────

export const experimentCommand = new Command('experiment')
  .description('Run and report on LAC reconstruction depth experiments')
  .addCommand(reportCommand)
