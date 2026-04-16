import React, { useState } from 'react'
import { useLacSearch } from '../hooks.js'
import type { LacView } from '../types.js'
import { LacFeatureCard } from './LacFeatureCard.js'

export interface LacSearchProps {
  guideUrl?: string
  /** Default view for result cards */
  defaultView?: LacView
  /** Placeholder text */
  placeholder?: string
  style?: React.CSSProperties
  className?: string
}

/**
 * LacSearch — full-text search across all features with live results.
 * Must be inside a LacDataProvider.
 */
export function LacSearch({ guideUrl, defaultView = 'user', placeholder = 'Search features…', style, className }: LacSearchProps) {
  const [query, setQuery] = useState('')
  const results = useLacSearch(query)

  return (
    <div className={className} style={style}>
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder={placeholder}
        autoFocus
        style={{
          width: '100%',
          background: '#27272a',
          border: '1px solid #3f3f46',
          borderRadius: 6,
          color: '#f4f4f5',
          fontSize: '0.875rem',
          padding: '8px 12px',
          marginBottom: 16,
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />

      {query && results.length === 0 && (
        <p style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', paddingTop: 24 }}>
          No features match &ldquo;{query}&rdquo;
        </p>
      )}

      {results.map(f => (
        <LacFeatureCard
          key={f.featureKey}
          feature={f}
          view={defaultView}
          guideUrl={guideUrl}
          style={{ marginBottom: 8 }}
        />
      ))}

      {!query && (
        <p style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', paddingTop: 24 }}>
          Start typing to search features…
        </p>
      )}
    </div>
  )
}
