import { dirname, resolve } from 'node:path'
import process from 'node:process'

import { Command } from 'commander'

import { genFromFeature } from '@life-as-code/lac-claude'

import { findNearestFeatureJson } from '../lib/walker.js'

const GEN_TYPES = ['component', 'test', 'migration', 'docs'] as const
type GenType = (typeof GEN_TYPES)[number]

export const genCommand = new Command('gen')
  .description('Generate code artifacts from a feature.json (component, test, migration, docs)')
  .argument('[dir]', 'Feature folder (default: nearest feature.json from cwd)')
  .option(`--type <type>`, `What to generate: ${GEN_TYPES.join(', ')}`)
  .option('--dry-run', 'Print generated content without writing to disk')
  .option('--out <file>', 'Output file path (default: auto-named next to feature.json)')
  .option('--model <model>', 'Claude model to use (default: claude-sonnet-4-6)')
  .action(
    async (
      dir: string | undefined,
      options: {
        type?: string
        dryRun?: boolean
        out?: string
        model?: string
      },
    ) => {
      // Resolve type
      const type = (options.type ?? 'component') as GenType
      if (!GEN_TYPES.includes(type)) {
        process.stderr.write(
          `Unknown type "${type}". Available: ${GEN_TYPES.join(', ')}\n`,
        )
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
            'No feature.json found from current directory.\nRun "lac init" to create one, or pass a path: lac gen src/auth/ --type test\n',
          )
          process.exit(1)
        }
        featureDir = dirname(found)
      }

      try {
        await genFromFeature({
          featureDir,
          type,
          dryRun: options.dryRun ?? false,
          outFile: options.out,
          model: options.model,
        })
      } catch (err) {
        process.stderr.write(`Error: ${err instanceof Error ? err.message : String(err)}\n`)
        process.exit(1)
      }
    },
  )
