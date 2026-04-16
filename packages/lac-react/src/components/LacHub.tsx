import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { LacDataProvider } from '../context.js'
import { useLacContext } from '../context.js'
import { LacSprintBoard } from './LacSprintBoard.js'
import { LacSuccessBoard } from './LacSuccessBoard.js'
import { LacDecisionLog } from './LacDecisionLog.js'
import { LacSearch } from './LacSearch.js'
import { LacFeatureDetail } from './LacFeatureDetail.js'
import { T, statusColor } from '../tokens.js'
import type { LacFeatureEntry } from '../types.js'
import { highlight } from '../utils.js'

// ── Types ──────────────────────────────────────────────────────────────

type HubMode = 'browse' | 'sprint' | 'decisions' | 'success' | 'search'
type StatusFilter = 'all' | 'active' | 'draft' | 'frozen' | 'deprecated'

const MODES: { id: HubMode; label: string; icon: string }[] = [
  { id: 'browse',    label: 'Browse',    icon: '◈' },
  { id: 'sprint',    label: 'Sprint',    icon: '⚡' },
  { id: 'decisions', label: 'Decisions', icon: '⚖' },
  { id: 'success',   label: 'Success',   icon: '✓' },
  { id: 'search',    label: 'Search',    icon: '⌕' },
]

const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
  { id: 'all',        label: 'All'  },
  { id: 'active',     label: 'Active' },
  { id: 'draft',      label: 'Draft' },
  { id: 'frozen',     label: 'Frozen' },
  { id: 'deprecated', label: 'Deprecated' },
]

// ── Sidebar ────────────────────────────────────────────────────────────

function Sidebar({
  features,
  filter,
  onFilter,
  statusFilter,
  onStatusFilter,
  collapsedDomains,
  onToggleDomain,
  selectedKey,
  onSelect,
  mode,
  onModeChange,
}: {
  features: LacFeatureEntry[]
  filter: string
  onFilter: (v: string) => void
  statusFilter: StatusFilter
  onStatusFilter: (v: StatusFilter) => void
  collapsedDomains: Set<string>
  onToggleDomain: (d: string) => void
  selectedKey: string | null
  onSelect: (key: string) => void
  mode: HubMode
  onModeChange: (m: HubMode) => void
}) {
  const filterRef = useRef<HTMLInputElement>(null)

  // Filter + sort features
  const q = filter.trim().toLowerCase()
  const filtered = useMemo(() => features.filter(f => {
    if (statusFilter !== 'all' && f.status !== statusFilter) return false
    if (!q) return true
    return (
      f.title.toLowerCase().includes(q) ||
      f.featureKey.toLowerCase().includes(q) ||
      f.domain.toLowerCase().includes(q)
    )
  }), [features, statusFilter, q])

  // Group by domain
  const byDomain = useMemo(() => {
    const map = new Map<string, LacFeatureEntry[]>()
    for (const f of filtered) {
      if (!map.has(f.domain)) map.set(f.domain, [])
      map.get(f.domain)!.push(f)
    }
    return map
  }, [filtered])

  const domains = useMemo(() => [...byDomain.keys()].sort(), [byDomain])

  const statsByStatus = useMemo(() => ({
    active:     features.filter(f => f.status === 'active').length,
    draft:      features.filter(f => f.status === 'draft').length,
    frozen:     features.filter(f => f.status === 'frozen').length,
    deprecated: features.filter(f => f.status === 'deprecated').length,
  }), [features])

  return (
    <div style={{
      width: 240, flexShrink: 0,
      background: T.bgSidebar, borderRight: `1px solid ${T.border}`,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Search */}
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
        <input
          ref={filterRef}
          type="text"
          value={filter}
          onChange={e => onFilter(e.target.value)}
          placeholder="Filter features…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: 4, padding: '6px 10px',
            fontFamily: T.mono, fontSize: 12, color: T.text,
            outline: 'none',
          }}
          onFocus={e => { (e.target as HTMLInputElement).style.borderColor = T.accent }}
          onBlur={e => { (e.target as HTMLInputElement).style.borderColor = T.border }}
        />
      </div>

      {/* Status filter pills */}
      <div style={{ padding: '4px 10px 8px', flexShrink: 0, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {STATUS_FILTERS.map(sf => {
          const count = sf.id === 'all' ? features.length : (statsByStatus[sf.id as keyof typeof statsByStatus] ?? 0)
          if (sf.id !== 'all' && count === 0) return null
          const active = statusFilter === sf.id
          return (
            <button
              key={sf.id}
              onClick={() => onStatusFilter(sf.id)}
              style={{
                background: active ? `rgba(196,162,85,0.15)` : 'none',
                border: `1px solid ${active ? T.accent : T.border}`,
                borderRadius: 3, padding: '2px 7px',
                fontFamily: T.mono, fontSize: 10, letterSpacing: '0.06em',
                color: active ? T.accent : T.textSoft,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
            >
              {sf.id !== 'all' && (
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: statusColor(sf.id), flexShrink: 0, display: 'inline-block' }} />
              )}
              {sf.id === 'all' ? `all ${count}` : `${sf.label} ${count}`}
            </button>
          )
        })}
      </div>

      {/* Nav tree */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '4px 0 24px',
        scrollbarWidth: 'thin',
        scrollbarColor: `${T.border} transparent`,
      }}>
        {domains.length === 0 && (
          <div style={{ padding: '24px 14px', fontFamily: T.mono, fontSize: 11, color: T.textSoft, textAlign: 'center' }}>
            {q ? `No features match "${filter}"` : 'No features'}
          </div>
        )}

        {domains.map(domain => {
          const items = byDomain.get(domain) ?? []
          const collapsed = collapsedDomains.has(domain)
          return (
            <div key={domain} style={{ marginBottom: 2 }}>
              {/* Domain header */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => onToggleDomain(domain)}
                onKeyDown={e => e.key === 'Enter' && onToggleDomain(domain)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px 4px',
                  fontFamily: T.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
                  color: T.textSoft, cursor: 'pointer', userSelect: 'none',
                }}
              >
                <span style={{
                  fontSize: 8, transition: 'transform 0.15s',
                  transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                  display: 'inline-block',
                }}>
                  ▾
                </span>
                <span style={{ flex: 1 }}>{domain}</span>
                <span style={{ opacity: 0.6, fontSize: 10 }}>{items.length}</span>
              </div>

              {/* Feature items */}
              {!collapsed && items.map(f => {
                const isSelected = f.featureKey === selectedKey
                const sc = statusColor(f.status)
                return (
                  <div
                    key={f.featureKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      onSelect(f.featureKey)
                      if (mode !== 'browse') onModeChange('browse')
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        onSelect(f.featureKey)
                        if (mode !== 'browse') onModeChange('browse')
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'baseline', gap: 7,
                      padding: '5px 14px 5px 18px',
                      cursor: 'pointer', userSelect: 'none',
                      borderLeft: `2px solid ${isSelected ? T.accent : 'transparent'}`,
                      background: isSelected ? T.bgActive : 'none',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = T.bgHover
                    }}
                    onMouseLeave={e => {
                      if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'none'
                    }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', background: sc,
                      flexShrink: 0, marginTop: 1, display: 'inline-block',
                      opacity: f.status === 'deprecated' ? 0.4 : 1,
                    }} />
                    <span style={{
                      fontFamily: T.mono, fontSize: 10, color: isSelected ? T.accent : T.textSoft,
                      flexShrink: 0,
                    }}>
                      {f.featureKey.split('-').slice(-1)[0]}
                    </span>
                    <span
                      style={{
                        fontSize: 12, color: isSelected ? T.text : T.textMid,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        flex: 1, minWidth: 0,
                      }}
                      dangerouslySetInnerHTML={{ __html: highlight(f.title, filter) }}
                    />
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Topbar ─────────────────────────────────────────────────────────────

function Topbar({
  projectName,
  mode,
  onModeChange,
  features,
  sidebarOpen,
  onToggleSidebar,
}: {
  projectName: string
  mode: HubMode
  onModeChange: (m: HubMode) => void
  features: LacFeatureEntry[]
  sidebarOpen: boolean
  onToggleSidebar: () => void
}) {
  const frozen = features.filter(f => f.status === 'frozen').length
  const active = features.filter(f => f.status === 'active').length
  const draft  = features.filter(f => f.status === 'draft').length

  return (
    <div style={{
      flexShrink: 0, height: 44,
      display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
      background: T.bgSidebar, borderBottom: `1px solid ${T.border}`,
    }}>
      {/* Sidebar toggle */}
      <button
        onClick={onToggleSidebar}
        title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.textSoft, fontSize: 14, padding: '2px 4px', lineHeight: 1,
          display: 'flex', alignItems: 'center',
        }}
      >
        ☰
      </button>

      {/* Brand */}
      <span style={{ fontFamily: T.mono, fontSize: 13, color: T.accent, letterSpacing: '0.05em', flexShrink: 0 }}>
        lac·
      </span>
      <span style={{ fontFamily: T.mono, fontSize: 12, color: T.textMid, flexShrink: 0, marginRight: 4 }}>
        {projectName}
      </span>

      {/* Separator */}
      <span style={{ color: T.border, flexShrink: 0 }}>│</span>

      {/* Mode buttons */}
      <div style={{ display: 'flex', gap: 2, flex: 1, overflowX: 'auto', minWidth: 0 }}>
        {MODES.map(m => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              style={{
                background: active ? 'rgba(196,162,85,0.12)' : 'none',
                border: `1px solid ${active ? T.accent : 'transparent'}`,
                borderRadius: 4,
                color: active ? T.accent : T.textSoft,
                fontFamily: T.sans, fontSize: 12, fontWeight: active ? 600 : 400,
                padding: '3px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 4,
                letterSpacing: '0.02em',
              }}
            >
              <span style={{ fontSize: 11 }}>{m.icon}</span>
              <span>{m.label}</span>
            </button>
          )
        })}
      </div>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 10, flexShrink: 0, fontFamily: T.mono, fontSize: 10 }}>
        <span style={{ color: T.statusFrozen }}>{frozen}<span style={{ color: T.textSoft }}> frz</span></span>
        <span style={{ color: T.statusActive }}>{active}<span style={{ color: T.textSoft }}> act</span></span>
        <span style={{ color: T.statusDraft }}>{draft}<span style={{ color: T.textSoft }}> dft</span></span>
      </div>
    </div>
  )
}

// ── Home (empty state when nothing selected) ───────────────────────────

function HomeView({
  features,
  meta,
  onSelect,
  onModeChange,
}: {
  features: LacFeatureEntry[]
  meta: { projectName: string; generatedAt: string; featureCount: number; domains: string[] } | null
  onSelect: (key: string) => void
  onModeChange: (m: HubMode) => void
}) {
  const byStatus = useMemo(() => ({
    frozen:     features.filter(f => f.status === 'frozen'),
    active:     features.filter(f => f.status === 'active'),
    draft:      features.filter(f => f.status === 'draft'),
    deprecated: features.filter(f => f.status === 'deprecated'),
  }), [features])

  const recent = useMemo(() =>
    features.filter(f => f.status === 'active' || f.status === 'draft')
      .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99))
      .slice(0, 6),
    [features])

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '48px 32px 80px' }}>
      {/* Eyebrow */}
      <div style={{
        fontFamily: T.mono, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: T.accent, marginBottom: 16,
      }}>
        Life as Code · Project Hub
      </div>

      {/* Title */}
      <h1 style={{ margin: '0 0 6px', fontSize: 28, fontWeight: 700, color: T.text, lineHeight: 1.25 }}>
        {meta?.projectName ?? 'Project'}
      </h1>
      <p style={{ margin: '0 0 36px', fontSize: 14, color: T.textMid }}>
        {meta?.featureCount ?? features.length} features across {meta?.domains.length ?? 0} domains
      </p>

      {/* Stats */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 36 }}>
        {[
          { label: 'Frozen', count: byStatus.frozen.length, color: T.statusFrozen, bg: T.statusFrozenBg, status: 'frozen' as const },
          { label: 'Active', count: byStatus.active.length, color: T.statusActive, bg: T.statusActiveBg, status: 'active' as const },
          { label: 'Draft',  count: byStatus.draft.length,  color: T.statusDraft,  bg: T.statusDraftBg,  status: 'draft'  as const },
        ].map(s => (
          <div key={s.label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 16px', background: T.bgCard, border: `1px solid ${T.border}`,
            borderRadius: 6, fontFamily: T.mono, fontSize: 12, cursor: 'default',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{s.count}</span>
            <span style={{ color: T.textSoft }}>{s.label}</span>
          </div>
        ))}
      </div>

      {/* In progress */}
      {recent.length > 0 && (
        <>
          <div style={{
            fontFamily: T.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: T.textSoft, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}`,
          }}>
            In Progress
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 36 }}>
            {recent.map(f => (
              <div
                key={f.featureKey}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(f.featureKey)}
                onKeyDown={e => e.key === 'Enter' && onSelect(f.featureKey)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 12px', background: T.bgCard, border: `1px solid ${T.border}`,
                  borderRadius: 4, cursor: 'pointer', transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = T.accent }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = T.border }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(f.status), flexShrink: 0 }} />
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, flexShrink: 0 }}>{f.featureKey}</span>
                <span style={{ fontSize: 13, color: T.textMid, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.title}
                </span>
                {f.priority && (
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, flexShrink: 0 }}>P{f.priority}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Quick actions */}
      <div style={{
        fontFamily: T.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: T.textSoft, marginBottom: 10, paddingBottom: 6, borderBottom: `1px solid ${T.border}`,
      }}>
        Quick Views
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {[
          { mode: 'sprint' as HubMode, label: '⚡ Sprint Board', desc: 'Active + draft features' },
          { mode: 'decisions' as HubMode, label: '⚖ Decision Log', desc: 'All architectural decisions' },
          { mode: 'success' as HubMode, label: '✓ Success Tracker', desc: 'Criteria status tracking' },
          { mode: 'search' as HubMode, label: '⌕ Full-text Search', desc: 'Search all features' },
        ].map(q => (
          <button
            key={q.mode}
            onClick={() => onModeChange(q.mode)}
            style={{
              background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 6, padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
              display: 'flex', flexDirection: 'column', gap: 3,
            }}
          >
            <span style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{q.label}</span>
            <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>{q.desc}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ── Hub inner ──────────────────────────────────────────────────────────

function HubInner({ guideUrl, defaultTab }: { guideUrl?: string; defaultTab: HubMode }) {
  const { meta, features, loading, error } = useLacContext()
  const [mode, setMode] = useState<HubMode>(defaultTab)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [collapsedDomains, setCollapsedDomains] = useState<Set<string>>(new Set())
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const toggleDomain = useCallback((domain: string) => {
    setCollapsedDomains(prev => {
      const next = new Set(prev)
      if (next.has(domain)) next.delete(domain)
      else next.add(domain)
      return next
    })
  }, [])

  const selectedFeature = useMemo(
    () => features.find(f => f.featureKey === selectedKey) ?? null,
    [features, selectedKey],
  )

  // Sidebar feature list (same filter as sidebar)
  const sidebarFeatures = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return features.filter(f => {
      if (statusFilter !== 'all' && f.status !== statusFilter) return false
      if (!q) return true
      return f.title.toLowerCase().includes(q) || f.featureKey.toLowerCase().includes(q) || f.domain.toLowerCase().includes(q)
    })
  }, [features, filter, statusFilter])

  if (loading) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: T.mono, fontSize: 13, color: T.textSoft }}>Loading lac-data.json…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: T.mono, fontSize: 13, color: T.statusDeprecated }}>Error: {error}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, background: T.bg }}>
      {/* Topbar */}
      <Topbar
        projectName={meta?.projectName ?? '…'}
        mode={mode}
        onModeChange={m => { setMode(m) }}
        features={features}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen(p => !p)}
      />

      {/* Body row */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Sidebar */}
        {sidebarOpen && (
          <Sidebar
            features={features}
            filter={filter}
            onFilter={setFilter}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            collapsedDomains={collapsedDomains}
            onToggleDomain={toggleDomain}
            selectedKey={selectedKey}
            onSelect={setSelectedKey}
            mode={mode}
            onModeChange={setMode}
          />
        )}

        {/* Content pane */}
        <div style={{
          flex: 1, minWidth: 0, overflowY: 'auto',
          scrollbarWidth: 'thin', scrollbarColor: `${T.border} transparent`,
        }}>
          {mode === 'browse' && (
            selectedFeature
              ? (
                <LacFeatureDetail
                  feature={selectedFeature}
                  allFeatures={sidebarFeatures}
                  onNavigate={key => setSelectedKey(key)}
                  guideUrl={guideUrl}
                />
              )
              : (
                <HomeView
                  features={features}
                  meta={meta}
                  onSelect={key => setSelectedKey(key)}
                  onModeChange={setMode}
                />
              )
          )}

          {mode === 'sprint' && (
            <div style={{ padding: '24px 20px' }}>
              <h2 style={{ margin: '0 0 20px', fontFamily: T.mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.textSoft }}>
                Sprint Board
              </h2>
              <LacSprintBoard guideUrl={guideUrl} onNavigate={key => { setSelectedKey(key); setMode('browse') }} />
            </div>
          )}

          {mode === 'decisions' && (
            <div style={{ padding: '24px 20px' }}>
              <h2 style={{ margin: '0 0 20px', fontFamily: T.mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.textSoft }}>
                Decision Log
              </h2>
              <LacDecisionLog />
            </div>
          )}

          {mode === 'success' && (
            <div style={{ padding: '24px 20px' }}>
              <h2 style={{ margin: '0 0 20px', fontFamily: T.mono, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.textSoft }}>
                Success Tracker
              </h2>
              <LacSuccessBoard />
            </div>
          )}

          {mode === 'search' && (
            <div style={{ padding: '24px 20px' }}>
              <LacSearch
                guideUrl={guideUrl}
                autoFocus
                onNavigate={key => { setSelectedKey(key); setMode('browse') }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Public API ─────────────────────────────────────────────────────────

export interface LacHubProps {
  /** URL to lac-data.json. Default: /lac/lac-data.json */
  dataUrl?: string
  /** URL to lac-guide.html for "Open in guide" links. Optional. */
  guideUrl?: string
  /** Initial mode tab. Default: browse */
  defaultTab?: HubMode
  /** CSS height of the hub container. Default: 600px */
  height?: string | number
  style?: React.CSSProperties
  className?: string
}

/**
 * LacHub — full embedded project hub with sidebar navigation.
 *
 * Drop into any React app. Fetches lac-data.json and renders a
 * shell layout: collapsible domain sidebar + content pane with
 * Browse / Sprint / Decisions / Success / Search modes.
 *
 * ```tsx
 * <LacHub
 *   dataUrl="/lac/lac-data.json"
 *   guideUrl="/lac/lac-guide.html"
 *   defaultTab="browse"
 *   height="calc(100dvh - 120px)"
 * />
 * ```
 *
 * No wrapper needed — LacHub includes its own LacDataProvider.
 */
export function LacHub({
  dataUrl,
  guideUrl,
  defaultTab = 'browse',
  height = 600,
  style,
  className,
}: LacHubProps) {
  return (
    <LacDataProvider dataUrl={dataUrl}>
      <div
        className={className}
        style={{
          height,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          background: T.bg,
          color: T.text,
          fontFamily: T.sans,
          fontSize: 14,
          lineHeight: 1.6,
          borderRadius: 8,
          border: `1px solid ${T.border}`,
          ...style,
        }}
      >
        <HubInner guideUrl={guideUrl} defaultTab={defaultTab} />
      </div>
    </LacDataProvider>
  )
}
