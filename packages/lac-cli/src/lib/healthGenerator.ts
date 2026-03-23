/**
 * Health generator — exports a project health scorecard/dashboard.
 * Design intent: "One glance tells you where your project stands."
 * Shows status breakdown, field coverage, tech debt, and a weighted health score.
 *
 * Minimal JavaScript: only animated number counters on load.
 */

import type { Feature } from '@life-as-code/feature-schema'

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

function completeness(f: Feature): number {
  const checks = [
    !!f.analysis,
    !!f.implementation,
    !!(f.decisions && f.decisions.length > 0),
    !!f.successCriteria,
    !!(f.knownLimitations && f.knownLimitations.length > 0),
    !!(f.tags && f.tags.length > 0),
    !!f.domain,
  ]
  return Math.round(checks.filter(Boolean).length / checks.length * 100)
}

function avgCompleteness(features: Feature[]): number {
  if (features.length === 0) return 0
  return Math.round(features.reduce((sum, f) => sum + completeness(f), 0) / features.length)
}

function groupByDomain(features: Feature[]): Map<string, Feature[]> {
  const map = new Map<string, Feature[]>()
  for (const f of features) {
    const key = f.domain ?? 'uncategorized'
    const bucket = map.get(key) ?? []
    bucket.push(f)
    map.set(key, bucket)
  }
  return new Map(
    [...map.entries()].sort(([a], [b]) => {
      if (a === 'uncategorized') return 1
      if (b === 'uncategorized') return -1
      return a.localeCompare(b)
    }),
  )
}

interface FieldCoverage {
  label: string
  pct: number
}

function fieldCoverages(features: Feature[]): FieldCoverage[] {
  const n = features.length
  if (n === 0) return []

  const fields: Array<{ label: string; check: (f: Feature) => boolean }> = [
    { label: 'problem',          check: f => !!f.problem },
    { label: 'analysis',         check: f => !!f.analysis },
    { label: 'implementation',   check: f => !!f.implementation },
    { label: 'successCriteria',  check: f => !!f.successCriteria },
    { label: 'decisions (≥1)',   check: f => !!(f.decisions && f.decisions.length > 0) },
    { label: 'knownLimitations (≥1)', check: f => !!(f.knownLimitations && f.knownLimitations.length > 0) },
    { label: 'tags (≥1)',        check: f => !!(f.tags && f.tags.length > 0) },
    { label: 'domain',           check: f => !!f.domain },
    { label: 'userGuide',        check: f => !!f.userGuide },
    { label: 'owner',            check: f => !!f.owner },
    { label: 'componentFile',    check: f => !!f.componentFile },
    { label: 'codeSnippets (≥1)', check: f => !!(f.codeSnippets && f.codeSnippets.length > 0) },
  ]

  return fields
    .map(({ label, check }) => ({
      label,
      pct: Math.round(features.filter(check).length / n * 100),
    }))
    .sort((a, b) => b.pct - a.pct)
}

function barColor(pct: number): string {
  if (pct >= 80) return '#4aad72'
  if (pct >= 50) return '#c4a255'
  return '#cc5b5b'
}

function healthScore(avgComp: number, frozenPct: number, totalDec: number, total: number): number {
  const decisionsPerFeatureScore = total === 0 ? 0 : Math.min(100, (totalDec / total) * 33.3)
  return Math.round((avgComp * 0.4) + (frozenPct * 0.3) + (decisionsPerFeatureScore * 0.3))
}

function scoreRingColor(score: number): string {
  if (score >= 70) return '#4aad72'
  if (score >= 45) return '#c4a255'
  return '#cc5b5b'
}

// ── Section renderers ──────────────────────────────────────────────────────────

function renderHeroCards(
  total: number,
  frozenPct: number,
  avgComp: number,
  totalDec: number,
  score: number,
): string {
  const ringColor = scoreRingColor(score)

  const cards = [
    { id: 'hero-total',   value: total,     label: 'total features' },
    { id: 'hero-frozen',  value: frozenPct, label: '% frozen',     suffix: '%' },
    { id: 'hero-avg',     value: avgComp,   label: 'avg completeness', suffix: '%' },
    { id: 'hero-dec',     value: totalDec,  label: 'total decisions' },
  ]

  const cardHtml = cards.map(c => `
          <div class="hero-card">
            <span class="hero-num" id="${c.id}" data-target="${c.value}">0</span>${c.suffix ? `<span class="hero-suffix">${c.suffix}</span>` : ''}
            <span class="hero-label">${c.label}</span>
          </div>`).join('')

  return `
      <div class="hero-row">
        ${cardHtml}
        <div class="score-badge" style="--score-color:${ringColor}">
          <svg class="score-ring" viewBox="0 0 56 56" width="56" height="56">
            <circle cx="28" cy="28" r="24" fill="none" stroke="#2a2420" stroke-width="4"/>
            <circle cx="28" cy="28" r="24" fill="none" stroke="${ringColor}" stroke-width="4"
              stroke-dasharray="${Math.round(24 * 2 * Math.PI)}"
              stroke-dashoffset="${Math.round(24 * 2 * Math.PI * (1 - score / 100))}"
              stroke-linecap="round"
              transform="rotate(-90 28 28)"/>
          </svg>
          <div class="score-inner">
            <span class="score-num" id="hero-score" data-target="${score}">0</span>
          </div>
          <span class="score-label">Health Score</span>
        </div>
      </div>`
}

function renderStatusBar(features: Feature[]): string {
  const n = features.length
  if (n === 0) return ''

  const counts = {
    active:     features.filter(f => f.status === 'active').length,
    frozen:     features.filter(f => f.status === 'frozen').length,
    draft:      features.filter(f => f.status === 'draft').length,
    deprecated: features.filter(f => f.status === 'deprecated').length,
  }

  const segments = [
    { key: 'active',     color: 'var(--status-active)',     count: counts.active },
    { key: 'frozen',     color: 'var(--status-frozen)',     count: counts.frozen },
    { key: 'draft',      color: 'var(--status-draft)',      count: counts.draft },
    { key: 'deprecated', color: 'var(--status-deprecated)', count: counts.deprecated },
  ].filter(s => s.count > 0)

  const barSegments = segments.map(s =>
    `<div class="status-segment" style="width:${(s.count / n * 100).toFixed(1)}%;background:${s.color}" title="${s.key}: ${s.count}"></div>`
  ).join('')

  const labels = segments.map(s =>
    `<span class="status-legend-item"><span class="status-dot" style="background:${s.color}"></span>${esc(s.key)} <strong>${s.count}</strong></span>`
  ).join('')

  return `
      <div class="section-card">
        <h3 class="section-heading">Status Breakdown</h3>
        <div class="status-bar">${barSegments}</div>
        <div class="status-legend">${labels}</div>
      </div>`
}

function renderDomainMiniChart(grouped: Map<string, Feature[]>): string {
  const entries = [...grouped.entries()]
  if (entries.length === 0) return ''
  const maxCount = Math.max(...entries.map(([, fs]) => fs.length))

  const rows = entries.map(([domain, fs]) => {
    const pct = maxCount > 0 ? (fs.length / maxCount * 100).toFixed(1) : '0'
    return `
          <div class="domain-row">
            <span class="domain-name">${esc(domain)}</span>
            <span class="domain-count-label">${fs.length}</span>
            <div class="domain-mini-bar-wrap">
              <div class="domain-mini-bar" style="width:${pct}%"></div>
            </div>
          </div>`
  }).join('')

  return `
      <div class="section-card">
        <h3 class="section-heading">By Domain</h3>
        <div class="domain-list">${rows}
        </div>
      </div>`
}

function renderFieldCoverageBars(features: Feature[]): string {
  const coverages = fieldCoverages(features)
  if (coverages.length === 0) return ''

  const bars = coverages.map(({ label, pct }) => {
    const color = barColor(pct)
    return `
          <div class="coverage-row">
            <span class="coverage-label">${esc(label)}</span>
            <div class="coverage-bar-wrap">
              <div class="coverage-bar" style="width:${pct}%;background:${color}"></div>
            </div>
            <span class="coverage-pct" style="color:${color}">${pct}%</span>
          </div>`
  }).join('')

  return `
      <div class="section-card">
        <h3 class="section-heading">Field Coverage</h3>
        <div class="coverage-list">${bars}
        </div>
      </div>`
}

function renderTechDebt(features: Feature[]): string {
  const noDecisions = features.filter(f => !f.decisions || f.decisions.length === 0)
  const noDomain    = features.filter(f => !f.domain)

  function debtList(items: Feature[], emptyText: string): string {
    if (items.length === 0) {
      return `<div class="debt-empty">&#10003; ${emptyText}</div>`
    }
    return `<ul class="debt-list">${items.map(f =>
      `<li><code class="debt-key">${esc(f.featureKey)}</code> <span class="debt-title">${esc(f.title)}</span></li>`
    ).join('')}</ul>`
  }

  return `
      <div class="section-card debt-card">
        <h3 class="section-heading">Tech Debt</h3>
        <div class="debt-cols">
          <div class="debt-col">
            <div class="debt-col-header">No decisions <span class="debt-count">${noDecisions.length}</span></div>
            ${debtList(noDecisions, 'All features covered')}
          </div>
          <div class="debt-col">
            <div class="debt-col-header">No domain <span class="debt-count">${noDomain.length}</span></div>
            ${debtList(noDomain, 'All features covered')}
          </div>
        </div>
      </div>`
}

// ── Public API ──────────────────────────────────────────────────────────────────

export function generateHealth(features: Feature[], projectName: string): string {
  const total     = features.length
  const frozen    = features.filter(f => f.status === 'frozen').length
  const frozenPct = total === 0 ? 0 : Math.round(frozen / total * 100)
  const avgComp   = avgCompleteness(features)
  const totalDec  = features.reduce((sum, f) => sum + (f.decisions?.length ?? 0), 0)
  const score     = healthScore(avgComp, frozenPct, totalDec, total)
  const grouped   = groupByDomain(features)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — LAC Health</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:          #12100e;
  --bg-card:     #1a1714;
  --bg-hover:    #201d1a;
  --bg-sidebar:  #0e0c0a;
  --border:      #2a2420;
  --border-soft: #221e1b;
  --text:        #e8ddd4;
  --text-mid:    #b0a49c;
  --text-soft:   #7a6a5a;
  --accent:      #c4a255;
  --mono:        'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
  --sans:        -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  --status-active:     #4aad72;
  --status-draft:      #c4a255;
  --status-frozen:     #5b82cc;
  --status-deprecated: #cc5b5b;
}

html, body { height: 100%; }
body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  display: flex;
  flex-direction: column;
}

/* ── Topbar ── */
.topbar {
  flex-shrink: 0;
  height: 48px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 20px;
  background: var(--bg-sidebar);
  border-bottom: 1px solid var(--border);
}
.topbar-logo    { font-family: var(--mono); font-size: 13px; color: var(--accent); letter-spacing: 0.05em; }
.topbar-sep     { color: var(--border); }
.topbar-project { font-family: var(--mono); font-size: 12px; color: var(--text-mid); }
.topbar-date    { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--text-soft); }

/* ── Page ── */
.page {
  flex: 1;
  overflow-y: auto;
  padding: 32px 24px 80px;
}

.inner {
  max-width: 1100px;
  margin: 0 auto;
}

/* ── Hero row ── */
.hero-row {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  align-items: flex-start;
  margin-bottom: 32px;
}

.hero-card {
  flex: 1;
  min-width: 140px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px 20px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.hero-num {
  font-family: var(--mono);
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
}

.hero-suffix {
  font-family: var(--mono);
  font-size: 1.4rem;
  color: var(--accent);
  opacity: 0.7;
  margin-left: 2px;
}

.hero-label {
  font-size: 11px;
  color: var(--text-soft);
  text-transform: uppercase;
  letter-spacing: 0.09em;
}

/* ── Score badge ── */
.score-badge {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-width: 110px;
}

.score-ring { flex-shrink: 0; }

.score-inner {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
}

.score-badge { position: relative; }
.score-ring  { display: block; }

.score-num {
  font-family: var(--mono);
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--score-color, var(--accent));
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -78%);
}

.score-label {
  font-size: 10px;
  color: var(--text-soft);
  text-transform: uppercase;
  letter-spacing: 0.09em;
  margin-top: 4px;
}

/* ── Two-column layout ── */
.two-col {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 20px;
}

@media (max-width: 720px) {
  .two-col { grid-template-columns: 1fr; }
  .hero-row { flex-direction: column; }
}

/* ── Section cards ── */
.section-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px 22px;
}

.section-heading {
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-soft);
  margin-bottom: 14px;
}

/* ── Status bar ── */
.status-bar {
  height: 10px;
  border-radius: 5px;
  overflow: hidden;
  display: flex;
  margin-bottom: 12px;
  background: var(--border);
}

.status-segment { height: 100%; transition: width 0.3s; }

.status-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 12px;
  color: var(--text-mid);
}

.status-legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Domain mini chart ── */
.domain-list { display: flex; flex-direction: column; gap: 8px; }

.domain-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.domain-name {
  min-width: 90px;
  color: var(--text-mid);
  font-family: var(--mono);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.domain-count-label {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  min-width: 20px;
  text-align: right;
}

.domain-mini-bar-wrap {
  flex: 1;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.domain-mini-bar {
  height: 100%;
  background: var(--accent);
  opacity: 0.6;
  border-radius: 3px;
  transition: width 0.3s;
}

/* ── Coverage bars ── */
.coverage-list { display: flex; flex-direction: column; gap: 8px; }

.coverage-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.coverage-label {
  min-width: 160px;
  color: var(--text-mid);
  font-family: var(--mono);
  font-size: 11px;
  flex-shrink: 0;
}

.coverage-bar-wrap {
  flex: 1;
  height: 6px;
  background: var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.coverage-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}

.coverage-pct {
  font-family: var(--mono);
  font-size: 11px;
  min-width: 34px;
  text-align: right;
}

/* ── Tech debt ── */
.debt-card { margin-top: 0; }

.debt-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

@media (max-width: 560px) {
  .debt-cols { grid-template-columns: 1fr; }
}

.debt-col-header {
  font-size: 12px;
  color: var(--text-mid);
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.debt-count {
  font-family: var(--mono);
  font-size: 11px;
  background: var(--bg-sidebar);
  border: 1px solid var(--border-soft);
  border-radius: 10px;
  padding: 0 7px;
  color: var(--text-soft);
}

.debt-list {
  list-style: none;
  max-height: 200px;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.debt-list::-webkit-scrollbar { width: 4px; }
.debt-list::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.debt-list li {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-size: 12px;
}

.debt-key {
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
  background: var(--bg-sidebar);
  border: 1px solid var(--border-soft);
  border-radius: 3px;
  padding: 1px 5px;
  flex-shrink: 0;
}

.debt-title {
  color: var(--text-mid);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.debt-empty {
  font-size: 12px;
  color: var(--status-active);
  font-family: var(--mono);
  padding: 4px 0;
}
</style>
</head>
<body>

<div class="topbar">
  <span class="topbar-logo">&#9672; lac &middot; health</span>
  <span class="topbar-sep">|</span>
  <span class="topbar-project">${esc(projectName)}</span>
  <span class="topbar-date">${today()}</span>
</div>

<div class="page">
  <div class="inner">

    ${renderHeroCards(total, frozenPct, avgComp, totalDec, score)}

    <div class="two-col">
      <div>
        ${renderStatusBar(features)}
        ${renderDomainMiniChart(grouped)}
      </div>
      <div>
        ${renderFieldCoverageBars(features)}
      </div>
    </div>

    ${renderTechDebt(features)}

  </div>
</div>

<script>
(function() {
  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Animate counters
  var els = document.querySelectorAll('[data-target]');
  var duration = 800;
  var start = performance.now();

  function step(ts) {
    var progress = Math.min((ts - start) / duration, 1);
    // ease-out: 1 - (1-t)^3
    var eased = 1 - Math.pow(1 - progress, 3);
    els.forEach(function(el) {
      var target = parseInt(el.getAttribute('data-target'), 10);
      el.textContent = String(Math.round(target * eased));
    });
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
})();
</script>

</body>
</html>`
}
