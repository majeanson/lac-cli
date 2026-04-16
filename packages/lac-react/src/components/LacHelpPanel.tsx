import React, { useState, useEffect } from 'react'
import { useLacFeature } from '../hooks.js'
import type { LacView } from '../types.js'

function mdToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
    .replace(/\n\n/g, '</p><p>')
    .trim()
}

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
 * Bring your own trigger (button, keyboard shortcut, etc.).
 * Must be inside a LacDataProvider.
 *
 * ```tsx
 * const [open, setOpen] = useState(false)
 * <button onClick={() => setOpen(true)}>?</button>
 * <LacHelpPanel
 *   featureKey="my-2026-001"
 *   open={open}
 *   onClose={() => setOpen(false)}
 *   guideUrl="/lac/lac-guide.html"
 * />
 * ```
 */
export function LacHelpPanel({ featureKey, defaultView = 'user', guideUrl, open, onClose, style, className }: LacHelpPanelProps) {
  const feature = useLacFeature(featureKey)
  const [view, setView] = useState<LacView>(defaultView)

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  const guideHref = guideUrl && feature ? `${guideUrl}#${feature.featureKey}` : undefined

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9998 }}
      />
      {/* Panel */}
      <div
        className={className}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 360,
          maxWidth: '90vw',
          background: '#18181b',
          borderLeft: '1px solid #3f3f46',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          ...style,
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid #3f3f46', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: '0.65rem', color: '#71717a', display: 'block', marginBottom: 2 }}>
              {feature?.domain ?? featureKey}
            </span>
            <h2 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#f4f4f5' }}>
              {feature?.title ?? 'Loading…'}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#71717a', fontSize: '1.2rem', cursor: 'pointer', padding: 4, lineHeight: 1 }}
            aria-label="Close help"
          >
            ×
          </button>
        </div>

        {/* Tab bar */}
        <div style={{ padding: '8px 12px', borderBottom: '1px solid #3f3f46', display: 'flex', gap: 4 }}>
          {(['user', 'dev', 'product'] as LacView[]).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                background: view === v ? 'rgba(245,158,11,0.15)' : 'none',
                border: view === v ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent',
                borderRadius: 4,
                color: view === v ? '#fbbf24' : '#71717a',
                fontSize: '0.75rem',
                fontWeight: view === v ? 600 : 400,
                padding: '4px 10px',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {v}
            </button>
          ))}
          {guideHref && (
            <a
              href={guideHref}
              target="_blank"
              rel="noreferrer"
              style={{ marginLeft: 'auto', fontSize: '0.7rem', color: '#f59e0b', textDecoration: 'none', alignSelf: 'center' }}
            >
              Full guide →
            </a>
          )}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
          {!feature && <p style={{ color: '#71717a', fontSize: '0.8rem' }}>Loading feature data…</p>}

          {feature && view === 'user' && feature.views.user && (
            <div style={{ fontSize: '0.8rem', color: '#d4d4d8', lineHeight: 1.6 }}>
              {feature.views.user.userGuide && (
                <div dangerouslySetInnerHTML={{ __html: mdToHtml(feature.views.user.userGuide) }} />
              )}
              {feature.views.user.knownLimitations && feature.views.user.knownLimitations.length > 0 && (
                <div style={{ marginTop: 12, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '10px 12px' }}>
                  <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 700, color: '#f59e0b' }}>Gotchas</p>
                  <ul style={{ margin: 0, padding: '0 0 0 1rem' }}>
                    {feature.views.user.knownLimitations.map((lim, i) => (
                      <li key={i} style={{ margin: '3px 0', color: '#d4d4d8' }}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {feature && view === 'dev' && feature.views.dev && (
            <div style={{ fontSize: '0.8rem', color: '#d4d4d8' }}>
              {feature.views.dev.componentFile && (
                <div style={{ marginBottom: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ color: '#71717a' }}>Component</span>
                  <code style={{ background: '#27272a', color: '#fbbf24', padding: '2px 8px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                    {feature.views.dev.componentFile}
                  </code>
                </div>
              )}
              {feature.views.dev.decisions && feature.views.dev.decisions.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 600, color: '#a1a1aa' }}>Decisions</p>
                  {feature.views.dev.decisions.slice(0, 5).map((d, i) => (
                    <div key={i} style={{ marginBottom: 8, borderLeft: '2px solid #3f3f46', paddingLeft: 10 }}>
                      <div style={{ fontSize: '0.7rem', color: '#71717a', marginBottom: 2 }}>{d.date}</div>
                      <div style={{ fontSize: '0.78rem', color: '#e4e4e7', marginBottom: 2 }}>{d.decision ?? d.choice}</div>
                      {d.rationale && <div style={{ fontSize: '0.72rem', color: '#71717a' }}>{d.rationale}</div>}
                    </div>
                  ))}
                </div>
              )}
              {feature.externalDependencies?.length > 0 && (
                <div>
                  <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 600, color: '#a1a1aa' }}>Depends on</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {feature.externalDependencies.map(dep => (
                      <span key={dep} style={{ background: '#27272a', color: '#a1a1aa', padding: '2px 8px', borderRadius: 4, fontSize: '0.7rem', fontFamily: 'monospace' }}>
                        {dep}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {feature && view === 'product' && feature.views.product && (
            <div style={{ fontSize: '0.8rem', color: '#d4d4d8', lineHeight: 1.5 }}>
              {feature.views.product.problem && (
                <p style={{ marginTop: 0 }}>{feature.views.product.problem}</p>
              )}
              {feature.views.product.successCriteria && (
                <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '8px 12px', marginTop: 10 }}>
                  <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 700, color: '#4ade80' }}>Success Criteria</p>
                  <p style={{ margin: 0, fontSize: '0.78rem' }}>{feature.views.product.successCriteria}</p>
                </div>
              )}
              {(feature.views.product.acceptanceCriteria ?? []).length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 600, color: '#a1a1aa' }}>Acceptance Criteria</p>
                  <ul style={{ margin: 0, padding: '0 0 0 1rem' }}>
                    {feature.views.product.acceptanceCriteria!.map((ac, i) => (
                      <li key={i} style={{ margin: '3px 0' }}>{ac}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
