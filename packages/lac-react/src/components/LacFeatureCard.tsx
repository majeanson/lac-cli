import React from 'react'
import type { LacFeatureEntry, LacView } from '../types.js'

function mdToHtml(md: string): string {
  return md
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:0.8rem;font-weight:600;color:#e4e4e7;margin:0.75rem 0 0.25rem">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:0.875rem;font-weight:600;color:#f4f4f5;margin:0.75rem 0 0.25rem">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:1rem;font-weight:600;color:#fff;margin:0.75rem 0 0.25rem">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code style="background:#27272a;padding:0 3px;border-radius:3px;font-size:0.8em">$1</code>')
    .replace(/^- (.+)$/gm, '<li style="margin:0.2rem 0">$1</li>')
    .replace(/(<li[^>]*>.*<\/li>\n?)+/g, m => `<ul style="padding-left:1rem;margin:0.5rem 0">${m}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin:0.4rem 0">')
    .replace(/\n/g, ' ')
    .trim()
}

const STATUS_COLORS: Record<string, string> = {
  frozen: '#22c55e',
  active: '#f59e0b',
  draft: '#60a5fa',
  deprecated: '#71717a',
}

export interface LacFeatureCardProps {
  feature: LacFeatureEntry
  view?: LacView
  guideUrl?: string
  /** Custom CSS class applied to the card wrapper */
  className?: string
  style?: React.CSSProperties
}

/**
 * LacFeatureCard — renders a single feature in a given audience view.
 *
 * ```tsx
 * <LacFeatureCard feature={feature} view="user" guideUrl="/lac/lac-guide.html" />
 * ```
 */
export function LacFeatureCard({ feature, view = 'user', guideUrl, className, style }: LacFeatureCardProps) {
  const statusColor = STATUS_COLORS[feature.status] ?? '#71717a'
  const featureGuideUrl = guideUrl ? `${guideUrl}#${feature.featureKey}` : undefined

  return (
    <div
      className={className}
      style={{
        background: '#18181b',
        border: '1px solid #3f3f46',
        borderRadius: 8,
        padding: '1rem',
        ...style,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>{feature.domain}</span>
            {feature.priority && (
              <span style={{ fontSize: '0.7rem', color: '#71717a' }}>P{feature.priority}</span>
            )}
          </div>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 600, color: '#f4f4f5', lineHeight: 1.3 }}>
            {feature.title}
          </h3>
        </div>
        {featureGuideUrl && (
          <a
            href={featureGuideUrl}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: '0.7rem', color: '#f59e0b', whiteSpace: 'nowrap', flexShrink: 0, textDecoration: 'none' }}
          >
            Full guide →
          </a>
        )}
      </div>

      {/* User view */}
      {view === 'user' && feature.views.user && (
        <div style={{ fontSize: '0.8rem', color: '#d4d4d8', lineHeight: 1.6 }}>
          {feature.views.user.userGuide && (
            <div dangerouslySetInnerHTML={{ __html: mdToHtml(feature.views.user.userGuide) }} />
          )}
          {feature.views.user.knownLimitations && feature.views.user.knownLimitations.length > 0 && (
            <div style={{ marginTop: 10, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, padding: '8px 10px' }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 600, color: '#f59e0b' }}>Gotchas</p>
              <ul style={{ margin: 0, padding: '0 0 0 1rem' }}>
                {feature.views.user.knownLimitations.map((lim, i) => (
                  <li key={i} style={{ margin: '2px 0', fontSize: '0.75rem', color: '#d4d4d8' }}>{lim}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Dev view */}
      {view === 'dev' && feature.views.dev && (
        <div style={{ fontSize: '0.8rem', color: '#d4d4d8' }}>
          {feature.views.dev.componentFile && (
            <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: '#71717a' }}>Component</span>
              <code style={{ background: '#27272a', color: '#fbbf24', padding: '1px 6px', borderRadius: 4, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                {feature.views.dev.componentFile}
              </code>
            </div>
          )}
          {feature.views.dev.decisions && feature.views.dev.decisions.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 600, color: '#a1a1aa' }}>Key Decisions</p>
              {feature.views.dev.decisions.slice(0, 3).map((d, i) => (
                <div key={i} style={{ marginBottom: 4, fontSize: '0.75rem', color: '#d4d4d8' }}>
                  <span style={{ color: '#71717a', marginRight: 4 }}>{d.date}</span>
                  {d.decision ?? d.choice}
                </div>
              ))}
            </div>
          )}
          {feature.externalDependencies?.length > 0 && (
            <div>
              <p style={{ margin: '0 0 4px', fontSize: '0.7rem', fontWeight: 600, color: '#a1a1aa' }}>Depends on</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {feature.externalDependencies.map(dep => (
                  <a
                    key={dep}
                    href={featureGuideUrl ? `${guideUrl}#${dep}` : undefined}
                    target="_blank"
                    rel="noreferrer"
                    style={{ background: '#27272a', color: '#a1a1aa', padding: '1px 6px', borderRadius: 4, fontSize: '0.7rem', fontFamily: 'monospace', textDecoration: 'none' }}
                  >
                    {dep}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Product view */}
      {view === 'product' && feature.views.product && (
        <div style={{ fontSize: '0.8rem', color: '#d4d4d8' }}>
          {feature.views.product.problem && (
            <p style={{ margin: '0 0 8px', lineHeight: 1.5 }}>{feature.views.product.problem}</p>
          )}
          {feature.views.product.successCriteria && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 6, padding: '6px 10px' }}>
              <p style={{ margin: '0 0 2px', fontSize: '0.7rem', fontWeight: 600, color: '#4ade80' }}>Success Criteria</p>
              <p style={{ margin: 0, fontSize: '0.75rem' }}>{feature.views.product.successCriteria}</p>
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {feature.tags?.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 10 }}>
          {feature.tags.map(tag => (
            <span key={tag} style={{ background: '#27272a', color: '#71717a', padding: '1px 6px', borderRadius: 3, fontSize: '0.65rem' }}>
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
