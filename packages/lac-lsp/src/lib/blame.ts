import { statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import type { FeatureIndex } from '../indexer/FeatureIndex.js'
import type { IndexedFeature } from '../indexer/types.js'

/**
 * Given any absolute path (file or directory), walks up the directory tree
 * to find the nearest feature.json that is tracked in the index.
 *
 * Returns the IndexedFeature that "owns" the path, or undefined if none found.
 *
 * This is the O(depth) walk — depth is typically < 10 so it's fast.
 */
export function blame(absPath: string, index: FeatureIndex): IndexedFeature | undefined {
  const resolved = resolve(absPath)

  // Determine start directory: use the path itself if it's a dir, else its parent
  let startDir: string
  try {
    const stat = statSync(resolved)
    startDir = stat.isDirectory() ? resolved : dirname(resolved)
  } catch {
    // Path doesn't exist (e.g. unsaved editor buffer) — treat as file
    startDir = dirname(resolved)
  }

  let current = startDir
  while (true) {
    const found = index.getByDir(current)
    if (found) return found

    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}
