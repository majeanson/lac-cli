import type { Feature } from '@life-as-code/feature-schema'

interface ReleaseNotesOptions {
  since?: string
  release?: string
}

/**
 * generateReleaseNotes — user-facing release notes filtered by date or releaseVersion.
 *
 * Features included: those that transitioned to "frozen" after `since` date,
 * OR those whose `releaseVersion` matches the `release` option.
 * Falls back to all frozen features if neither filter is provided.
 *
 * Output: lac-release-notes.html — communication-ready, PM/user tone.
 */
export function generateReleaseNotes(features: Feature[], projectName: string, opts: ReleaseNotesOptions): string {
  function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function mdToHtml(raw: string): string {
    function inline(s: string): string {
      return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
    }
    return raw.split(/\n{2,}/).map(block => {
      const lines = block.split('\n')
      if (lines.every(l => /^\s*[-*]\s/.test(l))) {
        return `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*[-*]\s/, ''))}</li>`).join('')}</ul>`
      }
      return `<p>${lines.map(l => inline(l.trim())).filter(Boolean).join(' ')}</p>`
    }).join('\n')
  }

  // Filter features
  let releaseFeatures = features.filter(f => {
    const feat = f as Record<string, unknown>
    // By releaseVersion
    if (opts.release && feat['releaseVersion'] === opts.release) return true
    // By frozen date (statusHistory)
    if (opts.since) {
      const history = feat['statusHistory'] as Array<{ from: string; to: string; date: string }> | undefined
      if (history) {
        return history.some(t => t.to === 'frozen' && t.date >= opts.since!)
      }
    }
    // Default: all frozen
    if (!opts.since && !opts.release) return f.status === 'frozen'
    return false
  })

  // Sort by priority
  releaseFeatures = releaseFeatures.sort((a, b) => ((a.priority ?? 99) - (b.priority ?? 99)))

  // Group by domain
  const domainOrder: string[] = []
  const seen = new Set<string>()
  for (const f of releaseFeatures) {
    const d = f.domain ?? 'other'
    if (!seen.has(d)) { seen.add(d); domainOrder.push(d) }
  }

  const PALETTE = ['#c4a255','#e8674a','#4aad72','#5b82cc','#b87fda','#4ab8cc','#cc5b5b','#a2cc4a']
  const domainColor: Record<string, string> = {}
  domainOrder.forEach((d, i) => { domainColor[d] = PALETTE[i % PALETTE.length]! })

  const filterLabel = opts.release
    ? `v${opts.release}`
    : opts.since
      ? `since ${opts.since}`
      : 'all frozen features'

  function renderFeatureCard(f: Feature): string {
    const feat = f as Record<string, unknown>
    const domain = f.domain ?? 'other'
    const color = domainColor[domain] ?? '#c4a255'
    const userGuide = typeof feat['userGuide'] === 'string' ? feat['userGuide'] as string : ''
    const pmSummary = typeof feat['pmSummary'] === 'string' ? feat['pmSummary'] as string : ''
    const limitations = (feat['knownLimitations'] as string[] | undefined) ?? []
    const releaseVer = typeof feat['releaseVersion'] === 'string' ? feat['releaseVersion'] as string : ''

    return `<div class="feature-card" id="${esc(f.featureKey)}">
      <div class="card-domain-eyebrow" style="color:${color}">${esc(domain.replace(/-/g, ' '))}${releaseVer ? ` · v${esc(releaseVer)}` : ''}</div>
      <div class="card-title">${esc(f.title)}</div>
      ${pmSummary ? `<div class="card-pm-summary">${esc(pmSummary)}</div>` : ''}
      ${userGuide ? `<div class="card-guide-block"><div class="card-guide-label">How to use</div><div class="card-guide-text">${mdToHtml(userGuide)}</div></div>` : ''}
      ${limitations.length > 0 ? `<div class="card-limits"><div class="card-limits-label">Known limitations</div><ul class="card-limits-list">${limitations.map(l => `<li>${esc(l)}</li>`).join('')}</ul></div>` : ''}
    </div>`
  }

  const domainSectionsHtml = domainOrder.map(domain => {
    const domFeatures = releaseFeatures.filter(f => (f.domain ?? 'other') === domain)
    const color = domainColor[domain]!
    return `<div class="domain-section">
      <div class="domain-header">
        <div class="domain-pip" style="background:${color}"></div>
        <div class="domain-title">${esc(domain.replace(/-/g, ' '))}</div>
        <div class="domain-count">${domFeatures.length} feature${domFeatures.length !== 1 ? 's' : ''}</div>
      </div>
      ${domFeatures.map(renderFeatureCard).join('')}
    </div>`
  }).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Release Notes</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
:root {
  --bg: #0f0d0b; --bg-card: #181512; --bg-hover: #1e1a16; --border: #262018; --text: #ece3d8; --text-mid: #b0a494; --text-soft: #736455;
  --accent: #c4a255; --mono: 'Cascadia Code','Fira Code','Consolas',monospace; --sans: -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
}
html { scroll-behavior: smooth; }
body { background: var(--bg); color: var(--text); font-family: var(--sans); font-size: 14px; line-height: 1.6; }
.topbar { height: 46px; display: flex; align-items: center; gap: 14px; padding: 0 20px; background: #0b0a08; border-bottom: 1px solid var(--border); position: sticky; top: 0; z-index: 10; }
.topbar-brand { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep { color: var(--border); font-size: 18px; }
.topbar-title { font-size: 13px; color: var(--text-mid); }
.topbar-filter { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--text-soft); padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--bg-card); }
.main { max-width: 820px; margin: 0 auto; padding: 56px 40px 100px; }
.page-eyebrow { font-family: var(--mono); font-size: 9px; letter-spacing: 0.2em; text-transform: uppercase; color: var(--accent); margin-bottom: 14px; }
.page-title { font-size: 36px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.1; margin-bottom: 10px; }
.page-sub { font-size: 15px; color: var(--text-mid); margin-bottom: 48px; max-width: 560px; }
.stats-row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 48px; }
.stat-card { padding: 14px 18px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 8px; min-width: 100px; }
.stat-num { font-family: var(--mono); font-size: 24px; font-weight: 700; color: var(--accent); }
.stat-lbl { font-size: 11px; color: var(--text-soft); margin-top: 4px; }
.domain-section { margin-bottom: 56px; }
.domain-header { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 1px solid var(--border); }
.domain-pip { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.domain-title { font-family: var(--mono); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--text); }
.domain-count { font-family: var(--mono); font-size: 10px; color: var(--text-soft); margin-left: auto; }
.feature-card { background: var(--bg-card); border: 1px solid var(--border); border-radius: 10px; padding: 24px 28px; margin-bottom: 16px; }
.card-domain-eyebrow { font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 8px; }
.card-title { font-size: 20px; font-weight: 800; color: var(--text); letter-spacing: -0.01em; margin-bottom: 10px; }
.card-pm-summary { font-size: 14px; color: var(--text-mid); line-height: 1.7; margin-bottom: 16px; font-style: italic; }
.card-guide-block { margin-bottom: 16px; }
.card-guide-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); margin-bottom: 10px; }
.card-guide-text { font-size: 14px; color: var(--text-mid); line-height: 1.8; }
.card-guide-text p { margin-bottom: 0.75em; }
.card-guide-text p:last-child { margin-bottom: 0; }
.card-guide-text ul { margin: 0.4em 0 0.8em 1.4em; }
.card-guide-text li { margin-bottom: 0.3em; }
.card-guide-text strong { color: var(--text); font-weight: 600; }
.card-guide-text code { font-family: var(--mono); font-size: 12px; background: var(--bg-hover); border: 1px solid var(--border); border-radius: 3px; padding: 1px 5px; }
.card-limits { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--border); }
.card-limits-label { font-family: var(--mono); font-size: 9px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--text-soft); margin-bottom: 8px; }
.card-limits-list { list-style: none; padding: 0; }
.card-limits-list li { font-size: 12px; color: var(--text-soft); line-height: 1.6; margin-bottom: 4px; padding-left: 14px; position: relative; }
.card-limits-list li::before { content: '—'; position: absolute; left: 0; opacity: 0.4; }
.empty-state { text-align: center; padding: 80px 40px; color: var(--text-soft); }
.empty-title { font-size: 20px; color: var(--text-mid); margin-bottom: 10px; font-weight: 700; }
</style>
</head>
<body>
<div class="topbar">
  <span class="topbar-brand">lac·release-notes</span>
  <span class="topbar-sep">/</span>
  <span class="topbar-title">${esc(projectName)}</span>
  <span class="topbar-filter">${esc(filterLabel)}</span>
</div>
<main class="main">
  <div class="page-eyebrow">release notes</div>
  <div class="page-title">${esc(projectName)}</div>
  <div class="page-sub">What shipped — ${esc(filterLabel)}. ${releaseFeatures.length} feature${releaseFeatures.length !== 1 ? 's' : ''} across ${domainOrder.length} domain${domainOrder.length !== 1 ? 's' : ''}.</div>
  <div class="stats-row">
    <div class="stat-card"><div class="stat-num">${releaseFeatures.length}</div><div class="stat-lbl">features shipped</div></div>
    <div class="stat-card"><div class="stat-num">${domainOrder.length}</div><div class="stat-lbl">domains</div></div>
    <div class="stat-card"><div class="stat-num">${releaseFeatures.filter(f => (f as Record<string, unknown>)['userGuide']).length}</div><div class="stat-lbl">with user guides</div></div>
  </div>
  ${releaseFeatures.length === 0
    ? `<div class="empty-state"><div class="empty-title">No features matched the filter</div><p>${opts.since ? `No features frozen after ${opts.since}.` : opts.release ? `No features with releaseVersion "${opts.release}".` : 'No frozen features found.'}</p></div>`
    : domainSectionsHtml}
</main>
</body>
</html>`
}
