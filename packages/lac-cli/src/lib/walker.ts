import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Walks up the directory tree from startDir to find the nearest feature.json.
 * Returns the absolute path or null if not found before reaching the filesystem root.
 */
export function findNearestFeatureJson(startDir: string): string | null {
  let current = resolve(startDir)
  while (true) {
    const candidate = join(current, 'feature.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/**
 * Walks up the directory tree from startDir to find the nearest .git directory.
 * Returns the absolute path to .git or null if not found.
 */
export function findGitDir(startDir: string): string | null {
  let current = resolve(startDir)
  while (true) {
    const candidate = join(current, '.git')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

/**
 * Walks up the directory tree from startDir to find the nearest lac.config.json.
 * Returns the absolute path or null if not found.
 */
export function findLacConfig(startDir: string): string | null {
  let current = resolve(startDir)
  while (true) {
    const candidate = join(current, 'lac.config.json')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}
