import React from 'react'
import { useLacContext } from '../context.js'
import type { LacFeatureEntry } from '../types.js'
import { T, statusColor, statusBg, statusBorder } from '../tokens.js'

function SprintCard({ feature, guideUrl, onNavigate }: {
  feature: LacFeatureEntry
  guideUrl?: string
  onNavigate?: (key: string) => void
}) {
  const sc = statusColor(feature.status)
  const sb = statusBg(feature.status)
  const sbd = statusBorder(feature.status)
  const problem = feature.views.user?.problem ?? feature.views.product?.problem
  const preview = problem ? problem.split(/[.!?]\s/)[0] : ''

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onNavigate?.(feature.featureKey)}
      onKeyDown={e => e.key === 'Enter' && onNavigate?.(feature.featureKey)}
      style={{
        background: T.bgCard, border: `1px solid ${sbd}`,
        borderRadius: 6, padding: '12px 14px', marginBottom: 6,
        cursor: onNavigate ? 'pointer' : 'default',
        transition: 'border-color 0.15s',
      }}
      onMouseEnter={e => {
        if (onNavigate) (e.currentTarget as HTMLElement).style.borderColor = T.accent
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLElement).style.borderColor = sbd
      }}
    >
      {/* Status + key row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          fontFamily: T.mono, fontSize: 10, letterSpacing: '0.08em',
          color: sc, background: sb, border: `1px solid ${sbd}`,
          padding: '2px 6px', borderRadius: 3,
        }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc, display: 'inline-block' }} />
          {feature.status}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {feature.priority && (
            <span style={{
              fontFamily: T.mono, fontSize: 10,
              color: T.textSoft, background: T.bg, border: `1px solid ${T.border}`,
              padding: '1px 5px', borderRadius: 3,
            }}>
              P{feature.priority}
            </span>
          )}
          <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>
            {feature.featureKey}
          </span>
        </div>
      </div>

      {/* Title */}
      <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>
        {feature.title}
      </p>

      {/* Preview */}
      {preview && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: T.textSoft, lineHeight: 1.45 }}>
          {preview.length > 90 ? preview.slice(0, 90) + '…' : preview}
        </p>
      )}

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>{feature.domain}</span>
        {guideUrl && (
          <a
            href={`${guideUrl}#${feature.featureKey}`} target="_blank" rel="noreferrer"
            onClick={e => e.stopPropagation()}
            style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, textDecoration: 'none' }}
          >
            guide →
          </a>
        )}
      </div>
    </div>
  )
}

export interface LacSprintBoardProps {
  guideUrl?: string
  /** Max features to show (default: 30) */
  limit?: number
  /** Called when a card is clicked in hub context */
  onNavigate?: (key: string) => void
  style?: React.CSSProperties
  className?: string
}

/**
 * LacSprintBoard — active + draft features sorted by priority.
 * Must be inside a LacDataProvider.
 */
export function LacSprintBoard({ guideUrl, limit = 30, onNavigate, style, className }: LacSprintBoardProps) {
  const { features, loading, error } = useLacContext()

  if (loading) return (
    <div style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft, padding: '16px 0' }}>Loading…</div>
  )
  if (error) return (
    <div style={{ fontFamily: T.mono, fontSize: 12, color: T.statusDeprecated, padding: '16px 0' }}>Error: {error}</div>
  )

  const sprint = features
    .filter(f => f.status === 'active' || f.status === 'draft')
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
    .slice(0, limit)

  const active = sprint.filter(f => f.status === 'active')
  const draft  = sprint.filter(f => f.status === 'draft')

  return (
    <div className={className} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start', ...style }}>
      <div>
        <div style={{
          fontFamily: T.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: T.statusActive, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Active</span>
          <span style={{ color: T.textSoft }}>{active.length}</span>
        </div>
        {active.map(f => <SprintCard key={f.featureKey} feature={f} guideUrl={guideUrl} onNavigate={onNavigate} />)}
        {active.length === 0 && (
          <p style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft }}>No active features.</p>
        )}
      </div>

      <div>
        <div style={{
          fontFamily: T.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
          color: T.statusDraft, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between',
        }}>
          <span>Draft</span>
          <span style={{ color: T.textSoft }}>{draft.length}</span>
        </div>
        {draft.map(f => <SprintCard key={f.featureKey} feature={f} guideUrl={guideUrl} onNavigate={onNavigate} />)}
        {draft.length === 0 && (
          <p style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft }}>No draft features.</p>
        )}
      </div>
    </div>
  )
}
