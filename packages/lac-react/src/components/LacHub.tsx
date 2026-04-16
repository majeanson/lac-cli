import React, { useState } from 'react'
import { LacDataProvider } from '../context.js'
import { useLacContext } from '../context.js'
import { LacSprintBoard } from './LacSprintBoard.js'
import { LacSuccessBoard } from './LacSuccessBoard.js'
import { LacDecisionLog } from './LacDecisionLog.js'
import { LacSearch } from './LacSearch.js'
import { LacFeatureCard } from './LacFeatureCard.js'
import { useLacFeatures, useLacDomains } from '../hooks.js'

type HubTab = 'sprint' | 'guide' | 'decisions' | 'success' | 'search'

const TABS: { id: HubTab; label: string; emoji: string }[] = [
  { id: 'sprint', label: 'Sprint', emoji: '⚡' },
  { id: 'guide', label: 'Guide', emoji: '📖' },
  { id: 'decisions', label: 'Decisions', emoji: '⚖️' },
  { id: 'success', label: 'Success', emoji: '✅' },
  { id: 'search', label: 'Search', emoji: '🔍' },
]

const BASE = {
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  background: '#09090b',
  color: '#e4e4e7',
  borderRadius: 12,
  border: '1px solid #27272a',
  overflow: 'hidden',
}

function HubInner({ guideUrl, defaultTab }: { guideUrl?: string; defaultTab: HubTab }) {
  const [tab, setTab] = useState<HubTab>(defaultTab)
  const [domain, setDomain] = useState<string | undefined>(undefined)
  const { meta, features, loading } = useLacContext()
  const domains = useLacDomains()
  const guideFeatures = useLacFeatures({ domain })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Top bar */}
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#f59e0b', letterSpacing: '0.05em' }}>LAC</span>
          <span style={{ fontSize: '0.75rem', color: '#52525b' }}>{meta?.projectName ?? '…'}</span>
        </div>
        {!loading && (
          <div style={{ display: 'flex', gap: 12, fontSize: '0.65rem', color: '#52525b' }}>
            <span><strong style={{ color: '#f4f4f5' }}>{features.filter(f => f.status === 'frozen').length}</strong> frozen</span>
            <span><strong style={{ color: '#f59e0b' }}>{features.filter(f => f.status === 'active').length}</strong> active</span>
            <span><strong style={{ color: '#60a5fa' }}>{features.filter(f => f.status === 'draft').length}</strong> draft</span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 2, padding: '8px 12px', borderBottom: '1px solid #27272a', overflowX: 'auto', flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? 'rgba(245,158,11,0.12)' : 'none',
              border: tab === t.id ? '1px solid rgba(245,158,11,0.25)' : '1px solid transparent',
              borderRadius: 6,
              color: tab === t.id ? '#fbbf24' : '#71717a',
              fontSize: '0.75rem',
              fontWeight: tab === t.id ? 600 : 400,
              padding: '5px 12px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{t.emoji}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
        {loading && <p style={{ color: '#52525b', fontSize: '0.8rem', textAlign: 'center', paddingTop: 32 }}>Loading…</p>}

        {!loading && tab === 'sprint' && (
          <LacSprintBoard guideUrl={guideUrl} />
        )}

        {!loading && tab === 'guide' && (
          <div>
            {/* Domain filter */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
              <button
                onClick={() => setDomain(undefined)}
                style={{
                  background: domain === undefined ? 'rgba(245,158,11,0.12)' : '#27272a',
                  border: domain === undefined ? '1px solid rgba(245,158,11,0.25)' : '1px solid #3f3f46',
                  borderRadius: 4, color: domain === undefined ? '#fbbf24' : '#a1a1aa',
                  fontSize: '0.7rem', padding: '3px 10px', cursor: 'pointer',
                }}
              >
                All
              </button>
              {domains.map(d => (
                <button
                  key={d}
                  onClick={() => setDomain(d)}
                  style={{
                    background: domain === d ? 'rgba(245,158,11,0.12)' : '#27272a',
                    border: domain === d ? '1px solid rgba(245,158,11,0.25)' : '1px solid #3f3f46',
                    borderRadius: 4, color: domain === d ? '#fbbf24' : '#a1a1aa',
                    fontSize: '0.7rem', padding: '3px 10px', cursor: 'pointer',
                  }}
                >
                  {d}
                </button>
              ))}
            </div>
            {guideFeatures.map(f => (
              <LacFeatureCard
                key={f.featureKey}
                feature={f}
                view="user"
                guideUrl={guideUrl}
                style={{ marginBottom: 8 }}
              />
            ))}
          </div>
        )}

        {!loading && tab === 'decisions' && (
          <LacDecisionLog domain={domain} />
        )}

        {!loading && tab === 'success' && (
          <LacSuccessBoard />
        )}

        {!loading && tab === 'search' && (
          <LacSearch guideUrl={guideUrl} defaultView="user" />
        )}
      </div>
    </div>
  )
}

export interface LacHubProps {
  /** URL to lac-data.json. Default: /lac/lac-data.json */
  dataUrl?: string
  /** URL to lac-guide.html for "Open full guide" links. Optional. */
  guideUrl?: string
  /** Initial tab. Default: sprint */
  defaultTab?: HubTab
  /** CSS height of the hub container. Default: 600px */
  height?: string | number
  style?: React.CSSProperties
  className?: string
}

/**
 * LacHub — full embedded project hub. Drop into any React app.
 *
 * Fetches lac-data.json (generated by `lac export --all`) and renders
 * a tabbed hub: Sprint board, User Guide browser, Decision Log,
 * Success Tracker, and full-text Search.
 *
 * ```tsx
 * <LacHub
 *   dataUrl="/lac/lac-data.json"
 *   guideUrl="/lac/lac-guide.html"
 *   defaultTab="sprint"
 *   height={700}
 * />
 * ```
 *
 * No wrapper needed — LacHub includes its own LacDataProvider.
 */
export function LacHub({ dataUrl, guideUrl, defaultTab = 'sprint', height = 600, style, className }: LacHubProps) {
  return (
    <LacDataProvider dataUrl={dataUrl}>
      <div className={className} style={{ ...BASE, height, ...style }}>
        <HubInner guideUrl={guideUrl} defaultTab={defaultTab} />
      </div>
    </LacDataProvider>
  )
}
