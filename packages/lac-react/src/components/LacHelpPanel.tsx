import React, { useState, useEffect } from 'react'
import { useLacFeature } from '../hooks.js'
import type { LacView } from '../types.js'
import { T, statusColor, statusBg, statusBorder } from '../tokens.js'
import { mdToHtml } from '../utils.js'

export interface LacHelpPanelProps {
  /** featureKey to show help for */
  featureKey: string
  /** Initial view tab */
  defaultView?: LacView
  /** URL to the generated lac-guide.html for "Full guide →" links */
  guideUrl?: string
  /** Whether the panel is shown */
  open: boolean
  /** Called when the panel requests to be closed */
  onClose: () => void
  style?: React.CSSProperties
  className?: string
}

/**
 * LacHelpPanel — headless slide-in help panel for a single feature.
 * Bring your own trigger. Must be inside a LacDataProvider.
 *
 * ```tsx
 * <LacHelpPanel featureKey="my-2026-001" open={open} onClose={() => setOpen(false)} />
 * ```
 */
export function LacHelpPanel({
  featureKey, defaultView = 'user', guideUrl, open, onClose, style, className
}: LacHelpPanelProps) {
  const feature = useLacFeature(featureKey)
  const [view, setView] = useState<LacView>(defaultView)

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const sc = feature ? statusColor(feature.status) : T.textSoft
  const guideHref = guideUrl && feature ? `${guideUrl}#${feature.featureKey}` : undefined

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9998 }}
      />

      {/* Panel */}
      <div
        className={className}
        style={{
          position: 'fixed', top: 0, right: 0, bottom: 0,
          width: 380, maxWidth: '92vw',
          background: T.bgSidebar, borderLeft: `1px solid ${T.border}`,
          zIndex: 9999, display: 'flex', flexDirection: 'column',
          fontFamily: T.sans, color: T.text, fontSize: 14,
          ...style,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 16px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexShrink: 0,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              {feature && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontFamily: T.mono, fontSize: 10,
                  color: sc, background: statusBg(feature.status), border: `1px solid ${statusBorder(feature.status)}`,
                  padding: '2px 6px', borderRadius: 3,
                }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: sc, display: 'inline-block' }} />
                  {feature.status}
                </span>
              )}
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>
                {feature?.domain ?? featureKey}
              </span>
            </div>
            <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: T.text, lineHeight: 1.3 }}>
              {feature?.title ?? 'Loading…'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close help"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: T.textSoft, fontSize: 20, padding: '0 2px', lineHeight: 1, flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {/* View tabs */}
        <div style={{
          padding: '8px 12px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', gap: 3, flexShrink: 0,
        }}>
          {(['user', 'dev', 'product'] as LacView[]).map(v => {
            const active = v === view
            return (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  background: active ? 'rgba(196,162,85,0.12)' : 'none',
                  border: `1px solid ${active ? T.accent : 'transparent'}`,
                  borderRadius: 4, color: active ? T.accent : T.textSoft,
                  fontFamily: T.sans, fontSize: 12, fontWeight: active ? 600 : 400,
                  padding: '4px 12px', cursor: 'pointer', textTransform: 'capitalize',
                }}
              >
                {v}
              </button>
            )
          })}
          {guideHref && (
            <a
              href={guideHref} target="_blank" rel="noreferrer"
              style={{ marginLeft: 'auto', fontFamily: T.mono, fontSize: 11, color: T.accent, textDecoration: 'none', alignSelf: 'center' }}
            >
              Full guide →
            </a>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 24px' }}>
          {!feature && (
            <p style={{ fontFamily: T.mono, fontSize: 12, color: T.textSoft }}>Loading feature data…</p>
          )}

          {/* User view */}
          {feature && view === 'user' && feature.views.user && (
            <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.65 }}>
              {feature.views.user.userGuide && (
                <div dangerouslySetInnerHTML={{ __html: mdToHtml(feature.views.user.userGuide) }} />
              )}
              {feature.views.user.knownLimitations && feature.views.user.knownLimitations.length > 0 && (
                <div style={{
                  marginTop: 14,
                  background: 'rgba(196,162,85,0.08)', border: `1px solid ${T.statusDraftBdr}`,
                  borderRadius: 6, padding: '12px 14px',
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, letterSpacing: '0.1em', color: T.accent, marginBottom: 8 }}>GOTCHAS</div>
                  {feature.views.user.knownLimitations.map((lim, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 12, color: T.textMid }}>
                      <span style={{ color: T.textSoft }}>·</span>
                      <span>{lim}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dev view */}
          {feature && view === 'dev' && feature.views.dev && (
            <div style={{ fontSize: 13, color: T.textMid }}>
              {feature.views.dev.componentFile && (
                <div style={{ marginBottom: 12, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>component</span>
                  <code style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, background: T.bg, border: `1px solid ${T.border}`, padding: '1px 5px', borderRadius: 3 }}>
                    {feature.views.dev.componentFile}
                  </code>
                </div>
              )}
              {feature.views.dev.decisions && feature.views.dev.decisions.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, letterSpacing: '0.1em', marginBottom: 8 }}>DECISIONS</div>
                  {feature.views.dev.decisions.slice(0, 5).map((d, i) => (
                    <div key={i} style={{
                      marginBottom: 8,
                      background: T.bgCard, border: `1px solid ${T.border}`,
                      borderLeft: `3px solid ${T.accent}`, borderRadius: 3, padding: '8px 12px',
                    }}>
                      <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, marginBottom: 4 }}>{d.date}</div>
                      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.4, marginBottom: d.rationale ? 3 : 0 }}>{d.decision ?? d.choice}</div>
                      {d.rationale && <div style={{ fontSize: 11, color: T.textMid }}>{d.rationale}</div>}
                    </div>
                  ))}
                </div>
              )}
              {feature.externalDependencies?.length > 0 && (
                <div>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, letterSpacing: '0.1em', marginBottom: 6 }}>DEPENDS ON</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {feature.externalDependencies.map(dep => (
                      <span key={dep} style={{ fontFamily: T.mono, fontSize: 11, color: T.textMid, background: T.bgCard, border: `1px solid ${T.border}`, padding: '2px 7px', borderRadius: 3 }}>
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Product view */}
          {feature && view === 'product' && feature.views.product && (
            <div style={{ fontSize: 13, color: T.textMid, lineHeight: 1.55 }}>
              {feature.views.product.problem && (
                <p style={{ marginTop: 0 }}>{feature.views.product.problem}</p>
              )}
              {feature.views.product.successCriteria && (
                <div style={{
                  background: 'rgba(74,173,114,0.08)', border: '1px solid rgba(74,173,114,0.25)',
                  borderRadius: 6, padding: '10px 14px', marginTop: 12,
                }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.statusActive, letterSpacing: '0.1em', marginBottom: 6 }}>DONE WHEN</div>
                  <p style={{ margin: 0, fontSize: 12 }}>{feature.views.product.successCriteria}</p>
                </div>
              )}
              {(feature.views.product.acceptanceCriteria ?? []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, letterSpacing: '0.1em', marginBottom: 6 }}>ACCEPTANCE CRITERIA</div>
                  {feature.views.product.acceptanceCriteria!.map((ac, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 3, fontSize: 12 }}>
                      <span style={{ color: T.textSoft }}>·</span>
                      <span>{ac}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
