import type { Feature } from '../types/feature.js'

interface CacheEntry {
  feature: Feature
  featureJsonPath: string
  expiresAt: number
}

export class FeatureCache {
  private cache = new Map<string, CacheEntry>()
  private readonly ttlMs = 5 * 60 * 1000 // 5 minutes

  get(filePath: string): CacheEntry | null {
    const entry = this.cache.get(filePath)
    if (!entry) return null
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(filePath)
      return null
    }
    return entry
  }

  set(filePath: string, feature: Feature, featureJsonPath: string): void {
    this.cache.set(filePath, {
      feature,
      featureJsonPath,
      expiresAt: Date.now() + this.ttlMs,
    })
  }

  /**
   * Invalidate all cache entries that were sourced from a given feature.json path.
   */
  invalidate(featureJsonPath: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.featureJsonPath === featureJsonPath) {
        this.cache.delete(key)
      }
    }
  }

  clear(): void {
    this.cache.clear()
  }
}
