/**
 * Diff generator — compares two scanned feature workspaces and renders
 * an HTML report showing added, removed, and changed features with
 * field-by-field diffs for changed ones.
 */

import type { ScannedFeature } from './scanner.js'

type Feature = ScannedFeature['feature']

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Fields to compare ──────────────────────────────────────────────────────────

const SCALAR_FIELDS: Array<keyof Feature> = [
  'title', 'status', 'problem', 'analysis', 'implementation',
  'userGuide', 'successCriteria', 'domain', 'owner', 'priority',
  'componentFile', 'lastVerifiedDate', 'superseded_by', 'merged_into',
]

const ARRAY_FIELDS: Array<keyof Feature> = [
  'tags', 'knownLimitations', 'npmPackages', 'externalDependencies',
  'superseded_from', 'merged_from',
]

const OBJECT_FIELDS: Array<keyof Feature> = [
  'decisions', 'annotations', 'statusHistory', 'lineage',
  'publicInterface', 'codeSnippets',
]

interface FieldDiff {
  field: string
  oldVal: string
  newVal: string
}

function serialize(val: unknown): string {
  if (val === undefined || val === null) return ''
  if (typeof val === 'string') return val
  return JSON.stringify(val, null, 2)
}

function diffFeatures(a: Feature, b: Feature): FieldDiff[] {
  const diffs: FieldDiff[] = []

  for (const field of [...SCALAR_FIELDS, ...ARRAY_FIELDS, ...OBJECT_FIELDS]) {
    const av = serialize(a[field])
    const bv = serialize(b[field])
    if (av !== bv) {
      diffs.push({ field: String(field), oldVal: av, newVal: bv })
    }
  }

  return diffs
}

// ── Rendering helpers ──────────────────────────────────────────────────────────

function statusBadge(status: string): string {
  return `<span class="badge badge-${esc(status)}">${esc(status)}</span>`
}

function renderAdded(f: Feature): string {
  return `<div class="feature-card added">
  <div class="card-header">
    <span class="card-sign added-sign">+</span>
    <span class="feature-key">${esc(f.featureKey)}</span>
    ${statusBadge(f.status)}
    ${f.domain ? `<span class="domain-badge">${esc(f.domain)}</span>` : ''}
    <span class="feature-title">${esc(f.title)}</span>
  </div>
  <div class="card-problem">${esc(f.problem)}</div>
  ${f.tags && f.tags.length ? `<div class="card-tags">${f.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
</div>`
}

function renderRemoved(f: Feature): string {
  return `<div class="feature-card removed">
  <div class="card-header">
    <span class="card-sign removed-sign">−</span>
    <span class="feature-key">${esc(f.featureKey)}</span>
    ${statusBadge(f.status)}
    ${f.domain ? `<span class="domain-badge">${esc(f.domain)}</span>` : ''}
    <span class="feature-title">${esc(f.title)}</span>
  </div>
  <div class="card-problem">${esc(f.problem)}</div>
  ${f.tags && f.tags.length ? `<div class="card-tags">${f.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
</div>`
}

function renderChanged(a: Feature, b: Feature, diffs: FieldDiff[]): string {
  const rows = diffs.map(d => {
    const oldEmpty = d.oldVal === ''
    const newEmpty = d.newVal === ''
    const oldDisplay = oldEmpty ? '<span class="diff-empty">— not set</span>' : `<pre class="diff-val">${esc(d.oldVal.length > 400 ? d.oldVal.slice(0, 400) + '…' : d.oldVal)}</pre>`
    const newDisplay = newEmpty ? '<span class="diff-empty">— not set</span>' : `<pre class="diff-val">${esc(d.newVal.length > 400 ? d.newVal.slice(0, 400) + '…' : d.newVal)}</pre>`
    return `<tr>
      <td class="diff-field"><code>${esc(d.field)}</code></td>
      <td class="diff-old">${oldDisplay}</td>
      <td class="diff-new">${newDisplay}</td>
    </tr>`
  }).join('')

  return `<div class="feature-card changed">
  <div class="card-header">
    <span class="card-sign changed-sign">~</span>
    <span class="feature-key">${esc(b.featureKey)}</span>
    ${statusBadge(b.status)}
    ${b.domain ? `<span class="domain-badge">${esc(b.domain)}</span>` : ''}
    <span class="feature-title">${esc(b.title)}</span>
    <span class="diff-count">${diffs.length} field${diffs.length === 1 ? '' : 's'} changed</span>
  </div>
  <div class="diff-table-wrap">
    <table class="diff-table">
      <thead><tr><th>field</th><th>before</th><th>after</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`
}

// ── Main export ────────────────────────────────────────────────────────────────

export function generateDiff(
  featuresA: Feature[],
  featuresB: Feature[],
  nameA: string,
  nameB: string,
): string {
  const mapA = new Map(featuresA.map(f => [f.featureKey, f]))
  const mapB = new Map(featuresB.map(f => [f.featureKey, f]))

  const added:   Feature[] = []
  const removed: Feature[] = []
  const changed: Array<{ a: Feature; b: Feature; diffs: FieldDiff[] }> = []

  for (const [key, fb] of mapB) {
    if (!mapA.has(key)) {
      added.push(fb)
    } else {
      const fa = mapA.get(key)!
      const diffs = diffFeatures(fa, fb)
      if (diffs.length > 0) changed.push({ a: fa, b: fb, diffs })
    }
  }

  for (const [key, fa] of mapA) {
    if (!mapB.has(key)) removed.push(fa)
  }

  const _dtd = new Date()
  const date = `${_dtd.getFullYear()}-${String(_dtd.getMonth() + 1).padStart(2, '0')}-${String(_dtd.getDate()).padStart(2, '0')}`
  const totalChanges = added.length + removed.length + changed.length

  const addedHtml   = added.map(renderAdded).join('\n')
  const removedHtml = removed.map(renderRemoved).join('\n')
  const changedHtml = changed.map(({ a, b, diffs }) => renderChanged(a, b, diffs)).join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Diff: ${esc(nameA)} → ${esc(nameB)}</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg:         #12100e;
  --bg-card:    #1a1714;
  --bg-hover:   #201d1a;
  --border:     #2a2420;
  --text:       #e8ddd4;
  --text-mid:   #b0a49c;
  --text-soft:  #7a6a5a;
  --accent:     #c4a255;
  --mono:       'Cascadia Code','Fira Code','JetBrains Mono','Consolas',monospace;
  --sans:       -apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;

  --added:      #4aad72;
  --added-bg:   rgba(74,173,114,0.08);
  --added-border: rgba(74,173,114,0.3);
  --removed:    #cc5b5b;
  --removed-bg: rgba(204,91,91,0.08);
  --removed-border: rgba(204,91,91,0.3);
  --changed:    #c4a255;
  --changed-bg: rgba(196,162,85,0.08);
  --changed-border: rgba(196,162,85,0.3);

  --status-active:  #4aad72; --status-active-bg:  rgba(74,173,114,0.12);
  --status-draft:   #c4a255; --status-draft-bg:   rgba(196,162,85,0.12);
  --status-frozen:  #5b82cc; --status-frozen-bg:  rgba(91,130,204,0.12);
  --status-deprecated: #cc5b5b; --status-deprecated-bg: rgba(204,91,91,0.12);
}

body {
  background: var(--bg);
  color: var(--text);
  font-family: var(--sans);
  font-size: 14px;
  line-height: 1.6;
  min-height: 100vh;
}

/* ── Topbar ── */
.topbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 24px;
  height: 48px;
  background: #0e0c0a;
  border-bottom: 1px solid var(--border);
}
.topbar-logo { font-family: var(--mono); font-size: 13px; color: var(--accent); }
.topbar-sep  { color: var(--border); }
.topbar-dirs { font-family: var(--mono); font-size: 12px; color: var(--text-mid); display: flex; align-items: center; gap: 8px; }
.topbar-arrow { color: var(--text-soft); }
.topbar-right { margin-left: auto; font-family: var(--mono); font-size: 11px; color: var(--text-soft); }

/* ── Layout ── */
.page { max-width: 960px; margin: 0 auto; padding: 40px 24px 80px; }

/* ── Summary ── */
.summary {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 40px;
  padding: 20px 24px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
}
.summary-title {
  width: 100%;
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-soft);
  margin-bottom: 4px;
}
.summary-stat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 6px;
  font-family: var(--mono);
  font-size: 12px;
}
.summary-stat.added-stat   { background: var(--added-bg);   border: 1px solid var(--added-border); }
.summary-stat.removed-stat { background: var(--removed-bg); border: 1px solid var(--removed-border); }
.summary-stat.changed-stat { background: var(--changed-bg); border: 1px solid var(--changed-border); }
.summary-stat.unchanged-stat { background: var(--bg-hover); border: 1px solid var(--border); color: var(--text-soft); }
.stat-num { font-size: 22px; font-weight: 700; }
.stat-num.added-num   { color: var(--added); }
.stat-num.removed-num { color: var(--removed); }
.stat-num.changed-num { color: var(--changed); }

/* ── Section headings ── */
.section-heading {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  margin-top: 40px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}
.section-heading-label {
  font-family: var(--mono);
  font-size: 11px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.section-heading-label.added-label   { color: var(--added); }
.section-heading-label.removed-label { color: var(--removed); }
.section-heading-label.changed-label { color: var(--changed); }
.section-heading-count {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
}

/* ── Feature cards ── */
.feature-card {
  border-radius: 6px;
  padding: 16px 18px;
  margin-bottom: 10px;
}
.feature-card.added   { background: var(--added-bg);   border: 1px solid var(--added-border); }
.feature-card.removed { background: var(--removed-bg); border: 1px solid var(--removed-border); }
.feature-card.changed { background: var(--changed-bg); border: 1px solid var(--changed-border); }

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}
.card-sign {
  font-family: var(--mono);
  font-size: 16px;
  font-weight: 700;
  width: 20px;
  text-align: center;
  flex-shrink: 0;
}
.added-sign   { color: var(--added); }
.removed-sign { color: var(--removed); }
.changed-sign { color: var(--changed); }

.feature-key {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
}
.feature-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}
.diff-count {
  margin-left: auto;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-soft);
}

.card-problem {
  font-size: 13px;
  color: var(--text-mid);
  line-height: 1.6;
  margin-bottom: 8px;
}

.card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.tag {
  padding: 2px 8px;
  background: rgba(196,162,85,0.1);
  border: 1px solid rgba(196,162,85,0.25);
  border-radius: 100px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--accent);
}

/* ── Status badges ── */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 10px;
  font-weight: 600;
}
.badge-active     { color: var(--status-active);     background: var(--status-active-bg);     border: 1px solid rgba(74,173,114,0.25); }
.badge-draft      { color: var(--status-draft);      background: var(--status-draft-bg);      border: 1px solid rgba(196,162,85,0.25); }
.badge-frozen     { color: var(--status-frozen);     background: var(--status-frozen-bg);     border: 1px solid rgba(91,130,204,0.25); }
.badge-deprecated { color: var(--status-deprecated); background: var(--status-deprecated-bg); border: 1px solid rgba(204,91,91,0.25); }

.domain-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 4px;
  font-family: var(--mono);
  font-size: 10px;
  color: var(--text-mid);
  background: var(--bg-card);
  border: 1px solid var(--border);
}

/* ── Diff table ── */
.diff-table-wrap { overflow-x: auto; margin-top: 12px; }

.diff-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
.diff-table th {
  background: rgba(0,0,0,0.3);
  border: 1px solid var(--border);
  padding: 6px 12px;
  text-align: left;
  font-family: var(--mono);
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text-soft);
  font-weight: 600;
}
.diff-table td {
  border: 1px solid var(--border);
  padding: 8px 12px;
  vertical-align: top;
}
.diff-field {
  width: 140px;
  white-space: nowrap;
}
.diff-field code {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--accent);
}
.diff-old { background: rgba(204,91,91,0.07); color: var(--text-mid); }
.diff-new { background: rgba(74,173,114,0.07); color: var(--text-mid); }

.diff-val {
  font-family: var(--mono);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  color: var(--text-mid);
  margin: 0;
  max-height: 200px;
  overflow-y: auto;
}

.diff-empty {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--text-soft);
  font-style: italic;
}

/* ── Empty state ── */
.empty-state {
  padding: 24px;
  text-align: center;
  font-family: var(--mono);
  font-size: 12px;
  color: var(--text-soft);
  border: 1px dashed var(--border);
  border-radius: 6px;
}
</style>
</head>
<body>

<div class="topbar">
  <span class="topbar-logo">◈ lac</span>
  <span class="topbar-sep">|</span>
  <div class="topbar-dirs">
    <span>${esc(nameA)}</span>
    <span class="topbar-arrow">→</span>
    <span>${esc(nameB)}</span>
  </div>
  <div class="topbar-right">${date} · ${totalChanges} change${totalChanges === 1 ? '' : 's'}</div>
</div>

<div class="page">

  <div class="summary">
    <div class="summary-title">Diff summary</div>
    <div class="summary-stat added-stat">
      <span class="stat-num added-num">${added.length}</span>
      <span>added</span>
    </div>
    <div class="summary-stat removed-stat">
      <span class="stat-num removed-num">${removed.length}</span>
      <span>removed</span>
    </div>
    <div class="summary-stat changed-stat">
      <span class="stat-num changed-num">${changed.length}</span>
      <span>changed</span>
    </div>
    <div class="summary-stat unchanged-stat">
      <span class="stat-num">${featuresA.length - removed.length - changed.length}</span>
      <span>unchanged</span>
    </div>
  </div>

  ${added.length > 0 ? `
  <div class="section-heading">
    <span class="section-heading-label added-label">Added</span>
    <span class="section-heading-count">${added.length} feature${added.length === 1 ? '' : 's'}</span>
  </div>
  ${addedHtml}
  ` : ''}

  ${removed.length > 0 ? `
  <div class="section-heading">
    <span class="section-heading-label removed-label">Removed</span>
    <span class="section-heading-count">${removed.length} feature${removed.length === 1 ? '' : 's'}</span>
  </div>
  ${removedHtml}
  ` : ''}

  ${changed.length > 0 ? `
  <div class="section-heading">
    <span class="section-heading-label changed-label">Changed</span>
    <span class="section-heading-count">${changed.length} feature${changed.length === 1 ? '' : 's'}</span>
  </div>
  ${changedHtml}
  ` : ''}

  ${totalChanges === 0 ? `
  <div class="empty-state">No differences found between ${esc(nameA)} and ${esc(nameB)}</div>
  ` : ''}

</div>
</body>
</html>`
}
