import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

import { FEATURE_KEY_PATTERN, validateFeature } from '@life-as-code/feature-schema'
import { Command } from 'commander'

import { scanFeatures } from '../lib/scanner.js'

/**
 * Patches all featureJson files that reference oldKey in their lineage.parent
 * or lineage.children to use newKey instead.
 */
async function patchLineageRefs(
  features: Awaited<ReturnType<typeof scanFeatures>>,
  oldKey: string,
  newKey: string,
): Promise<number> {
  let patched = 0

  for (const { feature, filePath } of features) {
    let changed = false
    const data = { ...feature } as Record<string, unknown>

    const lineage = data['lineage'] as
      | { parent?: string | null; children?: string[] }
      | undefined

    if (!lineage) continue

    const updatedLineage = { ...lineage }

    if (updatedLineage.parent === oldKey) {
      updatedLineage.parent = newKey
      changed = true
    }

    if (Array.isArray(updatedLineage.children) && updatedLineage.children.includes(oldKey)) {
      updatedLineage.children = updatedLineage.children.map((c) =>
        c === oldKey ? newKey : c,
      )
      changed = true
    }

    if (changed) {
      data['lineage'] = updatedLineage
      const validation = validateFeature(data)
      if (validation.success) {
        await writeFile(filePath, JSON.stringify(validation.data, null, 2) + '\n', 'utf-8')
        patched++
      }
    }
  }

  return patched
}

export const renameCommand = new Command('rename')
  .description('Rename a featureKey — updates the feature.json and patches all lineage references')
  .argument('<old-key>', 'Current featureKey (e.g. feat-2026-001)')
  .argument('<new-key>', 'New featureKey (e.g. feat-2026-099)')
  .option('-d, --dir <path>', 'Directory to scan for features (default: cwd)')
  .option('--dry-run', 'Preview changes without writing files')
  .action(
    async (
      oldKey: string,
      newKey: string,
      options: { dir?: string; dryRun?: boolean },
    ) => {
      // Validate new key format
      if (!FEATURE_KEY_PATTERN.test(newKey)) {
        process.stderr.write(
          `Error: "${newKey}" is not a valid featureKey.\n` +
            `Keys must match the pattern <domain>-YYYY-NNN (e.g. feat-2026-099).\n`,
        )
        process.exit(1)
      }

      if (oldKey === newKey) {
        process.stderr.write(`Error: old and new keys are identical ("${oldKey}").\n`)
        process.exit(1)
      }

      const scanDir = options.dir ?? process.cwd()
      const dryRun = options.dryRun ?? false

      let features: Awaited<ReturnType<typeof scanFeatures>>
      try {
        features = await scanFeatures(scanDir)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        process.stderr.write(`Error scanning "${scanDir}": ${message}\n`)
        process.exit(1)
      }

      // Find the target feature
      const target = features.find((f) => f.feature.featureKey === oldKey)
      if (!target) {
        process.stderr.write(`Error: feature "${oldKey}" not found in "${scanDir}".\n`)
        process.exit(1)
      }

      // Check that newKey is not already taken
      const conflict = features.find((f) => f.feature.featureKey === newKey)
      if (conflict) {
        process.stderr.write(
          `Error: "${newKey}" is already used by "${path.relative(scanDir, conflict.filePath)}".\n`,
        )
        process.exit(1)
      }

      // Find lineage refs that will be patched
      const lineageRefs = features.filter(({ feature }) => {
        const lineage = feature.lineage as
          | { parent?: string | null; children?: string[] }
          | undefined
        return (
          lineage?.parent === oldKey ||
          (Array.isArray(lineage?.children) && lineage.children.includes(oldKey))
        )
      })

      if (dryRun) {
        process.stdout.write(`Dry run — no files will be written.\n\n`)
        process.stdout.write(`Would rename: ${oldKey} → ${newKey}\n`)
        process.stdout.write(`  File: ${path.relative(scanDir, target.filePath)}\n`)
        if (lineageRefs.length > 0) {
          process.stdout.write(`\nWould patch ${lineageRefs.length} lineage reference(s):\n`)
          for (const ref of lineageRefs) {
            process.stdout.write(`  ${path.relative(scanDir, ref.filePath)}\n`)
          }
        }
        return
      }

      // 1. Update the target feature.json
      const raw = await readFile(target.filePath, 'utf-8')
      const parsed = JSON.parse(raw) as Record<string, unknown>
      parsed['featureKey'] = newKey

      const validation = validateFeature(parsed)
      if (!validation.success) {
        process.stderr.write(
          `Internal error: renamed feature failed validation:\n  ${validation.errors.join('\n  ')}\n`,
        )
        process.exit(1)
      }

      await writeFile(
        target.filePath,
        JSON.stringify(validation.data, null, 2) + '\n',
        'utf-8',
      )
      process.stdout.write(`✓ Renamed ${oldKey} → ${newKey}\n`)

      // 2. Patch lineage references in all other features
      const patched = await patchLineageRefs(features, oldKey, newKey)
      if (patched > 0) {
        process.stdout.write(`✓ Patched ${patched} lineage reference${patched === 1 ? '' : 's'}\n`)
      }

      // 3. Update the .lac/keys registry so it stays in sync.
      //    Walk up from scanDir to find the .lac/ directory.
      let lacDir: string | null = null
      let cur = path.resolve(scanDir)
      while (true) {
        const candidate = path.join(cur, '.lac')
        if (existsSync(candidate)) { lacDir = candidate; break }
        const parent = path.dirname(cur)
        if (parent === cur) break
        cur = parent
      }
      if (lacDir) {
        const keysPath = path.join(lacDir, 'keys')
        if (existsSync(keysPath)) {
          const lines = readFileSync(keysPath, 'utf-8').trim().split('\n').filter(Boolean)
          const updated = lines.map((k) => (k === oldKey ? newKey : k))
          if (!updated.includes(newKey)) updated.push(newKey)
          writeFileSync(keysPath, updated.join('\n') + '\n', 'utf-8')
          process.stdout.write(`✓ Updated .lac/keys registry\n`)
        }
      }
    },
  )
