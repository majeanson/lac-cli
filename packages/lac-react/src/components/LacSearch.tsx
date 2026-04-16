import React, { useState, useRef, useEffect } from 'react'
import { useLacContext } from '../context.js'
import type { LacFeatureEntry } from '../types.js'
import { T, statusColor, statusBg, statusBorder } from '../tokens.js'
import { highlight, mdToHtml } from '../utils.js'

function SearchResult({
  feature,
  query,
  onNavigate,
  guideUrl,
}: {
  feature: LacFeatureEntry
  query: string
  onNavigate?: (key: string) => void
  guideUrl?: string
}) {
  const sc   = statusColor(feature.status)
  const sbg  = statusBg(feature.status)
  const sbdr = statusBorder(feature.status)

  const userGuide = feature.views.user?.userGuide
  const preview   = feature.views.user?.problem ?? feature.views.product?.problem

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate?.(feature.featureKey)}
      onKeyDown={e => e.key === 'Enter' && onNavigate?.(feature.featureKey)}
      style={{
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 6, padding: '14px 16px', marginBottom: 8,
        cursor: onNavigate ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => {
        if (onNavigate) (e.currentTarget as HTMLElement).style.borderColor = T.accent
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = T.border
      }}
    >
      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>{feature.featureKey}</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontFamily: T.mono, fontSize: 10,
          color: sc, background: sbg, border: `1px solid ${sbdr}`,
          padding: '2px 6px', borderRadius: 3,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc, display: 'inline-block' }} />
          {feature.status}
        </span>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>{feature.domain}</span>
        {guideUrl && (
          <a
            href={`${guideUrl}#${feature.featureKey}`} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 10, color: T.accent, textDecoration: 'none' }}
          >
            guide →
          </a>
        )}
      </div>

      {/* Title with highlight */}
      <h3
        style={{ margin: '0 0 6px', fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.3 }}
        dangerouslySetInnerHTML={{ __html: highlight(feature.title, query) }}
      />

      {/* User guide excerpt with highlight */}
      {userGuide && query && userGuide.toLowerCase().includes(query.toLowerCase()) && (
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5, overflow: 'hidden', maxHeight: 48 }}>
          {(() => {
            const lower = userGuide.toLowerCase()
            const pos = lower.indexOf(query.toLowerCase())
            const start = Math.max(0, pos - 60)
            const end = Math.min(userGuide.length, pos + query.length + 100)
            const excerpt = (start > 0 ? '…' : '') + userGuide.slice(start, end) + (end < userGuide.length ? '…' : '')
            return <span dangerouslySetInnerHTML={{ __html: highlight(excerpt, query) }} />
          })()}
        </div>
      )}

      {/* Problem preview */}
      {!userGuide && preview && (
        <p style={{ margin: 0, fontSize: 12, color: T.textMid, lineHeight: 1.45 }}>
          <span dangerouslySetInnerHTML={{ __html: highlight(preview.slice(0, 120) + (preview.length > 120 ? '…' : ''), query) }} />
        </p>
      )}

      {/* Tags */}
      {feature.tags.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 8 }}>
          {feature.tags.map(tag => (
            <span key={tag} style={{
              fontFamily: T.mono, fontSize: 10,
              padding: '2px 6px', background: T.bg, border: `1px solid ${T.border}`,
              borderRadius: 100, color: T.textSoft,
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export interface LacSearchProps {
  guideUrl?: string
  placeholder?: string
  autoFocus?: boolean
  /** Called when a result is clicked in hub context */
  onNavigate?: (key: string) => void
  style?: React.CSSProperties
  className?: string
}

/**
 * LacSearch — full-text search across all features with amber mark highlighting.
 * Must be inside a LacDataProvider.
 */
export function LacSearch({
  guideUrl,
  placeholder = 'Search features, guides, domains…',
  autoFocus,
  onNavigate,
  style,
  className,
}: LacSearchProps) {
  const { features, loading } = useLacContext()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  const q = query.trim().toLowerCase()
  const results = q
    ? features.filter(f =>
        f.title.toLowerCase().includes(q) ||
        f.featureKey.toLowerCase().includes(q) ||
        f.domain.toLowerCase().includes(q) ||
        f.tags.some(t => t.toLowerCase().includes(q)) ||
        (f.views.user?.userGuide ?? '').toLowerCase().includes(q) ||
        (f.views.user?.problem ?? '').toLowerCase().includes(q),
      )
    : []

  return (
    <div className={className} style={style}>
      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <span style={{
          position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
          fontFamily: T.mono, fontSize: 14, color: T.textSoft, pointerEvents: 'none',
        }}>
          ⌕
        </span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%', boxSizing: 'border-box',
            background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: 6, padding: '10px 12px 10px 36px',
            fontFamily: T.sans, fontSize: 14, color: T.text,
            outline: 'none',
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = T.accent }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = T.border }}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: T.mono, fontSize: 16, color: T.textSoft, lineHeight: 1, padding: 0,
            }}
          >
            ×
          </button>
        )}
      </div>

      {/* Empty state */}
      {!q && (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontFamily: T.mono, fontSize: 28, color: T.border, marginBottom: 12 }}>⌕</div>
          <div style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft }}>
            Start typing to search {loading ? '…' : `${features.length} features`}
          </div>
          <div style={{ fontFamily: T.mono, fontSize: 11, color: T.border, marginTop: 6 }}>
            Searches title · domain · tags · guides
          </div>
        </div>
      )}

      {/* No results */}
      {q && results.length === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 32 }}>
          <div style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft }}>No features match &ldquo;{query}&rdquo;</div>
        </div>
      )}

      {/* Results count */}
      {q && results.length > 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, marginBottom: 12 }}>
          {results.length} result{results.length !== 1 ? 's' : ''}
          {results.length > 1 && <span> — click to browse</span>}
        </div>
      )}

      {/* Results */}
      {results.map(f => (
        <SearchResult
          key={f.featureKey}
          feature={f}
          query={query}
          onNavigate={onNavigate}
          guideUrl={guideUrl}
        />
      ))}
    </div>
  )
}
