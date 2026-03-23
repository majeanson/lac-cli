/**
 * Heatmap generator — exports a completeness grid showing which fields are
 * filled vs missing across all features.
 * Design intent: instantly see where the documentation debt lives.
 *
 * Static HTML/CSS for the grid; minimal JS only for the tooltip (mousemove).
 * Feature data is embedded as JSON in a <script> tag for tooltip content.
 */

import type { ScannedFeature } from './scanner.js'

type Feature = ScannedFeature['feature']

// ── Field definitions ───────────────────────────────────────────────────────────

type FieldDef = {
  key: keyof Feature
  label: string
  kind: 'string' | 'array' | 'scalar'
}

const FIELDS: FieldDef[] = [
  { key: 'problem',          label: 'problem',       kind: 'string' },
  { key: 'analysis',         label: 'analysis',      kind: 'string' },
  { key: 'implementation',   label: 'impl',          kind: 'string' },
  { key: 'successCriteria',  label: 'success',       kind: 'string' },
  { key: 'decisions',        label: 'decisions',     kind: 'array'  },
  { key: 'knownLimitations', label: 'limitations',   kind: 'array'  },
  { key: 'tags',             label: 'tags',          kind: 'array'  },
  { key: 'domain',           label: 'domain',        kind: 'scalar' },
  { key: 'userGuide',        label: 'userGuide',     kind: 'string' },
  { key: 'owner',            label: 'owner',         kind: 'scalar' },
  { key: 'priority',         label: 'priority',      kind: 'scalar' },
  { key: 'componentFile',    label: 'compFile',      kind: 'scalar' },
  { key: 'npmPackages',      label: 'npmPkgs',       kind: 'array'  },
  { key: 'publicInterface',  label: 'pubInterface',  kind: 'array'  },
  { key: 'codeSnippets',     label: 'snippets',      kind: 'array'  },
  { key: 'annotations',      label: 'annotations',   kind: 'array'  },
]

const TOTAL_FIELDS = FIELDS.length

// ── Helpers ────────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function isFilled(f: Feature, field: FieldDef): boolean {
  const v = f[field.key]
  if (v === undefined || v === null) return false
  if (field.kind === 'string') return typeof v === 'string' && v.length > 0
  if (field.kind === 'array') return Array.isArray(v) && v.length > 0
  // scalar: domain, owner, priority, componentFile
  return true
}

function getValuePreview(f: Feature, field: FieldDef): string {
  const v = f[field.key]
  if (v === undefined || v === null) return '— not set'
  if (field.kind === 'string') {
    const s = String(v)
    return s.length > 60 ? s.slice(0, 57) + '…' : s
  }
  if (field.kind === 'array') {
    if (!Array.isArray(v) || v.length === 0) return '— not set'
    const first = v[0]
    let preview: string
    if (typeof first === 'string') {
      preview = first
    } else if (typeof first === 'object' && first !== null) {
      // Decision, Annotation, etc — grab a sensible string
      const obj = first as Record<string, unknown>
      const text = obj['decision'] ?? obj['body'] ?? obj['name'] ?? obj['label'] ?? JSON.stringify(first)
      preview = String(text)
    } else {
      preview = String(first)
    }
    const trimmed = preview.length > 50 ? preview.slice(0, 47) + '…' : preview
    return v.length === 1 ? trimmed : `${trimmed} (+${v.length - 1} more)`
  }
  // scalar
  return String(v).slice(0, 60)
}

function featureCompleteness(f: Feature): number {
  const filled = FIELDS.filter(fd => isFilled(f, fd)).length
  return Math.round((filled / TOTAL_FIELDS) * 100)
}

function columnFillPercent(features: Feature[], field: FieldDef): number {
  if (features.length === 0) return 0
  const filled = features.filter(f => isFilled(f, field)).length
  return Math.round((filled / features.length) * 100)
}

function completenessColor(pct: number): string {
  // interpolate red → yellow → green in HSL space
  // 0%=0°(red), 50%=45°(yellow-orange), 100%=120°(green)
  const hue = Math.round((pct / 100) * 120)
  return `hsl(${hue}, 60%, 45%)`
}

function sortFeatures(features: Feature[]): Feature[] {
  return [...features].sort((a, b) => {
    const da = a.domain ?? 'zzz'
    const db = b.domain ?? 'zzz'
    if (da !== db) return da.localeCompare(db)
    return a.featureKey.localeCompare(b.featureKey)
  })
}


function overallCompleteness(features: Feature[]): number {
  if (features.length === 0) return 0
  const total = features.reduce((sum, f) => sum + featureCompleteness(f), 0)
  return Math.round(total / features.length)
}

function mostMissedFields(features: Feature[]): string[] {
  return FIELDS
    .map(fd => ({ label: fd.label, pct: columnFillPercent(features, fd) }))
    .filter(x => x.pct < 100)
    .sort((a, b) => a.pct - b.pct)
    .slice(0, 4)
    .map(x => `${x.label} (${x.pct}%)`)
}

function mostCompleteFeatures(features: Feature[]): string[] {
  return [...features]
    .map(f => ({ key: f.featureKey, pct: featureCompleteness(f) }))
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)
    .map(x => `${x.key} (${x.pct}%)`)
}

// ── Grid rendering ──────────────────────────────────────────────────────────────

function renderColumnHeaders(): string {
  const cells = FIELDS.map(fd => `
          <th class="col-header" scope="col">
            <div class="col-label-wrap">
              <span class="col-label">${esc(fd.label)}</span>
            </div>
          </th>`).join('')
  return `
        <tr>
          <th class="row-header-spacer" scope="col"></th>
          ${cells}
          <th class="pct-header" scope="col">done</th>
        </tr>`
}

function renderSummaryRow(features: Feature[]): string {
  const cells = FIELDS.map(fd => {
    const pct = columnFillPercent(features, fd)
    return `<td class="summary-cell" title="${pct}% filled">${pct}<span class="pct-mark">%</span></td>`
  }).join('')
  return `
        <tr class="summary-row">
          <td class="row-header summary-header">fill %</td>
          ${cells}
          <td class="pct-cell summary-pct"></td>
        </tr>`
}

function renderFeatureRow(f: Feature, idx: number): string {
  const pct = featureCompleteness(f)
  const pctColor = completenessColor(pct)
  const domain = f.domain ?? ''

  const cells = FIELDS.map((fd, colIdx) => {
    const filled = isFilled(f, fd)
    const cellClass = filled ? 'cell cell-filled' : 'cell cell-empty'
    return `<td
            class="${cellClass}"
            data-feature-idx="${idx}"
            data-col-idx="${colIdx}"
            role="gridcell"
            aria-label="${esc(fd.key)}: ${filled ? 'filled' : 'empty'}"
          ><span class="cell-inner"></span></td>`
  }).join('')

  return `
        <tr class="feature-row" data-feature-idx="${idx}">
          <th class="row-header" scope="row">
            <div class="row-header-inner">
              <span class="row-key">${esc(f.featureKey)}</span>
              <span class="row-title">${esc(f.title)}</span>
              ${domain ? `<span class="row-domain">${esc(domain)}</span>` : ''}
            </div>
          </th>
          ${cells}
          <td class="pct-cell" style="color:${pctColor}">${pct}<span class="pct-mark">%</span></td>
        </tr>`
}

// ── Public API ──────────────────────────────────────────────────────────────────

export function generateHeatmap(features: Feature[], projectName: string): string {
  const sorted = sortFeatures(features)
  const overallPct = overallCompleteness(features)
  const missed = mostMissedFields(features)
  const stars = mostCompleteFeatures(features)

  // Embed feature data for tooltip JS — escape </script> sequences
  const featureDataJson = JSON.stringify(
    sorted.map(f => ({
      featureKey: f.featureKey,
      title: f.title,
      domain: f.domain ?? null,
      fields: FIELDS.map(fd => ({
        key: fd.key,
        label: fd.label,
        filled: isFilled(f, fd),
        preview: getValuePreview(f, fd),
      })),
    }))
  ).replace(/<\/script>/gi, '<\\/script>')

  const colHeaders = renderColumnHeaders()
  const summaryRow = renderSummaryRow(features)
  const featureRows = sorted.map((f, i) => renderFeatureRow(f, i)).join('')

  const emptyState = features.length === 0
    ? `<div class="empty-grid">
        <div class="empty-icon">◈</div>
        <p>No features found. Run <code>lac extract</code> or add feature.json files.</p>
      </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(projectName)} — LAC Heatmap</title>
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
    --cell-filled: rgba(74, 173, 114, 0.7);
    --cell-empty: rgba(204, 91, 91, 0.22);
    --cell-size: 32px;
    --row-header-w: 260px;
    --topbar-h: 44px;
  }

  html, body {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-size: 13px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }

  body {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  /* ── Topbar ── */

  .topbar {
    height: var(--topbar-h);
    background: var(--bg-sidebar);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 20px;
    flex-shrink: 0;
    position: sticky;
    top: 0;
    z-index: 50;
  }

  .topbar-left {
    font-family: var(--mono);
    font-size: 13px;
    color: var(--text-mid);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .topbar-diamond {
    color: var(--accent);
    font-size: 14px;
  }

  .topbar-sep {
    color: var(--border);
  }

  .topbar-right {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-soft);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .topbar-project {
    color: var(--text-mid);
    font-weight: 600;
  }

  .topbar-count {
    color: var(--text-soft);
  }

  /* ── Page body ── */

  .page-body {
    flex: 1;
    overflow: auto;
    padding: 24px 20px 60px;
  }

  /* ── Grid wrapper ── */

  .grid-wrap {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* ── Table ── */

  table.heatmap-table {
    border-collapse: collapse;
    table-layout: fixed;
    /* row-header col + 16 field cols + pct col */
    width: calc(var(--row-header-w) + var(--cell-size) * ${TOTAL_FIELDS} + 52px);
  }

  /* ── Column headers ── */

  .col-header {
    width: var(--cell-size);
    height: 120px;
    vertical-align: bottom;
    padding: 0;
    border-bottom: 1px solid var(--border);
    position: relative;
  }

  .col-label-wrap {
    display: flex;
    justify-content: center;
    align-items: flex-end;
    height: 100%;
    padding-bottom: 6px;
  }

  .col-label {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-soft);
    white-space: nowrap;
    writing-mode: vertical-rl;
    text-orientation: mixed;
    transform: rotate(180deg);
    letter-spacing: 0.05em;
    display: block;
  }

  .row-header-spacer {
    width: var(--row-header-w);
  }

  .pct-header {
    width: 52px;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-soft);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    vertical-align: bottom;
    padding-bottom: 8px;
    text-align: right;
    padding-right: 4px;
    border-bottom: 1px solid var(--border);
  }

  /* ── Summary row ── */

  .summary-row {
    background: var(--bg-sidebar);
  }

  .summary-header {
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-soft);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    text-align: right;
    padding-right: 10px;
    border-bottom: 1px solid var(--border);
    font-weight: 400;
  }

  .summary-cell {
    text-align: center;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text-soft);
    padding: 6px 0;
    border-bottom: 1px solid var(--border);
  }

  .summary-pct {
    border-bottom: 1px solid var(--border);
  }

  /* ── Feature rows ── */

  .feature-row {
    border-bottom: 1px solid var(--border-soft);
    transition: background 0.1s;
  }

  .feature-row:hover {
    background: var(--bg-hover);
  }

  /* ── Row header ── */

  .row-header {
    width: var(--row-header-w);
    padding: 5px 10px 5px 0;
    text-align: right;
    vertical-align: middle;
    position: sticky;
    left: 0;
    background: var(--bg);
    z-index: 10;
    border-right: 1px solid var(--border-soft);
  }

  .feature-row:hover .row-header {
    background: var(--bg-hover);
  }

  .row-header-inner {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 1px;
  }

  .row-key {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text-mid);
    white-space: nowrap;
  }

  .row-title {
    font-size: 11px;
    color: var(--text-soft);
    font-style: italic;
    word-break: break-word;
    max-width: calc(var(--row-header-w) - 10px);
    text-align: right;
  }

  .row-domain {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--text-soft);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    opacity: 0.6;
    white-space: nowrap;
  }

  /* ── Cells ── */

  .cell {
    width: var(--cell-size);
    height: var(--cell-size);
    padding: 3px;
    cursor: default;
    vertical-align: middle;
  }

  .cell:hover .cell-inner {
    filter: brightness(1.25);
    outline: 1px solid rgba(255, 255, 255, 0.2);
    outline-offset: -1px;
  }

  .cell-inner {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 3px;
    transition: filter 0.1s, outline 0.1s;
  }

  .cell-filled .cell-inner {
    background: var(--cell-filled);
  }

  .cell-empty .cell-inner {
    background: var(--cell-empty);
  }

  /* ── Completeness % column ── */

  .pct-cell {
    width: 52px;
    text-align: right;
    padding-right: 4px;
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 600;
    vertical-align: middle;
  }

  .pct-mark {
    font-size: 9px;
    opacity: 0.7;
  }

  /* ── Summary footer ── */

  .summary-footer {
    margin-top: 32px;
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 16px 20px;
    display: grid;
    grid-template-columns: auto 1fr 1fr;
    gap: 24px;
    align-items: start;
    max-width: 900px;
  }

  .footer-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .footer-block-title {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    color: var(--text-soft);
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  .overall-pct {
    font-size: 36px;
    font-weight: 700;
    font-family: var(--mono);
    line-height: 1;
  }

  .overall-label {
    font-size: 11px;
    color: var(--text-soft);
  }

  .footer-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .footer-list li {
    font-family: var(--mono);
    font-size: 12px;
    color: var(--text-mid);
    padding: 2px 0;
  }

  .footer-list li::before {
    content: '· ';
    color: var(--text-soft);
  }

  /* ── Empty state ── */

  .empty-grid {
    text-align: center;
    padding: 80px 24px;
    color: var(--text-soft);
    font-size: 14px;
  }

  .empty-grid .empty-icon {
    font-size: 48px;
    color: var(--border);
    margin-bottom: 20px;
  }

  .empty-grid code {
    font-family: var(--mono);
    color: var(--accent);
  }

  /* ── Tooltip ── */

  #lac-tooltip {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-sidebar);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 8px 12px;
    max-width: 300px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    opacity: 0;
    transition: opacity 0.12s;
  }

  #lac-tooltip.visible {
    opacity: 1;
  }

  .tt-field {
    font-family: var(--mono);
    font-size: 10px;
    font-weight: 600;
    color: var(--text-soft);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 2px;
  }

  .tt-feature {
    font-size: 11px;
    color: var(--text-mid);
    margin-bottom: 6px;
    font-style: italic;
  }

  .tt-value {
    font-family: var(--mono);
    font-size: 11px;
    word-break: break-word;
  }

  .tt-value.filled {
    color: #4aad72;
  }

  .tt-value.empty {
    color: var(--text-soft);
    font-style: italic;
  }
</style>
</head>
<body>

  <div class="topbar">
    <div class="topbar-left">
      <span class="topbar-diamond">◈</span>
      <span>lac</span>
      <span class="topbar-sep">·</span>
      <span>heatmap</span>
    </div>
    <div class="topbar-right">
      <span class="topbar-project">${esc(projectName)}</span>
      <span class="topbar-count">${features.length} feature${features.length === 1 ? '' : 's'}</span>
    </div>
  </div>

  <div class="page-body">
    ${emptyState}
    ${features.length > 0 ? `
    <div class="grid-wrap">
      <table class="heatmap-table" role="grid" aria-label="Feature completeness heatmap">
        <thead>
          ${colHeaders}
          ${summaryRow}
        </thead>
        <tbody>
          ${featureRows}
        </tbody>
      </table>
    </div>

    <div class="summary-footer">
      <div class="footer-block">
        <div class="footer-block-title">Overall</div>
        <div class="overall-pct" style="color:${completenessColor(overallPct)}">${overallPct}<span class="pct-mark">%</span></div>
        <div class="overall-label">complete</div>
      </div>
      <div class="footer-block">
        <div class="footer-block-title">Most missed fields</div>
        <ul class="footer-list">
          ${missed.length > 0
            ? missed.map(m => `<li>${esc(m)}</li>`).join('\n          ')
            : '<li>All fields well covered</li>'
          }
        </ul>
      </div>
      <div class="footer-block">
        <div class="footer-block-title">Most complete features</div>
        <ul class="footer-list">
          ${stars.length > 0
            ? stars.map(s => `<li>${esc(s)}</li>`).join('\n          ')
            : '<li>No features yet</li>'
          }
        </ul>
      </div>
    </div>
    ` : ''}
  </div>

  <div id="lac-tooltip" role="tooltip" aria-live="polite">
    <div class="tt-field" id="tt-field"></div>
    <div class="tt-feature" id="tt-feature"></div>
    <div class="tt-value" id="tt-value"></div>
  </div>

<script>
(function () {
  'use strict';

  var FEATURES = ${featureDataJson};

  var tooltip = document.getElementById('lac-tooltip');
  var ttField = document.getElementById('tt-field');
  var ttFeature = document.getElementById('tt-feature');
  var ttValue = document.getElementById('tt-value');

  var MARGIN = 14;

  function showTooltip(e, featureIdx, colIdx) {
    var feature = FEATURES[featureIdx];
    if (!feature) return;
    var field = feature.fields[colIdx];
    if (!field) return;

    ttField.textContent = field.key;
    ttFeature.textContent = feature.featureKey + ' — ' + feature.title;
    ttValue.textContent = field.preview;
    ttValue.className = 'tt-value ' + (field.filled ? 'filled' : 'empty');

    tooltip.classList.add('visible');
    positionTooltip(e);
  }

  function positionTooltip(e) {
    var tw = tooltip.offsetWidth;
    var th = tooltip.offsetHeight;
    var vw = window.innerWidth;
    var vh = window.innerHeight;

    var x = e.clientX + MARGIN;
    var y = e.clientY + MARGIN;

    if (x + tw > vw - 8) x = e.clientX - tw - MARGIN;
    if (y + th > vh - 8) y = e.clientY - th - MARGIN;
    if (x < 8) x = 8;
    if (y < 8) y = 8;

    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }

  function hideTooltip() {
    tooltip.classList.remove('visible');
  }

  document.addEventListener('mousemove', function (e) {
    var target = e.target;
    // Walk up to find a cell
    var cell = null;
    var node = target;
    while (node && node !== document.body) {
      if (node.dataset && node.dataset.featureIdx !== undefined && node.dataset.colIdx !== undefined) {
        cell = node;
        break;
      }
      // Also check if we are in the .cell-inner span — look at parentElement
      if (node.parentElement && node.parentElement.dataset && node.parentElement.dataset.featureIdx !== undefined) {
        cell = node.parentElement;
        break;
      }
      node = node.parentElement;
    }

    if (cell) {
      var fi = parseInt(cell.dataset.featureIdx, 10);
      var ci = parseInt(cell.dataset.colIdx, 10);
      showTooltip(e, fi, ci);
      positionTooltip(e);
    } else {
      hideTooltip();
    }
  });

  document.addEventListener('mouseleave', hideTooltip);
})();
</script>
</body>
</html>`
}
