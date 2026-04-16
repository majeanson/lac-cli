import React, { useState, useMemo } from 'react'
import { useLacContext } from '../context.js'
import { T } from '../tokens.js'
import { highlight } from '../utils.js'

export interface LacDecisionLogProps {
  /** Filter to a specific domain */
  domain?: string
  style?: React.CSSProperties
  className?: string
}

type Entry = {
  featureKey: string
  featureTitle: string
  featureDomain: string
  date: string
  decision: string
  rationale?: string
}

/**
 * LacDecisionLog — all architectural decisions from all features, grouped by domain.
 * Live search with amber mark highlighting. Must be inside a LacDataProvider.
 */
export function LacDecisionLog({ domain, style, className }: LacDecisionLogProps) {
  const { features, loading, error } = useLacContext()
  const [search, setSearch] = useState('')

  const q = search.trim().toLowerCase()

  const entries = useMemo((): Entry[] => {
    const result: Entry[] = []
    for (const f of features) {
      if (domain && f.domain !== domain) continue
      const decisions = f.views.dev?.decisions ?? []
      for (const d of decisions) {
        const text = d.decision ?? d.choice ?? ''
        if (q && !text.toLowerCase().includes(q) && !f.title.toLowerCase().includes(q) && !(d.rationale ?? '').toLowerCase().includes(q)) continue
        result.push({
          featureKey:    f.featureKey,
          featureTitle:  f.title,
          featureDomain: f.domain,
          date:          d.date,
          decision:      text,
          rationale:     d.rationale,
        })
      }
    }
    return result
  }, [features, domain, q])

  const byDomain = useMemo(() => {
    const map = new Map<string, Entry[]>()
    for (const e of entries) {
      if (!map.has(e.featureDomain)) map.set(e.featureDomain, [])
      map.get(e.featureDomain)!.push(e)
    }
    return map
  }, [entries])

  const domains = useMemo(() => [...byDomain.keys()].sort(), [byDomain])

  if (loading) return <div style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft }}>Loading…</div>
  if (error)   return <div style={{ fontFamily: T.mono, fontSize: 12, color: T.statusDeprecated }}>Error: {error}</div>

  return (
    <div className={className} style={style}>
      {/* Search input */}
      <input
        type="text"
        placeholder="Search decisions, rationale…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%', boxSizing: 'border-box',
          background: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: 4, padding: '7px 12px',
          fontFamily: T.mono, fontSize: 12, color: T.text,
          outline: 'none', marginBottom: 20,
        }}
        onFocus={e => { (e.target as HTMLInputElement).style.borderColor = T.accent }}
        onBlur={e => { (e.target as HTMLInputElement).style.borderColor = T.border }}
      />

      {entries.length === 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft, textAlign: 'center', padding: '24px 0' }}>
          {q ? `No decisions match "${search}"` : 'No decisions found.'}
        </div>
      )}

      {domains.map(d => (
        <div key={d} style={{ marginBottom: 28 }}>
          {/* Domain header */}
          <div style={{
            fontFamily: T.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: T.accent, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}`,
            display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{d}</span>
            <span style={{ color: T.textSoft }}>{byDomain.get(d)!.length}</span>
          </div>

          {/* Decision cards */}
          {byDomain.get(d)!.map((entry, i) => (
            <div key={i} style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderLeft: `3px solid ${T.accent}`,
              borderRadius: 4, padding: '12px 14px', marginBottom: 8,
            }}>
              {/* Feature ref row */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>{entry.featureKey}</span>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>{entry.date}</span>
              </div>

              {/* Decision text */}
              <div
                style={{ fontSize: 13, color: T.text, lineHeight: 1.55, marginBottom: entry.rationale ? 6 : 0, fontWeight: 500 }}
                dangerouslySetInnerHTML={{ __html: highlight(entry.decision, search) }}
              />

              {/* Rationale */}
              {entry.rationale && (
                <div
                  style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}
                  dangerouslySetInnerHTML={{ __html: highlight(entry.rationale, search) }}
                />
              )}
            </div>
          ))}
        </div>
      ))}

      {entries.length > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, textAlign: 'center', paddingTop: 8 }}>
          {entries.length} decision{entries.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  )
}
