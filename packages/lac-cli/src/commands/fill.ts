import { dirname, resolve } from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

import { fillFeature } from '@life-as-code/lac-claude'

import { computeCompleteness, loadConfig } from '../lib/config.js'
import { scanFeatures } from '../lib/scanner.js'
import { findNearestFeatureJson } from '../lib/walker.js'

export const fillCommand = new Command('fill')
  .description('Fill missing feature.json fields using AI analysis of your code')
  .argument('[dir]', 'Feature folder to fill (default: nearest feature.json from cwd)')
  .option('--field <fields>', 'Comma-separated fields to fill (default: all missing)')
  .option('--dry-run', 'Preview proposed changes without writing')
  .option('--all', 'Fill all features found under [dir] (or cwd) below the completeness threshold')
  .option('--threshold <n>', 'Completeness % ceiling for --all (default: 80 — skip features already above this)', parseInt)
  .option('--model <model>', 'Claude model to use (default: claude-sonnet-4-6)')
  .action(
    async (
      dir: string | undefined,
      options: {
        field?: string
        dryRun?: boolean
        all?: boolean
        threshold?: number
        model?: string
      },
    ) => {
      const fields = options.field
        ? options.field.split(',').map((f) => f.trim()).filter(Boolean)
        : undefined

      if (options.all) {
        const threshold = options.threshold ?? 80
        const scanDir = dir ? resolve(dir) : process.cwd()

        let allFeatures: Awaited<ReturnType<typeof scanFeatures>>
        try {
          allFeatures = await scanFeatures(scanDir)
        } catch (err) {
          process.stderr.write(`Error scanning "${scanDir}": ${err instanceof Error ? err.message : String(err)}\n`)
          process.exit(1)
        }

        const toFill = allFeatures.filter(({ feature }) => {
          if (feature.status === 'deprecated') return false
          return computeCompleteness(feature as Record<string, unknown>) < threshold
        })

        if (toFill.length === 0) {
          process.stdout.write(`All features are above ${threshold}% completeness. Nothing to fill.\n`)
          return
        }

        process.stdout.write(`\nFilling ${toFill.length} feature${toFill.length === 1 ? '' : 's'} below ${threshold}% completeness...\n\n`)

        let filled = 0
        let failed = 0
        for (const { filePath } of toFill) {
          const featureDir = dirname(filePath)
          const cfg = loadConfig(featureDir)
          try {
            const result = await fillFeature({
              featureDir,
              fields,
              dryRun: options.dryRun ?? false,
              skipConfirm: true,
              model: options.model,
              defaultAuthor: cfg.defaultAuthor || undefined,
            })
            if (result.applied) filled++
          } catch (err) {
            process.stderr.write(`  Error filling "${featureDir}": ${err instanceof Error ? err.message : String(err)}\n`)
            failed++
          }
        }

        process.stdout.write(`\n✓ Filled ${filled} feature${filled === 1 ? '' : 's'}`)
        if (failed > 0) process.stdout.write(`, ${failed} failed`)
        process.stdout.write('\n')
        return
      }

      // Resolve the feature directory
      let featureDir: string
      if (dir) {
        featureDir = resolve(dir)
      } else {
        const found = findNearestFeatureJson(process.cwd())
        if (!found) {
          process.stderr.write(
            'No feature.json found from current directory.\nRun "lac init" to create one, or pass a path: lac fill src/auth/\n',
          )
          process.exit(1)
        }
        featureDir = dirname(found)
      }

      const config = loadConfig(featureDir)

      try {
        await fillFeature({
          featureDir,
          fields,
          dryRun: options.dryRun ?? false,
          model: options.model,
          defaultAuthor: config.defaultAuthor || undefined,
        })
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
        process.exit(1)
      }
    },
  )
