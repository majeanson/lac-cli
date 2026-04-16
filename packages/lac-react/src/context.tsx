import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import type { LacDataExport, LacFeatureEntry } from './types.js'

interface LacContextValue {
  data: LacDataExport | null
  loading: boolean
  error: string | null
  features: LacFeatureEntry[]
  meta: LacDataExport['meta'] | null
}

const LacContext = createContext<LacContextValue>({
  data: null,
  loading: false,
  error: null,
  features: [],
  meta: null,
})

// Module-level cache — survives re-renders and re-mounts
const cache = new Map<string, LacDataExport>()

export interface LacDataProviderProps {
  dataUrl?: string
  children: React.ReactNode
}

/**
 * LacDataProvider — wrap your app (or just the hub section) with this.
 * Fetches lac-data.json once and caches it for the session.
 *
 * ```tsx
 * <LacDataProvider dataUrl="/lac/lac-data.json">
 *   <LacHub />
 * </LacDataProvider>
 * ```
 */
export function LacDataProvider({ dataUrl = '/lac/lac-data.json', children }: LacDataProviderProps) {
  const [data, setData] = useState<LacDataExport | null>(cache.get(dataUrl) ?? null)
  const [loading, setLoading] = useState(!cache.has(dataUrl))
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (cache.has(dataUrl)) return
    if (fetchedRef.current) return
    fetchedRef.current = true

    setLoading(true)
    fetch(dataUrl)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<LacDataExport>
      })
      .then(d => {
        cache.set(dataUrl, d)
        setData(d)
        setLoading(false)
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : String(err))
        setLoading(false)
      })
  }, [dataUrl])

  const value: LacContextValue = {
    data,
    loading,
    error,
    features: data?.features ?? [],
    meta: data?.meta ?? null,
  }

  return <LacContext.Provider value={value}>{children}</LacContext.Provider>
}

/** Access the loaded LAC data. Must be inside LacDataProvider. */
export function useLacContext(): LacContextValue {
  return useContext(LacContext)
}
