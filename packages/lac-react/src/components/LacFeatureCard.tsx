import React from 'react'
import type { LacFeatureEntry, LacView } from '../types.js'
import { T, statusColor, statusBg, statusBorder } from '../tokens.js'
import { mdToHtml } from '../utils.js'

export interface LacFeatureCardProps {
  feature: LacFeatureEntry
  view?: LacView
  guideUrl?: string
  className?: string
  style?: React.CSSProperties
}

/**
 * LacFeatureCard — compact feature renderer in a given audience view.
 * For a full detail view with all fields use LacFeatureDetail instead.
 *
 * ```tsx
 * <LacFeatureCard feature={feature} view="user" guideUrl="/lac/lac-guide.html" />
 * ```
 */
export function LacFeatureCard({ feature, view = 'user', guideUrl, className, style }: LacFeatureCardProps) {
  const sc   = statusColor(feature.status)
  const sbg  = statusBg(feature.status)
  const sbdr = statusBorder(feature.status)
  const guideHref = guideUrl ? `${guideUrl}#${feature.featureKey}` : undefined

  return (
    <div
      className={className}
      style={{
        background: T.bgCard, border: `1px solid ${T.border}`,
        borderRadius: 6, padding: '14px 16px',
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
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
            {feature.priority && (
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>P{feature.priority}</span>
            )}
          </div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: T.text, lineHeight: 1.3 }}>
            {feature.title}
          </h3>
        </div>
        {guideHref && (
          <a
            href={guideHref} target="_blank" rel="noreferrer"
            style={{ fontFamily: T.mono, fontSize: 10, color: T.accent, whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none' }}
          >
            guide →
          </a>
        )}
      </div>

      {/* User view */}
      {view === 'user' && feature.views.user && (
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.6 }}>
          {feature.views.user.userGuide && (
            <div dangerouslySetInnerHTML={{ __html: mdToHtml(feature.views.user.userGuide) }} />
          )}
          {feature.views.user.knownLimitations && feature.views.user.knownLimitations.length > 0 && (
            <div style={{
              marginTop: 10,
              background: 'rgba(196,162,85,0.08)', border: `1px solid ${T.statusDraftBdr}`,
              borderRadius: 6, padding: '8px 12px',
            }}>
              <p style={{ margin: '0 0 4px', fontFamily: T.mono, fontSize: 10, letterSpacing: '0.08em', color: T.accent }}>GOTCHAS</p>
              <ul style={{ margin: 0, padding: '0 0 0 16px' }}>
                {feature.views.user.knownLimitations.map((lim, i) => (
                  <li key={i} style={{ margin: '2px 0', fontSize: 12, color: T.textMid }}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Dev view */}
      {view === 'dev' && feature.views.dev && (
        <div style={{ fontSize: 12, color: T.textMid }}>
          {feature.views.dev.componentFile && (
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft }}>component</span>
              <code style={{ fontFamily: T.mono, fontSize: 11, color: T.accent, background: T.bg, border: `1px solid ${T.border}`, padding: '1px 5px', borderRadius: 3 }}>
                {feature.views.dev.componentFile}
              </code>
            </div>
          )}
          {feature.views.dev.decisions && feature.views.dev.decisions.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: '0 0 4px', fontFamily: T.mono, fontSize: 10, color: T.textSoft, letterSpacing: '0.08em' }}>KEY DECISIONS</p>
              {feature.views.dev.decisions.slice(0, 3).map((d, i) => (
                <div key={i} style={{ marginBottom: 4, paddingLeft: 10, borderLeft: `2px solid ${T.accent}` }}>
                  <div style={{ fontFamily: T.mono, fontSize: 10, color: T.textSoft, marginBottom: 1 }}>{d.date}</div>
                  <div style={{ fontSize: 12, color: T.text }}>{d.decision ?? d.choice}</div>
                </div>
              ))}
            </div>
          )}
          {feature.externalDependencies?.length > 0 && (
            <div>
              <p style={{ margin: '0 0 4px', fontFamily: T.mono, fontSize: 10, color: T.textSoft, letterSpacing: '0.08em' }}>DEPENDS ON</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {feature.externalDependencies.map(dep => (
                  <span key={dep} style={{ fontFamily: T.mono, fontSize: 10, color: T.textMid, background: T.bgCard, border: `1px solid ${T.border}`, padding: '1px 6px', borderRadius: 3 }}>
                    {dep}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Product view */}
      {view === 'product' && feature.views.product && (
        <div style={{ fontSize: 12, color: T.textMid, lineHeight: 1.55 }}>
          {feature.views.product.problem && (
            <p style={{ margin: '0 0 8px' }}>{feature.views.product.problem}</p>
          )}
          {feature.views.product.successCriteria && (
            <div style={{
              background: 'rgba(74,173,114,0.08)', border: '1px solid rgba(74,173,114,0.25)',
              borderRadius: 5, padding: '8px 10px',
            }}>
              <p style={{ margin: '0 0 2px', fontFamily: T.mono, fontSize: 10, color: T.statusActive, letterSpacing: '0.08em' }}>DONE WHEN</p>
              <p style={{ margin: 0, fontSize: 12 }}>{feature.views.product.successCriteria}</p>
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {feature.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
          {feature.tags.map(tag => (
            <span key={tag} style={{
              fontFamily: T.mono, fontSize: 10,
              padding: '2px 7px', background: T.bg, border: `1px solid ${T.border}`,
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
