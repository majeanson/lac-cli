/**
 * Resume generator — exports frozen features as a developer portfolio page.
 * Design intent: "Here's what I shipped and why I made each call."
 * A shareable artifact that shows off a project without exposing source code.
 *
 * Pure HTML/CSS — no JavaScript. Self-contained, single scrollable column.
 */

import type { ScannedFeature } from './scanner.js'

type Feature = ScannedFeature['feature']

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function groupByDomain(features: Feature[]): Map<string, Feature[]> {
  const map = new Map<string, Feature[]>()
  for (const f of features) {
    const key = f.domain ?? 'uncategorized'
    const bucket = map.get(key) ?? []
    bucket.push(f)
    map.set(key, bucket)
  }
  // Sort each bucket by priority asc (lower number = higher priority), then featureKey
  for (const [, bucket] of map) {
    bucket.sort((a, b) => {
      const pa = a.priority ?? 99
      const pb = b.priority ?? 99
      if (pa !== pb) return pa - pb
      return a.featureKey.localeCompare(b.featureKey)
    })
  }
  // Return sorted by domain name, with uncategorized last
  return new Map(
    [...map.entries()].sort(([a], [b]) => {
      if (a === 'uncategorized') return 1
      if (b === 'uncategorized') return -1
      return a.localeCompare(b)
    }),
  )
}

function totalDecisions(features: Feature[]): number {
  return features.reduce((sum, f) => sum + (f.decisions?.length ?? 0), 0)
}

function avgTagsPerFeature(features: Feature[]): string {
  if (features.length === 0) return '0'
  const total = features.reduce((sum, f) => sum + (f.tags?.length ?? 0), 0)
  return (total / features.length).toFixed(1)
}

function renderStatusBadge(): string {
  return `<span class="badge badge-frozen">frozen</span>`
}

function renderTagPills(tags: string[]): string {
  return tags.map(t => `<span class="pill">${esc(t)}</span>`).join('')
}

function renderNpmPills(pkgs: string[]): string {
  return pkgs.map(p => `<span class="npm-pill">${esc(p)}</span>`).join('')
}

function renderDecisions(decisions: NonNullable<Feature['decisions']>): string {
  const capped = decisions.slice(0, 3)
  const items = capped.map(d => `<li>${esc(d.decision)}</li>`).join('\n            ')
  const more = decisions.length > 3
    ? `<li class="more-decisions">+${decisions.length - 3} more decision${decisions.length - 3 === 1 ? '' : 's'}</li>`
    : ''
  return `
          <div class="section-block">
            <span class="section-label">Key decisions:</span>
            <ul class="decision-list">
            ${items}
            ${more}
            </ul>
          </div>`
}

function renderFeatureCard(f: Feature): string {
  const tags = f.tags && f.tags.length > 0 ? renderTagPills(f.tags) : ''
  const decisions = f.decisions && f.decisions.length > 0 ? renderDecisions(f.decisions) : ''
  const successCriteria = f.successCriteria
    ? `
          <div class="section-block outcome">
            <span class="section-label accent">Outcome:</span>
            <span class="outcome-text">${esc(f.successCriteria)}</span>
          </div>`
    : ''
  const spawnReason = f.lineage?.spawnReason
    ? `
          <div class="section-block spawn-note">
            <span class="section-label">Spawned from:</span>
            <span class="spawn-text">${esc(f.lineage.spawnReason)}</span>
          </div>`
    : ''
  const npmPackages = f.npmPackages && f.npmPackages.length > 0
    ? `
          <div class="section-block">
            <span class="section-label">Built with:</span>
            <span class="npm-pills">${renderNpmPills(f.npmPackages)}</span>
          </div>`
    : ''

  return `
        <article class="feature-card">
          <header class="card-header">
            <div class="card-title-row">
              <h3 class="card-title">${esc(f.title)}</h3>
              <code class="feature-key">${esc(f.featureKey)}</code>
            </div>
            <div class="card-meta">
              ${renderStatusBadge()}
              ${tags ? `<span class="tag-row">${tags}</span>` : ''}
            </div>
          </header>

          <blockquote class="problem-block">${esc(f.problem)}</blockquote>
          ${decisions}
          ${successCriteria}
          ${spawnReason}
          ${npmPackages}
        </article>`
}

function renderDomainGroup(domain: string, features: Feature[]): string {
  const cards = features.map(renderFeatureCard).join('\n')
  return `
      <section class="domain-group">
        <h2 class="domain-heading">
          <span class="domain-label">${esc(domain.toUpperCase())}</span>
          <span class="domain-count">${features.length} feature${features.length === 1 ? '' : 's'}</span>
        </h2>
        ${cards}
      </section>`
}

function renderEmptyState(projectName: string): string {
  return `
    <main class="main-content">
      <div class="empty-state">
        <div class="empty-icon">◈</div>
        <h2 class="empty-title">No frozen features yet</h2>
        <p class="empty-body">
          Features appear here once they reach <code>frozen</code> status — meaning
          implementation is complete, decisions are documented, and success criteria
          have been met.
        </p>
        <p class="empty-hint">
          Run <code>lac advance ${esc(projectName)} --status frozen</code> when a feature ships.
        </p>
      </div>
    </main>`
}

// ── Public API ──────────────────────────────────────────────────────────────────

export function generateResume(features: Feature[], projectName: string): string {
  const frozen = features.filter(f => f.status === 'frozen')
  const grouped = groupByDomain(frozen)
  const domainCount = grouped.size
  const decisionCount = totalDecisions(frozen)
  const avgTags = avgTagsPerFeature(frozen)
  const generatedDate = today()

  const mainContent = frozen.length === 0
    ? renderEmptyState(projectName)
    : `
    <main class="main-content">
      <div class="stats-row">
        <div class="stat-item">
          <span class="stat-value">${domainCount}</span>
          <span class="stat-label">domain${domainCount === 1 ? '' : 's'}</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-value">${decisionCount}</span>
          <span class="stat-label">decision${decisionCount === 1 ? '' : 's'} logged</span>
        </div>
        <div class="stat-divider"></div>
        <div class="stat-item">
          <span class="stat-value">${avgTags}</span>
          <span class="stat-label">avg tags / feature</span>
        </div>
      </div>

      ${[...grouped.entries()].map(([domain, fs]) => renderDomainGroup(domain, fs)).join('\n')}

      <footer class="page-footer">
        <span class="footer-count">${frozen.length} feature${frozen.length === 1 ? '' : 's'} shipped</span>
        <span class="footer-dot">·</span>
        <span class="footer-note">All features frozen — implementation complete</span>
        <span class="footer-dot">·</span>
        <span class="footer-lac">generated via life-as-code</span>
      </footer>
    </main>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — Feature Portfolio</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg: #12100e;
    --bg-sidebar: #0e0c0a;
    --bg-card: #1a1714;
    --bg-hover: #201d1a;
    --border: #2a2420;
    --border-soft: #221e1b;
    --text: #e8ddd4;
    --text-mid: #b0a49c;
    --text-soft: #7a6a5a;
    --accent: #c4a255;
    --accent-warm: #e8b865;
    --mono: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace;
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
    --status-active: #4aad72;
    --status-draft: #c4a255;
    --status-frozen: #5b82cc;
    --status-deprecated: #cc5b5b;
  }

  html {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 15px;
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }

  body {
    min-height: 100vh;
    padding: 48px 24px 80px;
  }

  /* ── Page shell ── */

  .page-header {
    max-width: 800px;
    margin: 0 auto 40px;
    padding-bottom: 32px;
    border-bottom: 1px solid var(--border);
  }

  .header-eyebrow {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-soft);
    letter-spacing: 0.12em;
    text-transform: uppercase;
    margin-bottom: 12px;
  }

  .header-title {
    font-size: 32px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  .header-diamond {
    color: var(--accent);
    margin-right: 8px;
  }

  .header-subtitle {
    margin-top: 8px;
    font-size: 15px;
    color: var(--text-mid);
  }

  .header-meta {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 20px;
    font-size: 12px;
    color: var(--text-soft);
    font-family: var(--mono);
  }

  .header-meta-sep {
    color: var(--border);
  }

  /* ── Stats row ── */

  .main-content {
    max-width: 800px;
    margin: 0 auto;
  }

  .stats-row {
    display: flex;
    align-items: center;
    gap: 0;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 28px;
    margin-bottom: 40px;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex: 1;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 700;
    color: var(--accent);
    font-family: var(--mono);
    line-height: 1;
  }

  .stat-label {
    margin-top: 4px;
    font-size: 11px;
    color: var(--text-soft);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .stat-divider {
    width: 1px;
    height: 40px;
    background: var(--border);
    flex-shrink: 0;
  }

  /* ── Domain groups ── */

  .domain-group {
    margin-bottom: 48px;
  }

  .domain-heading {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin-bottom: 16px;
  }

  .domain-label {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.14em;
    color: var(--text-soft);
    font-weight: 600;
  }

  .domain-count {
    font-size: 11px;
    color: var(--border);
    font-family: var(--mono);
  }

  /* ── Feature cards ── */

  .feature-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 20px 24px;
    margin-bottom: 12px;
  }

  .card-header {
    margin-bottom: 14px;
  }

  .card-title-row {
    display: flex;
    align-items: baseline;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 8px;
  }

  .card-title {
    font-size: 17px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
  }

  .feature-key {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-soft);
    background: var(--bg-sidebar);
    border: 1px solid var(--border-soft);
    border-radius: 3px;
    padding: 1px 6px;
    flex-shrink: 0;
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  /* ── Badges ── */

  .badge {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    padding: 2px 8px;
    border-radius: 3px;
    border: 1px solid currentColor;
    flex-shrink: 0;
  }

  .badge-frozen {
    color: var(--status-frozen);
    border-color: rgba(91, 130, 204, 0.4);
    background: rgba(91, 130, 204, 0.08);
  }

  /* ── Tag pills ── */

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .pill {
    font-size: 11px;
    color: var(--text-soft);
    background: var(--bg-sidebar);
    border: 1px solid var(--border-soft);
    border-radius: 10px;
    padding: 1px 8px;
    font-family: var(--mono);
  }

  /* ── npm pills ── */

  .npm-pills {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .npm-pill {
    font-size: 11px;
    color: var(--accent);
    background: rgba(196, 162, 85, 0.08);
    border: 1px solid rgba(196, 162, 85, 0.25);
    border-radius: 3px;
    padding: 1px 7px;
    font-family: var(--mono);
  }

  /* ── Problem blockquote ── */

  .problem-block {
    font-size: 13.5px;
    color: var(--text-mid);
    line-height: 1.65;
    padding: 10px 14px;
    border-left: 2px solid var(--border);
    background: var(--bg-sidebar);
    border-radius: 0 4px 4px 0;
    font-style: italic;
    margin-bottom: 12px;
  }

  /* ── Section blocks ── */

  .section-block {
    margin-top: 10px;
    font-size: 13px;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .section-label {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-soft);
    padding-top: 2px;
    flex-shrink: 0;
  }

  .section-label.accent {
    color: var(--accent);
  }

  /* ── Decision list ── */

  .decision-list {
    list-style: none;
    padding: 0;
    margin: 0;
    flex: 1;
  }

  .decision-list li {
    position: relative;
    padding-left: 14px;
    color: var(--text-mid);
    font-size: 13px;
    line-height: 1.55;
    margin-bottom: 4px;
  }

  .decision-list li::before {
    content: '·';
    position: absolute;
    left: 0;
    color: var(--text-soft);
  }

  .decision-list li.more-decisions {
    color: var(--text-soft);
    font-style: italic;
    font-size: 12px;
  }

  /* ── Outcome ── */

  .outcome-text {
    color: var(--text-mid);
    font-size: 13px;
    line-height: 1.55;
    flex: 1;
  }

  /* ── Spawn note ── */

  .spawn-note .spawn-text {
    color: var(--text-soft);
    font-size: 12px;
    font-style: italic;
    flex: 1;
  }

  /* ── Footer ── */

  .page-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 24px 0 0;
    border-top: 1px solid var(--border);
    margin-top: 8px;
    font-size: 12px;
    color: var(--text-soft);
    font-family: var(--mono);
    flex-wrap: wrap;
  }

  .footer-count {
    color: var(--text-mid);
    font-weight: 600;
  }

  .footer-dot {
    color: var(--border);
  }

  .footer-lac {
    color: var(--text-soft);
    font-style: italic;
  }

  /* ── Empty state ── */

  .empty-state {
    text-align: center;
    padding: 80px 24px;
  }

  .empty-icon {
    font-size: 48px;
    color: var(--border);
    margin-bottom: 20px;
    line-height: 1;
  }

  .empty-title {
    font-size: 20px;
    font-weight: 600;
    color: var(--text-mid);
    margin-bottom: 12px;
  }

  .empty-body {
    font-size: 14px;
    color: var(--text-soft);
    max-width: 440px;
    margin: 0 auto 16px;
    line-height: 1.7;
  }

  .empty-body code,
  .empty-hint code {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--accent);
    background: rgba(196, 162, 85, 0.08);
    border: 1px solid rgba(196, 162, 85, 0.2);
    border-radius: 3px;
    padding: 1px 5px;
  }

  .empty-hint {
    font-size: 13px;
    color: var(--text-soft);
  }

  /* ── Print ── */

  @media print {
    body { background: white; color: black; padding: 20px; }
    .feature-card { border: 1px solid #ccc; break-inside: avoid; }
    .badge-frozen { color: #3366aa; }
    .domain-heading .domain-label { color: #555; }
  }
</style>
</head>
<body>

  <header class="page-header">
    <div class="header-eyebrow">feature portfolio</div>
    <h1 class="header-title">
      <span class="header-diamond">◈</span>${esc(projectName)}
    </h1>
    <p class="header-subtitle">
      ${frozen.length} shipped feature${frozen.length === 1 ? '' : 's'}
    </p>
    <div class="header-meta">
      <span>${generatedDate}</span>
      <span class="header-meta-sep">·</span>
      <span>generated via life-as-code</span>
    </div>
  </header>

  ${mainContent}

</body>
</html>`
}
