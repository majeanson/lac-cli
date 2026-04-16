import React, { useState } from 'react'
import { useLacContext } from '../context.js'

export interface LacDecisionLogProps {
  /** Filter to a specific domain */
  domain?: string
  style?: React.CSSProperties
  className?: string
}

/**
 * LacDecisionLog — all architectural decisions from all features, grouped by domain.
 * Must be inside a LacDataProvider.
 */
export function LacDecisionLog({ domain, style, className }: LacDecisionLogProps) {
  const { features, loading, error } = useLacContext()
  const [search, setSearch] = useState('')

  if (loading) return <div style={{ color: '#52525b', fontSize: '0.8rem', padding: '1rem' }}>Loading…</div>
  if (error) return <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '1rem' }}>Error: {error}</div>

  // Collect all decisions with feature context
  type Entry = {
    featureKey: string
    title: string
    featureDomain: string
    date: string
    decision: string
    rationale?: string
  }

  const entries: Entry[] = []
  for (const f of features) {
    if (domain && f.domain !== domain) continue
    const decisions = f.views.dev?.decisions ?? []
    for (const d of decisions) {
      const text = d.decision ?? d.choice ?? ''
      const q = search.toLowerCase()
      if (q && !text.toLowerCase().includes(q) && !f.title.toLowerCase().includes(q) && !f.domain.toLowerCase().includes(q)) continue
      entries.push({
        featureKey: f.featureKey,
        title: f.title,
        featureDomain: f.domain,
        date: d.date,
        decision: text,
        rationale: d.rationale,
      })
    }
  }

  // Group by domain
  const byDomain: Record<string, Entry[]> = {}
  for (const e of entries) {
    if (!byDomain[e.featureDomain]) byDomain[e.featureDomain] = []
    byDomain[e.featureDomain].push(e)
  }

  const domains = Object.keys(byDomain).sort()

  return (
    <div className={className} style={style}>
      <input
        type="text"
        placeholder="Search decisions…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%',
          background: '#27272a',
          border: '1px solid #3f3f46',
          borderRadius: 6,
          color: '#f4f4f5',
          fontSize: '0.8rem',
          padding: '6px 10px',
          marginBottom: 16,
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />

      {entries.length === 0 && (
        <p style={{ color: '#52525b', fontSize: '0.8rem' }}>No decisions match.</p>
      )}

      {domains.map(d => (
        <div key={d} style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {d}
          </h3>
          {byDomain[d].map((entry, i) => (
            <div key={i} style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 6, padding: '0.75rem', marginBottom: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.65rem', color: '#52525b', fontFamily: 'monospace' }}>{entry.featureKey}</span>
                <span style={{ fontSize: '0.65rem', color: '#52525b' }}>{entry.date}</span>
              </div>
              <p style={{ margin: '0 0 4px', fontSize: '0.8rem', color: '#e4e4e7', fontWeight: 500 }}>{entry.decision}</p>
              {entry.rationale && (
                <p style={{ margin: 0, fontSize: '0.75rem', color: '#71717a', lineHeight: 1.4 }}>{entry.rationale}</p>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
