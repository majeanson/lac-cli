import React, { useState, useCallback, useMemo } from 'react'
import { useLacContext } from '../context.js'
import type { LacFeatureEntry } from '../types.js'
import { T, statusColor } from '../tokens.js'

type CriteriaStatus = 'met' | 'in-progress' | 'not-started'

const CYCLE: CriteriaStatus[] = ['not-started', 'in-progress', 'met']

const STATUS_META: Record<CriteriaStatus, { color: string; label: string; bg: string; bdr: string }> = {
  'met':          { color: '#4aad72', label: '✓ Met',         bg: 'rgba(74,173,114,0.12)',  bdr: 'rgba(74,173,114,0.3)' },
  'in-progress':  { color: '#c4a255', label: '◑ In Progress', bg: 'rgba(196,162,85,0.12)', bdr: 'rgba(196,162,85,0.3)' },
  'not-started':  { color: '#7a6a5a', label: '○ Not Started', bg: 'transparent',            bdr: '#2a2420' },
}

const STORAGE_KEY = 'lac-success-status'

function loadStored(): Record<string, CriteriaStatus> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, CriteriaStatus> }
  catch { return {} }
}

function CriteriaCard({
  feature,
  stored,
  onToggle,
}: {
  feature: LacFeatureEntry
  stored: CriteriaStatus
  onToggle: () => void
}) {
  const successCriteria = feature.views.product?.successCriteria ?? feature.views.user?.successCriteria
  const acceptance = feature.views.product?.acceptanceCriteria ?? []
  if (!successCriteria && acceptance.length === 0) return null

  const s = STATUS_META[stored]

  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 6, padding: '12px 14px', marginBottom: 6,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 8 }}>
        <div>
          <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, marginBottom: 3 }}>
            <span style={{ marginRight: 6 }}>{feature.featureKey}</span>
            <span style={{ color: statusColor(feature.status) }}>● {feature.status}</span>
          </div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>
            {feature.title}
          </p>
        </div>
        <button
          onClick={onToggle}
          style={{
            background: s.bg, border: `1px solid ${s.bdr}`,
            borderRadius: 4, color: s.color,
            fontFamily: T.mono, fontSize: 10, fontWeight: 600,
            padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            letterSpacing: '0.04em',
          }}
        >
          {s.label}
        </button>
      </div>

      {successCriteria && (
        <p style={{ margin: '0 0 6px', fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>
          {successCriteria}
        </p>
      )}

      {acceptance.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 6 }}>
          {acceptance.map((ac, i) => (
            <div key={i} style={{
              display: 'flex', gap: 8, padding: '4px 10px',
              background: T.bg, border: `1px solid ${T.border}`, borderRadius: 3,
              fontSize: 11, color: T.textMid,
            }}>
              <span style={{ color: T.textSoft }}>·</span>
              <span>{ac}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export interface LacSuccessBoardProps {
  onlyWithCriteria?: boolean
  style?: React.CSSProperties
  className?: string
}

/**
 * LacSuccessBoard — per-feature success criteria with localStorage-persisted status.
 * Click the badge to cycle: Not Started → In Progress → Met.
 * Must be inside a LacDataProvider.
 */
export function LacSuccessBoard({ onlyWithCriteria = true, style, className }: LacSuccessBoardProps) {
  const { features, loading, error } = useLacContext()
  const [stored, setStored] = useState<Record<string, CriteriaStatus>>(loadStored)

  const toggle = useCallback((key: string) => {
    setStored(prev => {
      const next = { ...prev, [key]: CYCLE[(CYCLE.indexOf(prev[key] ?? 'not-started') + 1) % CYCLE.length] }
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }, [])

  if (loading) return <div style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft }}>Loading…</div>
  if (error)   return <div style={{ fontFamily: T.mono, fontSize: 12, color: T.statusDeprecated }}>Error: {error}</div>

  const shown = useMemo(() => {
    if (!onlyWithCriteria) return features
    return features.filter(f =>
      f.views.product?.successCriteria || f.views.user?.successCriteria ||
      (f.views.product?.acceptanceCriteria?.length ?? 0) > 0,
    )
  }, [features, onlyWithCriteria])

  const met        = shown.filter(f => stored[f.featureKey] === 'met').length
  const inProgress = shown.filter(f => stored[f.featureKey] === 'in-progress').length
  const notStarted = shown.length - met - inProgress

  const pct = shown.length > 0 ? Math.round((met / shown.length) * 100) : 0

  return (
    <div className={className} style={style}>
      {/* Summary bar */}
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 6, padding: '14px 16px', marginBottom: 20,
      }}>
        <div style={{ display: 'flex', gap: 24, marginBottom: 12 }}>
          {[
            { label: 'Total',       count: shown.length, color: T.textMid },
            { label: 'Met',         count: met,          color: STATUS_META.met.color },
            { label: 'In Progress', count: inProgress,   color: STATUS_META['in-progress'].color },
            { label: 'Remaining',   count: notStarted,   color: T.textSoft },
          ].map(item => (
            <div key={item.label}>
              <div style={{ fontSize: 22, fontWeight: 700, color: item.color, lineHeight: 1 }}>{item.count}</div>
              <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, marginTop: 3 }}>{item.label}</div>
            </div>
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: STATUS_META.met.color, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, marginTop: 3 }}>complete</div>
          </div>
        </div>

        {/* Progress track */}
        <div style={{ height: 4, background: T.bg, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: STATUS_META.met.color, borderRadius: 2, transition: 'width 0.3s ease' }} />
        </div>
      </div>

      {/* Criteria cards */}
      {shown.map(f => (
        <CriteriaCard
          key={f.featureKey}
          feature={f}
          stored={stored[f.featureKey] ?? 'not-started'}
          onToggle={() => toggle(f.featureKey)}
        />
      ))}

      {shown.length === 0 && (
        <div style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft, textAlign: 'center', padding: '24px 0' }}>
          No features with success criteria found.
        </div>
      )}
    </div>
  )
}
