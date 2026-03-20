import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import type { Feature } from '@life-as-code/feature-schema'
import { validateFeature } from '@life-as-code/feature-schema'

export interface ScannedFeature {
  filePath: string
  feature: Feature
}

/**
 * Recursively finds all feature.json files under a directory.
 * Returns an array of { filePath, feature } for each valid feature.json found.
 * Files that fail validation are skipped with a warning printed to stderr.
 */
export async function scanFeatures(dir: string): Promise<ScannedFeature[]> {
  const results: ScannedFeature[] = []

  async function walk(currentDir: string): Promise<void> {
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rawEntries: any[]
    try {
      rawEntries = await readdir(currentDir, { withFileTypes: true })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      process.stderr.write(`Warning: could not read directory "${currentDir}": ${message}\n`)
      return
    }

    // Normalise to plain objects to avoid @types/node Dirent<Buffer> vs
    // Dirent<string> variance across different @types/node versions.
    entries = rawEntries.map((e) => ({
      name: String(e.name),
      isDirectory: () => e.isDirectory(),
      isFile: () => e.isFile(),
    }))

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)

      if (entry.isDirectory()) {
        // Skip hidden directories and node_modules
        if (entry.name.startsWith('.') || entry.name === 'node_modules') {
          continue
        }
        await walk(fullPath)
      } else if (entry.isFile() && entry.name === 'feature.json') {
        let raw: string
        try {
          raw = await readFile(fullPath, 'utf-8')
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          process.stderr.write(`Warning: could not read "${fullPath}": ${message}\n`)
          continue
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          process.stderr.write(`Warning: invalid JSON in "${fullPath}" — skipping\n`)
          continue
        }

        const result = validateFeature(parsed)
        if (!result.success) {
          process.stderr.write(
            `Warning: "${fullPath}" failed validation — skipping\n  ${result.errors.join('\n  ')}\n`,
          )
          continue
        }

        results.push({ filePath: fullPath, feature: result.data })
      }
    }
  }

  await walk(dir)
  return results
}
