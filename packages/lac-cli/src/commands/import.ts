import { existsSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

export const importCommand = new Command('import')
  .description('Import features from a JSON file (array of feature objects)')
  .argument('<file>', 'Path to a JSON file containing an array of feature objects')
  .option('-d, --dir <path>', 'Directory to create feature subdirectories in (default: cwd)')
  .option('--dry-run', 'Preview what would be created without writing files')
  .option('--skip-invalid', 'Skip invalid features instead of aborting')
  .action(
    async (
      file: string,
      options: { dir?: string; dryRun?: boolean; skipInvalid?: boolean },
    ) => {
      const filePath = resolve(file)
      const outDir = resolve(options.dir ?? process.cwd())
      const dryRun = options.dryRun ?? false
      const skipInvalid = options.skipInvalid ?? false

      // Read input file
      let raw: string
      try {
        raw = await readFile(filePath, 'utf-8')
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error reading "${filePath}": ${message}\n`)
        process.exit(1)
      }

      // Parse JSON
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        process.stderr.write(`Error: "${filePath}" contains invalid JSON.\n`)
        process.exit(1)
      }

      if (!Array.isArray(parsed)) {
        process.stderr.write(
          `Error: expected a JSON array of feature objects, got ${typeof parsed}.\n`,
        )
        process.exit(1)
      }

      const features = parsed as unknown[]

      if (features.length === 0) {
        process.stdout.write(`No features in "${filePath}" — nothing to import.\n`)
        process.exit(0)
      }

      process.stdout.write(`Found ${features.length} feature${features.length === 1 ? '' : 's'} in "${file}".\n`)
      if (dryRun) {
        process.stdout.write(`Dry run — no files will be written.\n\n`)
      }

      let imported = 0
      let skipped = 0

      for (const item of features) {
        // Validate
        const result = validateFeature(item)

        if (!result.success) {
          const key = (item as Record<string, unknown>)?.['featureKey'] ?? '(unknown)'
          if (skipInvalid) {
            process.stderr.write(
              `  ⚠  ${key} — skipped (invalid): ${result.errors.join(', ')}\n`,
            )
            skipped++
            continue
          } else {
            process.stderr.write(
              `  ✗  ${key} — validation failed:\n` +
                result.errors.map((e) => `       ${e}`).join('\n') +
                '\n\nAbort. Use --skip-invalid to continue past errors.\n',
            )
            process.exit(1)
          }
        }

        const feature = result.data
        const featureDirName = feature.featureKey
        const featureDir = join(outDir, featureDirName)
        const featureFilePath = join(featureDir, 'feature.json')

        // Detect path conflicts before attempting to write.
        if (existsSync(featureDir) && !statSync(featureDir).isDirectory()) {
          process.stderr.write(
            `  ✗  ${feature.featureKey} — path "${featureDirName}" already exists as a file, not a directory.\n`,
          )
          process.exit(1)
        }
        const alreadyExists = existsSync(featureFilePath)

        if (dryRun) {
          process.stdout.write(`  Would ${alreadyExists ? 'overwrite' : 'create'}: ${featureDirName}/feature.json\n`)
          imported++
          continue
        }

        if (alreadyExists) {
          process.stderr.write(`  ⚠  ${feature.featureKey} — ${featureDirName}/feature.json already exists, overwriting\n`)
        }

        try {
          await mkdir(featureDir, { recursive: true })
          await writeFile(
            featureFilePath,
            JSON.stringify(feature, null, 2) + '\n',
            'utf-8',
          )
          process.stdout.write(`  ✓  ${feature.featureKey} → ${featureDirName}/feature.json\n`)
          imported++
        } catch (err) {
          // Write/IO failures are never silently skipped by --skip-invalid —
          // that flag applies to schema validation errors only.  An IO failure
          // (permissions, disk full, path conflict) is always fatal unless the
          // caller explicitly handles it.
          const message = err instanceof Error ? err.message : String(err)
          process.stderr.write(`  ✗  ${feature.featureKey} — write failed: ${message}\n`)
          process.exit(1)
        }
      }

      process.stdout.write(`\n`)
      if (dryRun) {
        process.stdout.write(`Would import ${imported} feature${imported === 1 ? '' : 's'}.\n`)
      } else {
        const parts: string[] = []
        if (imported > 0) parts.push(`${imported} imported`)
        if (skipped > 0) parts.push(`${skipped} skipped`)
        process.stdout.write(`Done: ${parts.join(', ')}.\n`)
      }
    },
  )
