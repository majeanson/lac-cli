import React, { useState, useCallback } from 'react'
import { useLacContext } from '../context.js'
import type { LacFeatureEntry } from '../types.js'

type CriteriaStatus = 'met' | 'in-progress' | 'not-started'

const STATUS_STYLES: Record<CriteriaStatus, { color: string; label: string; bg: string }> = {
  met: { color: '#4ade80', label: 'Met', bg: 'rgba(34,197,94,0.1)' },
  'in-progress': { color: '#f59e0b', label: 'In Progress', bg: 'rgba(245,158,11,0.1)' },
  'not-started': { color: '#71717a', label: 'Not Started', bg: 'rgba(113,113,122,0.1)' },
}

function CriteriaCard({
  feature,
  storedStatus,
  onToggle,
}: {
  feature: LacFeatureEntry
  storedStatus: CriteriaStatus
  onToggle: (key: string) => void
}) {
  const successCriteria = feature.views.product?.successCriteria ?? feature.views.user?.successCriteria
  const acceptance = feature.views.product?.acceptanceCriteria ?? []
  if (!successCriteria && acceptance.length === 0) return null

  const s = STATUS_STYLES[storedStatus]

  return (
    <div style={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8, padding: '0.875rem', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
        <div>
          <span style={{ fontSize: '0.65rem', color: '#52525b', fontFamily: 'monospace', display: 'block', marginBottom: 2 }}>
            {feature.featureKey}
          </span>
          <p style={{ margin: 0, fontSize: '0.8rem', fontWeight: 600, color: '#f4f4f5' }}>{feature.title}</p>
        </div>
        <button
          onClick={() => onToggle(feature.featureKey)}
          style={{
            background: s.bg,
            border: `1px solid ${s.color}`,
            borderRadius: 4,
            color: s.color,
            fontSize: '0.65rem',
            fontWeight: 600,
            padding: '2px 8px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          {s.label}
        </button>
      </div>
      {successCriteria && (
        <p style={{ margin: '0 0 6px', fontSize: '0.75rem', color: '#a1a1aa', lineHeight: 1.4 }}>
          {successCriteria}
        </p>
      )}
      {acceptance.length > 0 && (
        <ul style={{ margin: 0, padding: '0 0 0 1rem' }}>
          {acceptance.map((ac, i) => (
            <li key={i} style={{ fontSize: '0.7rem', color: '#71717a', margin: '2px 0' }}>{ac}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

const CYCLE: CriteriaStatus[] = ['not-started', 'in-progress', 'met']

function nextStatus(current: CriteriaStatus): CriteriaStatus {
  const idx = CYCLE.indexOf(current)
  return CYCLE[(idx + 1) % CYCLE.length]
}

const STORAGE_KEY = 'lac-success-status'

function loadStored(): Record<string, CriteriaStatus> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, CriteriaStatus>
  } catch {
    return {}
  }
}

export interface LacSuccessBoardProps {
  /** Only show features with successCriteria or acceptanceCriteria (default: true) */
  onlyWithCriteria?: boolean
  style?: React.CSSProperties
  className?: string
}

/**
 * LacSuccessBoard — successCriteria per feature with localStorage-persisted status tracking.
 * Click the status badge to cycle: Not Started → In Progress → Met.
 * Must be inside a LacDataProvider.
 */
export function LacSuccessBoard({ onlyWithCriteria = true, style, className }: LacSuccessBoardProps) {
  const { features, loading, error } = useLacContext()
  const [stored, setStored] = useState<Record<string, CriteriaStatus>>(loadStored)

  const toggle = useCallback((key: string) => {
    setStored(prev => {
      const next: Record<string, CriteriaStatus> = {
        ...prev,
        [key]: nextStatus(prev[key] ?? 'not-started'),
      }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  if (loading) return <div style={{ color: '#52525b', fontSize: '0.8rem', padding: '1rem' }}>Loading…</div>
  if (error) return <div style={{ color: '#ef4444', fontSize: '0.8rem', padding: '1rem' }}>Error: {error}</div>

  let shown: LacFeatureEntry[]
  if (onlyWithCriteria) {
    shown = features.filter(f =>
      f.views.product?.successCriteria || f.views.user?.successCriteria ||
      (f.views.product?.acceptanceCriteria?.length ?? 0) > 0,
    )
  } else {
    shown = features
  }

  const met = shown.filter(f => stored[f.featureKey] === 'met').length
  const inProgress = shown.filter(f => stored[f.featureKey] === 'in-progress').length

  return (
    <div className={className} style={style}>
      {/* Summary */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        {[
          { label: 'Total', count: shown.length, color: '#a1a1aa' },
          { label: 'Met', count: met, color: '#4ade80' },
          { label: 'In Progress', count: inProgress, color: '#f59e0b' },
          { label: 'Not Started', count: shown.length - met - inProgress, color: '#71717a' },
        ].map(item => (
          <div key={item.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.2rem', fontWeight: 700, color: item.color }}>{item.count}</div>
            <div style={{ fontSize: '0.65rem', color: '#71717a' }}>{item.label}</div>
          </div>
        ))}
      </div>
      {shown.map(f => (
        <CriteriaCard
          key={f.featureKey}
          feature={f}
          storedStatus={stored[f.featureKey] ?? 'not-started'}
          onToggle={toggle}
        />
      ))}
      {shown.length === 0 && (
        <p style={{ color: '#52525b', fontSize: '0.8rem' }}>
          No features with success criteria found.
        </p>
      )}
    </div>
  )
}
