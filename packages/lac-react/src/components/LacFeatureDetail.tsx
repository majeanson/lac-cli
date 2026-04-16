import React, { useState } from 'react'
import type { LacFeatureEntry } from '../types.js'
import { T, statusColor, statusBg, statusBorder } from '../tokens.js'
import { mdToHtml } from '../utils.js'

type DetailView = 'user' | 'dev' | 'product'

// ── Primitive section renders ──────────────────────────────────────────

function SectionHeader({ label, type }: { label: string; type?: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      marginBottom: 10, paddingBottom: 6,
      borderBottom: `1px solid ${T.border}`,
    }}>
      <span style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.textSoft }}>
        {label}
      </span>
      {type && (
        <span style={{ fontFamily: T.mono, fontSize: 10, color: T.border }}>{type}</span>
      )}
    </div>
  )
}

function RawPre({ text }: { text: string }) {
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 4,
      padding: '12px 16px', fontFamily: T.mono, fontSize: 12,
      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      color: T.textMid, lineHeight: 1.7,
    }}>
      {text}
    </div>
  )
}

function DecisionCard({ decision, rationale, date, idx }: {
  decision: string; rationale?: string; date: string; idx: number
}) {
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderLeft: `3px solid ${T.accent}`,
      borderRadius: 4, padding: '12px 14px', marginBottom: 8,
    }}>
      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, marginBottom: 8 }}>
        #{idx + 1} · {date}
      </div>
      <div style={{ fontSize: 13, color: T.text, lineHeight: 1.55, marginBottom: rationale ? 6 : 0 }}>
        {decision}
      </div>
      {rationale && (
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.5 }}>{rationale}</div>
      )}
    </div>
  )
}

function SnippetBlock({ label, code }: { label: string; code: string }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontFamily: T.mono, fontSize: 11, color: T.textSoft,
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderBottom: 'none', borderRadius: '4px 4px 0 0',
        padding: '4px 12px',
      }}>
        {label}
      </div>
      <div style={{
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: '0 0 4px 4px', padding: '12px 16px',
        fontFamily: T.mono, fontSize: 12, whiteSpace: 'pre-wrap',
        wordBreak: 'break-word', color: T.textMid, lineHeight: 1.65,
      }}>
        {code}
      </div>
    </div>
  )
}

function ListItem({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '7px 12px',
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 3, fontFamily: T.mono, fontSize: 12, color: T.textMid,
      marginBottom: 2,
    }}>
      <span style={{ color: T.textSoft, flexShrink: 0 }}>·</span>
      <span>{text}</span>
    </div>
  )
}

function Chip({ text, href }: { text: string; href?: string }) {
  const style: React.CSSProperties = {
    display: 'inline-block',
    fontFamily: T.mono, fontSize: 11,
    padding: '3px 8px',
    background: T.bgCard, border: `1px solid ${T.border}`,
    borderRadius: 4, color: T.textMid,
    textDecoration: 'none',
  }
  if (href) return <a href={href} target="_blank" rel="noreferrer" style={{ ...style, color: T.accent }}>{text}</a>
  return <span style={style}>{text}</span>
}

// ── View content panels ────────────────────────────────────────────────

function UserView({ feature }: { feature: LacFeatureEntry }) {
  const u = feature.views.user
  if (!u) return <p style={{ color: T.textSoft, fontSize: 13 }}>No user guide available.</p>

  return (
    <div>
      {u.userGuide && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="User Guide" type="string" />
          <div
            style={{ fontSize: 13, color: T.textMid, lineHeight: 1.65 }}
            dangerouslySetInnerHTML={{ __html: mdToHtml(u.userGuide) }}
          />
        </div>
      )}

      {u.problem && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Problem" type="string" />
          <p style={{ margin: 0, fontSize: 13, color: T.textMid, lineHeight: 1.6 }}>{u.problem}</p>
        </div>
      )}

      {u.successCriteria && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Success Criteria" type="string" />
          <RawPre text={u.successCriteria} />
        </div>
      )}

      {u.knownLimitations && u.knownLimitations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Known Limitations" type="string[]" />
          <div style={{
            background: `rgba(196,162,85,0.08)`, border: `1px solid ${T.statusDraftBdr}`,
            borderRadius: 6, padding: '12px 14px',
          }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.1em', color: T.accent, marginBottom: 8 }}>
              GOTCHAS
            </div>
            {u.knownLimitations.map((lim, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: T.textMid, lineHeight: 1.5, marginBottom: 4 }}>
                <span style={{ color: T.textSoft }}>·</span>
                <span>{lim}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function DevView({ feature }: { feature: LacFeatureEntry }) {
  const d = feature.views.dev
  if (!d) return <p style={{ color: T.textSoft, fontSize: 13 }}>No dev view available.</p>

  return (
    <div>
      {d.componentFile && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Component File" type="string" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 3 }}>
            <span style={{ fontFamily: T.mono, fontSize: 11, color: T.textSoft }}>path</span>
            <code style={{ fontFamily: T.mono, fontSize: 12, color: T.accent }}>{d.componentFile}</code>
          </div>
        </div>
      )}

      {d.implementation && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Implementation" type="string" />
          <div
            style={{ fontSize: 13, color: T.textMid, lineHeight: 1.65 }}
            dangerouslySetInnerHTML={{ __html: mdToHtml(d.implementation) }}
          />
        </div>
      )}

      {d.implementationNotes && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Implementation Notes" type="string" />
          <div
            style={{ fontSize: 13, color: T.textMid, lineHeight: 1.65 }}
            dangerouslySetInnerHTML={{ __html: mdToHtml(d.implementationNotes) }}
          />
        </div>
      )}

      {d.decisions && d.decisions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Decisions" type={`Array[${d.decisions.length}]`} />
          {d.decisions.map((dec, i) => (
            <DecisionCard key={i} idx={i} date={dec.date} decision={dec.decision ?? dec.choice ?? ''} rationale={dec.rationale} />
          ))}
        </div>
      )}

      {d.codeSnippets && d.codeSnippets.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Code Snippets" type={`Array[${d.codeSnippets.length}]`} />
          {d.codeSnippets.map((s, i) => (
            <SnippetBlock key={i} label={s.label} code={s.code} />
          ))}
        </div>
      )}

      {d.testStrategy && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Test Strategy" type="string" />
          <RawPre text={d.testStrategy} />
        </div>
      )}

      {d.npmPackages && d.npmPackages.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="NPM Packages" type="string[]" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {d.npmPackages.map(pkg => (
              <Chip key={pkg} text={pkg} href={`https://npmjs.com/package/${pkg}`} />
            ))}
          </div>
        </div>
      )}

      {feature.externalDependencies.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="External Dependencies" type="string[]" />
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {feature.externalDependencies.map(dep => <Chip key={dep} text={dep} />)}
          </div>
        </div>
      )}

      {d.publicInterface && d.publicInterface.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Public Interface" type={`Array[${d.publicInterface.length}]`} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {d.publicInterface.map((entry, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '160px 80px 1fr',
                gap: 12, alignItems: 'baseline',
                padding: '7px 12px', background: T.bgCard,
                border: `1px solid ${T.border}`, borderRadius: 3, fontSize: 12,
              }}>
                <code style={{ fontFamily: T.mono, color: T.accent, fontSize: 11 }}>{entry.name}</code>
                <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>{entry.type}</span>
                <span style={{ color: T.textMid }}>{entry.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ProductView({ feature }: { feature: LacFeatureEntry }) {
  const p = feature.views.product
  if (!p) return <p style={{ color: T.textSoft, fontSize: 13 }}>No product view available.</p>

  return (
    <div>
      {p.problem && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Problem" type="string" />
          <p style={{ margin: 0, fontSize: 13, color: T.textMid, lineHeight: 1.65 }}>{p.problem}</p>
        </div>
      )}

      {p.pmSummary && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="PM Summary" type="string" />
          <p style={{ margin: 0, fontSize: 13, color: T.textMid, lineHeight: 1.65 }}>{p.pmSummary}</p>
        </div>
      )}

      {p.successCriteria && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Success Criteria" type="string" />
          <div style={{
            background: 'rgba(74,173,114,0.08)', border: '1px solid rgba(74,173,114,0.25)',
            borderRadius: 6, padding: '12px 14px',
          }}>
            <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.1em', color: T.statusActive, marginBottom: 6 }}>
              DONE WHEN
            </div>
            <p style={{ margin: 0, fontSize: 13, color: T.textMid, lineHeight: 1.6 }}>{p.successCriteria}</p>
          </div>
        </div>
      )}

      {p.acceptanceCriteria && p.acceptanceCriteria.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Acceptance Criteria" type={`string[${p.acceptanceCriteria.length}]`} />
          {p.acceptanceCriteria.map((ac, i) => <ListItem key={i} text={ac} />)}
        </div>
      )}

      {p.decisions && p.decisions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Decisions" type={`Array[${p.decisions.length}]`} />
          {p.decisions.map((dec, i) => (
            <DecisionCard key={i} idx={i} date={dec.date} decision={dec.decision ?? dec.choice ?? ''} rationale={dec.rationale} />
          ))}
        </div>
      )}

      {p.knownLimitations && p.knownLimitations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Known Limitations" type="string[]" />
          {p.knownLimitations.map((lim, i) => <ListItem key={i} text={lim} />)}
        </div>
      )}

      {p.releaseVersion && (
        <div style={{ marginBottom: 24 }}>
          <SectionHeader label="Release Version" type="string" />
          <Chip text={p.releaseVersion} />
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────

export interface LacFeatureDetailProps {
  feature: LacFeatureEntry
  /** Ordered list for prev/next navigation */
  allFeatures?: LacFeatureEntry[]
  onNavigate?: (key: string) => void
  guideUrl?: string
  defaultView?: DetailView
  style?: React.CSSProperties
}

/**
 * LacFeatureDetail — full feature renderer with all fields.
 * Supports User / Dev / Product view tabs.
 * Optionally renders prev/next navigation when `allFeatures` is provided.
 *
 * ```tsx
 * <LacFeatureDetail
 *   feature={feature}
 *   allFeatures={sortedFeatures}
 *   onNavigate={key => setSelected(key)}
 * />
 * ```
 */
export function LacFeatureDetail({
  feature,
  allFeatures,
  onNavigate,
  guideUrl,
  defaultView = 'user',
  style,
}: LacFeatureDetailProps) {
  const [view, setView] = useState<DetailView>(defaultView)

  const idx = allFeatures?.findIndex(f => f.featureKey === feature.featureKey) ?? -1
  const prev = idx > 0 ? allFeatures![idx - 1] : undefined
  const next = idx >= 0 && idx < (allFeatures?.length ?? 0) - 1 ? allFeatures![idx + 1] : undefined

  const sc = statusColor(feature.status)
  const sb = statusBg(feature.status)
  const sbd = statusBorder(feature.status)

  const guideHref = guideUrl ? `${guideUrl}#${feature.featureKey}` : undefined

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '40px 32px 80px', ...style }}>
      {/* Meta row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <span style={{ fontFamily: T.mono, fontSize: 11, color: T.textSoft }}>{feature.featureKey}</span>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '3px 8px', borderRadius: 4,
          fontFamily: T.mono, fontSize: 11, fontWeight: 500,
          color: sc, background: sb, border: `1px solid ${sbd}`,
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc, flexShrink: 0, display: 'inline-block' }} />
          {feature.status}
        </span>
        <span style={{
          padding: '3px 8px', borderRadius: 4, fontFamily: T.mono, fontSize: 11,
          color: T.textMid, background: T.bgCard, border: `1px solid ${T.border}`,
        }}>
          {feature.domain}
        </span>
        {feature.priority && (
          <span style={{
            padding: '3px 8px', borderRadius: 4, fontFamily: T.mono, fontSize: 11,
            color: T.textSoft, background: T.bgCard, border: `1px solid ${T.border}`,
          }}>
            P{feature.priority}
          </span>
        )}
        {guideHref && (
          <a
            href={guideHref} target="_blank" rel="noreferrer"
            style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 11, color: T.accent, textDecoration: 'none' }}
          >
            Open in guide →
          </a>
        )}
      </div>

      {/* Title */}
      <h1 style={{ margin: '0 0 16px', fontSize: 26, fontWeight: 700, color: T.text, lineHeight: 1.25 }}>
        {feature.title}
      </h1>

      {/* Tags */}
      {feature.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 28 }}>
          {feature.tags.map(tag => (
            <span key={tag} style={{
              padding: '3px 9px', background: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: 100, fontFamily: T.mono, fontSize: 11, color: T.textSoft,
            }}>
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* View tab bar */}
      <div style={{
        display: 'flex', gap: 2, marginBottom: 28,
        borderBottom: `1px solid ${T.border}`, paddingBottom: 0,
      }}>
        {(['user', 'dev', 'product'] as DetailView[]).map(v => {
          const active = v === view
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: active ? T.bgCard : 'none',
                border: `1px solid ${active ? T.border : 'transparent'}`,
                borderBottom: active ? `1px solid ${T.bgCard}` : '1px solid transparent',
                borderRadius: '4px 4px 0 0',
                color: active ? T.accent : T.textSoft,
                fontFamily: T.sans,
                fontSize: 12,
                fontWeight: active ? 600 : 400,
                padding: '6px 14px',
                cursor: 'pointer',
                letterSpacing: '0.03em',
                position: 'relative',
                bottom: -1,
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          )
        })}
      </div>

      {/* View content */}
      {view === 'user'    && <UserView feature={feature} />}
      {view === 'dev'     && <DevView feature={feature} />}
      {view === 'product' && <ProductView feature={feature} />}

      {/* Prev/Next navigation */}
      {(prev || next) && (
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 48, paddingTop: 20, borderTop: `1px solid ${T.border}`,
        }}>
          {prev ? (
            <button
              onClick={() => onNavigate?.(prev.featureKey)}
              style={{
                background: 'none', border: `1px solid ${T.border}`,
                borderRadius: 6, padding: '8px 14px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
                maxWidth: '45%',
              }}
            >
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>← prev</span>
              <span style={{ fontSize: 12, color: T.textMid, textAlign: 'left' }}>{prev.title}</span>
            </button>
          ) : <div />}
          {next ? (
            <button
              onClick={() => onNavigate?.(next.featureKey)}
              style={{
                background: 'none', border: `1px solid ${T.border}`,
                borderRadius: 6, padding: '8px 14px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2,
                maxWidth: '45%',
              }}
            >
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>next →</span>
              <span style={{ fontSize: 12, color: T.textMid, textAlign: 'right' }}>{next.title}</span>
            </button>
          ) : <div />}
        </div>
      )}
    </div>
  )
}
