import { dirname, resolve } from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

import { fillFeature } from '@life-as-code/lac-claude'

import { findNearestFeatureJson } from '../lib/walker.js'

export const fillCommand = new Command('fill')
  .description('Fill missing feature.json fields using AI analysis of your code')
  .argument('[dir]', 'Feature folder to fill (default: nearest feature.json from cwd)')
  .option('--field <fields>', 'Comma-separated fields to fill (default: all missing)')
  .option('--dry-run', 'Preview proposed changes without writing')
  .option('--all', 'Fill all features in the workspace below the completeness threshold')
  .option('--threshold <n>', 'Skip features above this completeness % (used with --all)', parseInt)
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
        // TODO: scan workspace and fill all features below threshold
        process.stderr.write('--all flag coming soon. Run "lac fill <dir>" for a specific feature.\n')
        process.exit(1)
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

      try {
        await fillFeature({
          featureDir,
          fields,
          dryRun: options.dryRun ?? false,
          model: options.model,
        })
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
        process.exit(1)
      }
    },
  )
