import { readFile } from 'node:fs/promises'
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
 * Files that fail validation are silently skipped.
 * Hidden directories, node_modules, and dist are skipped.
 */
export async function scanFeatures(
  dir: string,
  onWarning?: (msg: string) => void,
): Promise<ScannedFeature[]> {
  const results: ScannedFeature[] = []
  const warn = onWarning ?? (() => {})

  // Use dynamic import to avoid the Dirent generic type issue with readdir
  const { readdir } = await import('node:fs/promises')

  async function walk(currentDir: string): Promise<void> {
    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[]

    try {
      const raw = await readdir(currentDir, { withFileTypes: true })
      entries = raw.map((e) => ({
        name: String(e.name),
        isDirectory: () => e.isDirectory(),
        isFile: () => e.isFile(),
      }))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      warn(`Warning: could not read directory "${currentDir}": ${message}`)
      return
    }

    for (const entry of entries) {
      const fullPath = join(currentDir, entry.name)

      if (entry.isDirectory()) {
        if (
          entry.name.startsWith('.') ||
          entry.name === 'node_modules' ||
          entry.name === 'dist'
        ) {
          continue
        }
        await walk(fullPath)
      } else if (entry.isFile() && entry.name === 'feature.json') {
        let raw: string
        try {
          raw = await readFile(fullPath, 'utf-8')
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          warn(`Warning: could not read "${fullPath}": ${message}`)
          continue
        }

        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          warn(`Warning: invalid JSON in "${fullPath}" — skipping`)
          continue
        }

        const result = validateFeature(parsed)
        if (!result.success) {
          warn(
            `Warning: "${fullPath}" failed validation — skipping\n  ${result.errors.join('\n  ')}`,
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
