import * as path from 'path'
import * as fs from 'fs'
import { type Feature, isValidFeature } from '../types/feature.js'
import type { FeatureCache } from './FeatureCache.js'

export class FeatureWalker {
  /**
   * Walk up from filePath to workspace root looking for feature.json.
   * Returns the Feature or null if none found or invalid.
   */
  static findFeature(filePath: string, workspaceRoot: string): Feature | null {
    const featureJsonPath = FeatureWalker.findFeatureJsonPath(filePath, workspaceRoot)
    if (!featureJsonPath) return null
    return FeatureWalker.readFeatureFile(featureJsonPath)
  }

  /**
   * Read and parse a feature.json file.
   * Returns the Feature or null if unreadable / invalid.
   */
  static readFeatureFile(featureJsonPath: string): Feature | null {
    try {
      const raw = fs.readFileSync(featureJsonPath, 'utf-8')
      const parsed: unknown = JSON.parse(raw)
      return isValidFeature(parsed) ? parsed : null
    } catch {
      return null
    }
  }

  /**
   * Get the path of the nearest feature.json above filePath,
   * stopping at workspaceRoot. Returns null if none found.
   */
  static findFeatureJsonPath(filePath: string, workspaceRoot: string): string | null {
    // Normalise separators so comparisons work cross-platform
    const root = path.normalize(workspaceRoot)
    let current = path.normalize(path.dirname(filePath))

    while (true) {
      const candidate = path.join(current, 'feature.json')
      if (fs.existsSync(candidate)) {
        return candidate
      }
      // Do not go above the workspace root
      if (current === root) break
      const parent = path.dirname(current)
      // Guard against infinite loop at filesystem root
      if (parent === current) break
      current = parent
    }

    return null
  }

  /**
   * Find feature for filePath and store the result in cache.
   * Returns the cache entry shape or null.
   */
  static findFeatureAndCache(
    filePath: string,
    workspaceRoot: string,
    cache: FeatureCache,
  ): { feature: Feature; featureJsonPath: string } | null {
    const featureJsonPath = FeatureWalker.findFeatureJsonPath(filePath, workspaceRoot)
    if (!featureJsonPath) return null
    const feature = FeatureWalker.readFeatureFile(featureJsonPath)
    if (!feature) return null
    cache.set(filePath, feature, featureJsonPath)
    return { feature, featureJsonPath }
  }
}
