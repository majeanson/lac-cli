import React from 'react'
import { useLacContext } from '../context.js'
import type { LacFeatureEntry } from '../types.js'

const PRIORITY_LABEL: Record<number, string> = { 1: 'P1', 2: 'P2', 3: 'P3', 4: 'P4', 5: 'P5' }
const STATUS_COLOR: Record<string, string> = {
  active: '#f59e0b',
  draft: '#60a5fa',
}

function SprintCard({ feature, guideUrl }: { feature: LacFeatureEntry; guideUrl?: string }) {
  const href = guideUrl ? `${guideUrl}#${feature.featureKey}` : undefined
  const problem = feature.views.user?.problem ?? feature.views.product?.problem
  const preview = problem ? problem.split(/[.!?]\s/)[0] : ''

  return (
    <div style={{
      background: '#1c1c1e',
      border: `1px solid ${feature.status === 'active' ? 'rgba(245,158,11,0.3)' : '#3f3f46'}`,
      borderRadius: 8,
      padding: '0.75rem',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: '0.65rem', color: STATUS_COLOR[feature.status], fontWeight: 600, textTransform: 'uppercase' }}>
          {feature.status}
        </span>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          {feature.priority && (
            <span style={{ fontSize: '0.65rem', color: '#71717a', background: '#27272a', padding: '1px 5px', borderRadius: 3 }}>
              {PRIORITY_LABEL[feature.priority]}
            </span>
          )}
          <span style={{ fontSize: '0.65rem', color: '#52525b', fontFamily: 'monospace' }}>{feature.featureKey}</span>
        </div>
      </div>
      <p style={{ margin: '0 0 4px', fontSize: '0.8rem', fontWeight: 600, color: '#f4f4f5', lineHeight: 1.3 }}>
        {feature.title}
      </p>
      {preview && (
        <p style={{ margin: '0 0 6px', fontSize: '0.75rem', color: '#71717a', lineHeight: 1.4 }}>
          {preview.length > 80 ? preview.slice(0, 80) + '…' : preview}
        </p>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '0.65rem', color: '#52525b' }}>{feature.domain}</span>
        {href && (
          <a href={href} target="_blank" rel="noreferrer" style={{ fontSize: '0.65rem', color: '#f59e0b', textDecoration: 'none' }}>
            Guide →
          </a>
        )}
      </div>
    </div>
  )
}

export interface LacSprintBoardProps {
  guideUrl?: string
  /** Max features to show (default: 20) */
  limit?: number
  style?: React.CSSProperties
  className?: string
}

/**
 * LacSprintBoard — active + draft features sorted by priority.
 * Must be inside a LacDataProvider.
 */
export function LacSprintBoard({ guideUrl, limit = 20, style, className }: LacSprintBoardProps) {
  const { features, loading, error } = useLacContext()

  if (loading) return <div style={{ color: '#52525b', fontSize: '0.8rem', padding: '1rem' }}>Loading sprint…</div>
  if (error) return <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '1rem' }}>Error: {error}</div>

  const sprint = features
    .filter(f => f.status === 'active' || f.status === 'draft')
    .sort((a, b) => ((a.priority ?? 99) - (b.priority ?? 99)))
    .slice(0, limit)

  const active = sprint.filter(f => f.status === 'active')
  const draft = sprint.filter(f => f.status === 'draft')

  return (
    <div className={className} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, ...style }}>
      <div>
        <h3 style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Active ({active.length})
        </h3>
        {active.map(f => <SprintCard key={f.featureKey} feature={f} guideUrl={guideUrl} />)}
        {active.length === 0 && <p style={{ color: '#52525b', fontSize: '0.75rem' }}>No active features.</p>}
      </div>
      <div>
        <h3 style={{ margin: '0 0 10px', fontSize: '0.75rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Draft ({draft.length})
        </h3>
        {draft.map(f => <SprintCard key={f.featureKey} feature={f} guideUrl={guideUrl} />)}
        {draft.length === 0 && <p style={{ color: '#52525b', fontSize: '0.75rem' }}>No draft features.</p>}
      </div>
    </div>
  )
}
