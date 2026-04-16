import { useMemo } from 'react'
import { useLacContext } from './context.js'
import type { LacFeatureEntry, LacStatus } from './types.js'

/** Get a single feature by key. Returns null if not found or not yet loaded. */
export function useLacFeature(featureKey: string): LacFeatureEntry | null {
  const { features } = useLacContext()
  return useMemo(() => features.find(f => f.featureKey === featureKey) ?? null, [features, featureKey])
}

/** Get all features, optionally filtered by domain and/or status. */
export function useLacFeatures(opts?: {
  domain?: string
  status?: LacStatus | LacStatus[]
  priority?: number
}): LacFeatureEntry[] {
  const { features } = useLacContext()
  return useMemo(() => {
    let result = features
    if (opts?.domain) result = result.filter(f => f.domain === opts.domain)
    if (opts?.status) {
      const statuses = Array.isArray(opts.status) ? opts.status : [opts.status]
      result = result.filter(f => statuses.includes(f.status))
    }
    if (opts?.priority !== undefined) result = result.filter(f => (f.priority ?? 99) <= opts.priority!)
    return result
  }, [features, opts?.domain, opts?.status, opts?.priority])
}

/** Full-text search across title, domain, tags, problem, userGuide. */
export function useLacSearch(query: string): LacFeatureEntry[] {
  const { features } = useLacContext()
  return useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return features.filter(f => {
      if (f.title.toLowerCase().includes(q)) return true
      if (f.domain?.toLowerCase().includes(q)) return true
      if (f.tags?.some(t => t.toLowerCase().includes(q))) return true
      if (f.views.user?.problem?.toLowerCase().includes(q)) return true
      if (f.views.user?.userGuide?.toLowerCase().includes(q)) return true
      if (f.featureKey.toLowerCase().includes(q)) return true
      return false
    })
  }, [features, query])
}

/** Get all unique domains from loaded features. */
export function useLacDomains(): string[] {
  const { features } = useLacContext()
  return useMemo(
    () => [...new Set(features.map(f => f.domain).filter(Boolean))].sort(),
    [features],
  )
}
